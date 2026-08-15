-- Voucher Ledger Head filtering support.
-- chart_of_accounts.account_type is the category used by the voucher UI:
-- asset, liability, equity, income, expense.

ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_account_type_check;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_account_type_check
  CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense'));

-- The existing voucher_details.account_id foreign key is the relation between
-- a voucher line and its Ledger Head. This partial index makes lookup queries
-- fast while excluding group accounts from selectable Ledger Heads.
CREATE INDEX IF NOT EXISTS idx_coa_active_leaf_type_code
  ON public.chart_of_accounts(account_type, code)
  WHERE is_active = true AND is_group = false;

-- Keep the relation explicit for installations where the core schema was
-- created without the foreign key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voucher_details_account_id_fkey'
      AND conrelid = 'public.voucher_details'::regclass
  ) THEN
    ALTER TABLE public.voucher_details
      ADD CONSTRAINT voucher_details_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
