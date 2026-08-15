/*
# PSKS ERP - Seed Reference & Sample Data

## What this migration does
1. Inserts voucher types (PV/RV/JV/CV/AV/OV/CLV).
2. Inserts a default financial year FY2025-26.
3. Inserts a full hierarchical Chart of Accounts
   (Assets/Liabilities/Equity/Income/Expenses) with auto codes.
4. Seeds branches (Dhaka HO, Chattogram, Khulna), a department, donors,
   projects, cost centers, suppliers, customers, bank accounts.
5. Seeds system settings (org name, currency BDT, voucher prefix).

This data is the minimum needed to operate the ERP and demonstrate reports.
All inserts are idempotent (guarded by ON CONFLICT DO NOTHING) so re-running
is safe.
*/

-- Voucher types
INSERT INTO public.voucher_types (code, name, prefix, is_active) VALUES
  ('PV','Payment Voucher','PV',true),
  ('RV','Receipt Voucher','RV',true),
  ('JV','Journal Voucher','JV',true),
  ('CV','Contra Voucher','CV',true),
  ('AV','Adjustment Voucher','AV',true),
  ('OV','Opening Voucher','OV',true),
  ('CLV','Closing Voucher','CLV',true)
ON CONFLICT (code) DO NOTHING;

-- Financial year
INSERT INTO public.financial_years (name, start_date, end_date, is_active)
VALUES ('FY 2025-26', '2025-07-01', '2026-06-30', true)
ON CONFLICT DO NOTHING;

-- Branches
INSERT INTO public.branches (code, name, division, region, district, address, is_active)
VALUES
  ('BR-001','Dhaka Head Office','Dhaka','Dhaka','Dhaka','1 Main Road, Dhaka',true),
  ('BR-002','Chattogram Branch','Chattogram','Chattogram','Chattogram','2 Port Road, Chattogram',true),
  ('BR-003','Khulna Branch','Khulna','Khulna','Khulna','3 Station Road, Khulna',true)
ON CONFLICT (code) DO NOTHING;

-- Donors
INSERT INTO public.donors (code, name, contact_person, email, phone, is_active)
VALUES
  ('DON-001','Global Aid Foundation','John Smith','john@globalaid.org','+880100000001',true),
  ('DON-002','Hope International','Mary Jones','mary@hopeint.org','+880100000002',true),
  ('DON-003','Local Welfare Trust','Karim Ahmed','karim@lwt.org','+880100000003',true)
ON CONFLICT DO NOTHING;

-- Department (for HO branch)
INSERT INTO public.departments (code, name, branch_id, is_active)
SELECT 'DEP-001','Finance & Accounts', b.id, true
FROM public.branches b WHERE b.code = 'BR-001'
ON CONFLICT DO NOTHING;

-- Projects
INSERT INTO public.projects (code, name, donor_id, branch_id, start_date, end_date, budget_amount, status, is_active)
SELECT 'PRJ-001','Rural Microfinance Program', d.id, b.id, '2025-07-01','2026-06-30',5000000,'active',true
FROM public.donors d, public.branches b
WHERE d.code='DON-001' AND b.code='BR-001'
ON CONFLICT DO NOTHING;

INSERT INTO public.projects (code, name, donor_id, branch_id, start_date, end_date, budget_amount, status, is_active)
SELECT 'PRJ-002','Women Empowerment Project', d.id, b.id, '2025-07-01','2026-06-30',3000000,'active',true
FROM public.donors d, public.branches b
WHERE d.code='DON-002' AND b.code='BR-001'
ON CONFLICT DO NOTHING;

-- Cost center
INSERT INTO public.cost_centers (code, name, branch_id, is_active)
SELECT 'CC-001','HO Operations', b.id, true FROM public.branches b WHERE b.code='BR-001'
ON CONFLICT DO NOTHING;

-- Bank accounts
INSERT INTO public.bank_accounts (branch_id, account_name, bank_name, account_number, account_type, opening_balance, current_balance, is_active)
SELECT b.id,'PSKS Operating Account','Sonali Bank','000111222333','savings',1000000,1000000,true
FROM public.branches b WHERE b.code='BR-001'
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_accounts (branch_id, account_name, bank_name, account_number, account_type, opening_balance, current_balance, is_active)
SELECT b.id,'PSKS Chattogram Account','Agrani Bank','000444555666','savings',500000,500000,true
FROM public.branches b WHERE b.code='BR-002'
ON CONFLICT DO NOTHING;

-- Suppliers
INSERT INTO public.suppliers (code, name, contact_person, email, phone, is_active)
VALUES
  ('SUP-001','Office Stationery Ltd','Rahim','sales@stationery.com','+880200000001',true),
  ('SUP-002','Tech Solutions BD','Sadia','info@techsolutions.com','+880200000002',true)
ON CONFLICT DO NOTHING;

-- Customers
INSERT INTO public.customers (code, name, contact_person, email, phone, is_active)
VALUES
  ('CUS-001','Micro Client Group A','Hasan','hasan@email.com','+880300000001',true),
  ('CUS-002','Micro Client Group B','Fatima','fatima@email.com','+880300000002',true)
ON CONFLICT DO NOTHING;

-- Settings
INSERT INTO public.settings (key, value) VALUES
  ('org_name','PSKS'),
  ('org_full_name','PSKS Accounting ERP'),
  ('currency','BDT'),
  ('currency_symbol','৳'),
  ('voucher_prefix_year','2026'),
  ('theme','light')
ON CONFLICT (key) DO NOTHING;

-- =========================================================
-- CHART OF ACCOUNTS (hierarchical, auto codes)
-- =========================================================
INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id, is_group, is_active) VALUES
  -- Top level groups
  ('1','Assets','asset',NULL,true,true),
  ('2','Liabilities','liability',NULL,true,true),
  ('3','Equity','equity',NULL,true,true),
  ('4','Income','income',NULL,true,true),
  ('5','Expenses','expense',NULL,true,true),
  -- Assets
  ('11','Current Assets','asset',(SELECT id FROM public.chart_of_accounts WHERE code='1'),true,true),
  ('111','Cash in Hand','asset',(SELECT id FROM public.chart_of_accounts WHERE code='11'),true,true),
  ('1111','Cash on Hand','asset',(SELECT id FROM public.chart_of_accounts WHERE code='111'),false,true),
  ('112','Cash at Bank','asset',(SELECT id FROM public.chart_of_accounts WHERE code='11'),true,true),
  ('1121','Sonali Bank','asset',(SELECT id FROM public.chart_of_accounts WHERE code='112'),false,true),
  ('1122','Agrani Bank','asset',(SELECT id FROM public.chart_of_accounts WHERE code='112'),false,true),
  ('113','Accounts Receivable','asset',(SELECT id FROM public.chart_of_accounts WHERE code='11'),true,true),
  ('1131','Customers','asset',(SELECT id FROM public.chart_of_accounts WHERE code='113'),false,true),
  ('12','Fixed Assets','asset',(SELECT id FROM public.chart_of_accounts WHERE code='1'),true,true),
  ('121','Office Equipment','asset',(SELECT id FROM public.chart_of_accounts WHERE code='12'),false,true),
  ('122','Furniture & Fixtures','asset',(SELECT id FROM public.chart_of_accounts WHERE code='12'),false,true),
  ('123','Buildings','asset',(SELECT id FROM public.chart_of_accounts WHERE code='12'),false,true),
  -- Liabilities
  ('21','Current Liabilities','liability',(SELECT id FROM public.chart_of_accounts WHERE code='2'),true,true),
  ('211','Accounts Payable','liability',(SELECT id FROM public.chart_of_accounts WHERE code='21'),true,true),
  ('2111','Suppliers','liability',(SELECT id FROM public.chart_of_accounts WHERE code='211'),false,true),
  ('212','Short Term Loans','liability',(SELECT id FROM public.chart_of_accounts WHERE code='21'),false,true),
  -- Equity
  ('31','Capital Fund','equity',(SELECT id FROM public.chart_of_accounts WHERE code='3'),false,true),
  ('32','General Reserve','equity',(SELECT id FROM public.chart_of_accounts WHERE code='3'),false,true),
  -- Income
  ('41','Grant Income','income',(SELECT id FROM public.chart_of_accounts WHERE code='4'),true,true),
  ('411','Donor Grants','income',(SELECT id FROM public.chart_of_accounts WHERE code='41'),false,true),
  ('42','Service Income','income',(SELECT id FROM public.chart_of_accounts WHERE code='4'),true,true),
  ('421','Microfinance Service Fee','income',(SELECT id FROM public.chart_of_accounts WHERE code='42'),false,true),
  ('43','Interest Income','income',(SELECT id FROM public.chart_of_accounts WHERE code='4'),true,true),
  ('431','Bank Interest','income',(SELECT id FROM public.chart_of_accounts WHERE code='43'),false,true),
  ('44','Other Income','income',(SELECT id FROM public.chart_of_accounts WHERE code='4'),true,true),
  ('441','Miscellaneous Income','income',(SELECT id FROM public.chart_of_accounts WHERE code='44'),false,true),
  -- Expenses
  ('51','Administrative Expenses','expense',(SELECT id FROM public.chart_of_accounts WHERE code='5'),true,true),
  ('511','Salaries & Wages','expense',(SELECT id FROM public.chart_of_accounts WHERE code='51'),false,true),
  ('512','Rent','expense',(SELECT id FROM public.chart_of_accounts WHERE code='51'),false,true),
  ('513','Utilities','expense',(SELECT id FROM public.chart_of_accounts WHERE code='51'),false,true),
  ('514','Office Supplies','expense',(SELECT id FROM public.chart_of_accounts WHERE code='51'),false,true),
  ('52','Program Expenses','expense',(SELECT id FROM public.chart_of_accounts WHERE code='5'),true,true),
  ('521','Training & Workshop','expense',(SELECT id FROM public.chart_of_accounts WHERE code='52'),false,true),
  ('522','Field Operations','expense',(SELECT id FROM public.chart_of_accounts WHERE code='52'),false,true),
  ('53','Financial Expenses','expense',(SELECT id FROM public.chart_of_accounts WHERE code='5'),true,true),
  ('531','Bank Charges','expense',(SELECT id FROM public.chart_of_accounts WHERE code='53'),false,true),
  ('532','Depreciation','expense',(SELECT id FROM public.chart_of_accounts WHERE code='53'),false,true)
ON CONFLICT (code) DO NOTHING;

-- Opening balances for key accounts
UPDATE public.chart_of_accounts SET opening_balance = 200000 WHERE code = '1111';
UPDATE public.chart_of_accounts SET opening_balance = 1500000 WHERE code = '1121';
UPDATE public.chart_of_accounts SET opening_balance = 500000 WHERE code = '1122';
UPDATE public.chart_of_accounts SET opening_balance = 800000 WHERE code = '121';
UPDATE public.chart_of_accounts SET opening_balance = 300000 WHERE code = '122';
UPDATE public.chart_of_accounts SET opening_balance = 1200000 WHERE code = '2111';
UPDATE public.chart_of_accounts SET opening_balance = 2000000 WHERE code = '31';
UPDATE public.chart_of_accounts SET opening_balance = 600000 WHERE code = '32';
