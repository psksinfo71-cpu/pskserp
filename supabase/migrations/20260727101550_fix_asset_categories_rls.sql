/*
# Fix RLS policies on asset_categories (security audit warnings)

## Purpose
The Supabase security audit flagged three `USING (true)` / `WITH CHECK (true)`
write policies on `public.asset_categories` (insert, update, delete) that
bypass row-level security for authenticated users. This is a signed-in,
multi-user ERP, so writes must be gated by role via `is_write_allowed()` —
the same pattern applied to every other master-data table in the
20260726033446 hardening migration. `asset_categories` was created AFTER
that migration (20260727074834) and was missed.

## Changes
1. `is_write_allowed()` — add `'asset_categories'` to the finance_manager
   allow-list so finance managers can manage asset categories (they can
   already manage `assets`). super_admin already has full write via the
   early-return branch. Delete stays super_admin-only (the function returns
   false for delete on all non-super-admin roles).
2. Replace the three `true` write policies on `asset_categories`:
   - INSERT  → `WITH CHECK (is_write_allowed('insert', 'asset_categories'))`
   - UPDATE  → `USING + WITH CHECK (is_write_allowed('update', 'asset_categories'))`
   - DELETE  → `USING (is_write_allowed('delete', 'asset_categories'))`
3. SELECT policy (`asset_cat_read`) stays `USING (true)` TO authenticated —
   read access is intentionally shared across all signed-in staff, matching
   every other table in the ERP. This is NOT a bypass; it is the documented
   shared-read model. Not touched.

## Safety
- No tables dropped, no columns changed, no data lost.
- Re-runnable: each policy is dropped before recreate.
- The function change is `CREATE OR REPLACE`, safe to re-run.
*/

-- =========================================================
-- 1. Add asset_categories to the finance_manager write allow-list
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
      'budgets','bank_accounts','assets','asset_categories','suppliers','customers',
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

-- Re-grant execute (OR REPLACE does not preserve grants reliably)
REVOKE EXECUTE ON FUNCTION public.is_write_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_write_allowed(text, text) TO authenticated;

-- =========================================================
-- 2. Replace the three true write policies on asset_categories
-- =========================================================
DROP POLICY IF EXISTS "asset_cat_insert" ON public.asset_categories;
CREATE POLICY "asset_cat_insert" ON public.asset_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_write_allowed('insert', 'asset_categories'));

DROP POLICY IF EXISTS "asset_cat_update" ON public.asset_categories;
CREATE POLICY "asset_cat_update" ON public.asset_categories
  FOR UPDATE TO authenticated
  USING (public.is_write_allowed('update', 'asset_categories'))
  WITH CHECK (public.is_write_allowed('update', 'asset_categories'));

DROP POLICY IF EXISTS "asset_cat_delete" ON public.asset_categories;
CREATE POLICY "asset_cat_delete" ON public.asset_categories
  FOR DELETE TO authenticated
  USING (public.is_write_allowed('delete', 'asset_categories'));
