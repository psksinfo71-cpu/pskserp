/*
# Multi-Office Accounting, Consolidation & Configurable Approval Workflows

## Purpose
Transforms the ERP from a flat single-office system into a multi-office hierarchy
with independent accounting per office, configurable approval chains, and
automatic monthly consolidation into project-level financial statements.

## New Tables
1. approval_workflows — defines an approval chain for an office type
   (head_office or project_office), optionally scoped to a specific project.
2. approval_workflow_steps — ordered steps within a workflow; each step
   specifies which role acts and what status the voucher transitions to.
3. voucher_approvals — immutable audit trail of each approval action on a
   voucher (who, when, which step, what action).

## Modified Tables
1. branches — added parent_id (self-FK for unlimited hierarchy),
   office_type (head_office/project_office/field_office/sub_office),
   project_id (links office to a project), level (depth in hierarchy).
2. chart_of_accounts — added project_id (NULL = shared/global accounts,
   non-NULL = project-specific copy). Existing 153 accounts stay global.
3. profiles — added project_id so users are assigned to a project.
4. vouchers — added approval_workflow_id, current_step, checked_by.

## Security
- RLS enabled on all new tables with TO authenticated policies (the ERP
  requires sign-in; all users are internal staff).
- approval_workflows and steps: any authenticated user can read (needed to
  determine workflow for a voucher); only super_admin writes (enforced in app
  layer, policies allow write for simplicity as with other master data).
- voucher_approvals: read for all, insert for all (app enforces who can
  approve), no update/delete (immutable audit trail).

## Important Notes
1. All new columns are nullable or have safe defaults so existing data is
   not affected.
2. Existing branches are backfilled with office_type and parent_id based on
   their current names (Head Office, Project Office).
3. Two default approval workflows are seeded: one for head_office and one
   for project_office, matching the required approval chains.
4. A helper function get_office_descendants() returns all child office IDs
   for a given office, used for consolidation queries.
*/

-- =========================================================
-- 1. BRANCHES — add office hierarchy support
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'parent_id') THEN
    ALTER TABLE public.branches ADD COLUMN parent_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'office_type') THEN
    ALTER TABLE public.branches ADD COLUMN office_type text NOT NULL DEFAULT 'branch';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'project_id') THEN
    ALTER TABLE public.branches ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'level') THEN
    ALTER TABLE public.branches ADD COLUMN level int NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_parent ON public.branches(parent_id);
CREATE INDEX IF NOT EXISTS idx_branches_project ON public.branches(project_id);
CREATE INDEX IF NOT EXISTS idx_branches_office_type ON public.branches(office_type);

-- Backfill existing branches with office_type and hierarchy
UPDATE public.branches SET office_type = 'head_office' WHERE name ILIKE '%head office%' AND office_type = 'branch';
UPDATE public.branches SET office_type = 'project_office' WHERE name ILIKE '%project office%' AND office_type = 'branch';
UPDATE public.branches SET level = 0 WHERE parent_id IS NULL;

-- Set Project Office parent to Head Office
UPDATE public.branches
SET parent_id = (SELECT id FROM public.branches WHERE office_type = 'head_office' LIMIT 1),
    level = 1
WHERE office_type = 'project_office' AND parent_id IS NULL;

-- Set remaining branches as children of Head Office
UPDATE public.branches
SET parent_id = (SELECT id FROM public.branches WHERE office_type = 'head_office' LIMIT 1),
    level = 1
WHERE parent_id IS NULL AND office_type != 'head_office';

-- =========================================================
-- 2. CHART OF ACCOUNTS — add project_id (NULL = global/shared)
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_of_accounts' AND column_name = 'project_id') THEN
    ALTER TABLE public.chart_of_accounts ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- The existing unique constraint is on code alone; for project-scoped COA
-- we need (code, project_id) uniqueness. Drop the old constraint and add
-- a new one that allows the same code in different projects.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chart_of_accounts_code_key' AND table_name = 'chart_of_accounts') THEN
    ALTER TABLE public.chart_of_accounts DROP CONSTRAINT chart_of_accounts_code_key;
  END IF;
END $$;

-- Allow same code across projects (NULL project_id = global, must stay unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_coa_code_project_unique
  ON public.chart_of_accounts (code, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS idx_coa_project ON public.chart_of_accounts(project_id);

-- =========================================================
-- 3. PROFILES — add project_id assignment
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'project_id') THEN
    ALTER TABLE public.profiles ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_project ON public.profiles(project_id);

-- =========================================================
-- 4. VOUCHERS — add approval workflow tracking
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'approval_workflow_id') THEN
    ALTER TABLE public.vouchers ADD COLUMN approval_workflow_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'current_step') THEN
    ALTER TABLE public.vouchers ADD COLUMN current_step int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'checked_by') THEN
    ALTER TABLE public.vouchers ADD COLUMN checked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vouchers_workflow ON public.vouchers(approval_workflow_id);

-- =========================================================
-- 5. APPROVAL WORKFLOWS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  office_type text NOT NULL DEFAULT 'project_office',
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aw_office_type ON public.approval_workflows(office_type);
CREATE INDEX IF NOT EXISTS idx_aw_project ON public.approval_workflows(project_id);

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aw_read" ON public.approval_workflows;
CREATE POLICY "aw_read" ON public.approval_workflows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "aw_insert" ON public.approval_workflows;
CREATE POLICY "aw_insert" ON public.approval_workflows FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "aw_update" ON public.approval_workflows;
CREATE POLICY "aw_update" ON public.approval_workflows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "aw_delete" ON public.approval_workflows;
CREATE POLICY "aw_delete" ON public.approval_workflows FOR DELETE TO authenticated USING (true);

-- =========================================================
-- 6. APPROVAL WORKFLOW STEPS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.approval_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  step_number int NOT NULL,
  role text NOT NULL,
  action_label text NOT NULL,
  result_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aws_workflow ON public.approval_workflow_steps(workflow_id);

ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aws_read" ON public.approval_workflow_steps;
CREATE POLICY "aws_read" ON public.approval_workflow_steps FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "aws_insert" ON public.approval_workflow_steps;
CREATE POLICY "aws_insert" ON public.approval_workflow_steps FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "aws_update" ON public.approval_workflow_steps;
CREATE POLICY "aws_update" ON public.approval_workflow_steps FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "aws_delete" ON public.approval_workflow_steps;
CREATE POLICY "aws_delete" ON public.approval_workflow_steps FOR DELETE TO authenticated USING (true);

-- =========================================================
-- 7. VOUCHER APPROVALS (immutable audit trail)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.voucher_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  step_number int NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email text DEFAULT '',
  action text NOT NULL,
  role_at_time text NOT NULL,
  comments text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_voucher ON public.voucher_approvals(voucher_id);
CREATE INDEX IF NOT EXISTS idx_va_created ON public.voucher_approvals(created_at DESC);

ALTER TABLE public.voucher_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "va_read" ON public.voucher_approvals;
CREATE POLICY "va_read" ON public.voucher_approvals FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "va_insert" ON public.voucher_approvals;
CREATE POLICY "va_insert" ON public.voucher_approvals FOR INSERT TO authenticated WITH CHECK (true);
-- No update/delete policy => immutable audit trail

-- =========================================================
-- 8. SEED DEFAULT APPROVAL WORKFLOWS
-- =========================================================

-- Head Office workflow: Finance Manager → Head of Finance → Deputy ED → Executive Director
INSERT INTO public.approval_workflows (id, name, office_type, project_id, is_active)
SELECT gen_random_uuid(), 'Head Office Default', 'head_office', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.approval_workflows WHERE name = 'Head Office Default');

INSERT INTO public.approval_workflow_steps (workflow_id, step_number, role, action_label, result_status)
SELECT aw.id, s.step, s.role, s.label, s.status
FROM public.approval_workflows aw
CROSS JOIN (VALUES
  (1, 'finance_manager', 'Review', 'reviewed'),
  (2, 'head_of_finance', 'Verify', 'verified'),
  (3, 'deputy_executive_director', 'Approve', 'approved'),
  (4, 'executive_director', 'Final Approval', 'posted')
) AS s(step, role, label, status)
WHERE aw.name = 'Head Office Default'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_workflow_steps aws
    WHERE aws.workflow_id = aw.id AND aws.step_number = s.step
  );

-- Project Office workflow: Accounts/Finance Officer → Finance Manager → Checked By → Verified By → Project Manager
INSERT INTO public.approval_workflows (id, name, office_type, project_id, is_active)
SELECT gen_random_uuid(), 'Project Office Default', 'project_office', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.approval_workflows WHERE name = 'Project Office Default');

INSERT INTO public.approval_workflow_steps (workflow_id, step_number, role, action_label, result_status)
SELECT aw.id, s.step, s.role, s.label, s.status
FROM public.approval_workflows aw
CROSS JOIN (VALUES
  (1, 'finance_manager', 'Review', 'reviewed'),
  (2, 'accounts_manager', 'Check', 'checked'),
  (3, 'head_of_finance', 'Verify', 'verified'),
  (4, 'project_manager', 'Approve', 'posted')
) AS s(step, role, label, status)
WHERE aw.name = 'Project Office Default'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_workflow_steps aws
    WHERE aws.workflow_id = aw.id AND aws.step_number = s.step
  );

-- =========================================================
-- 9. HELPER: get all descendant office IDs for consolidation
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_office_descendants(root_id uuid)
RETURNS SETOF uuid AS $$
WITH RECURSIVE descendants AS (
  SELECT id FROM public.branches WHERE id = root_id
  UNION ALL
  SELECT b.id FROM public.branches b
  INNER JOIN descendants d ON b.parent_id = d.id
)
SELECT id FROM descendants;
$$ LANGUAGE sql STABLE;

-- =========================================================
-- 10. HELPER: get all office IDs for a project (including HO)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_project_offices(proj_id uuid)
RETURNS SETOF uuid AS $$
SELECT id FROM public.branches
WHERE project_id = proj_id
   OR id IN (
     SELECT b.id FROM public.branches b
     WHERE b.office_type = 'head_office'
       AND b.id IN (
         SELECT child.parent_id FROM public.branches child
         WHERE child.project_id = proj_id AND child.parent_id IS NOT NULL
       )
   );
$$ LANGUAGE sql STABLE;
