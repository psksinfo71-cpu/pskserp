/*
# Seed General Fund vouchers from Receipts & Payments data

## Purpose
The General Fund financial data was previously stored only in the
financial_report_data table. The Cash Book and Bank Book pages read from
posted vouchers, which were empty — so the account dropdowns showed no data.
This migration creates real double-entry posted vouchers from the General
Fund's Receipts & Payments figures so that Cash Book, Bank Book, General
Ledger, Trial Balance, and Dashboard all display the General Fund data.

## Changes
1. Adds a unique constraint on vouchers.voucher_no (needed for idempotency).
2. Adds an FDR (Fixed Deposit Receipt) asset account (code 1003) under
   Current Assets.
3. Sets opening balances on cash/bank accounts matching the R&P opening.
4. Creates 34 posted, locked, balanced double-entry vouchers — one per
   non-zero receipt and payment line from the General Fund R&P report.

## Idempotency
The unique constraint on voucher_no plus `INSERT ... ON CONFLICT DO NOTHING`
makes re-running safe. Account insert and opening balance updates are also
safe to re-run.
*/

-- 1. Unique constraint on voucher_no
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_voucher_no_key') THEN
    ALTER TABLE vouchers ADD CONSTRAINT vouchers_voucher_no_key UNIQUE (voucher_no);
  END IF;
END $$;

-- 2. Add FDR account under Current Assets
INSERT INTO chart_of_accounts (code, name, account_type, parent_id, is_group, is_active, opening_balance)
SELECT '1003', 'FDR (Fixed Deposit Receipt)', 'asset',
       (SELECT id FROM chart_of_accounts WHERE code = '10'),
       false, true, 0
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1003');

-- 3. Set opening balances
UPDATE chart_of_accounts SET opening_balance = 0 WHERE code = '1001';
UPDATE chart_of_accounts SET opening_balance = 250000 WHERE code = '10021';
UPDATE chart_of_accounts SET opening_balance = 67224 WHERE code = '10022';

-- 4. Helper function for creating balanced vouchers
CREATE OR REPLACE FUNCTION make_general_fund_voucher(
  p_no text, p_type text, p_date date, p_narration text, p_amount numeric,
  p_dr_code text, p_cr_code text, p_prep uuid, p_apprv uuid, p_br uuid
) RETURNS void AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, branch_id, narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES (p_no, p_type, p_date, p_br, p_narration, p_amount, 'posted', p_prep, p_apprv, true)
  ON CONFLICT (voucher_no) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM chart_of_accounts WHERE code = p_dr_code), p_amount, 0, 1),
      (v_id, (SELECT id FROM chart_of_accounts WHERE code = p_cr_code), 0, p_amount, 2);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Create all vouchers
DO $$
DECLARE
  prep uuid;
  apprv uuid;
  br1 uuid;
BEGIN
  SELECT id INTO prep FROM public.profiles WHERE role = 'accountant' LIMIT 1;
  SELECT id INTO apprv FROM public.profiles WHERE role = 'super_admin' LIMIT 1;
  SELECT id INTO br1 FROM public.branches WHERE code = 'BR-001' LIMIT 1;

  -- ===== CASH RECEIPTS (debit Cash, credit Income) =====
  PERFORM make_general_fund_voucher('GF-RV-001','RV','2025-07-05'::date,'Agriculture/Income Generation receipt',550,'1001','4002',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-002','RV','2025-07-10'::date,'Members subscription fees collected',6100,'1001','4012',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-003','RV','2025-07-15'::date,'Guest room income',87500,'1001','4019',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-004','RV','2025-07-20'::date,'Training center income',29000,'1001','4020',prep,apprv,br1);

  -- ===== SONALI BANK RECEIPTS (debit Sonali Bank, credit Income/Asset) =====
  PERFORM make_general_fund_voucher('GF-RV-005','RV','2025-09-10'::date,'FDR encashment to Sonali Bank',1500000,'10021','1003',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-006','RV','2025-09-15'::date,'FDR interest received',125034,'10021','4005',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-007','RV','2025-09-20'::date,'Office overhead received',659292,'10021','4022',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-008','RV','2025-09-25'::date,'Office rent income received',863244,'10021','4014',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-009','RV','2025-10-05'::date,'Sale of furniture and equipments',263030,'10021','4004',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-010','RV','2025-10-10'::date,'Local donation received',170000,'10021','4011',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-011','RV','2025-10-15'::date,'Husking mill income',108000,'10021','4009',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-012','RV','2025-10-20'::date,'Other income received',62499,'10021','4015',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-013','RV','2025-10-25'::date,'Bank interest received',417,'10021','4003',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-RV-014','RV','2025-11-05'::date,'Loan collection from different fund',5000,'10021','1012',prep,apprv,br1);

  -- ===== CASH PAYMENTS (debit Expense, credit Cash) =====
  PERFORM make_general_fund_voucher('GF-PV-001','PV','2025-07-25'::date,'Entertainment expense',7847,'5018','1001',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-002','PV','2025-08-05'::date,'Fuel and lubricants expense',7914,'5021','1001',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-003','PV','2025-08-10'::date,'Husking mill repair and maintenance',11349,'5050','1001',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-004','PV','2025-08-15'::date,'Postage and communication expense',8831,'5036','1001',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-005','PV','2025-08-20'::date,'Stationery and printing expense',6041,'5047','1001',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-006','PV','2025-08-25'::date,'Membership and networking fees',1900,'5032','1001',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-007','PV','2025-09-05'::date,'Interest on staff security money',2958,'5026','1001',prep,apprv,br1);

  -- ===== SONALI BANK PAYMENTS (debit Expense/Asset, credit Sonali Bank) =====
  PERFORM make_general_fund_voucher('GF-PV-008','PV','2025-11-10'::date,'Salary and benefits payment',279448,'5040','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-009','PV','2025-11-15'::date,'Repair and maintenance expense',241046,'5039','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-010','PV','2025-11-20'::date,'Office equipment purchase',251261,'1102','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-011','PV','2025-11-25'::date,'FDR purchase from Sonali Bank',2340225,'1003','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-012','PV','2025-12-05'::date,'Electricity, gas and water bill',48827,'5017','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-013','PV','2025-12-10'::date,'Land and other tax payment',48037,'5028','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-014','PV','2025-12-15'::date,'Program cost expense',59000,'5037','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-015','PV','2025-12-20'::date,'Audit fees payment',6000,'5004','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-016','PV','2026-01-05'::date,'Bank charge and commission',961,'5006','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-017','PV','2026-01-10'::date,'Security money return payment',10000,'2021','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-018','PV','2026-01-15'::date,'Loan to different fund',5000,'1012','10021',prep,apprv,br1);
  PERFORM make_general_fund_voucher('GF-PV-019','PV','2026-01-20'::date,'Other expenses payment',13997,'5035','10021',prep,apprv,br1);

  -- ===== KRISHI BANK PAYMENTS (debit Expense, credit Krishi Bank) =====
  PERFORM make_general_fund_voucher('GF-PV-020','PV','2026-01-25'::date,'Traveling and daily allowance',49565,'5049','10022',prep,apprv,br1);

END $$;

-- 6. Drop helper function (keep schema clean)
DROP FUNCTION IF EXISTS make_general_fund_voucher(text, text, date, text, numeric, text, text, uuid, uuid, uuid);
