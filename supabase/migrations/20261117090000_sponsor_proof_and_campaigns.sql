/*
# Sponsor proof + new social campaigns (Batch 3)
Run AFTER 20261116090000_invite_rewards.sql. Safe to run more than once.
Then deploy:  supabase functions deploy auto-pipeline --no-verify-jwt

1. UK register of licensed sponsors (Home Office, public, updated daily).
   The auto-pipeline downloads it every morning ({ cron: "sponsors" }) and
   keeps one row per organisation. Companies on MadeVisa are matched by
   normalised name ("Stryker UK Limited" = "Stryker (UK)" = "stryker").
   Matching is exact on the normalised name — no fuzzy guessing, so a
   badge never appears on the wrong company. Unmatched companies simply
   show no badge.
   Safety: if a download looks broken (fewer than 50,000 organisations),
   the old data is kept.

2. Social job picker, rewritten:
   - Returns up to 20 candidates (was 5 — after removing recently used
     companies there was often nothing left, so the same big employers
     kept coming back).
   - A company is not posted again on the same network for 10 days
     (was: not in the last 3–8 posts, which could be a day apart).
   - New kinds: sponsor, visa, remote, offer (see 3).

3. Four new campaigns (added switched OFF, with approval on):
   - "Already licensed to sponsor"  — UK jobs at companies on the register.
   - "Visa sponsorship offered"     — jobs whose ad says sponsorship.
   - "Remote & hybrid"              — remote-friendly roles.
   - "No visa line? Send an offer"  — jobs with no visa mention; every post
                                      leads with the sponsorship offer.
*/

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Name normalisation (one definition, used everywhere)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_org(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE WHEN length(k) >= 3 THEN k END
  FROM (
    SELECT btrim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(p, '')), '\([^)]*\)', ' ', 'g'),   -- "(Netherlands)"
          '&', ' and ', 'g'),
        '[^a-z0-9]+', ' ', 'g'),
      '\m(the|ltd|limited|plc|llp|llc|lp|inc|incorporated|corp|corporation|co|company|uk|u k|gb|group|holdings|holding|gmbh|ag|bv|b v|nv|sa|sas|srl|spa|ab|oy)\M', ' ', 'g'),
    '\s+', ' ', 'g')) AS k
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 2. The UK register
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uk_sponsors (
  name_key text PRIMARY KEY,
  name text NOT NULL,
  city text,
  rating text,
  routes text[] NOT NULL DEFAULT '{}',
  seen_on date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.uk_sponsors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uk_sponsors FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.data_imports (
  source text PRIMARY KEY,
  imported_at timestamptz NOT NULL,
  rows integer NOT NULL,
  file_url text
);
ALTER TABLE public.data_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_imports FROM anon, authenticated;

-- Pipeline: add a batch of organisations. Rows: [{ "n": name, "c": city, "g": rating, "t": [routes] }].
-- "X Ltd T/A Y" is stored under both names.
CREATE OR REPLACE FUNCTION public.uk_sponsors_upsert(p_rows jsonb, p_seen date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  n integer;
BEGIN
  WITH src AS (
    SELECT x.n, x.c, x.g, route, kk.k
    FROM jsonb_to_recordset(p_rows) AS x(n text, c text, g text, t jsonb)
    CROSS JOIN LATERAL unnest(regexp_split_to_array(x.n, '\s+(t/a|trading as)\s+', 'i')) AS part
    CROSS JOIN LATERAL (SELECT public.normalize_org(part) AS k) kk
    LEFT JOIN LATERAL jsonb_array_elements_text(coalesce(x.t, '[]'::jsonb)) AS route ON true
    WHERE kk.k IS NOT NULL
  ),
  agg AS (
    SELECT k, min(n) AS n, min(c) AS c, max(g) AS g, array_remove(array_agg(DISTINCT route), NULL) AS routes
    FROM src GROUP BY k
  )
  INSERT INTO public.uk_sponsors (name_key, name, city, rating, routes, seen_on, updated_at)
  SELECT k, left(n, 200), left(c, 100), left(g, 100), routes, p_seen, now() FROM agg
  ON CONFLICT (name_key) DO UPDATE SET
    name = excluded.name,
    city = excluded.city,
    rating = excluded.rating,
    routes = CASE WHEN public.uk_sponsors.seen_on = excluded.seen_on
                  THEN (SELECT array_agg(DISTINCT r) FROM unnest(public.uk_sponsors.routes || excluded.routes) r)
                  ELSE excluded.routes END,
    seen_on = excluded.seen_on,
    updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.uk_sponsors_upsert(jsonb, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uk_sponsors_upsert(jsonb, date) TO service_role;

-- Pipeline: after all batches. Removes organisations no longer on the register —
-- only when today's import is clearly complete.
CREATE OR REPLACE FUNCTION public.uk_sponsors_finish(p_seen date, p_url text, p_min integer DEFAULT 50000)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  today integer;
  removed integer := 0;
BEGIN
  SELECT count(*) INTO today FROM public.uk_sponsors WHERE seen_on = p_seen;
  IF today < p_min THEN
    RETURN format('kept old data: only %s organisations today (minimum %s)', today, p_min);
  END IF;
  DELETE FROM public.uk_sponsors WHERE seen_on < p_seen;
  GET DIAGNOSTICS removed = ROW_COUNT;
  INSERT INTO public.data_imports (source, imported_at, rows, file_url)
  VALUES ('uk_sponsors', now(), today, p_url)
  ON CONFLICT (source) DO UPDATE SET imported_at = now(), rows = excluded.rows, file_url = excluded.file_url;
  RETURN format('%s organisations, %s removed', today, removed);
END;
$$;
REVOKE ALL ON FUNCTION public.uk_sponsors_finish(date, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uk_sponsors_finish(date, text, integer) TO service_role;

-- Public: is this company on the UK register? Null when not matched.
CREATE OR REPLACE FUNCTION public.uk_sponsor_for_publisher(p_publisher uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', u.name, 'city', u.city, 'rating', u.rating, 'routes', u.routes,
    'checked', (SELECT imported_at FROM public.data_imports WHERE source = 'uk_sponsors')
  )
  FROM public.program_publishers p
  JOIN public.uk_sponsors u ON u.name_key = public.normalize_org(p.name)
  WHERE p.id = p_publisher;
$$;
GRANT EXECUTE ON FUNCTION public.uk_sponsor_for_publisher(uuid) TO anon, authenticated;

-- Daily run.
CREATE OR REPLACE FUNCTION public.sponsors_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'sponsors'));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.sponsors_tick() FROM PUBLIC, anon, authenticated;

-- Admin "run now".
CREATE OR REPLACE FUNCTION public.sponsors_run_now()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'sponsors'));
  RETURN 'started';
END;
$$;
REVOKE ALL ON FUNCTION public.sponsors_run_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsors_run_now() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'madevisa-uk-sponsors';
    -- 11:45 UTC: the Home Office usually publishes around 10:00–12:30 UK time.
    PERFORM cron.schedule('madevisa-uk-sponsors', '45 11 * * *', 'select public.sponsors_tick()');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Social: new campaign kinds and a better picker
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_campaigns DROP CONSTRAINT IF EXISTS social_campaigns_kind_check;
ALTER TABLE public.social_campaigns ADD CONSTRAINT social_campaigns_kind_check
  CHECK (kind IN ('fresh', 'student', 'category', 'company', 'sponsor', 'visa', 'remote', 'offer'));

CREATE INDEX IF NOT EXISTS social_post_jobs_platform_time_idx ON public.social_post_jobs (platform, created_at DESC);

CREATE OR REPLACE FUNCTION public.social_pick_jobs(
  p_platform text, p_count integer, p_kind text DEFAULT 'fresh',
  p_categories text[] DEFAULT '{}', p_countries text[] DEFAULT '{}', p_salary_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH recent_companies AS (
    -- Companies posted on this network in the last 10 days.
    SELECT DISTINCT s2.publisher_id
    FROM public.social_post_jobs x
    JOIN public.sponsored_jobs s2 ON s2.id = x.job_id
    WHERE x.platform = p_platform AND x.created_at > now() - interval '10 days'
  ),
  c AS (
    SELECT s.id, s.title, s.publisher_id, p.name AS company, coalesce(s.image_url, p.logo_url) AS logo,
           s.city, co.name AS country, co.iso_code AS iso, s.remote, s.work_arrangement, s.employment_type, s.experience_level, s.job_function,
           CASE WHEN s.salary_status = 'disclosed' AND s.compensation_text ~ '[1-9]' THEN s.compensation_text END AS salary,
           (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa,
           (s.employment_type IN ('Internship', 'Apprenticeship') OR s.experience_level ILIKE ANY (ARRAY['%intern%', '%entry%', '%student%', '%graduate%', '%junior%'])
             OR s.title ~* '(intern|internship|student|graduate|trainee|werkstudent|apprentice|praktik|stagiaire|junior)') AS student,
           (s.work_arrangement IN ('remote', 'hybrid') OR coalesce(s.remote, false)) AS remote_ok,
           p.name AS pub_name,
           coalesce(s.released_at, s.created_at) AS added_at
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE s.status = 'published' AND NOT s.awaiting_release
      AND (s.expires_at IS NULL OR s.expires_at > now() + interval '2 days')
      -- Fresh jobs only; themed campaigns may look a little further back.
      AND coalesce(s.released_at, s.created_at) > now() - CASE p_kind
            WHEN 'sponsor' THEN interval '7 days'
            WHEN 'visa' THEN interval '3 days'
            WHEN 'remote' THEN interval '3 days'
            WHEN 'offer' THEN interval '3 days'
            ELSE interval '24 hours' END
      AND length(btrim(s.title)) BETWEEN 4 AND 140
      AND (s.city IS NOT NULL OR s.country_id IS NOT NULL OR s.remote OR s.work_arrangement = 'remote')
      AND NOT EXISTS (SELECT 1 FROM public.social_post_jobs x WHERE x.platform = p_platform AND x.job_id = s.id)
      AND s.publisher_id NOT IN (SELECT publisher_id FROM recent_companies)
      AND (coalesce(array_length(p_countries, 1), 0) = 0 OR co.iso_code = ANY (p_countries))
      AND (coalesce(array_length(p_categories, 1), 0) = 0
           OR s.job_function ILIKE ANY (SELECT '%' || x || '%' FROM unnest(p_categories) x)
           OR s.title ILIKE ANY (SELECT '%' || x || '%' FROM unnest(p_categories) x))
  ),
  f AS (
    SELECT * FROM c
    WHERE (p_kind <> 'student' OR student)
      AND (p_kind <> 'visa' OR visa)
      AND (p_kind <> 'offer' OR NOT visa)
      AND (p_kind <> 'remote' OR remote_ok)
      AND (p_kind <> 'sponsor' OR (iso = 'GB' AND EXISTS (SELECT 1 FROM public.uk_sponsors u WHERE u.name_key = public.normalize_org(pub_name))))
      AND (NOT p_salary_only OR salary IS NOT NULL)
  ),
  one AS (
    SELECT DISTINCT ON (publisher_id) * FROM f
    ORDER BY publisher_id, (salary IS NOT NULL) DESC, (logo IS NOT NULL) DESC, added_at DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(one) - 'publisher_id' - 'pub_name' - 'remote_ok' ORDER BY (salary IS NOT NULL) DESC, (logo IS NOT NULL) DESC, added_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM one ORDER BY (salary IS NOT NULL) DESC, (logo IS NOT NULL) DESC, added_at DESC LIMIT least(greatest(p_count, 1), 20)) one;
$$;
REVOKE ALL ON FUNCTION public.social_pick_jobs(text, integer, text, text[], text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_pick_jobs(text, integer, text, text[], text[], boolean) TO authenticated, service_role;

-- New campaigns, off until you switch them on (each added once, by name).
INSERT INTO public.social_campaigns (name, kind, platforms, every_minutes, format, jobs_count, min_jobs, countries, require_approval, enabled)
SELECT v.name, v.kind, v.platforms, v.every_minutes, v.format, v.jobs_count, v.min_jobs, v.countries, true, false
FROM (VALUES
  ('Already licensed to sponsor', 'sponsor', ARRAY['linkedin', 'instagram', 'facebook'], 1440, 'mix', 4, 2, ARRAY['GB']),
  ('Visa sponsorship offered',    'visa',    ARRAY['linkedin', 'instagram', 'facebook'], 720,  'mix', 4, 2, '{}'::text[]),
  ('Remote & hybrid',             'remote',  ARRAY['linkedin', 'instagram', 'facebook'], 1440, 'mix', 4, 3, '{}'::text[]),
  ('No visa line? Send an offer', 'offer',   ARRAY['linkedin', 'instagram', 'facebook'], 1440, 'company', 3, 1, '{}'::text[])
) AS v(name, kind, platforms, every_minutes, format, jobs_count, min_jobs, countries)
WHERE NOT EXISTS (SELECT 1 FROM public.social_campaigns s WHERE s.name = v.name);
