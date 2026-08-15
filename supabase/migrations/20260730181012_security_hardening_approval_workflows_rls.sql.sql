/*
# Security Hardening: Function Search Paths & RLS Policy Tightening

## Purpose
Fixes security vulnerabilities flagged by the database security scanner:
1. Two helper functions had mutable search_path (potential search_path
   hijacking attacks).
2. RLS policies on approval_workflows, approval_workflow_steps, and
   voucher_approvals used USING(true)/WITH CHECK(true) for writes,
   effectively bypassing row-level security for any authenticated user.

## Changes

### 1. Function Search Path (get_office_descendants, get_project_offices)
Both functions are recreated with an explicit, immutable search_path
(`SET search_path = public, pg_temp`) to prevent search_path hijacking.

### 2. approval_workflows write policies
- INSERT/UPDATE/DELETE: restricted to super_admin via is_super_admin().
- SELECT: unchanged (all authenticated staff can read workflows — this
  is needed to determine the approval chain for a voucher).

### 3. approval_workflow_steps write policies
- INSERT/UPDATE/DELETE: restricted to super_admin.
- SELECT: unchanged.

### 4. voucher_approvals INSERT policy
- INSERT: restricted so a user can only record an approval under their
  own identity (auth.uid() = user_id). This prevents forging approval
  records under another user's name.
- SELECT: unchanged (approval history is shared among staff).

## Security
- No data is lost or modified — only function definitions and policy
  definitions change.
- All policies remain scoped TO authenticated.
*/

-- =========================================================
-- 1. Fix function search_path: get_office_descendants
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_office_descendants(root_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
WITH RECURSIVE descendants AS (
  SELECT id FROM public.branches WHERE id = root_id
  UNION ALL
  SELECT b.id FROM public.branches b
  INNER JOIN descendants d ON b.parent_id = d.id
)
SELECT id FROM descendants;
$$;

-- =========================================================
-- 2. Fix function search_path: get_project_offices
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_project_offices(proj_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
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
$$;

-- =========================================================
-- 3. Tighten approval_workflows write policies
-- =========================================================
DROP POLICY IF EXISTS "aw_insert" ON public.approval_workflows;
CREATE POLICY "aw_insert" ON public.approval_workflows
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "aw_update" ON public.approval_workflows;
CREATE POLICY "aw_update" ON public.approval_workflows
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "aw_delete" ON public.approval_workflows;
CREATE POLICY "aw_delete" ON public.approval_workflows
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- =========================================================
-- 4. Tighten approval_workflow_steps write policies
-- =========================================================
DROP POLICY IF EXISTS "aws_insert" ON public.approval_workflow_steps;
CREATE POLICY "aws_insert" ON public.approval_workflow_steps
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "aws_update" ON public.approval_workflow_steps;
CREATE POLICY "aws_update" ON public.approval_workflow_steps
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "aws_delete" ON public.approval_workflow_steps;
CREATE POLICY "aws_delete" ON public.approval_workflow_steps
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- =========================================================
-- 5. Tighten voucher_approvals INSERT policy
-- Users can only record approvals under their own identity.
-- =========================================================
DROP POLICY IF EXISTS "va_insert" ON public.voucher_approvals;
CREATE POLICY "va_insert" ON public.voucher_approvals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
