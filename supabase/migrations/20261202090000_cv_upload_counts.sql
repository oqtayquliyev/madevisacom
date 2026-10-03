/*
  # CV uploads today, for Admin → CVs

  Each person has one CV: a new upload replaces the earlier one. So the number
  on the CVs tab (people with a CV) does not move when someone who already has
  a CV uploads another. This adds the number that does move:

   - uploads_today:        every time an account saved a new or changed CV today
   - guest_uploads_today:  CVs tried today by visitors without an account

  Both come from counters that already exist (the daily upload limits of
  migration 20261127090000); nothing new is stored. The day runs on UTC, like
  the limits. Can be run more than once.
*/

CREATE OR REPLACE FUNCTION public.admin_cv_limits()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'guests_today', (SELECT count(*) FROM public.cv_guest_uploads WHERE day = today),
    'guests_blocked_today', (SELECT count(*) FROM public.cv_guest_uploads WHERE day = today AND n >= public.cv_guest_daily_uploads()),
    'accounts_at_limit_today', (SELECT count(*) FROM public.user_cvs WHERE uploads_day = today AND uploads_n >= 15),
    'uploads_today', (SELECT coalesce(sum(uploads_n), 0) FROM public.user_cvs WHERE uploads_day = today),
    'guest_uploads_today', (SELECT coalesce(sum(n), 0) FROM public.cv_guest_uploads WHERE day = today)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cv_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cv_limits() TO authenticated;
