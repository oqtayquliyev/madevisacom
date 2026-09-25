/*
# Job page insights (the 3 graphics at the end of a job)

Run AFTER 20261011090000_closed_jobs_reports_counts.sql.

job_page_insights(pid) returns, for one company:

1. response       Will they answer me?
                  % of applications tracked on MadeVisa that got a reply,
                  and how many days it usually takes.
                  Only when ≥5 applications from ≥3 different people.
2. international  Do they interview people from abroad?
                  People whose nationality differs from the job's country
                  and who reported an interview or offer, by country.
                  Only when ≥3 people from ≥2 countries. Countries with a
                  single person are grouped as "Other countries" so no one
                  can be singled out.
3. live           Is this job real?
                  Open jobs, how many were checked live on the company's
                  careers page in the last 48 hours, new jobs per week for
                  the last 8 weeks, and how long jobs usually stay open
                  (from the closed-job history, once ≥5 jobs have closed).

The website only shows a graphic when there is enough data AND the number
is good; this function just returns the numbers. Readable by everyone.
*/

CREATE OR REPLACE FUNCTION public.job_page_insights(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH apps AS (
    SELECT r.user_id, r.applied_at, r.responded_at, r.interview_at, r.offer_at,
           p.nationality_country_id AS nat,
           coalesce(j.country_id, pub.country_id) AS job_country
    FROM public.application_reports r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.sponsored_jobs j ON r.listing_kind = 'job' AND j.id = r.listing_id
    LEFT JOIN public.program_publishers pub ON pub.id = r.publisher_id
    WHERE r.publisher_id = pid AND r.status <> 'withdrawn' AND NOT r.excluded
  ),
  resp AS (
    SELECT count(*)::int AS tracked,
           count(DISTINCT user_id)::int AS applicants,
           count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
           avg(extract(epoch FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days
    FROM apps
  ),
  intl AS (
    SELECT nat, count(DISTINCT user_id)::int AS n
    FROM apps
    WHERE (interview_at IS NOT NULL OR offer_at IS NOT NULL)
      AND nat IS NOT NULL
      AND (job_country IS NULL OR nat <> job_country)
    GROUP BY nat
  ),
  intl_sum AS (
    SELECT coalesce(sum(n), 0)::int AS people, count(*)::int AS countries FROM intl
  ),
  live AS (
    SELECT count(*) FILTER (WHERE status = 'published')::int AS open_jobs,
           count(*) FILTER (WHERE status = 'published' AND last_seen_at > now() - interval '48 hours')::int AS checked,
           count(*) FILTER (WHERE status = 'published' AND origin = 'imported')::int AS imported_open
    FROM public.sponsored_jobs
    WHERE publisher_id = pid
  ),
  weeks AS (
    SELECT g,
      (SELECT count(*) FROM public.sponsored_jobs s
        WHERE s.publisher_id = pid AND s.status IN ('published', 'expired')
          AND coalesce(s.source_posted_at, s.approved_at, s.created_at) >= date_trunc('week', now()) - make_interval(weeks => g)
          AND coalesce(s.source_posted_at, s.approved_at, s.created_at) <  date_trunc('week', now()) - make_interval(weeks => g - 1)
      )::int AS n
    FROM generate_series(7, 0, -1) AS g
  ),
  hist AS (
    SELECT jobs_closed, days_open_total FROM public.publisher_job_stats WHERE publisher_id = pid
  )
  SELECT jsonb_build_object(
    'response', CASE WHEN resp.tracked >= 5 AND resp.applicants >= 3 THEN jsonb_build_object(
        'rate', round(100.0 * resp.responded / resp.tracked),
        'avg_days', CASE WHEN resp.responded >= 3 THEN round(resp.avg_days::numeric) END,
        'tracked', resp.tracked
      ) END,
    'international', CASE WHEN intl_sum.people >= 3 AND intl_sum.countries >= 2 THEN jsonb_build_object(
        'people', intl_sum.people,
        'countries', intl_sum.countries,
        'top', (
          SELECT coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'code', c.iso_code, 'n', t.n) ORDER BY t.n DESC, c.name), '[]'::jsonb)
          FROM (SELECT nat, n FROM intl WHERE n >= 2 ORDER BY n DESC LIMIT 5) t
          JOIN public.countries c ON c.id = t.nat
        ),
        'other', (SELECT coalesce(sum(n), 0)::int FROM intl WHERE n < 2)
          + (SELECT coalesce(sum(n), 0)::int FROM (SELECT n FROM intl WHERE n >= 2 ORDER BY n DESC OFFSET 5) x)
      ) END,
    'live', jsonb_build_object(
        'open', live.open_jobs,
        'imported_open', live.imported_open,
        'checked', live.checked,
        'weeks', (SELECT jsonb_agg(n ORDER BY g DESC) FROM weeks),
        'avg_open_days', (SELECT CASE WHEN jobs_closed >= 5 THEN round(days_open_total / jobs_closed) END FROM hist)
      )
  )
  FROM resp, intl_sum, live;
$$;

GRANT EXECUTE ON FUNCTION public.job_page_insights(uuid) TO anon, authenticated;
