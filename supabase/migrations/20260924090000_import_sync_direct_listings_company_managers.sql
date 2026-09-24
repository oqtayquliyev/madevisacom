/*
# Import sync, direct listings, and company managers

Run this whole file in ONE paste in the Supabase SQL Editor, BEFORE
deploying the matching frontend (the frontend selects the new columns).

## 1. Import sources (for one-click "Sync")
`import_sources` remembers every Greenhouse board / careers URL an admin
imported from, so it can be re-fetched later. Each imported job now
carries `import_source_id` + `external_id` (the job's id on the source
site) and `last_seen_at`. A sync re-fetches the source, adds new jobs,
refreshes ones still live, and deletes the ones the source removed.

## 2. Listing origin (direct vs imported)
`origin` on sponsored_jobs and programs:
  - 'direct'   — submitted by a real user / company account on MadeVisa
  - 'imported' — pulled by MadeVisa from a careers page / ATS
  - 'admin'    — created by MadeVisa staff by hand
Non-admins can never set or change this (enforced by trigger), so the
public "Directly on MadeVisa by <Company>" badge can't be faked.
`submitted_by` records who submitted it (shown to admins in the inbox).

## 3. Company managers
`publisher_members` lets an admin (or the company account's owner) give
an email address management rights over one company: e.g. hr@netflix.com
can manage Netflix's vacancies, programs and company page. Membership is
matched against the CONFIRMED email of the signed-in account (read from
auth.users, not from the user-editable profiles table), so it works the
moment that person signs up or logs in with that address.
`can_publish = true` members publish without admin review; others'
changes go to review as before (they can still unpublish/close freely).

## Safety
- Backfills run with user triggers disabled so the review trigger can't
  flip published listings back to pending.
- Non-admins can no longer change a publisher's owner or verification
  status (other than resubmitting to 'pending'), nor a listing's
  publisher/origin/import fields/admin notes.
*/

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Confirmed email of the signed-in user (lowercase), or NULL.
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(u.email)
  FROM auth.users u
  WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 1. Import sources
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.program_publishers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('greenhouse', 'careers_url')),
  source_url text NOT NULL,            -- Greenhouse board token, or the careers URL as pasted
  resolved_url text,                   -- where jobs actually came from (e.g. the Workday board)
  strategy text,                       -- opaque strategy state from the import-ats-jobs function
  detected_platform text,              -- "Workday", "Eightfold", ...
  auto_publish boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('ok', 'partial', 'error')),
  last_sync_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publisher_id, kind, source_url)
);

DROP TRIGGER IF EXISTS import_sources_set_updated_at ON public.import_sources;
CREATE TRIGGER import_sources_set_updated_at
  BEFORE UPDATE ON public.import_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_sources_admin_all" ON public.import_sources;
CREATE POLICY "import_sources_admin_all"
  ON public.import_sources FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. New listing columns
-- ---------------------------------------------------------------------

ALTER TABLE public.sponsored_jobs
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_source_id uuid REFERENCES public.import_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.sponsored_jobs DROP CONSTRAINT IF EXISTS sponsored_jobs_origin_check;
ALTER TABLE public.sponsored_jobs ADD CONSTRAINT sponsored_jobs_origin_check CHECK (origin IN ('direct', 'imported', 'admin'));
ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS programs_origin_check;
ALTER TABLE public.programs ADD CONSTRAINT programs_origin_check CHECK (origin IN ('direct', 'imported', 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS sponsored_jobs_source_external_uidx
  ON public.sponsored_jobs (import_source_id, external_id)
  WHERE import_source_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sponsored_jobs_import_source_idx ON public.sponsored_jobs (import_source_id);
CREATE INDEX IF NOT EXISTS sponsored_jobs_origin_status_idx ON public.sponsored_jobs (origin, status);
CREATE INDEX IF NOT EXISTS programs_origin_status_idx ON public.programs (origin, status);

-- Backfill origin from the only signal that existed before: publishers
-- created by the admin import path have no owner account.
ALTER TABLE public.sponsored_jobs DISABLE TRIGGER USER;
UPDATE public.sponsored_jobs j
SET origin = 'imported'
FROM public.program_publishers p
WHERE p.id = j.publisher_id AND p.owner_id IS NULL AND j.origin = 'direct';
ALTER TABLE public.sponsored_jobs ENABLE TRIGGER USER;

ALTER TABLE public.programs DISABLE TRIGGER USER;
UPDATE public.programs pr
SET origin = 'admin'
FROM public.program_publishers p
WHERE p.id = pr.publisher_id AND p.owner_id IS NULL AND pr.origin = 'direct';
ALTER TABLE public.programs ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------
-- 3. Company managers
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.publisher_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.program_publishers(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  can_publish boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publisher_id, email)
);

CREATE INDEX IF NOT EXISTS publisher_members_email_idx ON public.publisher_members (email);

-- Can the signed-in user manage this publisher's page and listings?
CREATE OR REPLACE FUNCTION public.can_manage_publisher(pid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  em text;
BEGIN
  IF uid IS NULL OR pid IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.program_publishers WHERE id = pid AND owner_id = uid) THEN
    RETURN true;
  END IF;
  em := public.current_user_email();
  IF em IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.publisher_members m WHERE m.publisher_id = pid AND m.email = em);
END;
$$;

-- Can the signed-in user publish for this publisher without admin review?
CREATE OR REPLACE FUNCTION public.can_publish_directly(pid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  em text;
BEGIN
  IF auth.uid() IS NULL OR pid IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  em := public.current_user_email();
  IF em IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.publisher_members m WHERE m.publisher_id = pid AND m.email = em AND m.can_publish);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_publisher(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_publish_directly(uuid) TO authenticated, anon;

ALTER TABLE public.publisher_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "publisher_members_select" ON public.publisher_members;
CREATE POLICY "publisher_members_select"
  ON public.publisher_members FOR SELECT
  TO authenticated
  USING (public.is_admin() OR email = public.current_user_email() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "publisher_members_manage" ON public.publisher_members;
CREATE POLICY "publisher_members_manage"
  ON public.publisher_members FOR ALL
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.program_publishers p WHERE p.id = publisher_members.publisher_id AND p.owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.program_publishers p WHERE p.id = publisher_members.publisher_id AND p.owner_id = auth.uid())
  );

-- Companies the signed-in user can manage (for the /company page).
CREATE OR REPLACE FUNCTION public.my_managed_publishers()
RETURNS TABLE (
  id uuid,
  name text,
  org_type text,
  logo_url text,
  website text,
  description text,
  contact_email text,
  verification_status text,
  is_owner boolean,
  can_publish boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.name, p.org_type, p.logo_url, p.website, p.description, p.contact_email, p.verification_status,
    p.owner_id = auth.uid() AS is_owner,
    EXISTS (
      SELECT 1 FROM public.publisher_members m
      WHERE m.publisher_id = p.id AND m.email = public.current_user_email() AND m.can_publish
    ) AS can_publish
  FROM public.program_publishers p
  WHERE auth.uid() IS NOT NULL
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.publisher_members m WHERE m.publisher_id = p.id AND m.email = public.current_user_email())
    )
  ORDER BY p.name
$$;

GRANT EXECUTE ON FUNCTION public.my_managed_publishers() TO authenticated;

-- ---------------------------------------------------------------------
-- RLS: publishers, jobs, programs now also allow company managers
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "program_publishers_select_public_or_owner" ON public.program_publishers;
CREATE POLICY "program_publishers_select_public_or_owner"
  ON public.program_publishers FOR SELECT
  TO anon, authenticated
  USING (verification_status = 'verified' OR owner_id = auth.uid() OR public.is_admin() OR public.can_manage_publisher(id));

DROP POLICY IF EXISTS "program_publishers_update_owner" ON public.program_publishers;
CREATE POLICY "program_publishers_update_owner"
  ON public.program_publishers FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin() OR public.can_manage_publisher(id))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin() OR public.can_manage_publisher(id));

-- Jobs
DROP POLICY IF EXISTS "sponsored_jobs_select_published_or_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_select_published_or_owner"
  ON public.sponsored_jobs FOR SELECT
  TO anon, authenticated
  USING (status = 'published' OR public.is_admin() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "sponsored_jobs_insert_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_insert_owner"
  ON public.sponsored_jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "sponsored_jobs_update_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_update_owner"
  ON public.sponsored_jobs FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.can_manage_publisher(publisher_id))
  WITH CHECK (public.is_admin() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "sponsored_jobs_delete_admin" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_delete_admin"
  ON public.sponsored_jobs FOR DELETE
  TO authenticated
  USING (public.is_admin() OR public.can_manage_publisher(publisher_id));

-- Programs
DROP POLICY IF EXISTS "programs_select_published_or_owner" ON public.programs;
CREATE POLICY "programs_select_published_or_owner"
  ON public.programs FOR SELECT
  TO anon, authenticated
  USING (status = 'published' OR public.is_admin() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "programs_insert_owner" ON public.programs;
CREATE POLICY "programs_insert_owner"
  ON public.programs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "programs_update_owner" ON public.programs;
CREATE POLICY "programs_update_owner"
  ON public.programs FOR UPDATE
  TO authenticated
  USING (public.is_admin() OR public.can_manage_publisher(publisher_id))
  WITH CHECK (public.is_admin() OR public.can_manage_publisher(publisher_id));

DROP POLICY IF EXISTS "programs_delete_admin" ON public.programs;
CREATE POLICY "programs_delete_admin"
  ON public.programs FOR DELETE
  TO authenticated
  USING (public.is_admin() OR public.can_manage_publisher(publisher_id));

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Review rule: admins and trusted (can_publish) managers publish
-- directly; everyone else goes to review — except withdrawing a
-- listing (draft/expired), which never needs review. Server-side
-- contexts with no signed-in user (SQL editor, service role) pass
-- through untouched.
CREATE OR REPLACE FUNCTION public.enforce_review_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On UPDATE the ORIGINAL publisher decides trust: publisher_id can't be
  -- changed by non-admins anyway (stamp_*_origin resets it), and checking
  -- NEW here would let someone borrow another company's trust.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND NOT public.can_publish_directly(CASE WHEN TG_OP = 'UPDATE' THEN OLD.publisher_id ELSE NEW.publisher_id END)
     AND NEW.status NOT IN ('draft', 'expired') THEN
    NEW.status := 'pending';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      NEW.approved_at := now();
      NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '1 month');
    END IF;
  ELSE
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.approved_at := now();
      NEW.expires_at := now() + interval '1 month';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Origin / ownership stamping for jobs.
CREATE OR REPLACE FUNCTION public.stamp_job_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    IF TG_OP = 'INSERT' AND NEW.submitted_by IS NULL THEN
      NEW.submitted_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.origin := 'direct';
    NEW.submitted_by := auth.uid();
    NEW.import_source_id := NULL;
    NEW.external_id := NULL;
    NEW.admin_notes := NULL;
    NEW.source_verified := false;
  ELSE
    NEW.origin := OLD.origin;
    NEW.submitted_by := OLD.submitted_by;
    NEW.publisher_id := OLD.publisher_id;
    NEW.import_source_id := OLD.import_source_id;
    NEW.external_id := OLD.external_id;
    NEW.admin_notes := OLD.admin_notes;
    NEW.source_verified := OLD.source_verified;
  END IF;
  RETURN NEW;
END;
$$;

-- Same for programs (no import columns there).
CREATE OR REPLACE FUNCTION public.stamp_program_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    IF TG_OP = 'INSERT' AND NEW.submitted_by IS NULL THEN
      NEW.submitted_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.origin := 'direct';
    NEW.submitted_by := auth.uid();
    NEW.admin_notes := NULL;
    NEW.source_verified := false;
  ELSE
    NEW.origin := OLD.origin;
    NEW.submitted_by := OLD.submitted_by;
    NEW.publisher_id := OLD.publisher_id;
    NEW.admin_notes := OLD.admin_notes;
    NEW.source_verified := OLD.source_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sponsored_jobs_stamp_origin ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_stamp_origin
  BEFORE INSERT OR UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_job_origin();

DROP TRIGGER IF EXISTS programs_stamp_origin ON public.programs;
CREATE TRIGGER programs_stamp_origin
  BEFORE INSERT OR UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_program_origin();

-- Publisher guard: non-admins can't take over or self-verify a company.
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

DROP TRIGGER IF EXISTS program_publishers_guard_update ON public.program_publishers;
CREATE TRIGGER program_publishers_guard_update
  BEFORE UPDATE ON public.program_publishers
  FOR EACH ROW EXECUTE FUNCTION public.guard_publisher_update();
