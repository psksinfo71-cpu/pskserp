-- Step 1: Retire old income/expense sub-accounts without deleting them.
-- Voucher details keep a foreign-key reference to these accounts, so deleting
-- them would make a clean database reset fail. Existing accounts are retained
-- for historical vouchers and hidden from new entry selections.
UPDATE public.chart_of_accounts
SET is_active = false
WHERE account_type IN ('income', 'expense')
  AND code NOT IN ('4', '5');

-- Step 2: Update top-level groups to clean names
UPDATE public.chart_of_accounts SET name = 'Income'      WHERE code = '4';
UPDATE public.chart_of_accounts SET name = 'Expenditure' WHERE code = '5';

-- Step 3: Insert all Income heads directly under code '4'
INSERT INTO public.chart_of_accounts
  (code, name, account_type, parent_id, is_group, is_active, opening_balance, description)
SELECT
  code, name, 'income',
  (SELECT id FROM public.chart_of_accounts WHERE code = '4'),
  false, true, 0, ''
FROM (VALUES
  ('4001', 'Admission Fees'),
  ('4002', 'Agriculture/Income Generating'),
  ('4003', 'Bank Interest'),
  ('4004', 'Capital Gain From Sale Fixed Asset'),
  ('4005', 'FDR Interest'),
  ('4006', 'Fund Receive from Micro Finance'),
  ('4007', 'Fund Received from Country Donor'),
  ('4008', 'Fund Receive from Foreign Donation'),
  ('4009', 'Husking Mill'),
  ('4010', 'Loan Form'),
  ('4011', 'Local Donation'),
  ('4012', 'Members Subscription Fees'),
  ('4013', 'Overhead'),
  ('4014', 'Office Rent'),
  ('4015', 'Others'),
  ('4016', 'Pass Book'),
  ('4017', 'Service Charge Collection'),
  ('4018', 'Shop Rent'),
  ('4019', 'Guest Room'),
  ('4020', 'Training Center'),
  ('4021', 'Writeoff Collection')
) AS t(code, name)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  account_type = EXCLUDED.account_type,
  is_group = EXCLUDED.is_group;

-- Step 4: Insert all Expenditure heads directly under code '5'
INSERT INTO public.chart_of_accounts
  (code, name, account_type, parent_id, is_group, is_active, opening_balance, description)
SELECT
  code, name, 'expense',
  (SELECT id FROM public.chart_of_accounts WHERE code = '5'),
  false, true, 0, ''
FROM (VALUES
  ('5001', 'Advertisement and Promotion'),
  ('5002', 'Agriculture/Income Generation'),
  ('5003', 'Annual Fees Paid to MRA'),
  ('5004', 'Audit Fees'),
  ('5005', 'Awareness and Outreach Activities'),
  ('5006', 'Bank Charge & Commission'),
  ('5007', 'Bank Charge on FDR'),
  ('5008', 'Beneficiary Rehabilitation'),
  ('5009', 'Counseling and Legal Assistance'),
  ('5010', 'Court Case'),
  ('5011', 'Cleaning Charge'),
  ('5012', 'Creative Competitions'),
  ('5013', 'Day Observation'),
  ('5014', 'Depreciation'),
  ('5015', 'Education Activity'),
  ('5016', 'Education and Training/Workshop'),
  ('5017', 'Electricity, Gas & Wasa Bill'),
  ('5018', 'Entertainment'),
  ('5019', 'Environmental Conservation and Tree Plantation Activities'),
  ('5020', 'Fringe Benefit'),
  ('5021', 'Fuel and Lubricant'),
  ('5022', 'Health Services'),
  ('5023', 'Health Material Purchase'),
  ('5024', 'Honesty Store'),
  ('5025', 'Husking Mill'),
  ('5026', 'Interest on Staff Security'),
  ('5027', 'Interest Paid to Members Savings'),
  ('5028', 'Land and Other Tax'),
  ('5029', 'Loan Loss Provision (LLP)'),
  ('5030', 'Loss on Disposal of Fixed Assets'),
  ('5031', 'Lunch Allowance'),
  ('5032', 'Membership & Network Fees'),
  ('5033', 'Office Rent'),
  ('5034', 'Online Services'),
  ('5035', 'Others'),
  ('5036', 'Postage and Communication'),
  ('5037', 'Program Cost'),
  ('5038', 'Performance Incentive'),
  ('5039', 'Repair and Maintenance'),
  ('5040', 'Salary and Benefits'),
  ('5041', 'Social Activity'),
  ('5042', 'Senior Citizen Center'),
  ('5043', 'Senior Citizen Development Program'),
  ('5044', 'Service Charge Paid to BNF'),
  ('5045', 'Service Charge Paid to PKSF'),
  ('5046', 'Sports & Others Cultural Program'),
  ('5047', 'Stationary and Printing'),
  ('5048', 'Training & Workshop/Meeting'),
  ('5049', 'Travel & Daily Allowance')
) AS t(code, name)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  parent_id = EXCLUDED.parent_id,
  account_type = EXCLUDED.account_type,
  is_group = EXCLUDED.is_group;
