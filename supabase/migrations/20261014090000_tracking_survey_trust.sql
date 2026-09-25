/*
# Application tracking v3: 3-question check-in, reminders, trust weighting

Run AFTER 20261013090000_insights_fair_use.sql. Safe to run more than once.

## 1. Three quick questions per application
application_reports gets:
- match_answer     'full' | 'partly' | 'no'   "Did your experience match the job?"
- accuracy_answer  'yes' | 'mostly' | 'no'    "Was the job as described?"
- survey_at        when they last answered
(The first question, "Did they reply?", is the existing status.)

## 2. Reminders ("check in with me in X days")
- remind_at: when the person wants to be asked again (in-app reminder).
- Confirming an application sets it to 7 days later automatically.
- Answering "Not yet" moves it to day 21 unless they pick another date.
- Getting a final answer (reply / interview / rejection / never heard
  back) clears it.

## 3. Trust weighting — no proof needed
Every person's reports count with a weight between 0.5 and 1.0:
  0.5 base
  +0.2 verified email
  +0.15 nationality on their profile
  +0.15 account older than 14 days
Rates on job pages are weighted averages, so brand-new or incomplete
accounts can't swing a company's numbers. Existing checks still apply
(reply within an hour of applying, >8 status changes → left out).

## 4. job_page_insights() v3
- response: weighted rate, number of people, and a range while data is
  early (fewer than 15 people) so the page can say "about 60–75%".
- accuracy: how many applicants said the job was as described (≥3 answers).
- everything from before (international, live), same fair-use rules.

## 5. closed_job_outcomes(pid)
For applications to jobs that have since closed: how many still got a
reply / an interview — for this company (≥5 applications from ≥3 people)
and across MadeVisa (≥20 applications). Shown on closed jobs in the
applicant report.
*/

-- ---------------------------------------------------------------------
-- 1 + 2. Columns and reminder rules
-- ---------------------------------------------------------------------

ALTER TABLE public.application_reports
  ADD COLUMN IF NOT EXISTS match_answer text,
  ADD COLUMN IF NOT EXISTS accuracy_answer text,
  ADD COLUMN IF NOT EXISTS survey_at timestamptz,
  ADD COLUMN IF NOT EXISTS remind_at timestamptz;

ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_match_answer_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_match_answer_check CHECK (match_answer IS NULL OR match_answer IN ('full', 'partly', 'no'));
ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_accuracy_answer_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_accuracy_answer_check CHECK (accuracy_answer IS NULL OR accuracy_answer IN ('yes', 'mostly', 'no'));

CREATE INDEX IF NOT EXISTS application_reports_remind_idx ON public.application_reports (user_id, remind_at) WHERE remind_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.application_reminders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.match_answer := NULL;
    NEW.accuracy_answer := NULL;
    NEW.survey_at := NULL;
    NEW.remind_at := NULL;
    RETURN NEW;
  END IF;

  -- Reminder dates: not in the past by more than a day, not beyond 60 days.
  IF NEW.remind_at IS DISTINCT FROM OLD.remind_at AND NEW.remind_at IS NOT NULL THEN
    NEW.remind_at := least(greatest(NEW.remind_at, now() - interval '1 day'), now() + interval '60 days');
  END IF;

  -- Confirmed → first check-in a week after applying.
  IF OLD.status = 'clicked' AND NEW.status = 'applied' AND NEW.remind_at IS NULL THEN
    NEW.remind_at := greatest(NEW.applied_at + interval '7 days', now() + interval '1 day');
  END IF;

  -- A final answer ends the reminders.
  IF NEW.status IN ('responded', 'interview', 'offer', 'rejected', 'no_response', 'withdrawn') AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.remind_at := NULL;
  END IF;

  IF (NEW.match_answer IS DISTINCT FROM OLD.match_answer OR NEW.accuracy_answer IS DISTINCT FROM OLD.accuracy_answer) THEN
    NEW.survey_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_application_reminders ON public.application_reports;
CREATE TRIGGER zz_application_reminders
  BEFORE INSERT OR UPDATE ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.application_reminders();

-- ---------------------------------------------------------------------
-- 3 + 4. Weighted insights
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reporter_weight(uid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 0.5
    + CASE WHEN p.email_verified_at IS NOT NULL THEN 0.2 ELSE 0 END
    + CASE WHEN p.nationality_country_id IS NOT NULL THEN 0.15 ELSE 0 END
    + CASE WHEN u.created_at < now() - interval '14 days' THEN 0.15 ELSE 0 END
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = uid;
$$;

REVOKE ALL ON FUNCTION public.reporter_weight(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reporter_weight(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.job_page_insights(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT r.user_id, r.applied_at, r.responded_at, r.interview_at, r.offer_at, r.accuracy_answer,
           p.nationality_country_id AS nat,
           coalesce(j.country_id, pub.country_id) AS job_country,
           row_number() OVER (PARTITION BY r.user_id ORDER BY r.applied_at DESC) AS nth
    FROM public.application_reports r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN public.sponsored_jobs j ON r.listing_kind = 'job' AND j.id = r.listing_id
    LEFT JOIN public.program_publishers pub ON pub.id = r.publisher_id
    WHERE r.publisher_id = pid
      AND r.status NOT IN ('withdrawn', 'clicked')
      AND NOT r.excluded
      AND (r.responded_at IS NULL OR r.responded_at >= r.applied_at)
  ),
  apps AS (
    SELECT a.*, coalesce(public.reporter_weight(a.user_id), 0.5) AS w
    FROM ranked a WHERE nth <= 3
  ),
  resp AS (
    SELECT count(*)::int AS tracked,
           count(DISTINCT user_id)::int AS people,
           count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
           sum(w) AS wsum,
           sum(w) FILTER (WHERE responded_at IS NOT NULL) AS wresp,
           avg(extract(epoch FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days
    FROM apps
  ),
  resp2 AS (
    SELECT *, CASE WHEN wsum > 0 THEN coalesce(wresp, 0) / wsum END AS p FROM resp
  ),
  acc AS (
    SELECT count(*) FILTER (WHERE accuracy_answer IS NOT NULL)::int AS answers,
           count(*) FILTER (WHERE accuracy_answer IN ('yes', 'mostly'))::int AS ok
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
    'response', CASE WHEN resp2.tracked >= 5 AND resp2.people >= 3 THEN jsonb_build_object(
        'rate', round(100 * resp2.p),
        'avg_days', CASE WHEN resp2.responded >= 3 THEN round(resp2.avg_days::numeric) END,
        'tracked', resp2.tracked,
        'people', resp2.people,
        'early', resp2.people < 15,
        -- ~80% range while data is early (normal approximation, clamped).
        'low', CASE WHEN resp2.people < 15 THEN greatest(0, round(100 * (resp2.p - 1.28 * sqrt(resp2.p * (1 - resp2.p) / resp2.tracked)))) END,
        'high', CASE WHEN resp2.people < 15 THEN least(100, round(100 * (resp2.p + 1.28 * sqrt(resp2.p * (1 - resp2.p) / resp2.tracked)))) END
      ) END,
    'accuracy', CASE WHEN acc.answers >= 3 THEN jsonb_build_object('answers', acc.answers, 'ok', acc.ok) END,
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
  FROM resp2, acc, intl_sum, live;
$$;

GRANT EXECUTE ON FUNCTION public.job_page_insights(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. What happened after a job closed
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.closed_job_outcomes(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH closed_apps AS (
    SELECT r.publisher_id, r.user_id, r.responded_at, r.interview_at, r.offer_at
    FROM public.application_reports r
    LEFT JOIN public.sponsored_jobs j ON r.listing_kind = 'job' AND j.id = r.listing_id
    WHERE r.listing_kind = 'job'
      AND r.status NOT IN ('withdrawn', 'clicked')
      AND NOT r.excluded
      AND (j.id IS NULL OR j.status = 'expired')
  ),
  c AS (
    SELECT count(*)::int AS n, count(DISTINCT user_id)::int AS people,
           count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS replied,
           count(*) FILTER (WHERE interview_at IS NOT NULL OR offer_at IS NOT NULL)::int AS interviews
    FROM closed_apps WHERE publisher_id = pid
  ),
  a AS (
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS replied,
           count(*) FILTER (WHERE interview_at IS NOT NULL OR offer_at IS NOT NULL)::int AS interviews
    FROM closed_apps
  ),
  h AS (SELECT jobs_closed, days_open_total FROM public.publisher_job_stats WHERE publisher_id = pid)
  SELECT jsonb_build_object(
    'company', CASE WHEN c.n >= 5 AND c.people >= 3 THEN jsonb_build_object(
        'applications', c.n, 'replied_pct', round(100.0 * c.replied / c.n), 'interview_pct', round(100.0 * c.interviews / c.n)) END,
    'platform', CASE WHEN a.n >= 20 THEN jsonb_build_object(
        'applications', a.n, 'replied_pct', round(100.0 * a.replied / a.n), 'interview_pct', round(100.0 * a.interviews / a.n)) END,
    'avg_open_days', (SELECT CASE WHEN jobs_closed >= 5 THEN round(days_open_total / jobs_closed) END FROM h)
  )
  FROM c, a;
$$;

GRANT EXECUTE ON FUNCTION public.closed_job_outcomes(uuid) TO anon, authenticated;
