/*
# Auto-create profile for OAuth users

## Purpose
When a user signs in via Google OAuth (or any social provider), they bypass
the manual registration form that normally inserts a row into `public.profiles`.
Without a profile row, the frontend AuthProvider loads `profile = null` and the
user gets stuck on a perpetual loading screen.

This migration adds a `handle_new_user` trigger function that fires on INSERT
into `auth.users` (i.e. on every new auth signup, including OAuth). It inserts
a corresponding `profiles` row with:
  - id        = the new auth user id
  - email      = the user's email from auth.users
  - full_name  = the user's name from raw_user_meta_data (Google sends "name")
  - avatar_url = the avatar URL from raw_user_meta_data (Google sends "avatar_url" / "picture")
  - role       = 'customer' (the existing table default)

## Tables affected
- `public.profiles` — receives new rows (no schema change)

## Security
- The trigger function runs as `auth` (the Postgres role used by Supabase Auth),
  which is the only role that can INSERT into `auth.users`. It inserts into
  `public.profiles` using the same privilege.
- The existing `profiles_insert_self` RLS policy allows a user to insert their
  own row, which is compatible with this trigger (the trigger runs as `auth`,
  bypassing RLS, so the insert succeeds regardless).
- No RLS policy changes.
- No data is lost; this only adds rows for users that do not yet have one.

## Idempotency
- `CREATE OR REPLACE FUNCTION` makes the function definition safe to re-run.
- The trigger uses `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.
- The function body uses `WHERE NOT EXISTS` so re-running never duplicates rows.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'full_name',
      NULL
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture',
      NULL
    ),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
