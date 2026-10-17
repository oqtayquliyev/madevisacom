/* CV match: "The search didn't finish — canceling statement due to statement timeout".
   Run AFTER 20261225090000_fast_cv_shortlist.sql. Safe to run more than once.

   Why it still timed out: the shortlist matched up to 48 regular expressions against every live job
   title. The trigram index only helps when EVERY word in the pattern has three letters to look up —
   one short word from the CV ("ai", "qa", "c#", "sap", "jira") and Postgres reads all 50k+ titles,
   then runs up to 48 regexes on each title that matched any of them. A new CV (uploading again) means
   a new search with new words, so it hit the 8-second limit.

   Now:
   • every title is stored in an index as its list of words (GIN on _title_words(title));
   • the CV's words — plus the usual endings for words of 5+ letters ("engineer" → engineers,
     engineering), the same as before — are looked up in that index: a few milliseconds, whatever the words;
   • the per-job count is a join on words instead of regexes. Same ranking: title words count 3, skills 1. */

SET lock_timeout = '5s';

-- A job title as its words: lower case, letters/digits/+/#/. only, dots trimmed at the ends ("sr." → "sr").
-- (Changing this function later means: DROP INDEX sponsored_jobs_title_words_idx, then create it again.)
CREATE OR REPLACE FUNCTION public._title_words(p_title text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- One expression (no subquery), so it is cheap to work out for every title.
  -- A dot stays only inside a word ("node.js", "asp.net"); anything else that isn't a letter, digit, + or # splits words.
  SELECT regexp_split_to_array(
    btrim(regexp_replace(regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9+#.]+|\.(?![a-z0-9])|(?<![a-z0-9])\.', ' ', 'g'), ' +', ' ', 'g')),
    ' '
  );
$$;

CREATE INDEX IF NOT EXISTS sponsored_jobs_title_words_idx
  ON public.sponsored_jobs USING gin (public._title_words(title))
  WHERE status = 'published';

-- The regex/trigram index isn't used any more.
DROP INDEX IF EXISTS public.sponsored_jobs_title_trgm_idx;

-- The CV's words with the weight they count for (title 3, skill 1), each with the forms a title may use.
CREATE OR REPLACE FUNCTION public._cv_forms(p_title text[], p_skill text[])
RETURNS TABLE (f text, w text, weight integer)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT DISTINCT forms.f, words.w, words.weight FROM (
    SELECT x AS w, 3 AS weight FROM unnest(coalesce(p_title, '{}'::text[])) x
    UNION ALL
    SELECT x, 1 FROM unnest(coalesce(p_skill, '{}'::text[])) x
  ) words
  CROSS JOIN LATERAL (
    SELECT words.w AS f
    UNION ALL
    -- Longer words may continue, as before: "engineer" finds "engineering", "design" finds "designer".
    SELECT words.w || s FROM unnest(ARRAY['s','es','er','ers','or','ors','ing','ed','ment','ments','al','ist','ists','ion','ions','ics','y']) s
    WHERE char_length(words.w) >= 5
  ) forms;
$$;

CREATE OR REPLACE FUNCTION public.cv_job_shortlist(p_title_words text[], p_skill_words text[] DEFAULT '{}', p_limit integer DEFAULT 150)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET statement_timeout = '8s'
AS $$
DECLARE
  tw text[];
  sw text[];
  v_forms text[];
  lim integer := greatest(10, least(coalesce(p_limit, 150), 300));
  v_out jsonb;
  v_who text := coalesce(auth.uid()::text, public.request_visitor_hash());
  v_used integer;
BEGIN
  IF v_who IS NOT NULL THEN
    INSERT INTO public.cv_search_log AS l (who, hour) VALUES (v_who, date_trunc('hour', now()))
    ON CONFLICT ON CONSTRAINT cv_search_log_pkey DO UPDATE SET n = l.n + 1
    RETURNING l.n INTO v_used;
    IF v_used > public.cv_search_hourly_limit() THEN
      RAISE EXCEPTION 'Too many searches in the last hour. Try again a little later.' USING ERRCODE = 'P0001';
    END IF;
    IF v_used = 1 THEN DELETE FROM public.cv_search_log WHERE hour < now() - interval '2 days'; END IF;
  END IF;

  -- The words, cleaned the same way as the titles (at most 24 of each; a skill that is also a title word counts once, as a title word).
  SELECT array_agg(w) INTO tw FROM (
    SELECT DISTINCT btrim(regexp_replace(lower(x), '[^a-z0-9+#.]', '', 'g'), '.') AS w
    FROM unnest(coalesce(p_title_words, '{}'::text[])) x LIMIT 24
  ) t WHERE char_length(w) BETWEEN 2 AND 30;
  SELECT array_agg(w) INTO sw FROM (
    SELECT DISTINCT btrim(regexp_replace(lower(x), '[^a-z0-9+#.]', '', 'g'), '.') AS w
    FROM unnest(coalesce(p_skill_words, '{}'::text[])) x LIMIT 24
  ) t WHERE char_length(w) BETWEEN 2 AND 30 AND NOT (w = ANY (coalesce(tw, '{}'::text[])));
  IF tw IS NULL AND sw IS NULL THEN RETURN '[]'::jsonb; END IF;

  -- Every form of every word ("engineer", "engineers", "engineering"…), for the index lookup.
  SELECT array_agg(DISTINCT f) INTO v_forms FROM public._cv_forms(tw, sw);

  WITH fm AS (
    SELECT * FROM public._cv_forms(tw, sw)
  ), cand AS (
    SELECT j.id, j.title, public._title_words(j.title) AS tws, j.job_function, j.experience_level, j.city, j.remote, j.created_at, j.publisher_id, j.country_id
    FROM public.sponsored_jobs j
    WHERE j.status = 'published'
      AND public._title_words(j.title) && v_forms
      AND NOT coalesce(j.awaiting_release, false)
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ), pairs AS (
    -- One row per (job, CV word) that the title contains, in any of its forms.
    SELECT DISTINCT c.id, fm.w, fm.weight
    FROM cand c
    CROSS JOIN LATERAL unnest(c.tws) t(word)
    JOIN fm ON fm.f = t.word
  ), hits AS (
    SELECT id, sum(weight)::integer AS hits FROM pairs GROUP BY id
  ), top AS (
    SELECT c.*, h.hits FROM cand c JOIN hits h ON h.id = c.id
    ORDER BY h.hits DESC, c.created_at DESC
    LIMIT lim
  )
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'hits')::integer DESC, (r->>'created_at') DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'title', s.title, 'job_function', s.job_function, 'experience_level', s.experience_level,
      'city', s.city, 'remote', s.remote, 'created_at', s.created_at,
      'publisher_id', s.publisher_id, 'company', pub.name, 'logo_url', pub.logo_url,
      'country', c.name, 'cc', c.iso_code, 'hits', s.hits) AS r
    FROM top s
    LEFT JOIN public.program_publishers pub ON pub.id = s.publisher_id
    LEFT JOIN public.countries c ON c.id = s.country_id
  ) t;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.cv_job_shortlist(text[], text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_job_shortlist(text[], text[], integer) TO anon, authenticated;

ANALYZE public.sponsored_jobs;

NOTIFY pgrst, 'reload schema';
