/*
# Add opening_value column and set carried-over purchase dates

## Purpose
Support month-based depreciation (July-June FY, purchase month excluded).
Carried-over assets (bought before this FY) get 12 months; new purchases get
(12 - fiscalMonth) months. The depreciation base for carried-over assets is
the opening WDV (book value at FY start), not the closing WDV.

## Changes
1. Add `opening_value` numeric column to `assets` (default 0) — stores the
   WDV at the start of the current fiscal year.
2. Set purchase_date for the 9 seeded category rows to 2025-06-30 (end of
   prior FY) so the month rule correctly gives them 12 months for FY 2025-26.
3. Seed the opening WDV values from the Excel schedule:

   | Category            | Opening WDV (01.07.2025) |
   |---------------------|--------------------------|
   | Land                |          472,082.00      |
   | Building            |          871,445.70      |
   | Furniture & Fixture |          864,229.32      |
   | Office Equipment    |          861,155.55      |
   | Husking Mill        |            1,090.98      |
   | Books & Periodicals |            3,837.78      |
   | Vehicles            |           19,261.60      |
   | Computer Equipments |          373,283.20      |
   | Medical Equipments  |                0.00      |

   Opening WDV = opening cost - opening accumulated depreciation (from Excel).
*/

-- Add opening_value column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets'
      AND column_name = 'opening_value'
  ) THEN
    ALTER TABLE public.assets
      ADD COLUMN opening_value numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Set opening WDV and purchase_date for the 9 category summary rows
UPDATE public.assets SET opening_value = 472082.00,    purchase_date = DATE '2025-06-30' WHERE code = 'AST-LAND';
UPDATE public.assets SET opening_value = 871445.70,    purchase_date = DATE '2025-06-30' WHERE code = 'AST-BLDG';
UPDATE public.assets SET opening_value = 864229.32,    purchase_date = DATE '2025-06-30' WHERE code = 'AST-FURN';
UPDATE public.assets SET opening_value = 861155.55,    purchase_date = DATE '2025-06-30' WHERE code = 'AST-OFFE';
UPDATE public.assets SET opening_value = 1090.975,     purchase_date = DATE '2025-06-30' WHERE code = 'AST-HUSK';
UPDATE public.assets SET opening_value = 3837.78,      purchase_date = DATE '2025-06-30' WHERE code = 'AST-BOOK';
UPDATE public.assets SET opening_value = 19261.60,     purchase_date = DATE '2025-06-30' WHERE code = 'AST-VEHI';
UPDATE public.assets SET opening_value = 373283.20,    purchase_date = DATE '2025-06-30' WHERE code = 'AST-COMP';
UPDATE public.assets SET opening_value = 0.00,         purchase_date = DATE '2025-06-30' WHERE code = 'AST-MEDI';
