/*
# Closed jobs, job reports, and job counts every 5 minutes

Run AFTER 20261010090000_refresh_site_stats.sql.

## 1. Jobs removed from a company's careers page → "Closed" for 24 hours
- New columns: closed_at, closed_reason ('source' = gone from the
  company's careers page, found by sync).
- For 24 hours visitors still see the job, greyed out with a "Closed"
  label, so a link someone saved or shared doesn't break at once.
- After 24 hours cleanup_closed_jobs() deletes it — but first adds it to
  publisher_job_stats (how many jobs each company closed and how long
  they were open), so company scores and metrics keep that history.
- Only jobs closed BY SYNC are auto-deleted. A job a company or admin
  closes by hand stays (it can be reopened).
- Setting a job back to published clears closed_at.

## 2. Job reports ("Report this job")
- job_reports table, readable/editable by admins only.
- submit_job_report(): the only way in. Spam protection: hidden honeypot
  field, time on page, a small proof of work done by the browser, 300
  characters max, and limits: 5 reports per network per hour, 15 per
  day, one report per job per network per day, 300 per hour site-wide.

## 3. Automatic schedules (pg_cron)
- Every 5 minutes: admin_refresh_site_stats() → homepage / jobs page count.
- Every hour: cleanup_closed_jobs().
If pg_cron can't be enabled on your project, everything else still works:
the admin "Update count now" and "Keep jobs updated" panel do both jobs.

Safe to run more than once.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1. Closed jobs
-- ---------------------------------------------------------------------

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text;

CREATE INDEX IF NOT EXISTS sponsored_jobs_closed_idx
  ON public.sponsored_jobs (status, closed_at)
  WHERE closed_at IS NOT NULL;

-- Keep closed_at in step with the status, whoever changes it.
CREATE OR REPLACE FUNCTION public.track_job_closed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'expired' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'expired') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  ELSIF NEW.status IS DISTINCT FROM 'expired' THEN
    NEW.closed_at := NULL;
    NEW.closed_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_track_job_closed ON public.sponsored_jobs;
CREATE TRIGGER b_track_job_closed
  BEFORE INSERT OR UPDATE OF status, closed_at, closed_reason ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.track_job_closed();

-- Visitors can also read jobs closed in the last 24 hours (shown greyed out).
DROP POLICY IF EXISTS "sponsored_jobs_select_published_or_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_select_published_or_owner"
  ON public.sponsored_jobs FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR (status = 'expired' AND closed_at > now() - interval '24 hours')
    OR (SELECT public.is_admin())
    OR public.can_manage_publisher(publisher_id)
  );

-- History kept after closed jobs are deleted (for company scores / metrics).
CREATE TABLE IF NOT EXISTS public.publisher_job_stats (
  publisher_id uuid PRIMARY KEY REFERENCES public.program_publishers(id) ON DELETE CASCADE,
  jobs_closed bigint NOT NULL DEFAULT 0,
  days_open_total numeric NOT NULL DEFAULT 0,
  last_closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publisher_job_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "publisher_job_stats_read" ON public.publisher_job_stats;
CREATE POLICY "publisher_job_stats_read" ON public.publisher_job_stats FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.publisher_job_stats TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_closed_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT (session_user IN ('postgres', 'supabase_admin') OR public.is_admin()) THEN
    RAISE EXCEPTION 'Admin access (with your two-step code) required.' USING ERRCODE = '42501';
  END IF;

  WITH gone AS (
    SELECT id FROM public.sponsored_jobs
    WHERE status = 'expired' AND closed_reason = 'source'
      AND closed_at < now() - interval '24 hours'
    ORDER BY closed_at
    LIMIT 5000
  ),
  deleted AS (
    DELETE FROM public.sponsored_jobs j USING gone
    WHERE j.id = gone.id
    RETURNING j.publisher_id, j.closed_at, coalesce(j.approved_at, j.created_at) AS opened_at
  ),
  per_company AS (
    SELECT publisher_id,
           count(*) AS n,
           sum(greatest(extract(epoch FROM (closed_at - opened_at)) / 86400, 0)) AS days,
           max(closed_at) AS last_closed
    FROM deleted
    WHERE publisher_id IS NOT NULL
    GROUP BY publisher_id
  ),
  saved AS (
    INSERT INTO public.publisher_job_stats AS s (publisher_id, jobs_closed, days_open_total, last_closed_at, updated_at)
    SELECT publisher_id, n, coalesce(days, 0), last_closed, now() FROM per_company
    WHERE EXISTS (SELECT 1 FROM public.program_publishers p WHERE p.id = per_company.publisher_id)
    ON CONFLICT (publisher_id) DO UPDATE
      SET jobs_closed = s.jobs_closed + excluded.jobs_closed,
          days_open_total = s.days_open_total + excluded.days_open_total,
          last_closed_at = greatest(s.last_closed_at, excluded.last_closed_at),
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_closed_jobs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_closed_jobs() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Job reports
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  job_title text,
  company_name text,
  reason text NOT NULL CHECK (reason IN ('offensive', 'fake', 'inaccurate', 'closed', 'advertisement', 'other')),
  details text CHECK (details IS NULL OR length(details) <= 300),
  reporter_id uuid,
  ip_hash text,
  pow_hash text UNIQUE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

CREATE INDEX IF NOT EXISTS job_reports_created_idx ON public.job_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS job_reports_ip_idx ON public.job_reports (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS job_reports_job_idx ON public.job_reports (job_id);

ALTER TABLE public.job_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_reports_admin_select" ON public.job_reports;
CREATE POLICY "job_reports_admin_select" ON public.job_reports FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "job_reports_admin_update" ON public.job_reports;
CREATE POLICY "job_reports_admin_update" ON public.job_reports FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "job_reports_admin_delete" ON public.job_reports;
CREATE POLICY "job_reports_admin_delete" ON public.job_reports FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.submit_job_report(
  p_job_id uuid,
  p_reason text,
  p_details text,
  p_website text,        -- honeypot
  p_started_at bigint,   -- ms since epoch when the popup opened
  p_pow_ts bigint,
  p_pow_nonce text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  now_ms bigint := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text;
  ip_h text;
  pow text;
  details_clean text := nullif(regexp_replace(btrim(coalesce(p_details, '')), '\s+', ' ', 'g'), '');
  n int;
  v_title text;
  v_company text;
BEGIN
  IF coalesce(p_website, '') <> '' THEN
    RETURN json_build_object('ok', true);
  END IF;

  IF p_started_at IS NULL OR now_ms - p_started_at < 2500 OR now_ms - p_started_at > 7200000 THEN
    RAISE EXCEPTION 'Please reload the page and try again.';
  END IF;

  IF p_pow_ts IS NULL OR p_pow_nonce IS NULL OR length(p_pow_nonce) > 32
     OR now_ms - p_pow_ts > 1800000 OR p_pow_ts - now_ms > 120000 THEN
    RAISE EXCEPTION 'Verification expired. Please reload the page and try again.';
  END IF;
  pow := encode(digest(p_pow_ts::text || ':' || p_pow_nonce, 'sha256'), 'hex');
  IF left(pow, 4) <> '0000' THEN
    RAISE EXCEPTION 'Verification failed. Please reload the page and try again.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_reports WHERE pow_hash = pow) THEN
    RAISE EXCEPTION 'This report was already sent.';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('offensive', 'fake', 'inaccurate', 'closed', 'advertisement', 'other') THEN
    RAISE EXCEPTION 'Please choose a reason.';
  END IF;
  IF details_clean IS NOT NULL AND length(details_clean) > 300 THEN
    RAISE EXCEPTION 'Please keep additional information under 300 characters.';
  END IF;
  IF p_reason = 'other' AND details_clean IS NULL THEN
    RAISE EXCEPTION 'Please tell us a little about the problem.';
  END IF;

  SELECT j.title, p.name INTO v_title, v_company
  FROM public.sponsored_jobs j LEFT JOIN public.program_publishers p ON p.id = j.publisher_id
  WHERE j.id = p_job_id;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'This job is no longer on MadeVisa.';
  END IF;

  SELECT count(*) INTO n FROM public.job_reports WHERE created_at > now() - interval '1 hour';
  IF n >= 300 THEN RAISE EXCEPTION 'We are receiving a lot of reports right now. Please try again later.'; END IF;

  ip := coalesce(headers->>'cf-connecting-ip', headers->>'x-real-ip', btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)));
  ip_h := CASE WHEN coalesce(ip, '') = '' THEN NULL ELSE encode(digest('mv-job-reports:' || ip, 'sha256'), 'hex') END;

  IF ip_h IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.job_reports WHERE ip_hash = ip_h AND created_at > now() - interval '1 hour';
    IF n >= 5 THEN RAISE EXCEPTION 'You have sent several reports in the last hour. Please try again later.'; END IF;
    SELECT count(*) INTO n FROM public.job_reports WHERE ip_hash = ip_h AND created_at > now() - interval '24 hours';
    IF n >= 15 THEN RAISE EXCEPTION 'You have reached today''s limit for reports. Thank you for helping.'; END IF;
    IF EXISTS (SELECT 1 FROM public.job_reports WHERE ip_hash = ip_h AND job_id = p_job_id AND created_at > now() - interval '24 hours') THEN
      RETURN json_build_object('ok', true, 'duplicate', true);
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.job_reports WHERE reporter_id = auth.uid() AND created_at > now() - interval '24 hours';
    IF n >= 15 THEN RAISE EXCEPTION 'You have reached today''s limit for reports. Thank you for helping.'; END IF;
  END IF;

  INSERT INTO public.job_reports (job_id, job_title, company_name, reason, details, reporter_id, ip_hash, pow_hash)
  VALUES (p_job_id, left(v_title, 200), left(v_company, 200), p_reason, details_clean, auth.uid(), ip_h, pow);

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_job_report(uuid, text, text, text, bigint, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_job_report(uuid, text, text, text, bigint, bigint, text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Schedules
-- ---------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron is not available (%). Counts and cleanup will run from the admin panel instead.', SQLERRM;
    RETURN;
  END;

  BEGIN PERFORM cron.unschedule('madevisa-site-stats'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('madevisa-closed-jobs-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END;

  IF to_regprocedure('public.admin_refresh_site_stats()') IS NOT NULL THEN
    PERFORM cron.schedule('madevisa-site-stats', '*/5 * * * *', 'select public.admin_refresh_site_stats()');
  ELSE
    RAISE NOTICE 'Run 20261010090000_refresh_site_stats.sql, then this file again, to count jobs every 5 minutes.';
  END IF;
  PERFORM cron.schedule('madevisa-closed-jobs-cleanup', '17 * * * *', 'select public.cleanup_closed_jobs()');
END;
$$;
