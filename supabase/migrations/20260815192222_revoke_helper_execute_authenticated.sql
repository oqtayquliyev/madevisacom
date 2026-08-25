/*
# Revoke EXECUTE on helpers from authenticated role

The previous revocation from PUBLIC cleared anon access, but the `authenticated`
role retains an explicit EXECUTE grant. Revoke it directly so neither anon nor
authenticated users can call `is_admin()` or `current_user_agency_id()` via the
REST API. These functions remain available to the RLS policy engine.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_agency_id() FROM authenticated;
