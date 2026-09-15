/*
# Sponsored programs: publishers + programs

## Overview
Lets governments and companies create a publisher profile and submit
sponsored programs (scholarships, work & travel schemes, relocation
programs, etc.) that show up on the public Sponsored Programs board,
filterable by country and publisher type, with per-listing eligibility
(citizenship, age, and an application date window).

## New tables (2)
1. `program_publishers` — a government or company account, owned by a
   profile. Same shape/verification flow as `agencies`.
2. `programs` — a sponsored program submitted by a publisher. Starts as
   `pending`; only `published` rows are publicly visible. Admins move
   pending -> published/rejected (via `profiles.role = 'admin'`).

## Security
RLS mirrors the existing `agencies` pattern: public reads only
verified publishers / published programs; owners manage their own
rows; admin has full access via the existing `public.is_admin()`
helper.
*/

-- ===========================================================================
-- TABLES
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.program_publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  org_type text NOT NULL CHECK (org_type IN ('government', 'company')),
  name text NOT NULL,
  description text,
  website text,
  contact_email text NOT NULL DEFAULT 'hello@madevisa.com',
  logo_url text,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.program_publishers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  -- Eligibility
  citizenship_any boolean NOT NULL DEFAULT true,
  citizenship_allowed text[],        -- ISO codes; ignored when citizenship_any = true
  citizenship_excluded text[],
  min_age integer,
  max_age integer,
  -- Application window — drives the "eligible now / upcoming / closed" badge
  applications_open_at date,
  applications_close_at date,
  funding_text text,                 -- e.g. "Full tuition + $900/mo stipend"
  official_url text,
  contact_email text NOT NULL DEFAULT 'hello@madevisa.com',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- TRIGGERS (reuse existing public.set_updated_at())
-- ===========================================================================

DROP TRIGGER IF EXISTS program_publishers_set_updated_at ON public.program_publishers;
CREATE TRIGGER program_publishers_set_updated_at
  BEFORE UPDATE ON public.program_publishers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS programs_set_updated_at ON public.programs;
CREATE TRIGGER programs_set_updated_at
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- INDEXES
-- ===========================================================================

CREATE INDEX IF NOT EXISTS program_publishers_owner_id_idx ON public.program_publishers (owner_id);
CREATE INDEX IF NOT EXISTS programs_publisher_id_idx ON public.programs (publisher_id);
CREATE INDEX IF NOT EXISTS programs_country_id_idx ON public.programs (country_id);
CREATE INDEX IF NOT EXISTS programs_status_idx ON public.programs (status);

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================

ALTER TABLE public.program_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- program_publishers: public read verified; owner full access to own; admin all
DROP POLICY IF EXISTS "program_publishers_select_public_or_owner" ON public.program_publishers;
CREATE POLICY "program_publishers_select_public_or_owner"
  ON public.program_publishers FOR SELECT
  TO anon, authenticated
  USING (verification_status = 'verified' OR owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "program_publishers_insert_owner" ON public.program_publishers;
CREATE POLICY "program_publishers_insert_owner"
  ON public.program_publishers FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "program_publishers_update_owner" ON public.program_publishers;
CREATE POLICY "program_publishers_update_owner"
  ON public.program_publishers FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- programs: public read published; owner (via their publisher) full access to own; admin all
DROP POLICY IF EXISTS "programs_select_published_or_owner" ON public.programs;
CREATE POLICY "programs_select_published_or_owner"
  ON public.programs FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = programs.publisher_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "programs_insert_owner" ON public.programs;
CREATE POLICY "programs_insert_owner"
  ON public.programs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = programs.publisher_id AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "programs_update_owner" ON public.programs;
CREATE POLICY "programs_update_owner"
  ON public.programs FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = programs.publisher_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.program_publishers p
      WHERE p.id = programs.publisher_id AND p.owner_id = auth.uid()
    )
  );

-- ===========================================================================
-- SEED: common countries (idempotent — countries.iso_code is UNIQUE)
-- ===========================================================================

INSERT INTO public.countries (name, iso_code, flag_emoji) VALUES
  ('Azerbaijan', 'AZ', '🇦🇿'), ('Turkey', 'TR', '🇹🇷'), ('Georgia', 'GE', '🇬🇪'),
  ('United Arab Emirates', 'AE', '🇦🇪'), ('Qatar', 'QA', '🇶🇦'), ('Saudi Arabia', 'SA', '🇸🇦'),
  ('United Kingdom', 'GB', '🇬🇧'), ('France', 'FR', '🇫🇷'), ('Germany', 'DE', '🇩🇪'),
  ('Spain', 'ES', '🇪🇸'), ('Italy', 'IT', '🇮🇹'), ('Netherlands', 'NL', '🇳🇱'),
  ('Switzerland', 'CH', '🇨🇭'), ('Austria', 'AT', '🇦🇹'), ('Ireland', 'IE', '🇮🇪'),
  ('Portugal', 'PT', '🇵🇹'), ('Poland', 'PL', '🇵🇱'), ('Sweden', 'SE', '🇸🇪'),
  ('United States', 'US', '🇺🇸'), ('Canada', 'CA', '🇨🇦'),
  ('Australia', 'AU', '🇦🇺'), ('New Zealand', 'NZ', '🇳🇿'),
  ('India', 'IN', '🇮🇳'), ('Pakistan', 'PK', '🇵🇰'), ('China', 'CN', '🇨🇳'),
  ('Japan', 'JP', '🇯🇵'), ('South Korea', 'KR', '🇰🇷'), ('Singapore', 'SG', '🇸🇬'),
  ('Brazil', 'BR', '🇧🇷'), ('South Africa', 'ZA', '🇿🇦'), ('Nigeria', 'NG', '🇳🇬')
ON CONFLICT (iso_code) DO NOTHING;
