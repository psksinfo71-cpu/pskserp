/* Add asset_categories to finance_manager's writable tables list */
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

  IF v_role = 'super_admin' THEN
    RETURN true;
  END IF;

  IF p_action = 'delete' THEN
    RETURN false;
  END IF;

  IF v_role = 'finance_manager' THEN
    RETURN p_table IN (
      'branches','departments','donors','projects','cost_centers',
      'chart_of_accounts','financial_years','voucher_types',
      'budgets','bank_accounts','assets','asset_categories',
      'asset_transactions','asset_depreciation_runs',
      'suppliers','customers',
      'vouchers','voucher_details','settings'
    );
  END IF;

  IF v_role = 'accounts_manager' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  IF v_role = 'accountant' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  IF v_role = 'head_of_finance' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  IF v_role = 'deputy_executive_director' THEN
    RETURN p_table IN ('vouchers','voucher_details');
  END IF;

  IF v_role = 'branch_manager' THEN
    IF p_action = 'update' THEN
      RETURN p_table IN ('vouchers','voucher_details');
    END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_write_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_write_allowed(text, text) TO authenticated;
