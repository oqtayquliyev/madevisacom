/* CV match for visitors without an account timed out ("canceling statement due to statement timeout").
   Supabase stops requests from signed-out visitors after a few seconds, and the shortlist tested up to
   48 word patterns one by one against every live job title.
   Now:
   • one combined pattern picks the candidate jobs first (a trigram index on the lowercase title helps
     Postgres skip most rows), and the per-word count runs only on those — same results, same order;
   • signed-out visitors get the same 8-second limit signed-in people already have (Supabase's default
     for the anon role is 3 s; a function's own SET statement_timeout cannot extend the request's limit). */

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS sponsored_jobs_title_trgm_idx ON public.sponsored_jobs USING gin (lower(title) extensions.gin_trgm_ops) WHERE status = 'published';

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
  any_re text;
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
  SELECT array_agg(p) INTO tw FROM (SELECT DISTINCT public._cv_word_pattern(x) AS p FROM unnest(coalesce(p_title_words, '{}'::text[])) x LIMIT 24) t WHERE p IS NOT NULL;
  SELECT array_agg(p) INTO sw FROM (SELECT DISTINCT public._cv_word_pattern(x) AS p FROM unnest(coalesce(p_skill_words, '{}'::text[])) x LIMIT 24) t WHERE p IS NOT NULL;
  IF tw IS NULL AND sw IS NULL THEN RETURN '[]'::jsonb; END IF;
  -- Any of the words: one pass over the titles instead of one per word.
  any_re := '(' || array_to_string(coalesce(tw, '{}'::text[]) || coalesce(sw, '{}'::text[]), '|') || ')';

  WITH cand AS (
    SELECT j.id, j.title, lower(j.title) AS lt, j.job_function, j.experience_level, j.city, j.remote, j.created_at, j.publisher_id, j.country_id
    FROM public.sponsored_jobs j
    WHERE j.status = 'published' AND NOT coalesce(j.awaiting_release, false)
      AND (j.expires_at IS NULL OR j.expires_at > now())
      AND lower(j.title) ~ any_re
  ), scored AS (
    SELECT c.*, 3 * (SELECT count(*) FROM unnest(coalesce(tw, '{}'::text[])) p WHERE c.lt ~ p)
                  + (SELECT count(*) FROM unnest(coalesce(sw, '{}'::text[])) p WHERE c.lt ~ p) AS hits
    FROM cand c
  )
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'hits')::integer DESC, (r->>'created_at') DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'title', s.title, 'job_function', s.job_function, 'experience_level', s.experience_level,
      'city', s.city, 'remote', s.remote, 'created_at', s.created_at,
      'publisher_id', s.publisher_id, 'company', pub.name, 'logo_url', pub.logo_url,
      'country', c.name, 'cc', c.iso_code, 'hits', s.hits) AS r
    FROM scored s
    LEFT JOIN public.program_publishers pub ON pub.id = s.publisher_id
    LEFT JOIN public.countries c ON c.id = s.country_id
    WHERE s.hits > 0
    ORDER BY s.hits DESC, s.created_at DESC
    LIMIT lim
  ) t;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.cv_job_shortlist(text[], text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cv_job_shortlist(text[], text[], integer) TO anon, authenticated;

ALTER ROLE anon SET statement_timeout = '8s';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
