/*
# Add residence country to profiles

## Purpose
Registration now asks "which country are you in" separately from "what's
your citizenship" (nationality_country_id already existed). Most people
are in their home country, so the form defaults residence = nationality
unless the person says otherwise.

## Changes
- `public.profiles.country_id` — new nullable FK to `public.countries`,
  representing current country of residence (distinct from
  `nationality_country_id`, which represents citizenship).
- `handle_new_user()` trigger updated to also read `country_id` from the
  new user's metadata (mirrors how `nationality_country_id` already
  works), so it's populated automatically on signup without a second
  client-side write.

## Security
No RLS changes — `country_id` is just another column on `profiles`,
covered by the table's existing policies.
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
  v_nationality_id text := NEW.raw_user_meta_data->>'nationality_country_id';
  v_country_id text := NEW.raw_user_meta_data->>'country_id';
  v_company_name text := NEW.raw_user_meta_data->>'company_name';
  v_country text := NEW.raw_user_meta_data->>'country';
  v_city text := NEW.raw_user_meta_data->>'city';
  v_website text := NEW.raw_user_meta_data->>'website';
BEGIN
  -- Validate role
  IF v_role NOT IN ('customer', 'agency', 'admin') THEN
    v_role := 'customer';
  END IF;

  -- Insert profile (idempotent)
  INSERT INTO public.profiles (id, email, full_name, phone, role, avatar_url, nationality_country_id, country_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_phone,
    v_role,
    v_avatar_url,
    NULLIF(v_nationality_id, '')::uuid,
    NULLIF(v_country_id, '')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url,
    nationality_country_id = EXCLUDED.nationality_country_id,
    country_id = EXCLUDED.country_id;

  -- If agency role, create agency row (idempotent)
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
