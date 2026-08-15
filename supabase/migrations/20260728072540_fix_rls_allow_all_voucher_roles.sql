/*
# Fix: RLS write policies blocked voucher submission for accounts_manager,
# head_of_finance, and deputy_executive_director

## Problem
The `is_write_allowed()` function only allowed `accountant` and
`finance_manager` to insert/update vouchers. But `accounts_manager` has
the `create_voucher` capability, and `head_of_finance` /
`deputy_executive_director` have `edit_voucher` capability and need to
update voucher status (verify / approve). The RLS policy blocked their
writes, causing "new row violates row-level security policy" errors on
voucher submit.

## Fix
Add `accounts_manager`, `head_of_finance`, and
`deputy_executive_director` to `is_write_allowed()` for insert/update
on `vouchers` and `voucher_details`.
*/

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
      'asset_categories','asset_transactions','asset_depreciation_runs'
    );
  END IF;

  -- Accounts manager: create & edit vouchers and their lines
  IF v_role = 'accounts_manager' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  -- Accountant: create & edit vouchers and their lines
  IF v_role = 'accountant' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  -- Head of finance: update vouchers (verify step) + voucher_details
  IF v_role = 'head_of_finance' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  -- Deputy executive director: update vouchers (approve step)
  IF v_role = 'deputy_executive_director' THEN
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

-- Re-grant execute
REVOKE EXECUTE ON FUNCTION public.is_write_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_write_allowed(text, text) TO authenticated;
