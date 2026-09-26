/*
Admin: who sent each shared application experience.

admin_experience_reporters(uids) returns, for each sender (admins only):
name, email, profile link, LinkedIn, photo, country, occupation, account age,
last sign-in, email confirmation, and their history — experiences shared
(pending / approved / rejected), applications tracked on MadeVisa, and
the companies they shared about most recently.

Run after 20261024090000_public_by_default.sql.
*/

CREATE OR REPLACE FUNCTION public.admin_experience_reporters(uids uuid[])
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  username text,
  avatar_url text,
  linkedin_url text,
  country_name text,
  occupation text,
  role text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  email_verified boolean,
  shared_total int,
  shared_pending int,
  shared_approved int,
  shared_rejected int,
  shared_24h int,
  tracked_total int,
  recent_companies text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    p.full_name,
    coalesce(p.email, u.email)::text,
    p.username,
    p.avatar_url,
    p.linkedin_url,
    c.name,
    p.occupation,
    p.role::text,
    coalesce(u.created_at, p.created_at),
    u.last_sign_in_at,
    (p.email_verified_at IS NOT NULL),
    (SELECT count(*)::int FROM public.company_experience_reports r WHERE r.user_id = u.id),
    (SELECT count(*)::int FROM public.company_experience_reports r WHERE r.user_id = u.id AND r.status = 'pending'),
    (SELECT count(*)::int FROM public.company_experience_reports r WHERE r.user_id = u.id AND r.status = 'approved'),
    (SELECT count(*)::int FROM public.company_experience_reports r WHERE r.user_id = u.id AND r.status = 'rejected'),
    (SELECT count(*)::int FROM public.company_experience_reports r WHERE r.user_id = u.id AND r.created_at > now() - interval '24 hours'),
    (SELECT count(*)::int FROM public.application_reports a WHERE a.user_id = u.id AND a.status <> 'clicked'),
    ARRAY(
      SELECT r.company_name FROM public.company_experience_reports r
      WHERE r.user_id = u.id ORDER BY r.created_at DESC LIMIT 6
    )
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.countries c ON c.id = p.country_id
  WHERE u.id = ANY(uids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_experience_reporters(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_experience_reporters(uuid[]) TO authenticated;
