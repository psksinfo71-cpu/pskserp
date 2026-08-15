/*
# Project-Specific Opening Balances

## Problem
The `chart_of_accounts.opening_balance` column is a single shared value per account.
When a user zeroes out Cash/Bank/FDR/Asset opening balances for one project (e.g. Employment Creation Project),
it zeroes them out for ALL projects (including General Fund), because the same row is shared.

## Solution
1. Create a new table `project_opening_balances` that stores opening balances per (project_id, account_id).
2. The `chart_of_accounts` structure (codes, names, hierarchy) stays SHARED across all projects.
3. Only the opening balance values become project-specific.
4. When a project-specific opening balance exists, it takes precedence over the default `chart_of_accounts.opening_balance`.
5. If no project-specific row exists, the default `chart_of_accounts.opening_balance` is used as fallback.

## New Table
- `project_opening_balances`
  - `id` (uuid, primary key)
  - `project_id` (uuid, FK to projects, NOT NULL)
  - `account_id` (uuid, FK to chart_of_accounts, NOT NULL)
  - `opening_balance` (numeric, NOT NULL, default 0)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - UNIQUE constraint on (project_id, account_id)

## Security
- RLS enabled.
- Read: all authenticated users can read (they already can read chart_of_accounts).
- Write: uses the same `is_write_allowed` function as chart_of_accounts.
*/

CREATE TABLE IF NOT EXISTS public.project_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  opening_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_opening_balances_unique UNIQUE (project_id, account_id)
);

ALTER TABLE public.project_opening_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_opening_balances_read" ON public.project_opening_balances;
CREATE POLICY "project_opening_balances_read"
  ON public.project_opening_balances FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "project_opening_balances_insert" ON public.project_opening_balances;
CREATE POLICY "project_opening_balances_insert"
  ON public.project_opening_balances FOR INSERT
  TO authenticated WITH CHECK (is_write_allowed('insert'::text, 'chart_of_accounts'::text));

DROP POLICY IF EXISTS "project_opening_balances_update" ON public.project_opening_balances;
CREATE POLICY "project_opening_balances_update"
  ON public.project_opening_balances FOR UPDATE
  TO authenticated USING (is_write_allowed('update'::text, 'chart_of_accounts'::text))
  WITH CHECK (is_write_allowed('update'::text, 'chart_of_accounts'::text));

DROP POLICY IF EXISTS "project_opening_balances_delete" ON public.project_opening_balances;
CREATE POLICY "project_opening_balances_delete"
  ON public.project_opening_balances FOR DELETE
  TO authenticated USING (is_write_allowed('delete'::text, 'chart_of_accounts'::text));

CREATE INDEX IF NOT EXISTS idx_project_opening_balances_project ON public.project_opening_balances(project_id);
CREATE INDEX IF NOT EXISTS idx_project_opening_balances_account ON public.project_opening_balances(account_id);
