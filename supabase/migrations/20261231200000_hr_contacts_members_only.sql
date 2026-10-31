/*
# HR & recruiter contacts: full emails for members only

Run AFTER 20261231170000_notifications_offer_contact.sql. Safe to run more than once.

/network (now "HR Contacts") lists companies with their hiring emails. From now on the
server sends the full addresses only to members and admins; everyone else gets them
shortened, e.g. "re***@ramboll.com" (the domain stays, so people see which company it is).
The page offers the membership to see them.

How: the existing function is kept as recruiter_companies_all() (not callable from the
site), and recruiter_companies() wraps it.
*/

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mv_mask_email(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
              THEN left(split_part(p, '@', 1), 2) || '***@' || split_part(p, '@', 2) END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.recruiter_companies_all()') IS NULL AND to_regprocedure('public.recruiter_companies()') IS NOT NULL THEN
    ALTER FUNCTION public.recruiter_companies() RENAME TO recruiter_companies_all;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.recruiter_companies_all() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recruiter_companies()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb := public.recruiter_companies_all();
  uid uuid := auth.uid();
BEGIN
  IF uid IS NOT NULL AND (public.is_admin() OR coalesce(public.has_feature(uid, 'cv_full_report'), false)) THEN
    RETURN v;
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(
             c || jsonb_build_object(
               'emails', (SELECT coalesce(jsonb_agg(public.mv_mask_email(e)) FILTER (WHERE public.mv_mask_email(e) IS NOT NULL), '[]'::jsonb)
                          FROM jsonb_array_elements_text(c -> 'emails') AS e),
               'masked', true)
             ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(v) WITH ORDINALITY AS t(c, ord)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.recruiter_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recruiter_companies() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
