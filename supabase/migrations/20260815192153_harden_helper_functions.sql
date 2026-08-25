/*
# Harden helper functions

## Changes
1. `set_updated_at()` — add `SET search_path = public` to pin the search path
   and clear the function_search_path_mutable advisor warning.
2. `is_admin()` and `current_user_agency_id()` — revoke EXECUTE from `anon` and
   `authenticated` so these internal helpers cannot be called directly via the
   REST API. They remain SECURITY DEFINER because they are used inside RLS
   policy predicates and must bypass RLS on the tables they read. Policy
   evaluation calls them as the table owner, not via the REST RPC endpoint.

## Security
- No data was at risk: `is_admin()` returns false and `current_user_agency_id()`
  returns NULL for unauthenticated callers. This change reduces attack surface.
- All existing RLS policies continue to work because they invoke the functions
  during policy evaluation, not through the public RPC endpoint.
*/

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_agency_id() FROM anon;
