/*
# Add branch_id to approval_workflows

1. Modified Tables
- `approval_workflows`: added `branch_id` (uuid, nullable) column so a workflow
  can be scoped to a specific branch within a project.
- Added foreign key from `approval_workflows.branch_id` to `branches(id)` with
  ON DELETE SET NULL.

2. Security
- No RLS policy changes. Existing policies already allow super_admin to
  INSERT/UPDATE/DELETE, and all authenticated users to SELECT.
*/

ALTER TABLE approval_workflows
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
