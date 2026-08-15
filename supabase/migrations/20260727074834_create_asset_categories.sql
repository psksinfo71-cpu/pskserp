/*
# Create asset_categories table and link assets to it

## Purpose
Replace the free-text `category` field on `assets` with a proper reference
table holding the 9 fixed-asset categories from the org's depreciation
schedule, each with its Written Down Value (WDV) depreciation rate. This lets
new asset purchases automatically aggregate into their category for the
Fixed Asset & Depreciation report.

## New Tables
- `asset_categories`
  - `id` uuid PK
  - `code` text, unique — short code e.g. 'LAND', 'BLDG'
  - `name` text — category name e.g. 'Land', 'Building'
  - `depreciation_rate` numeric — annual WDV rate as a fraction (0.05 = 5%)
  - `depreciation_method` text — 'wdv' | 'straight_line' (default 'wdv')
  - `sort_order` int — display order matching the Excel schedule
  - `is_active` boolean
  - `created_at` timestamptz

## Modified Tables
- `assets`
  - Adds `category_id uuid REFERENCES asset_categories(id) ON DELETE SET NULL`
  - Keeps the existing `category text` column for backward compatibility of
    any existing rows; new entries should use `category_id`. No data is lost.

## Seeded Data
The 9 categories from the Fixed Asset & Depreciation schedule (Excel):
1. Land            — rate 0%   (not depreciated)
2. Building        — rate 5%
3. Furniture & Fixture    — rate 10%
4. Office Equipment       — rate 10%
5. Husking Mill           — rate 15%
6. Books & Periodicals    — rate 10%
7. Vehicles               — rate 20%
8. Computer Equipments    — rate 20%
9. Medical Equipments     — rate 10%

## Security
- Shared organizational reference data (like chart_of_accounts).
- Enable RLS; allow authenticated CRUD (the ERP requires sign-in; all staff
  share master data). Policies mirror the existing master-data tables.
*/

CREATE TABLE IF NOT EXISTS public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  depreciation_rate numeric(6,4) NOT NULL DEFAULT 0,
  depreciation_method text NOT NULL DEFAULT 'wdv',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_cat_read" ON public.asset_categories;
CREATE POLICY "asset_cat_read" ON public.asset_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "asset_cat_insert" ON public.asset_categories;
CREATE POLICY "asset_cat_insert" ON public.asset_categories
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "asset_cat_update" ON public.asset_categories;
CREATE POLICY "asset_cat_update" ON public.asset_categories
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "asset_cat_delete" ON public.asset_categories;
CREATE POLICY "asset_cat_delete" ON public.asset_categories
  FOR DELETE TO authenticated USING (true);

-- Link assets to asset_categories (idempotent column add)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets'
      AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.assets
      ADD COLUMN category_id uuid REFERENCES public.asset_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_category_id ON public.assets(category_id);

-- Seed the 9 categories (idempotent: insert only if code missing)
INSERT INTO public.asset_categories (code, name, depreciation_rate, depreciation_method, sort_order, is_active)
VALUES
  ('LAND', 'Land', 0.0000, 'wdv', 1, true),
  ('BLDG', 'Building', 0.0500, 'wdv', 2, true),
  ('FURN', 'Furniture & Fixture', 0.1000, 'wdv', 3, true),
  ('OFFE', 'Office Equipment', 0.1000, 'wdv', 4, true),
  ('HUSK', 'Husking Mill', 0.1500, 'wdv', 5, true),
  ('BOOK', 'Books & Periodicals', 0.1000, 'wdv', 6, true),
  ('VEHI', 'Vehicles', 0.2000, 'wdv', 7, true),
  ('COMP', 'Computer Equipments', 0.2000, 'wdv', 8, true),
  ('MEDI', 'Medical Equipments', 0.1000, 'wdv', 9, true)
ON CONFLICT (code) DO NOTHING;
