/*
# Add posted_at column to vouchers

## Purpose
When the Deputy Executive Director approves a voucher, it is automatically
posted to the ledger (status changes from 'verified' to 'posted'). The
posted_at timestamp records when posting happened.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'posted_at'
  ) THEN
    ALTER TABLE vouchers ADD COLUMN posted_at timestamptz;
  END IF;
END $$;

-- Backfill posted_at for existing posted vouchers that don't have a timestamp
UPDATE vouchers SET posted_at = updated_at WHERE status = 'posted' AND posted_at IS NULL;
