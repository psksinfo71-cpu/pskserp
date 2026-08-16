-- Seed the exact General Fund balance-sheet snapshots supplied for July and June 2026.
ALTER TABLE public.financial_report_data
  ADD COLUMN IF NOT EXISTS as_on_date date,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_financial_report_data_snapshot
  ON public.financial_report_data(report_type, project_id, as_on_date);

DELETE FROM public.financial_report_data
WHERE report_type = 'balance_sheet'
  AND project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
  AND as_on_date IN ('2026-07-31', '2026-06-30');

INSERT INTO public.financial_report_data
  (report_type, section, particulars, this_month, this_year, previous_year, is_subtotal, sort_order, as_on_date, project_id)
VALUES
  ('balance_sheet','PROPERTY AND ASSETS','Fixed Assets (Note 1.00)',0,4301989,0,false,10,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Security Money to PBS (Note 2.00)',0,11314,0,false,20,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Loan to Different Fund (Note 3.00)',0,0,0,false,30,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Fixed Deposit Investment (FDR) (Note 4.00)',0,2340225,0,false,40,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Advance Income Tax (Note 5.00)',0,16693,0,false,50,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Interest on FDR (Note 6.00)',0,-150,0,false,60,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Cash and Bank Balance (Note 7.00)',0,844295,0,false,70,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Total Current Assets',0,3012377,0,true,80,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','PROPERTY AND ASSETS','Total Property and Assets',0,4301989,0,true,90,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','FUND AND LIABILITIES','Fund Account (Note 8.00)',0,7498366,0,false,100,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Security Deposit (Husking Mill) (Note 9.00)',0,10000,0,false,110,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Staff Security Money (Note 10.00)',0,0,0,false,120,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Loan from Different Fund (Note 11.00)',0,0,0,false,130,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Provision for Audit Fees (Note 12.00)',0,6000,0,false,140,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','FUND AND LIABILITIES','Total Fund and Liabilities',0,7498366,0,true,150,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','PROPERTY AND ASSETS','Total Property and Assets TAKA',0,7514366,0,true,160,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','FUND AND LIABILITIES','Total Fund and Liabilities TAKA',0,7514366,0,true,170,'2026-07-31','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','PROPERTY AND ASSETS','Fixed Assets (Note 1.00)',0,4301989,0,false,10,'2026-06-30','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Security Money to PBS (Note 2.00)',0,11314,0,false,20,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Loan to Different Fund (Note 3.00)',0,0,0,false,30,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Fixed Deposit Investment (FDR) (Note 4.00)',0,2340225,0,false,40,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Advance Income Tax (Note 5.00)',0,16693,0,false,50,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Interest on FDR (Note 6.00)',0,-150,0,false,60,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Cash and Bank Balance (Note 7.00)',0,796683,0,false,70,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT ASSETS','Total Current Assets',0,3164765,0,true,80,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','PROPERTY AND ASSETS','Total Property and Assets',0,4301989,0,true,90,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','FUND AND LIABILITIES','Fund Account (Note 8.00)',0,7450754,0,false,100,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Security Deposit (Husking Mill) (Note 9.00)',0,10000,0,false,110,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Staff Security Money (Note 10.00)',0,0,0,false,120,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Loan from Different Fund (Note 11.00)',0,0,0,false,130,'2026-06-30','83e3a2cf-f80e-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','CURRENT LIABILITIES','Provision for Audit Fees (Note 12.00)',0,6000,0,false,140,'2026-06-30','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','FUND AND LIABILITIES','Total Fund and Liabilities',0,7466754,0,true,150,'2026-06-30','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','PROPERTY AND ASSETS','Total Property and Assets TAKA',0,7466754,0,true,160,'2026-06-30','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'),
  ('balance_sheet','FUND AND LIABILITIES','Total Fund and Liabilities TAKA',0,7466754,0,true,170,'2026-06-30','83e3a2cf-f80a-4e03-a96e-80ad1ed70e65');