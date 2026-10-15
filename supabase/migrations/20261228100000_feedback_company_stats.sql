/*
  /feedback company cards: one source for every number on the page.
  Counts approved shared reports (latest per person per company) plus applications tracked on MadeVisa,
  the same inputs as hiring_feedback_overview. A reply rate is shown only from 5 reports by at least 3 people;
  below that the card shows how many reports there are so far.
*/
CREATE OR REPLACE FUNCTION public.feedback_company_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shared AS (
    SELECT DISTINCT ON (user_id, publisher_id) user_id, publisher_id, outcome, reply_days::numeric AS reply_days
    FROM public.company_experience_reports
    WHERE status = 'approved' AND publisher_id IS NOT NULL
    ORDER BY user_id, publisher_id, applied_on DESC, created_at DESC
  ),
  tracked AS (
    SELECT user_id, publisher_id,
      CASE WHEN status IN ('viewed', 'responded', 'interview', 'offer', 'rejected') THEN 'heard' ELSE 'no_response' END AS outcome,
      CASE WHEN responded_at IS NOT NULL THEN EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0 END AS reply_days
    FROM public.application_reports
    WHERE NOT excluded AND status IN ('viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response', 'no_response_week')
  ),
  allr AS (
    SELECT user_id, publisher_id, outcome, reply_days FROM shared
    UNION ALL
    SELECT user_id, publisher_id, outcome, reply_days FROM tracked
  ),
  per AS (
    SELECT publisher_id, count(*)::int AS n, count(DISTINCT user_id)::int AS people,
      round(100.0 * count(*) FILTER (WHERE outcome <> 'no_response') / count(*))::int AS pct,
      round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL AND reply_days >= 0)::numeric, 1) AS days
    FROM allr
    WHERE publisher_id IS NOT NULL
    GROUP BY publisher_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', publisher_id, 'n', n, 'people', people,
    'pct', CASE WHEN n >= 5 AND people >= 3 THEN pct END,
    'days', CASE WHEN n >= 5 AND people >= 3 THEN days END)), '[]'::jsonb)
  FROM per;
$$;
REVOKE ALL ON FUNCTION public.feedback_company_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_company_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
