/*
# Budget Management Module — Schema Changes

1. New Table: budget_versions
   - Stores budget version metadata: Original, Revised-1, Revised-2, Final
   - Scoped by fiscal_year_id + project_id
   - Tracks who created/updated and when

2. Modified Table: budgets
   - ADD COLUMN budget_version_id (uuid, nullable, FK to budget_versions)
   - ADD COLUMN version_label (text, nullable) — e.g. 'Original', 'Revised-1'
   - ADD COLUMN prev_year_actual (numeric, default 0) — optional reference only
   - ADD COLUMN area (text, nullable) — geographic area grouping
   - ADD COLUMN ledger_group (text, nullable) — COA group name for variance reporting

3. Security
   - Enable RLS on budget_versions
   - SELECT: all authenticated users can read (view reports)
   - INSERT/UPDATE/DELETE: only via is_write_allowed (admin/finance_manager)
   - Budgets table already has RLS; existing policies remain

4. Notes
   - Existing budgets rows get NULL budget_version_id (backward compatible)
   - No data loss — all new columns are nullable or have defaults
*/

CREATE TABLE IF NOT EXISTS budget_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid REFERENCES financial_years(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  version_label text NOT NULL DEFAULT 'Original',
  version_type text NOT NULL DEFAULT 'original',
  description text DEFAULT '',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year_id, project_id, version_label)
);

ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bv_select" ON budget_versions;
CREATE POLICY "bv_select" ON budget_versions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "bv_insert" ON budget_versions;
CREATE POLICY "bv_insert" ON budget_versions FOR INSERT
  TO authenticated WITH CHECK (is_write_allowed('insert', 'budget_versions'));

DROP POLICY IF EXISTS "bv_update" ON budget_versions;
CREATE POLICY "bv_update" ON budget_versions FOR UPDATE
  TO authenticated USING (is_write_allowed('update', 'budget_versions'))
  WITH CHECK (is_write_allowed('update', 'budget_versions'));

DROP POLICY IF EXISTS "bv_delete" ON budget_versions;
CREATE POLICY "bv_delete" ON budget_versions FOR DELETE
  TO authenticated USING (is_write_allowed('delete', 'budget_versions'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'budget_version_id') THEN
    ALTER TABLE budgets ADD COLUMN budget_version_id uuid REFERENCES budget_versions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'version_label') THEN
    ALTER TABLE budgets ADD COLUMN version_label text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'prev_year_actual') THEN
    ALTER TABLE budgets ADD COLUMN prev_year_actual numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'area') THEN
    ALTER TABLE budgets ADD COLUMN area text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'ledger_group') THEN
    ALTER TABLE budgets ADD COLUMN ledger_group text;
  END IF;
END $$;
