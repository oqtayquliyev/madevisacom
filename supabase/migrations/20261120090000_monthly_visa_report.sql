/*
# Monthly Visa Hiring Report (Batch 6)
Run AFTER 20261119090000_visa_plan_name.sql. Safe to run more than once.
Then deploy:  supabase functions deploy auto-pipeline --no-verify-jwt

On the 1st of each month the pipeline ({ cron: "monthly" }) writes one
global article about the month before: new jobs, which countries and
companies offered sponsorship, how many UK jobs came from licensed
sponsors, and measured reply rates for Visa Plans vs ordinary applications.

Fairness rules, built into the data:
- A rate is only returned when it rests on enough data (30+ items);
  otherwise it is NULL and the article leaves that section out.
- Companies only appear in POSITIVE lists ("most sponsored jobs",
  "replied most"), and the reply list needs 10+ tracked applications from
  5+ different people per company. No "worst companies" list is ever made.
- Everything is an aggregate. No candidate is identifiable.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.visa_hiring_monthly(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH live AS (
    -- Jobs that went live on MadeVisa during the month.
    SELECT s.id, s.publisher_id, p.name AS company, co.iso_code AS iso, co.name AS country,
           (s.visa_status = 'offered' OR s.visa_sponsorship) AS visa
    FROM public.sponsored_jobs s
    JOIN public.program_publishers p ON p.id = s.publisher_id
    LEFT JOIN public.countries co ON co.id = s.country_id
    WHERE coalesce(s.released_at, s.approved_at, s.created_at) >= p_from
      AND coalesce(s.released_at, s.approved_at, s.created_at) < p_to
      AND NOT coalesce(s.awaiting_release, false)
      AND s.status IN ('published', 'expired', 'closed')
  ),
  plans AS (
    SELECT hb.id,
           hb.unique_viewers > 0 AS opened,
           EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.counted) AS replied,
           EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.counted AND r.verified_domain) AS verified,
           EXISTS (SELECT 1 FROM public.brief_replies r WHERE r.brief_id = hb.id AND r.counted AND r.kind = 'interested') AS interested,
           hb.status IN ('replied', 'interview', 'offer', 'declined') AS self_reported
    FROM public.hiring_briefs hb
    WHERE hb.created_at >= p_from AND hb.created_at < p_to AND hb.status <> 'withdrawn'
  ),
  apps AS (
    SELECT status FROM public.application_reports
    WHERE applied_at >= p_from AND applied_at < p_to AND status <> 'withdrawn'
  ),
  responsive AS (
    -- Last 90 days up to the end of the month; enough people per company.
    SELECT ar.publisher_id, p.name,
           count(*) AS tracked,
           count(*) FILTER (WHERE ar.status IN ('responded', 'interview', 'offer', 'rejected')) AS replied
    FROM public.application_reports ar
    JOIN public.program_publishers p ON p.id = ar.publisher_id
    WHERE ar.applied_at >= p_to - interval '90 days' AND ar.applied_at < p_to - interval '14 days'
      AND ar.status <> 'withdrawn'
    GROUP BY ar.publisher_id, p.name
    HAVING count(*) >= 10 AND count(DISTINCT ar.user_id) >= 5
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'jobs', (SELECT count(*) FROM live),
    'visa_jobs', (SELECT count(*) FROM live WHERE visa),
    'companies', (SELECT count(DISTINCT publisher_id) FROM live),
    'countries', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'jobs')::int DESC) FROM (
        SELECT jsonb_build_object('iso', iso, 'name', country, 'jobs', count(*), 'visa_jobs', count(*) FILTER (WHERE visa)) AS x
        FROM live WHERE iso IS NOT NULL GROUP BY iso, country ORDER BY count(*) DESC LIMIT 10
      ) t), '[]'::jsonb),
    'visa_companies', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'visa_jobs')::int DESC) FROM (
        SELECT jsonb_build_object('id', publisher_id, 'name', company, 'visa_jobs', count(*)) AS x
        FROM live WHERE visa GROUP BY publisher_id, company HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 10
      ) t), '[]'::jsonb),
    'uk', jsonb_build_object(
      'jobs', (SELECT count(*) FROM live WHERE iso = 'GB'),
      'licensed_jobs', (SELECT count(*) FROM live l WHERE l.iso = 'GB'
                        AND EXISTS (SELECT 1 FROM public.uk_sponsors u WHERE u.name_key = public.normalize_org(l.company))),
      'register_orgs', (SELECT count(*) FROM public.uk_sponsors),
      'checked', (SELECT imported_at FROM public.data_imports WHERE source = 'uk_sponsors')
    ),
    'plans', jsonb_build_object(
      'created', (SELECT count(*) FROM plans),
      'opened', (SELECT count(*) FROM plans WHERE opened),
      'replied', (SELECT count(*) FROM plans WHERE replied OR self_reported),
      'verified', (SELECT count(*) FROM plans WHERE verified),
      'interested', (SELECT count(*) FROM plans WHERE interested),
      'enough', (SELECT count(*) >= 30 FROM plans)
    ),
    'applications', jsonb_build_object(
      'tracked', (SELECT count(*) FROM apps),
      'replied', (SELECT count(*) FROM apps WHERE status IN ('responded', 'interview', 'offer', 'rejected')),
      'enough', (SELECT count(*) >= 30 FROM apps)
    ),
    'responsive', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'rate')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', publisher_id, 'name', name, 'tracked', tracked, 'rate', round(100.0 * replied / tracked)) AS x
        FROM responsive ORDER BY replied::numeric / tracked DESC, tracked DESC LIMIT 5
      ) t), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.visa_hiring_monthly(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visa_hiring_monthly(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.monthly_report_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'monthly'));
  RETURN 'sent';
END;
$$;
REVOKE ALL ON FUNCTION public.monthly_report_tick() FROM PUBLIC, anon, authenticated;

-- Admin: write last month's report now (does nothing if it already exists).
CREATE OR REPLACE FUNCTION public.monthly_report_run_now()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  PERFORM public._pipeline_call(jsonb_build_object('cron', 'monthly'));
  RETURN 'started';
END;
$$;
REVOKE ALL ON FUNCTION public.monthly_report_run_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monthly_report_run_now() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'madevisa-monthly-report';
    -- 1st of each month, 07:00 UTC.
    PERFORM cron.schedule('madevisa-monthly-report', '0 7 1 * *', 'select public.monthly_report_tick()');
  END IF;
END $$;
