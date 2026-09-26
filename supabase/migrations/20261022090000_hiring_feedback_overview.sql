/*
/feedback — "Hiring Feedback" page: live totals across all companies.

hiring_feedback_overview() combines the two real sources MadeVisa has:
  - applications tracked on MadeVisa listings (application_reports), and
  - approved shared experiences (company_experience_reports; each person
    counts once per company, their latest report).

It returns overall outcome shares plus the most responsive and the most
silent companies — only companies with at least 3 different people behind
their numbers are listed (responsive: at least half heard back; silent: more
than half heard nothing), so nobody can be singled out and one person
can't put a company on a list.

Run after 20261021090000_company_experience_limits.sql.
*/

CREATE OR REPLACE FUNCTION public.hiring_feedback_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shared AS (
    SELECT DISTINCT ON (user_id, publisher_id)
      user_id, publisher_id, outcome, reply_days::numeric AS reply_days, created_at AS at, 'shared'::text AS src
    FROM public.company_experience_reports
    WHERE status = 'approved' AND publisher_id IS NOT NULL
    ORDER BY user_id, publisher_id, applied_on DESC, created_at DESC
  ),
  tracked AS (
    SELECT user_id, publisher_id,
      CASE status
        WHEN 'viewed' THEN 'responded'
        WHEN 'responded' THEN 'responded'
        WHEN 'interview' THEN 'interview'
        WHEN 'offer' THEN 'offer'
        WHEN 'rejected' THEN 'rejected'
        ELSE 'no_response'
      END AS outcome,
      CASE WHEN responded_at IS NOT NULL THEN EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0 END AS reply_days,
      updated_at AS at, 'tracked'::text AS src
    FROM public.application_reports
    WHERE NOT excluded AND status IN ('viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response', 'no_response_week')
  ),
  allr AS (SELECT * FROM shared UNION ALL SELECT * FROM tracked),
  tot AS (
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE src = 'shared')::int AS shared_n,
      count(*) FILTER (WHERE src = 'tracked')::int AS tracked_n,
      count(DISTINCT publisher_id)::int AS companies,
      count(DISTINCT user_id)::int AS people,
      count(*) FILTER (WHERE outcome = 'no_response')::int AS no_response,
      count(*) FILTER (WHERE outcome = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE outcome = 'responded')::int AS responded,
      count(*) FILTER (WHERE outcome = 'interview')::int AS interview,
      count(*) FILTER (WHERE outcome = 'offer')::int AS offer,
      round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL AND reply_days >= 0)::numeric, 1) AS avg_reply_days,
      count(*) FILTER (WHERE at > now() - interval '7 days')::int AS last_7d
    FROM allr
  ),
  per AS (
    SELECT a.publisher_id, count(*)::int AS n, count(DISTINCT a.user_id)::int AS people,
      round(100.0 * count(*) FILTER (WHERE a.outcome <> 'no_response') / count(*))::int AS heard_pct,
      round(100.0 * count(*) FILTER (WHERE a.outcome = 'no_response') / count(*))::int AS silent_pct,
      round(avg(a.reply_days) FILTER (WHERE a.reply_days IS NOT NULL AND a.reply_days >= 0)::numeric, 1) AS avg_reply_days
    FROM allr a
    GROUP BY a.publisher_id
    HAVING count(DISTINCT a.user_id) >= 3
  ),
  named AS (
    SELECT per.*, p.name, p.logo_url
    FROM per JOIN public.program_publishers p ON p.id = per.publisher_id
    WHERE p.verification_status = 'verified'
  )
  SELECT jsonb_build_object(
    'total', tot.n,
    'shared', tot.shared_n,
    'tracked', tot.tracked_n,
    'companies', tot.companies,
    'people', tot.people,
    'last_7d', tot.last_7d,
    'no_response', tot.no_response,
    'rejected', tot.rejected,
    'responded', tot.responded,
    'interview', tot.interview,
    'offer', tot.offer,
    'avg_reply_days', tot.avg_reply_days,
    'most_responsive', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', publisher_id, 'name', name, 'logo_url', logo_url, 'n', n, 'pct', heard_pct, 'avg_reply_days', avg_reply_days) ORDER BY heard_pct DESC, n DESC)
      FROM (SELECT * FROM named WHERE heard_pct >= 50 ORDER BY heard_pct DESC, n DESC LIMIT 5) x
    ), '[]'::jsonb),
    'most_silent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', publisher_id, 'name', name, 'logo_url', logo_url, 'n', n, 'pct', silent_pct) ORDER BY silent_pct DESC, n DESC)
      FROM (SELECT * FROM named WHERE silent_pct > 50 ORDER BY silent_pct DESC, n DESC LIMIT 5) x
    ), '[]'::jsonb)
  )
  FROM tot;
$$;

GRANT EXECUTE ON FUNCTION public.hiring_feedback_overview() TO anon, authenticated;
