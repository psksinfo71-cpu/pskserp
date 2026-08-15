-- Add EpiC project fund account and set opening balance to balance the balance sheet
-- EpiC assets = 4,907,717, no liabilities, no equity
-- The balance sheet will compute the fund as a balancing figure automatically,
-- but we should add a proper fund account for correct accounting.

-- Add a "Project Fund" equity account for EpiC
INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, is_group, is_active, opening_balance, project_id)
SELECT gen_random_uuid(), '3001', 'EpiC Project Fund', 'equity',
       NULL,  -- no parent group for project-specific accounts
       false, true, 0,
       'ba404d4a-eb6b-4763-8417-eac640860fee'
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts
  WHERE code = '3001' AND project_id = 'ba404d4a-eb6b-4763-8417-eac640860fee'
);

-- Set the opening balance for EpiC Project Fund
-- Assets (4,907,717) - Liabilities (0) = Fund should be 4,907,717
-- But EpiC also has income (3,502,747) and expense (4,081,885) opening balances
-- The surplus = income - expense = 3,502,747 - 4,081,885 = -579,138
-- So Fund = Assets - Liabilities - Surplus = 4,907,717 - 0 - (-579,138) = 5,486,855
-- Actually, for a project, the fund should just be: Assets - Liabilities = 4,907,717
-- The income/expense opening balances represent prior period activity
-- The balance sheet code computes: Fund = Assets - Liabilities - ExplicitEquity + Surplus
-- If we set Fund = 4,907,717 and surplus = -579,138, then:
-- Assets = Fund + Liabilities + Surplus? No, the BS code shows:
--   Assets side = total assets
--   Liabilities side = liabilities + equity + surplus (if computed)
-- So if we set equity = 4,907,717, then:
--   LHS = 4,907,717 (assets)
--   RHS = 0 (liabilities) + 4,907,717 (equity) + (-579,138) (surplus) = 4,328,579
--   That doesn't balance.
--
-- The correct approach: Fund = Assets - Liabilities - Surplus
--   = 4,907,717 - 0 - (-579,138) = 5,486,855
-- Then: RHS = 0 + 5,486,855 + (-579,138) = 4,907,717 = LHS ✓

INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), 'ba404d4a-eb6b-4763-8417-eac640860fee',
       (SELECT id FROM chart_of_accounts WHERE code = '3001' AND project_id = 'ba404d4a-eb6b-4763-8417-eac640860fee'),
       5486855
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = 'ba404d4a-eb6b-4763-8417-eac640860fee'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '3001' AND project_id = 'ba404d4a-eb6b-4763-8417-eac640860fee')
);
