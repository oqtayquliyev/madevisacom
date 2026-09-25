/*
# Confirmed applications, public tracking, response rates, input limits

Builds on 20261001090000_response_report_linkedin_org_types (run that first).
Safe to re-run.

## 1. "Did you apply?" — applications start unconfirmed
Clicking Apply no longer counts as applying. It creates a row with status
'clicked'; the Applicant Response Report asks the person whether they
actually applied:
- Yes → status 'applied', confirmed_at stamped, tracking starts.
- No  → they delete the row.
Unconfirmed rows are left out of every company statistic (they're marked
excluded with reason 'Not confirmed yet' until confirmed). Existing rows
that were never touched (status 'applied', no changes) are moved back to
'clicked' so their owners are asked too.

Response types: after applying, "Got a response" can be recorded as a
plain reply ('responded'), an interview invite ('interview') or a
rejection email ('rejected'). All three count as a response. Switching
back to waiting clears the response time.

## 2. Public tracking
application_reports.is_public (default false): the owner chooses which
applications appear on their public profile. get_public_applications(username)
returns only those, only once confirmed.

## 3. Response rates for a list of companies
company_response_rates(uuid[]) → per company: tracked applications and
response rates (null until ≥5 applications from ≥3 applicants).

## 4. Input limits (profiles, organizations)
Length / format limits so profile and organization fields can't hold huge
or junk text. Existing values over the limits are trimmed first.
  full_name 80 · occupation 80 · education 120 · specialization 120 ·
  experience 1000 · languages ≤ 10 items of ≤ 40 chars ·
  phone: digits, spaces, + ( ) - only, 6–20 chars ·
  organization name 120 · website ≤ 200, must start with http(s)://
*/

-- ---------------------------------------------------------------------
-- 1. Confirmation step
-- ---------------------------------------------------------------------

ALTER TABLE public.application_reports
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_status_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_status_check
  CHECK (status IN ('clicked', 'applied', 'viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response_week', 'no_response', 'withdrawn'));

CREATE OR REPLACE FUNCTION public.stamp_application_milestones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent int;
  admin boolean := public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'Sign in to track applications';
    END IF;

    IF NEW.listing_kind = 'job' AND NOT EXISTS (
      SELECT 1 FROM public.sponsored_jobs WHERE id = NEW.listing_id AND publisher_id = NEW.publisher_id
    ) THEN
      RAISE EXCEPTION 'This job is not on MadeVisa';
    END IF;
    IF NEW.listing_kind = 'program' AND NOT EXISTS (
      SELECT 1 FROM public.programs WHERE id = NEW.listing_id AND publisher_id = NEW.publisher_id
    ) THEN
      RAISE EXCEPTION 'This program is not on MadeVisa';
    END IF;

    SELECT count(*) INTO recent FROM public.application_reports
    WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours';
    IF recent >= 40 THEN
      RAISE EXCEPTION 'Too many applications recorded in the last 24 hours';
    END IF;

    IF NEW.applied_at IS NULL OR NEW.applied_at > now() OR NEW.applied_at < now() - interval '14 days' THEN
      NEW.applied_at := now();
    END IF;

    -- Starts unconfirmed: the person is asked whether they really applied.
    NEW.status := 'clicked';
    NEW.confirmed_at := NULL;
    NEW.is_public := false;
    NEW.responded_at := NULL;
    NEW.viewed_at := NULL;
    NEW.interview_at := NULL;
    NEW.offer_at := NULL;
    NEW.experience_rating := NULL;
    NEW.feedback_tags := NULL;
    NEW.evidence_path := NULL;
    NEW.evidence_status := 'none';
    NEW.excluded := true;
    NEW.excluded_reason := 'Not confirmed yet';
    NEW.status_changes := 0;
    RETURN NEW;
  END IF;

  -- UPDATE: history can't be rewritten.
  NEW.user_id := OLD.user_id;
  NEW.publisher_id := OLD.publisher_id;
  NEW.listing_kind := OLD.listing_kind;
  NEW.listing_id := OLD.listing_id;
  NEW.applied_at := OLD.applied_at;

  IF NOT admin THEN
    NEW.excluded := OLD.excluded;
    NEW.excluded_reason := OLD.excluded_reason;
    NEW.confirmed_at := OLD.confirmed_at;
    IF NEW.evidence_path IS DISTINCT FROM OLD.evidence_path THEN
      NEW.evidence_status := CASE WHEN NEW.evidence_path IS NULL THEN 'none' ELSE 'pending' END;
    ELSE
      NEW.evidence_status := OLD.evidence_status;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'clicked' THEN
        RAISE EXCEPTION 'This application is already confirmed';
      END IF;
      IF OLD.status = 'clicked' AND NEW.status <> 'applied' THEN
        RAISE EXCEPTION 'Confirm that you applied first';
      END IF;
      IF NEW.status = 'no_response_week' AND OLD.applied_at > now() - interval '7 days' THEN
        RAISE EXCEPTION 'You can choose "No response within 1 week" once a week has passed since applying';
      END IF;
      IF NEW.status = 'no_response' AND OLD.applied_at > now() - interval '21 days' THEN
        RAISE EXCEPTION 'You can choose "Never heard back" once 21 days have passed since applying';
      END IF;
    END IF;
  END IF;

  -- Confirming: tracking starts, and the row can count in statistics.
  IF OLD.status = 'clicked' AND NEW.status = 'applied' THEN
    NEW.confirmed_at := now();
    IF NEW.excluded AND NEW.excluded_reason = 'Not confirmed yet' THEN
      NEW.excluded := false;
      NEW.excluded_reason := NULL;
    END IF;
  END IF;

  -- Only confirmed applications can be shown publicly.
  IF NEW.status = 'clicked' THEN
    NEW.is_public := false;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Confirming isn't a "change" for the flip-flop guard.
    IF OLD.status <> 'clicked' THEN
      NEW.status_changes := OLD.status_changes + 1;
    END IF;
    -- Back to waiting from any kind of response clears the response.
    IF OLD.status IN ('responded', 'interview', 'rejected', 'offer') AND NEW.status IN ('applied', 'no_response_week', 'no_response') THEN
      NEW.responded_at := NULL;
      NEW.interview_at := NULL;
      NEW.offer_at := NULL;
      IF OLD.excluded_reason IN ('Response reported within an hour of applying', 'Interview/offer reported within an hour of applying') THEN
        NEW.excluded := false;
        NEW.excluded_reason := NULL;
      END IF;
    END IF;
    -- Switching between response types: interview time only for interview/offer.
    IF NEW.status IN ('responded', 'rejected') THEN
      NEW.interview_at := NULL;
      NEW.offer_at := NULL;
    END IF;
  END IF;

  IF NEW.status IN ('viewed', 'responded', 'interview', 'offer', 'rejected') AND NEW.viewed_at IS NULL THEN
    NEW.viewed_at := now();
  END IF;
  IF NEW.status IN ('responded', 'interview', 'offer', 'rejected') AND NEW.responded_at IS NULL THEN
    NEW.responded_at := now();
  END IF;
  IF NEW.status IN ('interview', 'offer') AND NEW.interview_at IS NULL THEN
    NEW.interview_at := now();
  END IF;
  IF NEW.status = 'offer' AND NEW.offer_at IS NULL THEN
    NEW.offer_at := now();
  END IF;

  IF NEW.status NOT IN ('offer', 'rejected', 'no_response') THEN
    NEW.experience_rating := NULL;
    NEW.feedback_tags := NULL;
  END IF;

  -- Suspicious patterns → left out of statistics (still visible to the user).
  IF NOT NEW.excluded THEN
    IF NEW.responded_at IS NOT NULL AND NEW.responded_at < NEW.applied_at + interval '1 hour' THEN
      NEW.excluded := true;
      NEW.excluded_reason := 'Response reported within an hour of applying';
    ELSIF NEW.interview_at IS NOT NULL AND NEW.interview_at < NEW.applied_at + interval '1 hour' THEN
      NEW.excluded := true;
      NEW.excluded_reason := 'Interview/offer reported within an hour of applying';
    ELSIF NEW.status_changes > 8 THEN
      NEW.excluded := true;
      NEW.excluded_reason := 'Status changed too many times';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Untouched auto-"applied" rows go back to unconfirmed so their owners are asked.
ALTER TABLE public.application_reports DISABLE TRIGGER USER;
UPDATE public.application_reports
SET status = 'clicked', excluded = true, excluded_reason = 'Not confirmed yet', is_public = false
WHERE status = 'applied' AND status_changes = 0 AND confirmed_at IS NULL AND NOT excluded;
ALTER TABLE public.application_reports ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------
-- 2. Public tracking
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_applications(p_username text)
RETURNS TABLE (
  id uuid,
  listing_kind text,
  listing_id uuid,
  listing_title text,
  company_name text,
  company_logo_url text,
  applied_at timestamptz,
  status text,
  responded_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT r.id, r.listing_kind, r.listing_id, r.listing_title, pub.name, pub.logo_url, r.applied_at, r.status, r.responded_at
  FROM public.application_reports r
  JOIN public.profiles p ON p.id = r.user_id
  LEFT JOIN public.program_publishers pub ON pub.id = r.publisher_id
  WHERE p.username = lower(p_username)
    AND r.is_public
    AND r.status NOT IN ('clicked', 'withdrawn')
  ORDER BY r.applied_at DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_applications(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Response rates for several companies at once
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.company_response_rates(pids uuid[])
RETURNS TABLE (publisher_id uuid, tracked int, response_rate numeric, response_week_rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (
    SELECT r.publisher_id,
      count(*)::int AS tracked,
      count(DISTINCT r.user_id)::int AS applicants,
      count(*) FILTER (WHERE r.responded_at IS NOT NULL)::int AS responded,
      count(*) FILTER (WHERE r.responded_at IS NOT NULL AND r.responded_at <= r.applied_at + interval '7 days')::int AS responded_week
    FROM public.application_reports r
    WHERE r.publisher_id = ANY (pids) AND r.status <> 'withdrawn' AND NOT r.excluded
    GROUP BY r.publisher_id
  )
  SELECT p.pid,
    COALESCE(a.tracked, 0),
    CASE WHEN a.tracked >= 5 AND a.applicants >= 3 THEN round(100.0 * a.responded / a.tracked) END,
    CASE WHEN a.tracked >= 5 AND a.applicants >= 3 THEN round(100.0 * a.responded_week / a.tracked) END
  FROM unnest(pids) AS p(pid)
  LEFT JOIN a ON a.publisher_id = p.pid;
$$;

GRANT EXECUTE ON FUNCTION public.company_response_rates(uuid[]) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Input limits
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.text_array_ok(arr text[], max_items int, max_len int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT arr IS NULL OR (
    COALESCE(array_length(arr, 1), 0) <= max_items
    AND NOT EXISTS (SELECT 1 FROM unnest(arr) x WHERE length(x) > max_len OR length(btrim(x)) = 0)
  );
$$;

-- Trim what's already over the limits (only affects junk / oversized values).
ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET full_name = left(btrim(full_name), 80) WHERE length(full_name) > 80;
UPDATE public.profiles SET occupation = left(btrim(occupation), 80) WHERE length(occupation) > 80;
UPDATE public.profiles SET education = left(btrim(education), 120) WHERE length(education) > 120;
UPDATE public.profiles SET specialization = left(btrim(specialization), 120) WHERE length(specialization) > 120;
UPDATE public.profiles SET experience = left(btrim(experience), 1000) WHERE length(experience) > 1000;
UPDATE public.profiles
SET languages = (
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE array_agg(v ORDER BY ord) END
  FROM (
    SELECT left(btrim(x), 40) AS v, ord FROM unnest(languages) WITH ORDINALITY AS t(x, ord)
    WHERE length(btrim(x)) > 0 ORDER BY ord LIMIT 10
  ) s
)
WHERE NOT public.text_array_ok(languages, 10, 40);
UPDATE public.profiles SET phone = NULLIF(btrim(regexp_replace(phone, '[^0-9+ ()-]', '', 'g')), '')
WHERE phone IS NOT NULL AND phone !~ '^\+?[0-9 ()-]{6,20}$';
UPDATE public.profiles SET phone = NULL WHERE phone IS NOT NULL AND phone !~ '^\+?[0-9 ()-]{6,20}$';
ALTER TABLE public.profiles ENABLE TRIGGER USER;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_input_limits_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_input_limits_check CHECK (
  (full_name IS NULL OR length(full_name) <= 80)
  AND (occupation IS NULL OR length(occupation) <= 80)
  AND (education IS NULL OR length(education) <= 120)
  AND (specialization IS NULL OR length(specialization) <= 120)
  AND (experience IS NULL OR length(experience) <= 1000)
  AND public.text_array_ok(languages, 10, 40)
  AND (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{6,20}$')
);

ALTER TABLE public.program_publishers DISABLE TRIGGER USER;
UPDATE public.program_publishers SET name = left(btrim(name), 120) WHERE length(name) > 120;
UPDATE public.program_publishers SET website = 'https://' || btrim(website)
WHERE website IS NOT NULL AND btrim(website) <> '' AND website !~* '^https?://' AND btrim(website) !~ '\s';
UPDATE public.program_publishers SET website = NULL
WHERE website IS NOT NULL AND (btrim(website) = '' OR website !~* '^https?://\S+$' OR length(website) > 200);
ALTER TABLE public.program_publishers ENABLE TRIGGER USER;

ALTER TABLE public.program_publishers DROP CONSTRAINT IF EXISTS program_publishers_input_limits_check;
ALTER TABLE public.program_publishers ADD CONSTRAINT program_publishers_input_limits_check CHECK (
  length(name) <= 120
  AND (website IS NULL OR (length(website) <= 200 AND website ~* '^https?://\S+$'))
);
