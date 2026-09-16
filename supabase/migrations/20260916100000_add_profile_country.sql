/*
# Add profiles.country_id (current country, separate from nationality)

## Purpose
The signup form now asks for the person's current country separately
from their nationality/citizenship (which defaults to "same as
country" unless they say otherwise). `nationality_country_id` already
existed for citizenship; this adds `country_id` for where they
currently are.

## Changes
- `public.profiles.country_id` — nullable FK to `public.countries`.
- `handle_new_user()` trigger updated to also read `country_id` from
  the signup metadata (same pattern as the other profile fields).

## Security
No RLS changes — existing `profiles` policies already cover this
column since policies are row-level, not column-level.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL;

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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
