/*
# Fix: restore EXECUTE on RLS helper functions

## Root cause
Three earlier migrations progressively revoked EXECUTE on
`public.is_admin()` and `public.current_user_agency_id()` from `anon`,
`PUBLIC`, and finally `authenticated` — on the assumption that RLS
policy evaluation doesn't need explicit EXECUTE grants on functions it
calls. That assumption is incorrect: Postgres still requires the
querying role to have EXECUTE on any function referenced inside a
policy's USING/WITH CHECK clause, `SECURITY DEFINER` or not.

The practical effect: every policy that calls `is_admin()` — including
the `profiles_select_own_or_admin` policy that runs every time a
signed-in user loads their own profile — has been failing with
`permission denied for function is_admin (42501)` for every real user,
not just non-admins. This is what's been causing the app to hang on
"loading forever" after sign-in: the profile fetch 403s, and the app
is waiting on data that can never arrive.

## Fix
Re-grant EXECUTE on both functions to `authenticated` (needed for any
signed-in user's own queries) and `anon` (needed for the public-read
branches of the sponsored-programs policies, which check `is_admin()`
too). This does NOT widen who counts as an admin — `is_admin()` itself
still only returns true for actual admins; this only lets the
function be *called* at all during policy evaluation, which is the
minimum required for RLS to function correctly.
*/

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_agency_id() TO authenticated, anon;
