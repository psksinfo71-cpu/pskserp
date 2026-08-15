-- Add missing accounts and set opening balances to match the June 2026 Balance Sheet
-- for the General Fund project.

-- Missing accounts from the Balance Sheet image:
-- Assets:
--   Security Money to PBS (11,314) - under Current Assets (code 10)
--   Advance Income Tax (16,693) - under Current Assets (code 10)
--   Interest on FDR (-150) - under Current Assets (code 10)
--   Loan to Different Fund (0) - under Current Assets (code 10)
-- Liabilities:
--   Security Deposit (Husking Mill) (10,000) - under Current Liabilities (code 20)
--   Staff Security Money (0) - under Current Liabilities (code 20)
--   Loan from Different Fund (0) - under Current Liabilities (code 20)
--   Provision for Audit Fees (6,000) - under Accrued Expenses (code 202)

-- Insert missing asset accounts (under Current Assets group, code 10)
INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '1041', 'Security Money to PBS', 'asset',
       (SELECT id FROM chart_of_accounts WHERE code = '10' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1041' AND project_id IS NULL);

INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '1042', 'Loan to Different Fund', 'asset',
       (SELECT id FROM chart_of_accounts WHERE code = '10' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1042' AND project_id IS NULL);

INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '1043', 'Advance Income Tax', 'asset',
       (SELECT id FROM chart_of_accounts WHERE code = '10' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1043' AND project_id IS NULL);

INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '1044', 'Interest on FDR', 'asset',
       (SELECT id FROM chart_of_accounts WHERE code = '10' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '1044' AND project_id IS NULL);

-- Insert missing liability accounts
-- Security Deposit (Husking Mill) - under Current Liabilities (code 20)
INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '2031', 'Security Deposit (Husking Mill)', 'liability',
       (SELECT id FROM chart_of_accounts WHERE code = '20' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '2031' AND project_id IS NULL);

-- Staff Security Money - under Current Liabilities (code 20)
INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '2032', 'Staff Security Money', 'liability',
       (SELECT id FROM chart_of_accounts WHERE code = '20' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '2032' AND project_id IS NULL);

-- Loan from Different Fund - under Current Liabilities (code 20)
INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '2033', 'Loan from Different Fund', 'liability',
       (SELECT id FROM chart_of_accounts WHERE code = '20' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '2033' AND project_id IS NULL);

-- Provision for Audit Fees - under Accrued Expenses (code 202)
INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '2022', 'Provision for Audit Fees', 'liability',
       (SELECT id FROM chart_of_accounts WHERE code = '202' AND project_id IS NULL AND is_group = true),
       false, true, 0, NULL
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '2022' AND project_id IS NULL);

-- Now set opening balances for General Fund project (83e3a2cf-f80a-4e03-a96e-80ad1ed70e65)
-- to match the June 2026 Balance Sheet image.

-- The General Fund project already has these opening balances:
--   1001 Cash in Hand: 34,704
--   10022 Bangladesh Krishi Bank (cloned as Dutch Bangla Bank PLC globally): 500,296
--   1003 FDR: 2,340,225
--   3001 General Fund (equity): 796,683

-- We need to add opening balances for the new accounts:
--   1041 Security Money to PBS: 11,314
--   1042 Loan to Different Fund: 0 (no entry needed)
--   1043 Advance Income Tax: 16,693
--   1044 Interest on FDR: -150 (negative - credit balance on asset)
--   2031 Security Deposit (Husking Mill): 10,000
--   2032 Staff Security Money: 0 (no entry needed)
--   2033 Loan from Different Fund: 0 (no entry needed)
--   2022 Provision for Audit Fees: 6,000

-- Also need to fix: Cash and Bank Balance should total 7,96,683
-- Currently: Cash in Hand 34,704 + Sonali Bank 261,683 + Dutch Bangla Bank 500,296 = 796,683
-- But the project OB only has Cash in Hand 34,704 + Bangladesh Krishi Bank 500,296 = 535,000
-- The Sonali Bank (10021) opening balance is 261,683 globally but not in project OB
-- We need to add Sonali Bank opening balance for General Fund project

-- Add Sonali Bank opening balance for General Fund project
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '10021' AND project_id IS NULL),
       261683
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '10021' AND project_id IS NULL)
);

-- Add Security Money to PBS opening balance
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1041' AND project_id IS NULL),
       11314
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1041' AND project_id IS NULL)
);

-- Add Advance Income Tax opening balance
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1043' AND project_id IS NULL),
       16693
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1043' AND project_id IS NULL)
);

-- Add Interest on FDR opening balance (negative -150, credit balance on asset)
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1044' AND project_id IS NULL),
       -150
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1044' AND project_id IS NULL)
);

-- Add Security Deposit (Husking Mill) opening balance
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '2031' AND project_id IS NULL),
       10000
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '2031' AND project_id IS NULL)
);

-- Add Provision for Audit Fees opening balance
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '2022' AND project_id IS NULL),
       6000
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '2022' AND project_id IS NULL)
);

-- Update General Fund (equity) opening balance to 74,50,754
-- Currently it's 796,683 which is wrong - it should be 74,50,754
UPDATE project_opening_balances
SET opening_balance = 7450754
WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
  AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '3001' AND project_id IS NULL);
