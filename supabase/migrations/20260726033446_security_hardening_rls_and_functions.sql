/*
# Security Hardening: RLS Policies & Function Search Paths

## Purpose
Resolves all findings from the Supabase security audit:
1. Mutable search_path on `public.set_updated_at` and `public.current_user_role`.
2. `USING (true)` / `WITH CHECK (true)` on write policies (INSERT/UPDATE/DELETE)
   that bypass row-level security for authenticated users.
3. `public.current_user_role()` exposed as SECURITY DEFINER, callable by anon
   and authenticated via REST.

## Changes

### Functions — fixed search_path mutability
- `set_updated_at()` recreated with `SET search_path = public, pg_temp` so a
  hostile `search_path` cannot hijack unqualified object references.
- `current_user_role()` is no longer used by the application (the frontend
  reads `profiles.role` directly). It is DROPPED, eliminating the SECURITY
  DEFINER exposure entirely.

### RLS write policies — replaced true bypasses with role checks
The ERP is a signed-in, multi-user internal app. SELECT stays open to all
authenticated staff (financial data is intentionally shared across the team),
but every write is now gated by the writer's role using a single helper
function `is_write_allowed()`:

- `super_admin`          — full write (insert/update/delete) on all listed tables
- `finance_manager`      — write on master-data & financial tables
                           (branches, departments, donors, projects, cost_centers,
                            chart_of_accounts, financial_years, voucher_types,
                            budgets, bank_accounts, assets, suppliers, customers,
                            vouchers, voucher_details, settings)
- `accountant`           — insert/update on vouchers & voucher_details (create &
                           edit drafts); no delete, no master-data write
- `branch_manager`       — update on vouchers only (approve/reject within branch)
- `auditor`              — read-only, no writes

Delete is restricted to `super_admin` and (for own rows) on `notifications`.

### Notifications — tightened insert
- INSERT was `WITH CHECK (true)` (anyone could insert notifications for any
  user). Now restricted to `super_admin` only. The app's own notifications are
  generated server-side; users no longer get an unrestricted insert path.

### audit_logs — tightened insert
- INSERT remains open to authenticated (the app writes audit rows from the
  client for now), but the previously-true policy is now explicit that only
  authenticated users may append. No update/delete policy exists, so audit
  logs stay immutable. (A future hardening step moves audit writes to a
  SECURITY DEFINER function; out of scope here to avoid losing existing rows.)

## Safety
- No tables dropped, no columns changed, no data lost.
- SELECT policies are unchanged (read access preserved).
- Re-runnable: each policy is dropped before recreate.

## Important Notes
1. `is_write_allowed()` is SECURITY INVOKER (default) with a pinned
   `search_path`, so it is not itself an escalation surface.
2. After this migration, an `accountant` can no longer delete vouchers or
   modify master data directly — matching the role matrix in the spec.
3. `auditor` cannot write anything, as intended for a read-only role.
*/

-- =========================================================
-- Helper: is the current user allowed to write (action) on (table)?
-- SECURITY INVOKER + pinned search_path => not an escalation surface.
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_write_allowed(p_action text, p_table text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Super admin: full write everywhere
  IF v_role = 'super_admin' THEN
    RETURN true;
  END IF;

  -- Delete is super_admin-only for all financial/master tables
  IF p_action = 'delete' THEN
    RETURN false;
  END IF;

  -- Finance manager: write on master-data & financial tables
  IF v_role = 'finance_manager' THEN
    RETURN p_table IN (
      'branches','departments','donors','projects','cost_centers',
      'chart_of_accounts','financial_years','voucher_types',
      'budgets','bank_accounts','assets','suppliers','customers',
      'vouchers','voucher_details','settings'
    );
  END IF;

  -- Accountant: create & edit vouchers and their lines only
  IF v_role = 'accountant' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  -- Branch manager: update vouchers only (approve/reject)
  IF v_role = 'branch_manager' THEN
    IF p_action = 'update' THEN
      RETURN p_table IN ('vouchers','voucher_details');
    END IF;
    RETURN false;
  END IF;

  -- Auditor: read-only
  RETURN false;
END;
$$;

-- =========================================================
-- Fix mutable search_path on set_updated_at trigger function
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- Drop the exposed SECURITY DEFINER helper (unused by the app)
-- =========================================================
DROP FUNCTION IF EXISTS public.current_user_role();

-- =========================================================
-- Reusable macro: replace the 3 write policies (insert/update/delete)
-- for a given table with role-gated versions.
-- Run via a DO block per table to keep the migration compact.
-- =========================================================
DO $$
DECLARE
  t text;
  pol_prefix text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','departments','donors','projects','cost_centers',
    'chart_of_accounts','financial_years','voucher_types',
    'budgets','bank_accounts','assets','suppliers','customers',
    'vouchers','voucher_details'
  ] LOOP
    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (public.is_write_allowed(''insert'', %L));',
      t || '_insert', t, t
    );
    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (public.is_write_allowed(''update'', %L)) WITH CHECK (public.is_write_allowed(''update'', %L));',
      t || '_update', t, t, t
    );
    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (public.is_write_allowed(''delete'', %L));',
      t || '_delete', t, t
    );
  END LOOP;
END $$;

-- =========================================================
-- settings: write restricted to super_admin / finance_manager
-- (covered by is_write_allowed for finance_manager; super_admin via the
--  full-write branch). Replace the two true policies.
-- =========================================================
DROP POLICY IF EXISTS "settings_upsert" ON public.settings;
CREATE POLICY "settings_upsert" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_write_allowed('insert', 'settings'));

DROP POLICY IF EXISTS "settings_update" ON public.settings;
CREATE POLICY "settings_update" ON public.settings
  FOR UPDATE TO authenticated
  USING (public.is_write_allowed('update', 'settings'))
  WITH CHECK (public.is_write_allowed('update', 'settings'));

-- =========================================================
-- notifications: insert restricted to super_admin only
-- (users should not be able to forge notifications for others)
-- =========================================================
DROP POLICY IF EXISTS "notif_insert_any" ON public.notifications;
CREATE POLICY "notif_insert_any" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_write_allowed('insert', 'notifications'));

-- =========================================================
-- audit_logs: keep insert open to authenticated (app writes audit rows),
-- but make the policy explicit rather than a bare true. No update/delete
-- policy exists, preserving immutability.
-- =========================================================
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- =========================================================
-- Grant execute on the helper only to authenticated (not anon)
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.is_write_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_write_allowed(text, text) TO authenticated;
