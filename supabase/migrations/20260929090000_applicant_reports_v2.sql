/*
# Applicant reports v2 — a structured application tracker, not a review site

Builds on 20260928090000 (run that first).

## What changes for application_reports
- New status 'viewed' (the company viewed your application) + viewed_at.
- Reports must reference a REAL listing of that company (job or program),
  so nobody can report on jobs they never applied to through MadeVisa.
- Backdating: an application recorded later (e.g. clicked Apply as a
  guest, signed up afterwards) may carry its real click time, but only
  up to 14 days back.
- Rate limit: at most 40 new applications per user per 24 hours.
- Structured feedback only (fixed tags + 1–5 rating), and only once the
  process has ended (offer / rejected / no response). No free text, so
  no accusations — just verified events.
- Private evidence: users may attach a response/rejection email
  (private storage bucket 'application-evidence', owner-only). Admins
  review it → evidence_status 'verified' / 'rejected'.
- Suspicious reports are EXCLUDED from statistics automatically:
    · interview/offer marked within 1 hour of applying
    · status flipped more than 8 times
  Admins can also exclude/include reports manually.

## Company statistics
company_insights / companies_directory now:
- ignore excluded & withdrawn reports,
- require ≥5 reports from ≥3 different applicants before any rate shows,
- return reliability labels so the UI can say "Verified data",
  "Applicant reported" or "Insufficient data" for each metric.

## Cleanup
Salary texts with no non-zero digit (e.g. "0.0", "0", "$0") are cleared.

Safe to re-run.
*/

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------

ALTER TABLE public.application_reports
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_tags text[],
  ADD COLUMN IF NOT EXISTS evidence_path text,
  ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_reason text,
  ADD COLUMN IF NOT EXISTS status_changes integer NOT NULL DEFAULT 0;

ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_status_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_status_check
  CHECK (status IN ('applied', 'viewed', 'responded', 'interview', 'offer', 'rejected', 'no_response', 'withdrawn'));

ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_evidence_status_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_evidence_status_check
  CHECK (evidence_status IN ('none', 'pending', 'verified', 'rejected'));

ALTER TABLE public.application_reports DROP CONSTRAINT IF EXISTS application_reports_feedback_tags_check;
ALTER TABLE public.application_reports ADD CONSTRAINT application_reports_feedback_tags_check
  CHECK (
    feedback_tags IS NULL OR feedback_tags <@ ARRAY[
      'clear_communication', 'timely_updates', 'respectful_process', 'fair_assessment',
      'slow_process', 'no_feedback_given', 'unclear_requirements', 'long_silence'
    ]::text[]
  );

CREATE INDEX IF NOT EXISTS application_reports_user_created_idx ON public.application_reports (user_id, created_at);
CREATE INDEX IF NOT EXISTS application_reports_evidence_idx ON public.application_reports (evidence_status) WHERE evidence_status = 'pending';

-- ---------------------------------------------------------------------
-- Integrity / anti-spam trigger (replaces the v1 milestone trigger)
-- ---------------------------------------------------------------------

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
    -- Users can only attach/remove evidence; admins decide verification.
    IF NEW.evidence_path IS DISTINCT FROM OLD.evidence_path THEN
      NEW.evidence_status := CASE WHEN NEW.evidence_path IS NULL THEN 'none' ELSE 'pending' END;
    ELSE
      NEW.evidence_status := OLD.evidence_status;
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changes := OLD.status_changes + 1;
  END IF;

  -- Milestones (measured by MadeVisa, not typed in).
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

  -- Feedback only once the process has ended.
  IF NEW.status NOT IN ('offer', 'rejected', 'no_response') THEN
    NEW.experience_rating := NULL;
    NEW.feedback_tags := NULL;
  END IF;

  -- Suspicious patterns → left out of statistics (still visible to the user).
  IF NOT NEW.excluded THEN
    IF NEW.interview_at IS NOT NULL AND NEW.interview_at < NEW.applied_at + interval '1 hour' THEN
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

DROP TRIGGER IF EXISTS application_reports_milestones ON public.application_reports;
CREATE TRIGGER application_reports_milestones
  BEFORE INSERT OR UPDATE ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.stamp_application_milestones();

DROP POLICY IF EXISTS "application_reports_admin_update" ON public.application_reports;
CREATE POLICY "application_reports_admin_update"
  ON public.application_reports FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Private evidence bucket
-- ---------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('application-evidence', 'application-evidence', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "evidence_owner_insert" ON storage.objects;
CREATE POLICY "evidence_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'application-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "evidence_owner_read" ON storage.objects;
CREATE POLICY "evidence_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'application-evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

DROP POLICY IF EXISTS "evidence_owner_delete" ON storage.objects;
CREATE POLICY "evidence_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'application-evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- ---------------------------------------------------------------------
-- Aggregates with minimum samples + reliability labels
-- ---------------------------------------------------------------------

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
      count(*) FILTER (WHERE interview_at IS NOT NULL)::int AS interviewed,
      count(*) FILTER (WHERE offer_at IS NOT NULL)::int AS offers,
      count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      count(*) FILTER (WHERE status IN ('applied', 'no_response') AND applied_at < now() - interval '30 days')::int AS silent,
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
    'viewed_rate', CASE WHEN ok.enough THEN round(100.0 * a.viewed / a.tracked) END,
    'interview_rate', CASE WHEN ok.enough THEN round(100.0 * a.interviewed / a.tracked) END,
    'offer_rate', CASE WHEN ok.enough THEN round(100.0 * a.offers / a.tracked) END,
    'rejection_rate', CASE WHEN ok.enough THEN round(100.0 * a.rejected / a.tracked) END,
    'no_response_rate', CASE WHEN ok.enough THEN round(100.0 * a.silent / a.tracked) END,
    'avg_response_days', CASE WHEN ok.enough AND a.responded >= 3 THEN round(a.avg_days::numeric, 1) END,
    'rating', CASE WHEN a.rating_count >= 3 THEN round(a.rating::numeric, 1) END,
    -- Reliability label for the applicant metrics:
    --   verified  = enough reports AND ≥5 of them backed by admin-verified evidence
    --   reported  = enough reports from enough different applicants
    --   insufficient = not enough yet (rates are withheld)
    'reliability', CASE
      WHEN ok.enough AND a.verified >= 5 THEN 'verified'
      WHEN ok.enough THEN 'reported'
      ELSE 'insufficient' END,
    'confidence', CASE WHEN NOT ok.enough THEN 'insufficient' WHEN a.tracked >= 50 THEN 'high' WHEN a.tracked >= 15 THEN 'medium' ELSE 'low' END
  )
  FROM a, ok;
$$;

GRANT EXECUTE ON FUNCTION public.company_insights(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.companies_directory()
RETURNS TABLE (
  id uuid, name text, logo_url text, website text, org_type text, country_name text,
  active_jobs int, active_programs int, posted_30d int, tracked int,
  response_rate numeric, avg_response_days numeric, last_listed timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH j AS (
    SELECT publisher_id,
      count(*) FILTER (WHERE status = 'published')::int AS active,
      count(*) FILTER (WHERE COALESCE(approved_at, created_at) >= now() - interval '30 days')::int AS p30,
      max(COALESCE(approved_at, created_at)) AS last_listed
    FROM public.sponsored_jobs WHERE status IN ('published', 'expired') GROUP BY publisher_id
  ),
  pr AS (SELECT publisher_id, count(*) FILTER (WHERE status = 'published')::int AS active FROM public.programs GROUP BY publisher_id),
  a AS (
    SELECT publisher_id, count(*)::int AS tracked, count(DISTINCT user_id)::int AS applicants,
      count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
      avg(EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days
    FROM public.application_reports WHERE status <> 'withdrawn' AND NOT excluded GROUP BY publisher_id
  )
  SELECT p.id, p.name, p.logo_url, p.website, p.org_type, c.name,
    COALESCE(j.active, 0), COALESCE(pr.active, 0), COALESCE(j.p30, 0), COALESCE(a.tracked, 0),
    CASE WHEN COALESCE(a.tracked, 0) >= 5 AND a.applicants >= 3 THEN round(100.0 * a.responded / a.tracked) END,
    CASE WHEN COALESCE(a.tracked, 0) >= 5 AND a.applicants >= 3 AND a.responded >= 3 THEN round(a.avg_days::numeric, 1) END,
    j.last_listed
  FROM public.program_publishers p
  LEFT JOIN j ON j.publisher_id = p.id
  LEFT JOIN pr ON pr.publisher_id = p.id
  LEFT JOIN a ON a.publisher_id = p.id
  LEFT JOIN public.countries c ON c.id = p.country_id
  WHERE p.verification_status = 'verified'
    AND (COALESCE(j.active, 0) + COALESCE(pr.active, 0) > 0 OR COALESCE(a.tracked, 0) > 0)
  ORDER BY COALESCE(j.active, 0) + COALESCE(pr.active, 0) DESC, p.name;
$$;

GRANT EXECUTE ON FUNCTION public.companies_directory() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Cleanup: salary texts that are only zeros ("0.0", "0", "$0.00")
-- ---------------------------------------------------------------------

ALTER TABLE public.sponsored_jobs DISABLE TRIGGER USER;
UPDATE public.sponsored_jobs
SET compensation_text = NULL, salary_status = 'not_disclosed'
WHERE compensation_text IS NOT NULL AND compensation_text !~ '[1-9]';
ALTER TABLE public.sponsored_jobs ENABLE TRIGGER USER;
