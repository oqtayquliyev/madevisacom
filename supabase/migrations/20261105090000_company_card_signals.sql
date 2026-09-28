/*
# Company signals on job cards

One call per page of job cards: for each company, what applicants saw
(reply rate + typical reply time, only with enough reports — same
thresholds as Company Scores: ≥5 tracked applications from ≥3 people) and
how actively it is hiring (live roles, roles added in the last 30 days).
Public, aggregate numbers only. Run AFTER 20261104090000.
*/

CREATE OR REPLACE FUNCTION public.company_card_signals(pids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '6s'
AS $$
  WITH ids AS (SELECT DISTINCT x AS pid FROM unnest(pids[1:80]) AS x WHERE x IS NOT NULL),
  a AS (
    SELECT r.publisher_id,
      count(*)::int AS tracked,
      count(DISTINCT r.user_id)::int AS applicants,
      count(*) FILTER (WHERE r.responded_at IS NOT NULL)::int AS responded,
      count(*) FILTER (WHERE r.responded_at IS NOT NULL AND r.applied_at IS NOT NULL AND r.responded_at >= r.applied_at)::int AS timed,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (r.responded_at - r.applied_at)) / 86400.0)
        FILTER (WHERE r.responded_at IS NOT NULL AND r.applied_at IS NOT NULL AND r.responded_at >= r.applied_at) AS median_days
    FROM public.application_reports r
    JOIN ids ON ids.pid = r.publisher_id
    WHERE r.status <> 'withdrawn' AND NOT r.excluded
    GROUP BY r.publisher_id
  ),
  j AS (
    SELECT s.publisher_id,
      count(*) FILTER (WHERE s.status = 'published' AND NOT s.awaiting_release AND (s.expires_at IS NULL OR s.expires_at > now()))::int AS live,
      count(*) FILTER (WHERE coalesce(s.released_at, s.created_at) > now() - interval '30 days' AND NOT s.awaiting_release)::int AS posted_30d,
      max(coalesce(s.released_at, s.created_at)) FILTER (WHERE NOT s.awaiting_release) AS last_posted
    FROM public.sponsored_jobs s
    JOIN ids ON ids.pid = s.publisher_id
    GROUP BY s.publisher_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', ids.pid,
    'tracked', coalesce(a.tracked, 0),
    'response_rate', CASE WHEN a.tracked >= 5 AND a.applicants >= 3 THEN round(100.0 * a.responded / a.tracked) END,
    'median_days', CASE WHEN a.tracked >= 5 AND a.applicants >= 3 AND a.timed >= 3 THEN round(a.median_days::numeric, 1) END,
    'live', coalesce(j.live, 0),
    'posted_30d', coalesce(j.posted_30d, 0),
    'last_posted', j.last_posted
  )), '[]'::jsonb)
  FROM ids
  LEFT JOIN a ON a.publisher_id = ids.pid
  LEFT JOIN j ON j.publisher_id = ids.pid;
$$;

GRANT EXECUTE ON FUNCTION public.company_card_signals(uuid[]) TO anon, authenticated;
