/*
# Add verified_by column and update roles for voucher workflow

## Purpose
The voucher approval workflow now has an additional "verified" stage between
review and approve. Head of Finance verifies vouchers after the Finance
Manager reviews them, and before the Deputy Executive Director approves them.

## Changes
1. Adds `verified_by` column to vouchers (uuid, nullable, references profiles).
2. No changes to existing data — all existing vouchers keep their current
   status and reviewer/approver values.

## Workflow (implemented in application code)
- Accounts Manager: prepares & submits (status: draft -> submitted)
- Finance Manager: reviews/checks (status: submitted -> reviewed)
- Head of Finance: verifies (status: reviewed -> verified)
- Deputy Executive Director: approves (status: verified -> approved)
- Super Admin: can delete any voucher; posting is automatic on approval
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'verified_by'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
