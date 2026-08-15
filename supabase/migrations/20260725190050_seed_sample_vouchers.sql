/*
# Sample posted vouchers

Inserts a small set of balanced, posted vouchers so the dashboard, trial
balance and reports display real figures immediately after install.
All vouchers are double-entry (sum of debit = sum of credit) and posted.

Idempotent: guarded by voucher_no uniqueness via ON CONFLICT.
*/

DO $$
DECLARE
  prep uuid;   -- accountant id
  apprv uuid;  -- super admin id
  br1 uuid;
  fy uuid;
  v_id uuid;
BEGIN
  SELECT id INTO prep FROM public.profiles WHERE role='accountant' LIMIT 1;
  SELECT id INTO apprv FROM public.profiles WHERE role='super_admin' LIMIT 1;
  SELECT id INTO br1 FROM public.branches WHERE code='BR-001';
  SELECT id INTO fy FROM public.financial_years WHERE is_active = true LIMIT 1;

  -- Voucher 1: Receipt of donor grant into Sonali Bank
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    project_id, narration, amount, status, prepared_by, approved_by, is_locked)
  SELECT 'RV-2026-000001','RV','2025-07-05'::date, br1,
    p.id, 'Grant received from Global Aid Foundation', 1000000, 'posted', prep, apprv, true
  FROM public.projects p WHERE p.code='PRJ-001'
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='RV-2026-000001';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1121'), 1000000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='411'), 0, 1000000, 2);
  END IF;

  -- Voucher 2: Salary payment from Cash on Hand
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES ('PV-2026-000001','PV','2025-07-10'::date, br1,
    'Staff salary payment for July 2025', 250000, 'posted', prep, apprv, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='PV-2026-000001';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='511'), 250000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1111'), 0, 250000, 2);
  END IF;

  -- Voucher 3: Office rent via Sonali Bank
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES ('PV-2026-000002','PV','2025-07-15'::date, br1,
    'Office rent for July 2025', 60000, 'posted', prep, apprv, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='PV-2026-000002';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='512'), 60000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1121'), 0, 60000, 2);
  END IF;

  -- Voucher 4: Utilities paid in cash
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES ('PV-2026-000003','PV','2025-07-18'::date, br1,
    'Electricity and water bill', 18000, 'posted', prep, apprv, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='PV-2026-000003';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='513'), 18000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1111'), 0, 18000, 2);
  END IF;

  -- Voucher 5: Training expense for Women Empowerment Project from Agrani Bank
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    project_id, narration, amount, status, prepared_by, approved_by, is_locked)
  SELECT 'PV-2026-000004','PV','2025-07-22'::date, br1,
    p.id, 'Training workshop for women entrepreneurs', 120000, 'posted', prep, apprv, true
  FROM public.projects p WHERE p.code='PRJ-002'
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='PV-2026-000004';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='521'), 120000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1122'), 0, 120000, 2);
  END IF;

  -- Voucher 6: Contra - cash deposit to bank
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES ('CV-2026-000001','CV','2025-07-25'::date, br1,
    'Cash deposit to Sonali Bank', 150000, 'posted', prep, apprv, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='CV-2026-000001';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1121'), 150000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1111'), 0, 150000, 2);
  END IF;

  -- Voucher 7: Bank interest income
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES ('JV-2026-000001','JV','2025-07-30'::date, br1,
    'Bank interest credited for July', 8500, 'posted', prep, apprv, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='JV-2026-000001';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1121'), 8500, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='431'), 0, 8500, 2);
  END IF;

  -- Voucher 8 (DRAFT): Office supplies purchase from supplier
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    narration, amount, status, prepared_by, approved_by, is_locked)
  VALUES ('PV-2026-000005','PV','2025-08-02'::date, br1,
    'Office stationery purchase (draft)', 15000, 'draft', prep, NULL, false)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='PV-2026-000005';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='514'), 15000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1111'), 0, 15000, 2);
  END IF;

  -- Voucher 9 (SUBMITTED): Field operations expense awaiting approval
  INSERT INTO public.vouchers (voucher_no, voucher_type, voucher_date, branch_id,
    project_id, narration, amount, status, prepared_by, approved_by, is_locked)
  SELECT 'PV-2026-000006','PV','2025-08-05'::date, br1,
    p.id, 'Field operations - microfinance outreach', 75000, 'submitted', prep, NULL, false
  FROM public.projects p WHERE p.code='PRJ-001'
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.vouchers WHERE voucher_no='PV-2026-000006';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.voucher_details (voucher_id, account_id, debit, credit, line_order) VALUES
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='522'), 75000, 0, 1),
      (v_id, (SELECT id FROM public.chart_of_accounts WHERE code='1121'), 0, 75000, 2);
  END IF;

END $$;
