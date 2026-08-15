/*
# Harden is_super_admin() function

## Problem
The Supabase security audit flagged three warnings on `is_super_admin()`:

1. **Mutable search_path** — the function had no explicit `search_path`.
2. **Public (anon) can execute SECURITY DEFINER function** — the `anon`
   role could call it via `/rest/v1/rpc/is_super_admin`.
3. **Authenticated can execute SECURITY DEFINER function** — any signed-in
   user could call it via REST.

## Fix
- Switch from `SECURITY DEFINER` to `SECURITY INVOKER`. The function only
  reads `public.profiles` (role column), and the existing SELECT policy
  already grants authenticated users read access — so no elevated
  privileges are needed.
- Pin `search_path = public, auth`.
- Revoke EXECUTE from `anon` and `public`.
- Grant EXECUTE to `authenticated` only.

Existing RLS policies that reference the function continue to work because
`CREATE OR REPLACE` preserves the function OID and its dependents.
*/

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
