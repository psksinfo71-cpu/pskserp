/*
# Add designation field to profiles

1. Changes
- Adds `designation` (text, nullable) column to `profiles`.
- Backfills existing rows with a human-readable designation derived from their `role`.
2. Notes
- The voucher print page previously hard-coded each signer's title
  ("Deputy Executive Director", "Finance Manager", etc.) regardless of who
  actually held that role. This column lets each user carry their own
  designation so printed vouchers show the correct title under each name.
- No RLS changes — existing profile policies already cover the new column.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS designation text;

UPDATE profiles
SET designation = CASE role
  WHEN 'super_admin' THEN 'Super Admin'
  WHEN 'deputy_executive_director' THEN 'Deputy Executive Director'
  WHEN 'head_of_finance' THEN 'Head of Finance'
  WHEN 'finance_manager' THEN 'Finance Manager'
  WHEN 'accounts_manager' THEN 'Accounts Manager'
  WHEN 'accountant' THEN 'Accountant'
  WHEN 'branch_manager' THEN 'Branch Manager'
  WHEN 'auditor' THEN 'Auditor'
  ELSE 'Staff'
END
WHERE designation IS NULL;
