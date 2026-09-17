/*
# Requirements/limits on programs + sponsored jobs table

## Purpose
Verified publishers (agency/company/government) need to: (1) state
specific requirements or limits on a program listing (e.g. "IELTS 6.5+
required", "only 50 spots"), and (2) post sponsored JOBS, not just
programs, once approved.

## Changes
1. `programs` gets `requirements` (free text) and `spots_available`
   (nullable integer — leave blank for "unlimited").
2. New `sponsored_jobs` table — same shape/approval flow as `programs`
   (own eligibility columns, `status` pending/published/rejected,
   owned by a `program_publishers` row), plus job-specific fields
   (employment type, remote, compensation, requirements, spots).

## Security
Same RLS pattern as `programs`: public reads only `published` rows;
the owning publisher can manage their own; `is_admin()` can do
anything (approve/reject from the admin panel).
*/

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS requirements text,
  ADD COLUMN IF NOT EXISTS spots_available integer;

CREATE TABLE IF NOT EXISTS public.sponsored_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.program_publishers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  employment_type text NOT NULL DEFAULT 'Full time', -- Full time / Part time / Contract / Internship
  remote boolean NOT NULL DEFAULT false,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  compensation_text text,
  requirements text,
  spots_available integer,
  -- Eligibility (same shape as programs)
  citizenship_any boolean NOT NULL DEFAULT true,
  citizenship_allowed text[],
  citizenship_excluded text[],
  min_age integer,
  max_age integer,
  official_url text,
  contact_email text NOT NULL DEFAULT 'hello@madevisa.com',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS sponsored_jobs_set_updated_at ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_set_updated_at
  BEFORE UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS sponsored_jobs_publisher_id_idx ON public.sponsored_jobs (publisher_id);
CREATE INDEX IF NOT EXISTS sponsored_jobs_country_id_idx ON public.sponsored_jobs (country_id);
CREATE INDEX IF NOT EXISTS sponsored_jobs_status_idx ON public.sponsored_jobs (status);

ALTER TABLE public.sponsored_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sponsored_jobs_select_published_or_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_select_published_or_owner"
  ON public.sponsored_jobs FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = sponsored_jobs.publisher_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sponsored_jobs_insert_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_insert_owner"
  ON public.sponsored_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = sponsored_jobs.publisher_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sponsored_jobs_update_owner" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_update_owner"
  ON public.sponsored_jobs FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = sponsored_jobs.publisher_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = sponsored_jobs.publisher_id AND p.owner_id = auth.uid()
    )
  );
