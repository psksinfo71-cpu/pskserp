/*
# Add unique constraint on assets.code and seed category totals

## Purpose
1. Make `assets.code` unique so upserts work (asset codes must be unique anyway).
2. Seed the 9 fixed-asset category summary rows from the Excel schedule into
   `assets` so the Fixed Asset Schedule report and the Balance Sheet share one
   live data source.

Totals as at 30.06.2026 (from Excel):
  Cost 19,205,611 | Accum Depn 14,903,622.14 | WDV 4,301,988.87

## Changes
- Add UNIQUE constraint on `assets.code` (idempotent via DO block).
- Upsert 9 rows keyed by code 'AST-LAND', 'AST-BLDG', etc.
*/

-- Add unique constraint on assets.code if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_code_key'
      AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets ADD CONSTRAINT assets_code_key UNIQUE (code);
  END IF;
END $$;

-- Seed the 9 category summary rows (idempotent upsert by code)
DO $$
DECLARE
  cat_rec RECORD;
BEGIN
  FOR cat_rec IN
    SELECT * FROM (VALUES
      ('LAND',  472082.00,     0.00,        472082.00),
      ('BLDG',  9405860.00,    8577986.30,  827873.70),
      ('FURN',  2367705.00,    1387066.25,  980638.75),
      ('OFFE',  3330688.00,    1867597.39,  1463090.61),
      ('HUSK',  231696.00,     230769.025,  926.975),
      ('BOOK',  69267.00,      66388.22,    2878.78),
      ('VEHI',  1319400.00,    1149530.40,  169869.60),
      ('COMP',  2008913.00,    1624284.55,  384628.45),
      ('MEDI',  0.00,          0.00,        0.00)
    ) AS t(code, cost, accum_depn, wdv)
  LOOP
    INSERT INTO public.assets
      (code, name, category_id, purchase_date, purchase_cost,
       accumulated_depreciation, current_value, depreciation_method, status, is_active)
    SELECT
      'AST-' || cat_rec.code,
      ac.name,
      ac.id,
      DATE '2025-07-01',
      cat_rec.cost,
      cat_rec.accum_depn,
      cat_rec.wdv,
      'wdv',
      'in_service',
      true
    FROM public.asset_categories ac
    WHERE ac.code = cat_rec.code
    ON CONFLICT (code) DO UPDATE SET
      category_id = EXCLUDED.category_id,
      purchase_cost = EXCLUDED.purchase_cost,
      accumulated_depreciation = EXCLUDED.accumulated_depreciation,
      current_value = EXCLUDED.current_value,
      depreciation_method = 'wdv',
      status = 'in_service';
  END LOOP;
END $$;
