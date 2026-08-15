/*
# Create financial report data table

1. New Tables
- `financial_report_data`
  - `id` uuid PK
  - `report_type` text — 'balance_sheet' | 'income_expenditure' | 'receipts_payments'
  - `section` text — grouping label e.g. 'INCOME', 'EXPENDITURE', 'RECEIPTS', 'PAYMENTS', 'PROPERTY AND ASSETS', 'CURRENT ASSETS', 'FUND AND LIABILITIES', 'CURRENT LIABILITIES'
  - `particulars` text — line item name
  - `this_month` numeric — amount for the current month (June 2026)
  - `this_year` numeric — amount for the year (2025-2026)
  - `previous_year` numeric — comparative balance for prior year (balance sheet)
  - `is_subtotal` boolean — row is a subtotal/total row (bold styling)
  - `sort_order` int — display order within report_type
  - `created_at` timestamptz

2. Security
- Single-tenant, no auth scoping needed for these reference/report rows.
- Enable RLS; allow anon + authenticated CRUD since the data is intentionally shared.
*/

CREATE TABLE IF NOT EXISTS financial_report_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  section text NOT NULL DEFAULT '',
  particulars text NOT NULL,
  this_month numeric(15,2) NOT NULL DEFAULT 0,
  this_year numeric(15,2) NOT NULL DEFAULT 0,
  previous_year numeric(15,2) NOT NULL DEFAULT 0,
  is_subtotal boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_report_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_report_data" ON financial_report_data;
CREATE POLICY "anon_select_report_data" ON financial_report_data
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_report_data" ON financial_report_data;
CREATE POLICY "anon_insert_report_data" ON financial_report_data
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_report_data" ON financial_report_data;
CREATE POLICY "anon_update_report_data" ON financial_report_data
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_report_data" ON financial_report_data;
CREATE POLICY "anon_delete_report_data" ON financial_report_data
  FOR DELETE TO anon, authenticated USING (true);
