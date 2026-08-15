/*
# Fixed Asset Management System

## Purpose
Build a complete fixed-asset lifecycle: asset purchase/addition entry,
category-based auto depreciation rate, depreciation run (monthly or yearly),
opening WDV computation, asset transfer, asset disposal, accumulated
depreciation ledger, auto journal posting, Fixed Asset Register, and
Depreciation Schedule (year-wise and month-wise).

## New Tables
1. `asset_depreciation_runs` — records each depreciation run (period, mode,
   total amount, linked journal voucher, status).
2. `asset_transactions` — records every asset lifecycle event: purchase,
   addition, transfer, disposal, revaluation. Links to the auto-posted
   journal voucher and optional depreciation run.

## Modified Tables
- `asset_categories`: adds `gl_account_id` and `accum_depn_gl_account_id`
  (FK to chart_of_accounts) to map each category to its fixed-asset GL
  account and accumulated-depreciation contra account for auto-posting.
- `assets`: adds `gl_account_id`, `accum_dep_wdv_opening`, `disposal_date`,
  `disposal_value`, `transfer_date`.

## New GL Accounts
Children under the existing "Fixed Assets" group (code 12):
- 1201-1209: one per asset category (Land, Building, Furniture, etc.)
- 1210-1218: Accumulated Depreciation contra accounts per category.

## Security
- RLS enabled on all new tables.
- Policies scope TO authenticated (ERP requires sign-in; shared org data).
- Standard CRUD pattern matching existing master-data tables.
*/

-- =========================================================
-- 1. Create Fixed Asset GL accounts under code 12
-- =========================================================
DO $$
DECLARE
  fa_parent uuid;
BEGIN
  SELECT id INTO fa_parent FROM chart_of_accounts WHERE code = '12' LIMIT 1;

  INSERT INTO chart_of_accounts (code, name, account_type, parent_id, is_group, is_active)
  SELECT '1201', 'Land', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1201')
  UNION ALL
  SELECT '1202', 'Building', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1202')
  UNION ALL
  SELECT '1203', 'Furniture & Fixture', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1203')
  UNION ALL
  SELECT '1204', 'Office Equipment', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1204')
  UNION ALL
  SELECT '1205', 'Husking Mill', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1205')
  UNION ALL
  SELECT '1206', 'Books & Periodicals', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1206')
  UNION ALL
  SELECT '1207', 'Vehicles', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1207')
  UNION ALL
  SELECT '1208', 'Computer Equipments', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1208')
  UNION ALL
  SELECT '1209', 'Medical Equipments', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1209')
  ON CONFLICT DO NOTHING;

  INSERT INTO chart_of_accounts (code, name, account_type, parent_id, is_group, is_active)
  SELECT '1210', 'Accumulated Depreciation - Land', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1210')
  UNION ALL
  SELECT '1211', 'Accumulated Depreciation - Building', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1211')
  UNION ALL
  SELECT '1212', 'Accumulated Depreciation - Furniture', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1212')
  UNION ALL
  SELECT '1213', 'Accumulated Depreciation - Office Equipment', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1213')
  UNION ALL
  SELECT '1214', 'Accumulated Depreciation - Husking Mill', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1214')
  UNION ALL
  SELECT '1215', 'Accumulated Depreciation - Books', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1215')
  UNION ALL
  SELECT '1216', 'Accumulated Depreciation - Vehicles', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1216')
  UNION ALL
  SELECT '1217', 'Accumulated Depreciation - Computer Equipments', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1217')
  UNION ALL
  SELECT '1218', 'Accumulated Depreciation - Medical Equipments', 'asset', fa_parent, false, true
  WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1218')
  ON CONFLICT DO NOTHING;
END $$;

-- =========================================================
-- 2. Add GL account links to asset_categories
-- =========================================================
ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS gl_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accum_depn_gl_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1201') WHERE code = 'LAND' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1202') WHERE code = 'BLDG' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1203') WHERE code = 'FURN' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1204') WHERE code = 'OFFE' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1205') WHERE code = 'HUSK' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1206') WHERE code = 'BOOK' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1207') WHERE code = 'VEHI' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1208') WHERE code = 'COMP' AND gl_account_id IS NULL;
UPDATE asset_categories SET gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1209') WHERE code = 'MEDI' AND gl_account_id IS NULL;

UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1210') WHERE code = 'LAND' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1211') WHERE code = 'BLDG' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1212') WHERE code = 'FURN' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1213') WHERE code = 'OFFE' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1214') WHERE code = 'HUSK' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1215') WHERE code = 'BOOK' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1216') WHERE code = 'VEHI' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1217') WHERE code = 'COMP' AND accum_depn_gl_account_id IS NULL;
UPDATE asset_categories SET accum_depn_gl_account_id = (SELECT id FROM chart_of_accounts WHERE code = '1218') WHERE code = 'MEDI' AND accum_depn_gl_account_id IS NULL;

-- =========================================================
-- 3. Add columns to assets table
-- =========================================================
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS gl_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accum_dep_wdv_opening numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_date date,
  ADD COLUMN IF NOT EXISTS disposal_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_date date;

-- =========================================================
-- 4. Create asset_depreciation_runs table (MUST come before asset_transactions)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.asset_depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL DEFAULT 'monthly',
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_depreciation numeric(18,2) NOT NULL DEFAULT 0,
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed',
  run_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depn_run_period ON public.asset_depreciation_runs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_depn_run_status ON public.asset_depreciation_runs(status);

ALTER TABLE public.asset_depreciation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depn_run_read" ON public.asset_depreciation_runs;
CREATE POLICY "depn_run_read" ON public.asset_depreciation_runs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "depn_run_insert" ON public.asset_depreciation_runs;
CREATE POLICY "depn_run_insert" ON public.asset_depreciation_runs
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "depn_run_update" ON public.asset_depreciation_runs;
CREATE POLICY "depn_run_update" ON public.asset_depreciation_runs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "depn_run_delete" ON public.asset_depreciation_runs;
CREATE POLICY "depn_run_delete" ON public.asset_depreciation_runs
  FOR DELETE TO authenticated USING (true);

-- =========================================================
-- 5. Create asset_transactions table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.asset_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  transaction_type text NOT NULL DEFAULT 'purchase',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  narration text DEFAULT '',
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  depreciation_run_id uuid REFERENCES public.asset_depreciation_runs(id) ON DELETE SET NULL,
  posted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_txn_asset ON public.asset_transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_txn_type ON public.asset_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_asset_txn_date ON public.asset_transactions(transaction_date);

ALTER TABLE public.asset_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_txn_read" ON public.asset_transactions;
CREATE POLICY "asset_txn_read" ON public.asset_transactions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "asset_txn_insert" ON public.asset_transactions;
CREATE POLICY "asset_txn_insert" ON public.asset_transactions
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "asset_txn_update" ON public.asset_transactions;
CREATE POLICY "asset_txn_update" ON public.asset_transactions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "asset_txn_delete" ON public.asset_transactions;
CREATE POLICY "asset_txn_delete" ON public.asset_transactions
  FOR DELETE TO authenticated USING (true);
