/*
  Admin panel capabilities: grant/revoke admin access by email, and
  full edit/delete of programs + sponsored jobs.

  Two things worth knowing about this migration:

  1. `programs_update_owner` / `sponsored_jobs_update_owner` (from
     earlier migrations) let an owner UPDATE any column on their own
     row, including `status` — meaning an owner could technically
     set their own listing straight to "published" via a direct API
     call, bypassing review. That was never exploited from the UI
     (no edit UI existed until now), but building real edit
     functionality is the right moment to close it: the trigger
     below forces `status` back to 'pending' whenever anyone other
     than an admin changes a row, so an edited listing always goes
     through review again, and only an admin's own edits can set an
     explicit status.

  2. No DELETE policy existed for either table before this — meaning
     delete was silently blocked entirely. This adds admin-only
     delete for both.
*/

-- 1. Grant/revoke admin access by email, callable only by an existing admin.
CREATE OR REPLACE FUNCTION public.grant_admin_by_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can grant admin access';
  END IF;

  UPDATE public.profiles
  SET role = 'admin'
  WHERE email = target_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No account found with that email';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_admin_by_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_admin_by_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can revoke admin access';
  END IF;

  IF target_email = (SELECT email FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'You cannot revoke your own admin access';
  END IF;

  UPDATE public.profiles
  SET role = 'customer'
  WHERE email = target_email AND role = 'admin';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No admin account found with that email';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_admin_by_email(text) TO authenticated;

-- 2. Any non-admin edit sends a listing back for review, and can
-- never set status directly (regardless of what value they send).
CREATE OR REPLACE FUNCTION public.enforce_review_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_enforce_review_on_edit ON public.programs;
CREATE TRIGGER programs_enforce_review_on_edit
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_on_edit();

DROP TRIGGER IF EXISTS sponsored_jobs_enforce_review_on_edit ON public.sponsored_jobs;
CREATE TRIGGER sponsored_jobs_enforce_review_on_edit
  BEFORE UPDATE ON public.sponsored_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_on_edit();

-- 3. Admin-only delete for both tables.
DROP POLICY IF EXISTS "programs_delete_admin" ON public.programs;
CREATE POLICY "programs_delete_admin"
  ON public.programs FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "sponsored_jobs_delete_admin" ON public.sponsored_jobs;
CREATE POLICY "sponsored_jobs_delete_admin"
  ON public.sponsored_jobs FOR DELETE
  TO authenticated
  USING (public.is_admin());
