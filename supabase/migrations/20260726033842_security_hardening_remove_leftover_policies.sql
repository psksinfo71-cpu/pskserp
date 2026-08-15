/*
# Security Hardening (part 2): remove leftover bypass policies

## Problem
The first hardening migration created correctly-gated policies named
`<table>_insert/_update/_delete`, but several tables had older policies
with different names (e.g. `bank_insert`, `branches_write`, `coa_insert`,
`cc_insert`, `depts_insert`, `donors_insert`, `vt_insert`, `vd_insert`,
`sup_insert`, `cust_insert`, `fy_insert`, `assets_insert`, `projects_insert`,
`budgets_insert`). The old policies used `USING (true)` / `WITH CHECK (true)`
and were never dropped, so they coexist with the new gated policies. Because
RLS ORs policies for the same command, the old `true` policies still bypass
row-level security.

## Fix
For every financial/master-data table, drop ALL existing INSERT, UPDATE and
DELETE policies (whatever their names), then recreate exactly one of each
command using the `is_write_allowed(action, table)` helper from part 1.
SELECT policies are left untouched (read access stays shared across staff).

## Tables affected
branches, departments, donors, projects, cost_centers, chart_of_accounts,
financial_years, voucher_types, vouchers, voucher_details, budgets,
bank_accounts, assets, suppliers, customers.

## Safety
- No data changes; only policy definitions.
- Re-runnable: drops use IF EXISTS; creates run after drops so no duplicate.
*/

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','departments','donors','projects','cost_centers',
    'chart_of_accounts','financial_years','voucher_types',
    'vouchers','voucher_details','budgets',
    'bank_accounts','assets','suppliers','customers'
  ] LOOP
    -- Drop every existing INSERT/UPDATE/DELETE policy on this table
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd IN ('INSERT','UPDATE','DELETE')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', pol.policyname, t);
    END LOOP;

    -- Recreate one gated policy per command
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (public.is_write_allowed(''insert'', %L));',
      t || '_insert', t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (public.is_write_allowed(''update'', %L)) WITH CHECK (public.is_write_allowed(''update'', %L));',
      t || '_update', t, t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (public.is_write_allowed(''delete'', %L));',
      t || '_delete', t, t
    );
  END LOOP;
END $$;
