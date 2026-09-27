/*
# Only jobs posted in the last 30 days · landing = newest jobs, 5 companies

Run AFTER 20261027090000_landing_24h_and_diverse_newest.sql. Safe to run
more than once.

## The rule
A job's "posted" date = the date the company posted it on its careers
page (source_posted_at) — or, when the source didn't say, when it went
live on MadeVisa (created_at). Whichever is earlier.
A job is shown for 30 days after that date, never longer.

## What this migration does
1. job_posted_at(source_posted_at, created_at) — that date, as a function
   (plus an index, so "newest first" and the clean-up are fast).
2. A trigger that caps expires_at at posted + 30 days on every insert and
   whenever status / expires_at / source_posted_at change. So a sync can
   no longer keep a 2025 job alive, and a job imported with an old date is
   hidden the moment it lands.
3. enforce_job_age_limit(batch) — cleans up jobs past 30 days, a batch at
   a time (easy on the database):
     - imported jobs whose source date is over 30 days old → deleted
       (the importer now skips such jobs, so they won't come back);
     - everything else past 30 days → hidden (status 'expired',
       closed_reason 'age'). Kept as a small marker so the next sync
       recognises the job and doesn't re-add it as "new".
   Runs every hour by itself (pg_cron). For the jobs that are already
   too old today, see "Remove old jobs now" below.
4. landing_job_ids(n): the landing page's 5 cards — the newest job of 5
   different companies (companies with a logo first), newest first.
5. newest_diverse_job_ids(n, per_company): first jobs a signed-out
   visitor sees on /jobs — the newest jobs, at most 3 per company.

## Remove old jobs now (one time)
Admin → Update all jobs → "Remove jobs older than 30 days" does it in
small steps with a Pause button. Or, in the SQL editor, run this
repeatedly until it returns {"deleted":0,"hidden":0}:

    select public.enforce_job_age_limit(3000);
*/

-- 1. Posted date --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.job_posted_at(p_source timestamptz, p_created timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT least(coalesce(p_source, p_created), p_created);
$$;

CREATE INDEX IF NOT EXISTS sponsored_jobs_live_posted_idx
  ON public.sponsored_jobs (public.job_posted_at(source_posted_at, created_at) DESC)
  WHERE status = 'published';

-- 2. Never shown longer than 30 days after posting ----------------------

CREATE OR REPLACE FUNCTION public.cap_job_age()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit timestamptz := public.job_posted_at(NEW.source_posted_at, coalesce(NEW.created_at, now())) + interval '30 days';
BEGIN
  -- A posting date in the future is a parsing mistake — treat it as unknown.
  IF NEW.source_posted_at IS NOT NULL AND NEW.source_posted_at > now() + interval '1 day' THEN
    NEW.source_posted_at := NULL;
    v_limit := coalesce(NEW.created_at, now()) + interval '30 days';
  END IF;
  IF NEW.expires_at IS NULL OR NEW.expires_at > v_limit THEN
    NEW.expires_at := v_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_cap_job_age ON public.sponsored_jobs;
CREATE TRIGGER a_cap_job_age
  BEFORE INSERT OR UPDATE OF status, expires_at, source_posted_at ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cap_job_age();

-- 3. Clean-up, a batch at a time -----------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_job_age_limit(p_batch int DEFAULT 2000)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
  v_deleted int := 0;
  v_hidden int := 0;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  WITH c AS (
    SELECT id,
           (origin = 'imported' AND source_posted_at IS NOT NULL AND source_posted_at < v_cutoff) AS drop_it
    FROM public.sponsored_jobs
    WHERE status = 'published'
      AND public.job_posted_at(source_posted_at, created_at) < v_cutoff
    ORDER BY public.job_posted_at(source_posted_at, created_at)
    LIMIT least(greatest(coalesce(p_batch, 2000), 1), 10000)
    FOR UPDATE SKIP LOCKED
  ),
  d AS (
    DELETE FROM public.sponsored_jobs j USING c
    WHERE j.id = c.id AND c.drop_it
    RETURNING 1
  ),
  h AS (
    UPDATE public.sponsored_jobs j
    SET status = 'expired',
        closed_reason = 'age',
        -- In the past, so it isn't shown greyed out as "Closed".
        closed_at = now() - interval '2 days'
    FROM c
    WHERE j.id = c.id AND NOT c.drop_it
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM d), (SELECT count(*) FROM h) INTO v_deleted, v_hidden;

  RETURN json_build_object('deleted', v_deleted, 'hidden', v_hidden);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_job_age_limit(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enforce_job_age_limit(int) TO authenticated;

-- Every hour (minute 23), 3,000 at most — keeps up with daily imports.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'madevisa-job-age-limit';
  PERFORM cron.schedule('madevisa-job-age-limit', '23 * * * *', 'select public.enforce_job_age_limit(3000)');
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron not available (%). Use Admin → Update all jobs → Remove jobs older than 30 days.', SQLERRM;
END;
$$;

-- 4. Landing page: newest job of 5 different companies ------------------

CREATE OR REPLACE FUNCTION public.landing_job_ids(n int DEFAULT 5)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
  WITH recent AS (
    SELECT
      j.id,
      j.publisher_id,
      j.created_at,
      public.job_posted_at(j.source_posted_at, j.created_at) AS posted,
      (coalesce(btrim(p.logo_url), '') <> '' OR coalesce(btrim(j.image_url), '') <> '') AS has_logo
    FROM public.sponsored_jobs j
    JOIN public.program_publishers p ON p.id = j.publisher_id
    WHERE j.status = 'published'
      AND public.job_posted_at(j.source_posted_at, j.created_at) > now() - interval '7 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ),
  newest_per_company AS (
    SELECT DISTINCT ON (publisher_id) id, posted, created_at, has_logo
    FROM recent
    ORDER BY publisher_id, posted DESC, created_at DESC
  )
  SELECT id FROM newest_per_company
  -- Companies with a logo (last 3 days) first, then strictly newest first.
  ORDER BY (has_logo AND posted > now() - interval '3 days') DESC, posted DESC, created_at DESC
  LIMIT least(greatest(n, 1), 12);
$$;
GRANT EXECUTE ON FUNCTION public.landing_job_ids(int) TO anon, authenticated;

-- 5. Guests on /jobs: newest jobs, at most `per_company` per company -----

CREATE OR REPLACE FUNCTION public.newest_diverse_job_ids(n int DEFAULT 36, per_company int DEFAULT 3)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8s'
AS $$
  SELECT id FROM (
    SELECT
      j.id,
      public.job_posted_at(j.source_posted_at, j.created_at) AS posted,
      j.created_at,
      row_number() OVER (
        PARTITION BY j.publisher_id
        ORDER BY public.job_posted_at(j.source_posted_at, j.created_at) DESC, j.created_at DESC, j.id DESC
      ) AS rn
    FROM public.sponsored_jobs j
    WHERE j.status = 'published'
      AND public.job_posted_at(j.source_posted_at, j.created_at) > now() - interval '7 days'
      AND (j.expires_at IS NULL OR j.expires_at > now())
  ) t
  WHERE rn <= least(greatest(per_company, 1), 10)
  ORDER BY posted DESC, created_at DESC
  LIMIT least(greatest(n, 1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.newest_diverse_job_ids(int, int) TO anon, authenticated;
