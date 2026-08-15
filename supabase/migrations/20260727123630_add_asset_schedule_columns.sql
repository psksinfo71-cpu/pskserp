-- Add Excel-matching columns to asset_categories for the Fixed Asset & Depreciation Schedule.
-- VALUE AT COST section: opening_cost, transferred_cost, addition_cost, adjustment_cost (signed)
-- DEPRECIATION section: opening_depn, transferred_depn, depn_for_year, adjustment_depn (signed)
-- Total Cost = opening_cost + transferred_cost + addition_cost + adjustment_cost
-- Accumulated Depn = opening_depn + transferred_depn + depn_for_year + adjustment_depn
-- WDV = Total Cost - Accumulated Depn

ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS opening_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transferred_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addition_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_depn numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transferred_depn numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depn_for_year numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_depn numeric NOT NULL DEFAULT 0;