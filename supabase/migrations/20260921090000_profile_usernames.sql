/*
  Unique, shareable profile links (/u/<username>).

  A profile's username is optional (NULL allowed) but unique when
  set, and constrained to a URL-safe format. Public lookup goes
  through a SECURITY DEFINER function that returns only fields safe
  to show a stranger (name, avatar, role, publisher org info if
  applicable) — never email, phone, or other private fields — rather
  than opening a broad SELECT policy on the whole profiles table.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

-- Unique only where set — many existing accounts will have NULL
-- until they choose one, and NULLs don't collide under a unique index.
DROP INDEX IF EXISTS profiles_username_unique_idx;
CREATE UNIQUE INDEX profiles_username_unique_idx ON public.profiles (username) WHERE username IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format_check
  CHECK (username IS NULL OR (username ~ '^[a-z0-9_-]{3,30}$'));

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  role text,
  username text,
  publisher_name text,
  publisher_org_type text,
  publisher_verification_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.role,
    p.username,
    pub.name,
    pub.org_type::text,
    pub.verification_status
  FROM public.profiles p
  LEFT JOIN public.program_publishers pub ON pub.owner_id = p.id
  WHERE p.username = lower(p_username)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated, anon;
