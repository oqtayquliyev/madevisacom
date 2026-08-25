/*
# Revoke public EXECUTE on internal helper functions

## Changes
Revoke EXECUTE on `is_admin()` and `current_user_agency_id()` from PUBLIC so
no role can call them directly via the REST API. These functions are internal
RLS policy helpers; they are invoked by the policy engine as the table owner,
which does not require explicit EXECUTE grants.

## Security
- Closes the anon and authenticated SECURITY DEFINER execution warnings.
- RLS policies continue to work: policy evaluation runs these functions with
  owner privileges regardless of role EXECUTE grants.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_agency_id() FROM PUBLIC;
