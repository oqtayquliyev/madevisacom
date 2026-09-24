/*
# Company profiles: real hiring & applicant-response data

MadeVisa becomes the source of the numbers on each company page, based
on verified interactions — not anonymous reviews:

## application_reports
One row per signed-in user per job/program they applied to THROUGH
MadeVisa (created automatically when they click Apply while signed in).
The user later updates the outcome from their dashboard:
  applied → responded / interview / offer / rejected / no_response / withdrawn
and can optionally rate the experience (1–5). Timestamps for first
response / interview / offer are stamped automatically, so response time
is measured, not self-reported.

Rows are private: only their owner (and admins) can read them.

## company_insights(publisher_id)  /  companies_directory()
SECURITY DEFINER functions that return ONLY aggregates to the public:
listing activity (active / closed / posting frequency) and application
outcomes (response rate, average response time, interview & offer
rates, experience rating, data confidence). Rates are withheld until at
least 5 applications are tracked, so no individual can be singled out.

Safe to run any time: new table + functions only; touches no data.
*/

CREATE TABLE IF NOT EXISTS public.application_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES public.program_publishers(id) ON DELETE CASCADE,
  listing_kind text NOT NULL CHECK (listing_kind IN ('job', 'program')),
  listing_id uuid NOT NULL,
  listing_title text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'responded', 'interview', 'offer', 'rejected', 'no_response', 'withdrawn')),
  responded_at timestamptz,
  interview_at timestamptz,
  offer_at timestamptz,
  experience_rating smallint CHECK (experience_rating IS NULL OR experience_rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_kind, listing_id)
);

CREATE INDEX IF NOT EXISTS application_reports_publisher_idx ON public.application_reports (publisher_id, applied_at);

DROP TRIGGER IF EXISTS application_reports_set_updated_at ON public.application_reports;
CREATE TRIGGER application_reports_set_updated_at
  BEFORE UPDATE ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Stamp milestone timestamps from status changes (measured, not typed in).
CREATE OR REPLACE FUNCTION public.stamp_application_milestones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Nobody rewrites history: user_id / listing / applied_at are fixed.
    NEW.user_id := OLD.user_id;
    NEW.publisher_id := OLD.publisher_id;
    NEW.listing_kind := OLD.listing_kind;
    NEW.listing_id := OLD.listing_id;
    NEW.applied_at := OLD.applied_at;
  ELSE
    NEW.user_id := auth.uid();
    NEW.applied_at := now();
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_reports_milestones ON public.application_reports;
CREATE TRIGGER application_reports_milestones
  BEFORE INSERT OR UPDATE ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.stamp_application_milestones();

ALTER TABLE public.application_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application_reports_own" ON public.application_reports;
CREATE POLICY "application_reports_own"
  ON public.application_reports FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "application_reports_admin_read" ON public.application_reports;
CREATE POLICY "application_reports_admin_read"
  ON public.application_reports FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Aggregates (public)
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
  apps AS (SELECT * FROM public.application_reports WHERE publisher_id = pid AND status <> 'withdrawn'),
  a AS (
    SELECT
      count(*)::int AS tracked,
      count(*) FILTER (WHERE applied_at >= now() - interval '90 days')::int AS last90,
      count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
      count(*) FILTER (WHERE interview_at IS NOT NULL)::int AS interviewed,
      count(*) FILTER (WHERE offer_at IS NOT NULL)::int AS offers,
      count(*) FILTER (WHERE status IN ('applied', 'no_response') AND applied_at < now() - interval '30 days')::int AS silent,
      avg(EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days,
      avg(experience_rating) FILTER (WHERE experience_rating IS NOT NULL) AS rating,
      count(experience_rating)::int AS rating_count
    FROM apps
  )
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
    'last90', a.last90,
    'rating_count', a.rating_count,
    -- Rates only once there's enough data that no individual stands out.
    'response_rate', CASE WHEN a.tracked >= 5 THEN round(100.0 * a.responded / a.tracked) END,
    'interview_rate', CASE WHEN a.tracked >= 5 THEN round(100.0 * a.interviewed / a.tracked) END,
    'offer_rate', CASE WHEN a.tracked >= 5 THEN round(100.0 * a.offers / a.tracked) END,
    'no_response_rate', CASE WHEN a.tracked >= 5 THEN round(100.0 * a.silent / a.tracked) END,
    'avg_response_days', CASE WHEN a.responded >= 3 THEN round(a.avg_days::numeric, 1) END,
    'rating', CASE WHEN a.rating_count >= 3 THEN round(a.rating::numeric, 1) END,
    'confidence', CASE WHEN a.tracked >= 50 THEN 'high' WHEN a.tracked >= 15 THEN 'medium' WHEN a.tracked >= 5 THEN 'low' ELSE 'insufficient' END
  )
  FROM a;
$$;

GRANT EXECUTE ON FUNCTION public.company_insights(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.companies_directory()
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  website text,
  org_type text,
  country_name text,
  active_jobs int,
  active_programs int,
  posted_30d int,
  tracked int,
  response_rate numeric,
  avg_response_days numeric,
  last_listed timestamptz
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
  pr AS (
    SELECT publisher_id, count(*) FILTER (WHERE status = 'published')::int AS active
    FROM public.programs GROUP BY publisher_id
  ),
  a AS (
    SELECT publisher_id, count(*)::int AS tracked,
      count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responded,
      avg(EXTRACT(EPOCH FROM (responded_at - applied_at)) / 86400.0) FILTER (WHERE responded_at IS NOT NULL) AS avg_days
    FROM public.application_reports WHERE status <> 'withdrawn' GROUP BY publisher_id
  )
  SELECT p.id, p.name, p.logo_url, p.website, p.org_type, c.name,
    COALESCE(j.active, 0), COALESCE(pr.active, 0), COALESCE(j.p30, 0), COALESCE(a.tracked, 0),
    CASE WHEN COALESCE(a.tracked, 0) >= 5 THEN round(100.0 * a.responded / a.tracked) END,
    CASE WHEN COALESCE(a.responded, 0) >= 3 THEN round(a.avg_days::numeric, 1) END,
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
