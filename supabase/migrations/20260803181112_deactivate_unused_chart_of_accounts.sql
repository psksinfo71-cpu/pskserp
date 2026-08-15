-- Deactivate unnecessary chart of accounts heads that have no opening balances,
-- no voucher movements, and are not referenced by any project opening balances.
-- This cleans up the chart of accounts for both General Fund and EpiC projects.

-- Deactivate empty active leaf accounts (no OB, no vouchers, not referenced by project OB)
-- Keep accounts that are parents of other active accounts
UPDATE chart_of_accounts c
SET is_active = false
WHERE c.project_id IS NULL
  AND c.is_active = true
  AND c.is_group = false
  AND NOT EXISTS (SELECT 1 FROM project_opening_balances pob WHERE pob.account_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM voucher_details vd WHERE vd.account_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts child WHERE child.parent_id = c.id AND child.is_active = true)
  AND NOT EXISTS (SELECT 1 FROM asset_categories ac WHERE ac.gl_account_id = c.id OR ac.accum_depn_gl_account_id = c.id)
  -- Keep the accounts we created for the Balance Sheet (Security Money, Advance Tax, etc.)
  -- even though they have OB=0 globally, they have project OB for General Fund
  AND c.code NOT IN ('1042', '2032', '2033');  -- Loan to Different Fund, Staff Security Money, Loan from Different Fund (keep for BS structure)

-- Also deactivate empty group accounts that have no active children
UPDATE chart_of_accounts c
SET is_active = false
WHERE c.project_id IS NULL
  AND c.is_active = true
  AND c.is_group = true
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts child
    WHERE child.parent_id = c.id AND child.is_active = true
  );
