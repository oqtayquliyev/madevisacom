/*
Public profiles by default + shorter limits on shared experiences.

1. New accounts get a profile link (/u/<username>) straight away, made from
   their name ("Oqtay Quliyev" → oqtay-quliyev, or oqtay-quliyev-4821 if
   taken). They can change it in their profile.
2. Applications are public by default once confirmed: when someone confirms
   an application (status clicked → applied) it is shown on their public
   profile unless they switch it off. Each application keeps its own
   switch, as before.
   Existing accounts are NOT changed — see the optional query at the end.
3. Shared experiences: company name ≤ 80, role ≤ 60, website ≤ 100 characters.

Run after 20261023090000_fair_experience_score.sql.
*/

-- 1. Username from the name, unique ------------------------------------------
CREATE OR REPLACE FUNCTION public.make_username(full_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  tries int := 0;
BEGIN
  base := lower(coalesce(full_name, ''));
  base := translate(base, 'əçğıöşüäåéèêëáàâãíìîïóòôõúùûñß', 'ecgiosuaaeeeeaaaaiiiioooouuuns');
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  base := left(base, 24);
  IF length(base) < 3 THEN base := 'member'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    tries := tries + 1;
    candidate := left(base, 24) || '-' || (1000 + floor(random() * 9000))::int;
    IF tries > 20 THEN
      candidate := 'member-' || substr(md5(random()::text), 1, 8);
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NULL AND coalesce(btrim(NEW.full_name), '') <> '' THEN
    NEW.username := public.make_username(NEW.full_name);
  END IF;
  RETURN NEW;
END;
$$;

-- On sign-up, and when a name is added to an account created without one.
DROP TRIGGER IF EXISTS profiles_default_username ON public.profiles;
CREATE TRIGGER profiles_default_username
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.default_username();

DROP TRIGGER IF EXISTS profiles_default_username_on_name ON public.profiles;
CREATE TRIGGER profiles_default_username_on_name
  BEFORE UPDATE OF full_name ON public.profiles
  FOR EACH ROW
  WHEN (OLD.username IS NULL AND OLD.full_name IS NULL AND NEW.full_name IS NOT NULL)
  EXECUTE FUNCTION public.default_username();

-- 2. Confirmed applications are public unless switched off ---------------------
-- Runs after the milestone trigger (trigger names run in alphabetical order).
CREATE OR REPLACE FUNCTION public.application_public_by_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'clicked' AND NEW.status <> 'clicked' AND NEW.confirmed_at IS NOT NULL THEN
    NEW.is_public := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_application_public_by_default ON public.application_reports;
CREATE TRIGGER zzz_application_public_by_default
  BEFORE UPDATE ON public.application_reports
  FOR EACH ROW EXECUTE FUNCTION public.application_public_by_default();

-- 3. Shorter limits on shared experiences (existing rows are left as they are) --
ALTER TABLE public.company_experience_reports DROP CONSTRAINT IF EXISTS company_experience_reports_short_limits;
ALTER TABLE public.company_experience_reports ADD CONSTRAINT company_experience_reports_short_limits CHECK (
  length(company_name) <= 80
  AND (role_title IS NULL OR length(role_title) <= 60)
  AND (company_website IS NULL OR length(company_website) <= 108)
) NOT VALID;

/*
OPTIONAL — also give existing accounts a profile link. Run on its own only
if you want this; people can still change or remove it in their profile.

UPDATE public.profiles SET username = public.make_username(full_name)
WHERE username IS NULL AND coalesce(btrim(full_name), '') <> '';
*/
