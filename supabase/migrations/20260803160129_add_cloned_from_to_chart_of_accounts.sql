/*
# Add cloned_from_id column to chart_of_accounts

## Purpose
When a user edits a global (shared) chart-of-accounts entry from within a
specific project, the system needs to create a project-specific copy instead
of modifying the shared global record. This prevents changes in one project
from affecting other projects.

## Changes
1. New column: `chart_of_accounts.cloned_from_id` (uuid, nullable)
   - References `chart_of_accounts.id`
   - When non-null, this row is a project-specific clone of the referenced
     global account. The original global account remains unchanged.
2. Index on `cloned_from_id` for efficient lookups.

## Security
- No RLS policy changes. Existing policies already govern access via
  `is_write_allowed()`. The new column is nullable and carries no sensitive
  data.
*/

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS cloned_from_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_cloned_from_id
  ON chart_of_accounts(cloned_from_id);
