/*
# Applicant Response Report, LinkedIn link, organization types

Builds on 20260929090000_applicant_reports_v2 (run that first). Safe to re-run.

## 1. Applicant Response Report (application_reports)
The report now tracks one thing: did the company respond, and how fast.

  Viewed job → Applied → Response

Statuses a user can choose, unlocked by time since applying:
- 'applied'           Waiting (default)
- 'responded'         Got a response — any time, including after the two below
- 'no_response_week'  No response within 1 week — from day 7
- 'no_response'       Never heard back — from day 21

Enforced here, not just in the UI. Choosing "Got a response" and then
switching back clears responded_at (so a mis-click can be undone), and
the existing flip-flop guard (> 8 changes → left out of statistics) still
applies. A response reported within an hour of applying is left out of
statistics too.

Users can delete their own rows (the existing "application_reports_own"
policy already allows it).

company_insights gains `response_week_rate`: % of tracked applications
answered within 7 days. Its other fields are unchanged.

## 2. LinkedIn
profiles.linkedin_url (a linkedin.com/in/… profile URL), shown next to
the person's name on their profile and public profile.
get_public_profile_by_username returns it.

## 3. Organization types
New organizations can only be 'government' or 'company'. Existing agency /
expert organizations keep working. Company organizations record how the
person is connected: 'owner', 'authorized' (authorized representative) or
'hr' (HR / recruiting).
*/

-- ---------------------------------------------------------------------
-- 1. Applicant Response Report
-- ---------------------------------------------------------------------

ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_status_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_status_check
  CHECK (status IN ('applied', 'viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response_week', 'no_response', 'withdrawn'));

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

    -- Only real listings of that company.
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

    -- Rate limit.
    SELECT count(*) INTO recent FROM public.application_reports
    WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours';
    IF recent >= 40 THEN
      RAISE EXCEPTION 'Too many applications recorded in the last 24 hours';
    END IF;

    -- Real click time allowed, but at most 14 days back and never in the future.
    IF NEW.applied_at IS NULL OR NEW.applied_at > now() OR NEW.applied_at < now() - interval '14 days' THEN
      NEW.applied_at := now();
    END IF;

    NEW.status := 'applied';
    NEW.responded_at := NULL;
    NEW.viewed_at := NULL;
    NEW.interview_at := NULL;
    NEW.offer_at := NULL;
    NEW.experience_rating := NULL;
    NEW.feedback_tags := NULL;
    NEW.evidence_path := NULL;
    NEW.evidence_status := 'none';
    NEW.excluded := false;
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
    IF NEW.evidence_path IS DISTINCT FROM OLD.evidence_path THEN
      NEW.evidence_status := CASE WHEN NEW.evidence_path IS NULL THEN 'none' ELSE 'pending' END;
    ELSE
      NEW.evidence_status := OLD.evidence_status;
    END IF;

    -- Time gates for the "no response" choices.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'no_response_week' AND OLD.applied_at > now() - interval '7 days' THEN
        RAISE EXCEPTION 'You can choose "No response within 1 week" once a week has passed since applying';
      END IF;
      IF NEW.status = 'no_response' AND OLD.applied_at > now() - interval '21 days' THEN
        RAISE EXCEPTION 'You can choose "Never heard back" once 21 days have passed since applying';
      END IF;
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changes := OLD.status_changes + 1;
    -- Undoing "Got a response" clears its time (and the "too fast" flag it caused).
    IF OLD.status = 'responded' AND NEW.status IN ('applied', 'no_response_week', 'no_response') THEN
      NEW.responded_at := NULL;
      IF OLD.excluded_reason = 'Response reported within an hour of applying' THEN
        NEW.excluded := false;
        NEW.excluded_reason := NULL;
      END IF;
    END IF;
  END IF;

  -- Milestones (stamped by MadeVisa, not typed in).
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

-- company_insights: same as v2, plus response_week_rate, and "silent"
-- also counts the new no_response_week status.
CREATE OR REPLACE FUNCTION public.company_insights(pid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH jobs AS (
    SELECT status, COALESCE(approved_at, created_at) AS listed_at, updated_at
    FROM public.sponsored_jobs WHERE publisher_id = pid AND status IN ('published', 'expired')
  ),
  progs AS (
    SELECT status, COALESCE(approved_at, created_at) AS listed_at, updated_at
    FROM public.programs WHERE publisher_id = pid AND status IN ('published', 'expired')
  ),
  listings AS (SELECT * FROM jobs UNION ALL SELECT * FROM progs),
  apps AS (
    SELECT * FROM public.application_reports
    WHERE publisher_id = pid AND status <> 'withdrawn' AND NOT excluded
  ),
  a AS (
    SELECT
      count(*)::int AS tracked,
      count(DISTINCT user_id)::int AS applicants,
      count(*) FILTER (WHERE evidence_status = 'verified')::int AS verified,
      count(*) FILTER (WHERE applied_at >= now() - interval '90 days')::int AS last90,
      count(*) FILTER (WHERE viewed_at IS NOT NULL)::int AS viewed,
      count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
      count(*) FILTER (WHERE responded_at IS NOT NULL AND responded_at <= applied_at + interval '7 days')::int AS responded_week,
      count(*) FILTER (WHERE interview_at IS NOT NULL)::int AS interviewed,
      count(*) FILTER (WHERE offer_at IS NOT NULL)::int AS offers,
      count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE status IN ('applied', 'no_response_week', 'no_response') AND applied_at < now() - interval '30 days')::int AS silent,
      avg(EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days,
      avg(experience_rating) FILTER (WHERE experience_rating IS NOT NULL) AS rating,
      count(experience_rating)::int AS rating_count
    FROM apps
  ),
  ok AS (SELECT (a.tracked >= 5 AND a.applicants >= 3) AS enough FROM a)
  SELECT jsonb_build_object(
    'active_jobs', (SELECT count(*) FROM jobs WHERE status = 'published'),
    'active_programs', (SELECT count(*) FROM progs WHERE status = 'published'),
    'closed_90d', (SELECT count(*) FROM listings WHERE status = 'expired' AND updated_at >= now() - interval '90 days'),
    'posted_30d', (SELECT count(*) FROM listings WHERE listed_at >= now() - interval '30 days'),
    'posted_90d', (SELECT count(*) FROM listings WHERE listed_at >= now() - interval '90 days'),
    'first_listed', (SELECT min(listed_at) FROM listings),
    'last_listed', (SELECT max(listed_at) FROM listings),
    'last_synced', (SELECT max(last_synced_at) FROM public.import_sources WHERE publisher_id = pid),
    'top_functions', (
      SELECT COALESCE(jsonb_agg(f ORDER BY n DESC), '[]'::jsonb) FROM (
        SELECT job_function AS f, count(*) AS n FROM public.sponsored_jobs
        WHERE publisher_id = pid AND status = 'published' AND job_function IS NOT NULL AND job_function <> ''
        GROUP BY job_function ORDER BY n DESC LIMIT 4
      ) t
    ),
    'top_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', c.name, 'code', c.iso_code, 'n', t.n) ORDER BY t.n DESC), '[]'::jsonb) FROM (
        SELECT country_id, count(*) AS n FROM public.sponsored_jobs
        WHERE publisher_id = pid AND status = 'published' AND country_id IS NOT NULL
        GROUP BY country_id ORDER BY n DESC LIMIT 5
      ) t JOIN public.countries c ON c.id = t.country_id
    ),
    'tracked', a.tracked,
    'applicants', a.applicants,
    'verified', a.verified,
    'last90', a.last90,
    'rating_count', a.rating_count,
    'response_rate', CASE WHEN ok.enough THEN round(100.0 * a.responded / a.tracked) END,
    'response_week_rate', CASE WHEN ok.enough THEN round(100.0 * a.responded_week / a.tracked) END,
    'viewed_rate', CASE WHEN ok.enough THEN round(100.0 * a.viewed / a.tracked) END,
    'interview_rate', CASE WHEN ok.enough THEN round(100.0 * a.interviewed / a.tracked) END,
    'offer_rate', CASE WHEN ok.enough THEN round(100.0 * a.offers / a.tracked) END,
    'rejection_rate', CASE WHEN ok.enough THEN round(100.0 * a.rejected / a.tracked) END,
    'no_response_rate', CASE WHEN ok.enough THEN round(100.0 * a.silent / a.tracked) END,
    'avg_response_days', CASE WHEN ok.enough AND a.responded >= 3 THEN round(a.avg_days::numeric, 1) END,
    'rating', CASE WHEN a.rating_count >= 3 THEN round(a.rating::numeric, 1) END,
    'reliability', CASE
      WHEN ok.enough AND a.verified >= 5 THEN 'verified'
      WHEN ok.enough THEN 'reported'
      ELSE 'insufficient' END,
    'confidence', CASE WHEN NOT ok.enough THEN 'insufficient' WHEN a.tracked >= 50 THEN 'high' WHEN a.tracked >= 15 THEN 'medium' ELSE 'low' END
  )
  FROM a, ok;
$$;

GRANT EXECUTE ON FUNCTION public.company_insights(uuid) TO anon, authenticated;

-- The report shows whether a job is still listed; people can read the
-- status of jobs they applied to even after the listing is taken down.
CREATE OR REPLACE FUNCTION public.my_application_listing_status()
RETURNS TABLE (report_id uuid, listing_status text, listing_removed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id,
    CASE
      WHEN r.listing_kind = 'job' THEN COALESCE(
        CASE WHEN j.status = 'published' AND j.expires_at IS NOT NULL AND j.expires_at <= now() THEN 'expired' ELSE j.status END,
        'deleted')
      ELSE COALESCE(p.status, 'deleted')
    END,
    CASE
      WHEN r.listing_kind = 'job' AND j.id IS NOT NULL AND (j.status <> 'published' OR (j.expires_at IS NOT NULL AND j.expires_at <= now()))
        THEN COALESCE(LEAST(j.updated_at, j.expires_at), j.updated_at)
      WHEN r.listing_kind = 'program' AND p.id IS NOT NULL AND p.status <> 'published' THEN p.updated_at
    END
  FROM public.application_reports r
  LEFT JOIN public.sponsored_jobs j ON r.listing_kind = 'job' AND j.id = r.listing_id
  LEFT JOIN public.programs p ON r.listing_kind = 'program' AND p.id = r.listing_id
  WHERE r.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_application_listing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_application_listing_status() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. LinkedIn
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_linkedin_url_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_linkedin_url_check
  CHECK (linkedin_url IS NULL OR linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%.-]{2,100}/?$');

-- Return type changes, so drop first.
DROP FUNCTION IF EXISTS public.get_public_profile_by_username(text);
CREATE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  role text,
  username text,
  linkedin_url text,
  publisher_name text,
  publisher_org_type text,
  publisher_verification_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.role,
    p.username,
    p.linkedin_url,
    pub.name,
    pub.org_type::text,
    pub.verification_status
  FROM public.profiles p
  LEFT JOIN public.program_publishers pub ON pub.owner_id = p.id
  WHERE p.username = lower(p_username)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Organization types
-- ---------------------------------------------------------------------

ALTER TABLE public.program_publishers ADD COLUMN IF NOT EXISTS representative_role text;
ALTER TABLE public.program_publishers DROP CONSTRAINT IF EXISTS program_publishers_representative_role_check;
ALTER TABLE public.program_publishers ADD CONSTRAINT program_publishers_representative_role_check
  CHECK (representative_role IS NULL OR representative_role IN ('owner', 'authorized', 'hr'));

-- New organizations: government or company only (admins exempt; existing
-- agency / expert rows are untouched unless their type is changed).
CREATE OR REPLACE FUNCTION public.restrict_new_org_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.org_type::text IS DISTINCT FROM OLD.org_type::text)
     AND NEW.org_type::text NOT IN ('government', 'company') THEN
    RAISE EXCEPTION 'Organizations can be a government or a company';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS program_publishers_restrict_org_types ON public.program_publishers;
CREATE TRIGGER program_publishers_restrict_org_types
  BEFORE INSERT OR UPDATE ON public.program_publishers
  FOR EACH ROW EXECUTE FUNCTION public.restrict_new_org_types();
