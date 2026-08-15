-- Add Office Over head under Income (code 4)
INSERT INTO public.chart_of_accounts
  (code, name, account_type, parent_id, is_group, is_active, opening_balance, description)
VALUES (
  '4022',
  'Office Over Head',
  'income',
  (SELECT id FROM public.chart_of_accounts WHERE code = '4'),
  false, true, 0, ''
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  account_type = EXCLUDED.account_type;

-- Add Husking Mill (Repair & Maintenance) under Expenditure (code 5)
INSERT INTO public.chart_of_accounts
  (code, name, account_type, parent_id, is_group, is_active, opening_balance, description)
VALUES (
  '5050',
  'Husking Mill (Repair & Maintenance)',
  'expense',
  (SELECT id FROM public.chart_of_accounts WHERE code = '5'),
  false, true, 0, ''
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  account_type = EXCLUDED.account_type;
