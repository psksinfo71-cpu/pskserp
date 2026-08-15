/*
# Add salary sub-accounts for hierarchical Income & Expenditure report

1. New Accounts (under Expenditure group, code 5)
- Basic Salary, House Rent, Medical, Festival Bonus, PF, Gratuity
- These are leaf expense accounts needed for the Salary & Benefit sub-group
2. Notes
- All accounts are active, non-group, account_type = 'expense'
- Parent is the Expenditure group (id of code 5)
*/

INSERT INTO chart_of_accounts (code, name, account_type, parent_id, is_group, is_active, opening_balance)
SELECT v.code, v.name, 'expense', 'b0963f4e-69da-4567-9d10-620f7dd265cc', false, true, 0
FROM (VALUES
  ('5051', 'Basic Salary'),
  ('5052', 'House Rent'),
  ('5053', 'Medical'),
  ('5054', 'Festival Bonus'),
  ('5055', 'PF'),
  ('5056', 'Gratuity')
) AS v(code, name)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.code = v.code
);
