/*
  /feedback company cards: one source for every number on the page.
  Counts approved shared reports (latest per person per company) plus applications tracked on MadeVisa,
  the same inputs and the same fair score as hiring_feedback_overview (replies, interviews and offers weigh
  more; silence after a poor match less; verified reports more). The score (0–100) is shown as 1–5 stars.
  Nothing is shown below 5 reports from at least 3 people; the card then shows how many reports there are.
*/
CREATE OR REPLACE FUNCTION public.feedback_company_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shared AS (
    SELECT DISTINCT ON (user_id, publisher_id)
      user_id, publisher_id, outcome, reply_days::numeric AS reply_days,
      CASE WHEN email_verified THEN 1.0 ELSE 0.5 END AS trust, match_pct::int AS match_pct
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
      1.2::numeric AS trust, NULL::int AS match_pct
    FROM public.application_reports
    WHERE NOT excluded AND status IN ('viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response', 'no_response_week')
  ),
  allr AS (
    SELECT *, public.experience_weight(outcome, trust, match_pct) AS wt
    FROM (SELECT * FROM shared UNION ALL SELECT * FROM tracked) u
    WHERE publisher_id IS NOT NULL
  ),
  per AS (
    SELECT publisher_id, count(*)::int AS n, count(DISTINCT user_id)::int AS people,
      round(100.0 * count(*) FILTER (WHERE outcome <> 'no_response') / count(*))::int AS pct,
      round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL AND reply_days >= 0)::numeric, 1) AS days,
      round((sum(wt * public.experience_points(outcome)) + 250) / (sum(wt) + 5))::int AS score
    FROM allr
    GROUP BY publisher_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', publisher_id, 'n', n, 'people', people,
    'pct', CASE WHEN n >= 5 AND people >= 3 THEN pct END,
    'days', CASE WHEN n >= 5 AND people >= 3 THEN days END,
    'score', CASE WHEN n >= 5 AND people >= 3 THEN score END)), '[]'::jsonb)
  FROM per;
$$;
REVOKE ALL ON FUNCTION public.feedback_company_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_company_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
