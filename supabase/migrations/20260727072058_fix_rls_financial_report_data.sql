/*
# Fix RLS bypass on financial_report_data write policies

## Purpose
Resolves the Supabase security audit warnings: the INSERT, UPDATE, and DELETE
policies on `public.financial_report_data` used `WITH CHECK (true)` /
`USING (true)`, which bypass row-level security for anon + authenticated.

## Changes
- SELECT stays open to all authenticated staff (financial report data is
  intentionally shared across the team), and remains readable to anon so the
  no-auth read path keeps working.
- INSERT / UPDATE / DELETE are now gated by the existing
  `public.is_write_allowed(action, table)` role helper, matching the pattern
  used for every other master-data table in the ERP:
    - super_admin      — full write
    - finance_manager  — write on master/financial tables (report data added)
    - accountant       — no write on report data
    - branch_manager   — no write on report data
    - auditor          — read-only
  `financial_report_data` is added to the finance_manager's allow-list in
  `is_write_allowed()`.
- anon can no longer insert/update/delete report data (was previously
  unrestricted via the true policies).

## Safety
- No tables dropped, no columns changed, no data lost.
- Re-runnable: each policy is dropped before recreate.
*/

-- Add financial_report_data to the finance_manager allow-list
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
      'vouchers','voucher_details','settings',
      'financial_report_data'
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

-- SELECT stays readable to anon + authenticated (shared report data)
DROP POLICY IF EXISTS "anon_select_report_data" ON financial_report_data;
CREATE POLICY "anon_select_report_data" ON financial_report_data
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: role-gated (super_admin / finance_manager only)
DROP POLICY IF EXISTS "anon_insert_report_data" ON financial_report_data;
CREATE POLICY "report_data_insert" ON financial_report_data
  FOR INSERT TO authenticated
  WITH CHECK (public.is_write_allowed('insert', 'financial_report_data'));

-- UPDATE: role-gated (super_admin / finance_manager only)
DROP POLICY IF EXISTS "anon_update_report_data" ON financial_report_data;
CREATE POLICY "report_data_update" ON financial_report_data
  FOR UPDATE TO authenticated
  USING (public.is_write_allowed('update', 'financial_report_data'))
  WITH CHECK (public.is_write_allowed('update', 'financial_report_data'));

-- DELETE: super_admin only (via is_write_allowed delete branch)
DROP POLICY IF EXISTS "anon_delete_report_data" ON financial_report_data;
CREATE POLICY "report_data_delete" ON financial_report_data
  FOR DELETE TO authenticated
  USING (public.is_write_allowed('delete', 'financial_report_data'));

REVOKE EXECUTE ON FUNCTION public.is_write_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_write_allowed(text, text) TO authenticated;
