/*
# Sponsored-content publishers: add 'agency' and 'expert' org types,
  auto-create pending publisher profiles at signup

## Purpose
Registration now offers three paths: traveler, agency/company, and
government institution. Agency and government signups should be able
to publish sponsored jobs/programs, but only after admin approval —
this reuses the existing `program_publishers` verification flow
(already gates the Sponsored Programs board) rather than inventing a
second approval system.

## Changes
1. `program_publishers.org_type` now also allows 'agency' and 'expert'
   (previously only 'government' and 'company') — 'expert' is for
   individual travelers who apply from their profile to be listed as
   an independent visa expert.
2. `handle_new_user()` trigger:
   - Agency signups (`role = 'agency'`) now ALSO create a pending
     `program_publishers` row (org_type = 'agency'), in addition to
     the existing `agencies` marketplace-listing row. Both start
     unverified until you approve them.
   - A new `publisher_org_type` signup-metadata field (used by the new
     "I'm a government institution" registration path) creates a
     pending `program_publishers` row with that org_type. This is
     separate from `role`, so a government signup doesn't need a new
     `profiles.role` value — their "specialness" comes entirely from
     the publisher record, exactly like agencies already work.

## Security
No RLS changes needed — the existing `program_publishers` policies
already: let the public see only `verification_status = 'verified'`
rows, let owners see/manage their own row regardless of status, and
let `is_admin()` see and update everything (this is what your future
admin panel approve/reject actions use).
*/

ALTER TABLE public.program_publishers DROP CONSTRAINT IF EXISTS program_publishers_org_type_check;
ALTER TABLE public.program_publishers
  ADD CONSTRAINT program_publishers_org_type_check
  CHECK (org_type IN ('government', 'company', 'agency', 'expert'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
  v_full_name text := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULL
  );
  v_phone text := NEW.raw_user_meta_data->>'phone';
  v_avatar_url text := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    NULL
  );
  v_country_id text := NEW.raw_user_meta_data->>'country_id';
  v_nationality_id text := COALESCE(
    NEW.raw_user_meta_data->>'nationality_country_id',
    NEW.raw_user_meta_data->>'country_id'
  );
  v_company_name text := NEW.raw_user_meta_data->>'company_name';
  v_country text := NEW.raw_user_meta_data->>'country';
  v_city text := NEW.raw_user_meta_data->>'city';
  v_website text := NEW.raw_user_meta_data->>'website';
  v_publisher_org_type text := NEW.raw_user_meta_data->>'publisher_org_type';
BEGIN
  IF v_role NOT IN ('customer', 'agency', 'admin') THEN
    v_role := 'customer';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, role, avatar_url, country_id, nationality_country_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_phone,
    v_role,
    v_avatar_url,
    NULLIF(v_country_id, '')::uuid,
    NULLIF(v_nationality_id, '')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url,
    country_id = EXCLUDED.country_id,
    nationality_country_id = EXCLUDED.nationality_country_id;

  -- Travel-agency marketplace listing (unchanged behavior)
  IF v_role = 'agency' AND v_company_name IS NOT NULL AND v_company_name != '' THEN
    INSERT INTO public.agencies (owner_id, name, email, phone, country, city, website, verification_status)
    VALUES (
      NEW.id,
      v_company_name,
      NEW.email,
      v_phone,
      NULLIF(v_country, ''),
      NULLIF(v_city, ''),
      NULLIF(v_website, ''),
      'pending'
    )
    ON CONFLICT DO NOTHING;

    -- Also register them as a pending sponsored-content publisher, so
    -- they can submit jobs/programs once approved.
    INSERT INTO public.program_publishers (owner_id, org_type, name, website, contact_email, country_id, verification_status)
    VALUES (
      NEW.id,
      'agency',
      v_company_name,
      NULLIF(v_website, ''),
      NEW.email,
      NULLIF(v_country_id, '')::uuid,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Government (or any other non-agency org type set explicitly via
  -- the registration form) — publisher-only, no agencies-table row.
  IF v_publisher_org_type IS NOT NULL
     AND v_publisher_org_type != ''
     AND v_publisher_org_type != 'agency'
     AND v_company_name IS NOT NULL
     AND v_company_name != ''
  THEN
    INSERT INTO public.program_publishers (owner_id, org_type, name, website, contact_email, country_id, verification_status)
    VALUES (
      NEW.id,
      v_publisher_org_type,
      v_company_name,
      NULLIF(v_website, ''),
      NEW.email,
      NULLIF(v_country_id, '')::uuid,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- The existing agencies_update_owner policy only let an agency update
-- its OWN row — meaning admin could never actually approve one via
-- RLS. Widen it so is_admin() can update (approve/reject) any agency,
-- same pattern already used on program_publishers/programs.
DROP POLICY IF EXISTS "agencies_update_owner" ON public.agencies;
CREATE POLICY "agencies_update_owner"
  ON public.agencies FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());
