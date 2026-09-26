/*
Shared application experiences — protection against spam and against
someone trying to damage (or boost) a company on purpose.

  1. Only people with a verified email can share.
  2. At most 3 shares a day per person.
  3. One share per person per company every 30 days, and at most 3 ever
     for the same company.
  4. On the company page each person counts once per company (their latest
     approved report), so one person can't tilt the numbers.
  5. The breakdown is shown only once 3 different people have shared about
     the company; before that the page just says how many reports exist.

Every report still goes through admin review before it counts.
Run after 20261020090000_company_experience_reports.sql.
*/

CREATE OR REPLACE FUNCTION public.guard_company_experience_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent int;
  same_company_recent int;
  same_company_total int;
  key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to share your experience';
  END IF;
  NEW.user_id := auth.uid();
  NEW.status := 'pending';
  NEW.admin_note := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  NEW.company_name := btrim(regexp_replace(NEW.company_name, '\s+', ' ', 'g'));

  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Please verify your email first — it keeps these reports trustworthy.';
  END IF;

  IF NEW.applied_on > current_date OR NEW.applied_on < current_date - 730 THEN
    RAISE EXCEPTION 'Choose when you applied (within the last 2 years)';
  END IF;
  IF NEW.outcome = 'no_response' THEN
    NEW.reply_days := NULL;
    IF NEW.applied_on > current_date - 7 THEN
      RAISE EXCEPTION 'You can report "no response" once a week has passed since applying';
    END IF;
  END IF;

  SELECT count(*) INTO recent FROM public.company_experience_reports
    WHERE user_id = auth.uid() AND created_at > now() - interval '24 hours';
  IF recent >= 3 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You can share up to 3 experiences a day. Thank you — please come back tomorrow.';
  END IF;

  -- Same company = same linked company, or the same name ignoring case/punctuation.
  key := lower(regexp_replace(NEW.company_name, '[^[:alnum:]]+', '', 'g'));
  SELECT count(*) FILTER (WHERE created_at > now() - interval '30 days'), count(*)
    INTO same_company_recent, same_company_total
    FROM public.company_experience_reports
    WHERE user_id = auth.uid()
      AND status <> 'rejected'
      AND (
        (NEW.publisher_id IS NOT NULL AND publisher_id = NEW.publisher_id)
        OR lower(regexp_replace(company_name, '[^[:alnum:]]+', '', 'g')) = key
      );
  IF same_company_recent > 0 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You already shared an experience with this company in the last 30 days.';
  END IF;
  IF same_company_total >= 3 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'You have already shared 3 experiences with this company.';
  END IF;
  RETURN NEW;
END;
$$;

-- One vote per person per company (their latest approved report);
-- breakdown only from 3 different people.
CREATE OR REPLACE FUNCTION public.company_experience_summary(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (user_id) user_id, outcome, reply_days, applied_on
    FROM public.company_experience_reports
    WHERE publisher_id = pid AND status = 'approved'
    ORDER BY user_id, applied_on DESC, created_at DESC
  ),
  agg AS (
    SELECT count(*)::int AS n,
      count(*) FILTER (WHERE outcome = 'no_response')::int AS no_response,
      count(*) FILTER (WHERE outcome = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE outcome = 'responded')::int AS responded,
      count(*) FILTER (WHERE outcome = 'interview')::int AS interview,
      count(*) FILTER (WHERE outcome = 'offer')::int AS offer,
      round(avg(reply_days) FILTER (WHERE reply_days IS NOT NULL)::numeric, 1) AS avg_reply_days,
      max(applied_on) AS last_applied
    FROM latest
  )
  SELECT CASE WHEN agg.n >= 3 THEN jsonb_build_object(
      'total', agg.n, 'reporters', agg.n, 'hidden', false,
      'no_response', agg.no_response, 'rejected', agg.rejected, 'responded', agg.responded,
      'interview', agg.interview, 'offer', agg.offer,
      'avg_reply_days', agg.avg_reply_days, 'last_applied', agg.last_applied)
    ELSE jsonb_build_object(
      'total', agg.n, 'reporters', agg.n, 'hidden', true,
      'no_response', 0, 'rejected', 0, 'responded', 0, 'interview', 0, 'offer', 0,
      'avg_reply_days', NULL, 'last_applied', NULL)
    END
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.company_experience_summary(uuid) TO anon, authenticated;
