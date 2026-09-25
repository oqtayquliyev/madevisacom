/*
# Email verification on MadeVisa's own terms

Supabase "Confirm email" is OFF, so every sign-up gets
auth.users.email_confirmed_at immediately — it can't tell who really owns
an inbox. From now on MadeVisa tracks that itself:

## profiles.email_verified_at / profiles.verified_email
Empty for new accounts. Set only by mark_email_verified(), which checks the
signed-in session was created from a link or code sent to the user's inbox
(magic link, email code, password reset, invite or email change), within
the last hour. verified_email remembers WHICH address was verified — if the
account email changes later, it no longer counts as verified.

Nobody can set these columns directly (a trigger resets them), except
admins and mark_email_verified().

## What verification unlocks
- The "Verified" badge on the profile.
- Company access: current_user_email() — used by team access
  (publisher_members) — now only returns a verified email. So signing up as
  hr@company.com no longer gives access to that company's dashboard.
- Registering a new company requires a verified email.
Everything else (browsing, applying, tracking) works without it.

## Existing accounts
Marked verified (so nobody working today is locked out): admins, owners of
a company, and people already on a company team.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_email text;

-- ---------------------------------------------------------------------
-- Guard: only admins / mark_email_verified() may set the columns
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() OR current_setting('app.verifying_email', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.email_verified_at := NULL;
    NEW.verified_email := NULL;
  ELSE
    NEW.email_verified_at := OLD.email_verified_at;
    NEW.verified_email := OLD.verified_email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_profile_verification ON public.profiles;
CREATE TRIGGER a_guard_profile_verification
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_verification();

-- ---------------------------------------------------------------------
-- mark_email_verified(): called after the person opens the emailed link
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_email_verified()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  amr jsonb := coalesce(auth.jwt() -> 'amr', '[]'::jsonb);
  ok boolean;
  mail text;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('verified', false, 'reason', 'not_signed_in');
  END IF;

  SELECT lower(email) INTO mail FROM auth.users WHERE id = uid;

  -- Already verified for this address: nothing to do.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND email_verified_at IS NOT NULL AND verified_email = mail) THEN
    RETURN json_build_object('verified', true);
  END IF;

  -- The session must come from something sent to the inbox, recently.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(amr) a
    WHERE a ->> 'method' IN ('otp', 'magiclink', 'email/signup', 'recovery', 'invite', 'email_change')
      AND (a ->> 'timestamp')::bigint >= extract(epoch FROM now() - interval '1 hour')
  ) INTO ok;

  IF NOT ok THEN
    RETURN json_build_object('verified', false, 'reason', 'not_from_email_link');
  END IF;

  PERFORM set_config('app.verifying_email', 'on', true);
  UPDATE public.profiles SET email_verified_at = now(), verified_email = mail WHERE id = uid;
  PERFORM set_config('app.verifying_email', 'off', true);

  RETURN json_build_object('verified', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_email_verified() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_email_verified() TO authenticated;

-- ---------------------------------------------------------------------
-- Company access now needs a verified email
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(u.email)
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid()
    AND p.email_verified_at IS NOT NULL
    AND p.verified_email = lower(u.email)
$$;

GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.require_verified_company_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Verify your email before registering an organization.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_require_verified_company_owner ON public.program_publishers;
CREATE TRIGGER a_require_verified_company_owner
  BEFORE INSERT ON public.program_publishers
  FOR EACH ROW EXECUTE FUNCTION public.require_verified_company_owner();

-- ---------------------------------------------------------------------
-- Existing accounts that already have trusted roles
-- ---------------------------------------------------------------------

UPDATE public.profiles p
SET email_verified_at = now(), verified_email = lower(u.email)
FROM auth.users u
WHERE u.id = p.id
  AND p.email_verified_at IS NULL
  AND (
    p.role = 'admin'
    OR EXISTS (SELECT 1 FROM public.program_publishers pp WHERE pp.owner_id = p.id)
    OR EXISTS (SELECT 1 FROM public.publisher_members m WHERE m.email = lower(u.email))
  );
