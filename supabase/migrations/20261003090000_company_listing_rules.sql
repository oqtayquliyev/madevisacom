/*
# Company listings: review, locking, limits, directory

Builds on 20260924090000 (company managers) and 20261002090000. Safe to re-run.

## 1. Approved listings are locked for companies
Once a job or program has been approved (approved_at is set), companies
can no longer edit or delete it — only close it (expired / draft) or
reopen it. Changes go through MadeVisa
(hello@madevisa.com). Admins can still edit anything.

## 2. Approved companies are locked for companies
Once a company is verified, its owner and managers can't change its name,
type, website, country, description, logo, contact email or role.
Admins still can. (Before verification the owner can edit and resubmit.)

## 3. Limits (companies only — admins and server-side imports are exempt)
- At most 10 new jobs + programs per person per 24 hours.
- At most 25 listings waiting for review per company.
- Field limits: title 3–120, city 80, team/function 60, salary text 80,
  experience 60, funding 120, description 20,000 characters, links must
  be http(s):// and ≤ 500 characters, spots 0–100,000.
- Team access: at most 10 people per company, and at most 5 invites per
  person per 24 hours. Only admins can mark someone "trusted" (publishes
  without review).

## 4. /companies lists every verified company
companies_directory() no longer hides verified companies that have no
live listings yet — a newly approved company appears straight away.

Review itself: the company dashboard now always submits listings as
'pending' (unless an admin marked that manager "trusted"), so they land in
the admin Requests inbox — including when an admin tests as a company.
*/

-- ---------------------------------------------------------------------
-- 1 + 3. Listings: lock after approval, limits
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_company_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  requested text;
  recent int;
  waiting int;
  is_job boolean := TG_TABLE_NAME = 'sponsored_jobs';
BEGIN
  -- Admins, the SQL editor and server-side imports are not limited.
  IF uid IS NULL OR public.is_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Approved listings keep their history (applicants track them); close instead.
    IF OLD.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Approved listings can''t be deleted. Close it instead, or contact hello@madevisa.com.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.approved_at IS NOT NULL THEN
    -- Approved: only closing or reopening. Everything else stays as it was.
    requested := NEW.status;
    NEW := OLD;
    IF requested IN ('published', 'expired', 'draft') THEN
      NEW.status := requested;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT (SELECT count(*) FROM public.sponsored_jobs WHERE submitted_by = uid AND created_at > now() - interval '24 hours')
         + (SELECT count(*) FROM public.programs WHERE submitted_by = uid AND created_at > now() - interval '24 hours')
      INTO recent;
    IF recent >= 10 THEN
      RAISE EXCEPTION 'You can submit up to 10 listings a day. Please try again tomorrow.';
    END IF;

    IF is_job THEN
      SELECT count(*) INTO waiting FROM public.sponsored_jobs WHERE publisher_id = NEW.publisher_id AND status = 'pending';
    ELSE
      SELECT count(*) INTO waiting FROM public.programs WHERE publisher_id = NEW.publisher_id AND status = 'pending';
    END IF;
    IF waiting >= 25 THEN
      RAISE EXCEPTION 'This company already has 25 listings waiting for review. Please wait until they are reviewed.';
    END IF;
  END IF;

  -- Field limits.
  IF length(btrim(coalesce(NEW.title, ''))) < 3 OR length(NEW.title) > 120 THEN
    RAISE EXCEPTION 'Title must be 3–120 characters';
  END IF;
  IF length(coalesce(NEW.city, '')) > 80 THEN
    RAISE EXCEPTION 'City must be 80 characters or fewer';
  END IF;
  IF length(coalesce(NEW.description, '')) > 20000 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;
  IF NEW.official_url IS NOT NULL AND (NEW.official_url !~* '^https?://\S+$' OR length(NEW.official_url) > 500) THEN
    RAISE EXCEPTION 'The link must start with http:// or https://';
  END IF;

  IF is_job THEN
    IF length(coalesce(NEW.job_function, '')) > 60 THEN
      RAISE EXCEPTION 'Team / function must be 60 characters or fewer';
    END IF;
    IF length(coalesce(NEW.compensation_text, '')) > 80 THEN
      RAISE EXCEPTION 'Salary text must be 80 characters or fewer';
    END IF;
    IF length(coalesce(NEW.experience_level, '')) > 60 THEN
      RAISE EXCEPTION 'Experience level must be 60 characters or fewer';
    END IF;
  ELSE
    IF length(coalesce(NEW.funding_text, '')) > 120 THEN
      RAISE EXCEPTION 'Funding text must be 120 characters or fewer';
    END IF;
    IF NEW.spots_available IS NOT NULL AND (NEW.spots_available < 0 OR NEW.spots_available > 100000) THEN
      RAISE EXCEPTION 'Spots available must be between 0 and 100,000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Named to fire before the other BEFORE triggers (they run alphabetically),
-- so review / timestamps see the locked row.
DROP TRIGGER IF EXISTS a_guard_company_listing ON public.sponsored_jobs;
CREATE TRIGGER a_guard_company_listing
  BEFORE INSERT OR UPDATE OR DELETE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_listing();

DROP TRIGGER IF EXISTS a_guard_company_listing ON public.programs;
CREATE TRIGGER a_guard_company_listing
  BEFORE INSERT OR UPDATE OR DELETE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_listing();

-- ---------------------------------------------------------------------
-- 2. Companies: locked once verified
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_publisher_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.owner_id := OLD.owner_id;
  NEW.organization_id := OLD.organization_id;

  IF OLD.verification_status = 'verified' THEN
    -- Approved companies: details change only through MadeVisa.
    NEW := OLD;
    RETURN NEW;
  END IF;

  IF OLD.owner_id IS DISTINCT FROM auth.uid() THEN
    -- Company managers edit the page, not the identity.
    NEW.name := OLD.name;
    NEW.org_type := OLD.org_type;
    NEW.verification_status := OLD.verification_status;
  ELSIF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status <> 'pending' THEN
    -- Owners may only re-submit for review.
    NEW.verification_status := OLD.verification_status;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Team access limits
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.limit_publisher_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Owners can't make someone "trusted" or repoint an invite.
    NEW := OLD;
    RETURN NEW;
  END IF;
  NEW.invited_by := auth.uid();
  NEW.can_publish := false; -- only admins can make someone "trusted"
  SELECT count(*) INTO n FROM public.publisher_members WHERE publisher_id = NEW.publisher_id;
  IF n >= 10 THEN
    RAISE EXCEPTION 'A company can have up to 10 people with access. Remove someone first.';
  END IF;
  SELECT count(*) INTO n FROM public.publisher_members WHERE invited_by = auth.uid() AND created_at > now() - interval '24 hours';
  IF n >= 5 THEN
    RAISE EXCEPTION 'You can invite up to 5 people a day. Please try again tomorrow.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_limit_publisher_members ON public.publisher_members;
CREATE TRIGGER a_limit_publisher_members
  BEFORE INSERT OR UPDATE ON public.publisher_members
  FOR EACH ROW EXECUTE FUNCTION public.limit_publisher_members();

-- ---------------------------------------------------------------------
-- 4. Directory: every verified company
-- ---------------------------------------------------------------------

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
  SELECT p.id, p.name, p.logo_url, p.website, p.org_type::text, c.name,
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
  ORDER BY COALESCE(j.active, 0) + COALESCE(pr.active, 0) DESC, p.name;
$$;

GRANT EXECUTE ON FUNCTION public.companies_directory() TO anon, authenticated;
