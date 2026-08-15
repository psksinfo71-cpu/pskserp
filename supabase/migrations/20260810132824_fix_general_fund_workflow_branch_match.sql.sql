/*
# Fix General Fund Approval Workflow Branch Mismatch

## Problem
The "General Fund" approval workflow has branch_id = 'a3ff900c...' (a
Head Office branch linked to the General Fund project), but users creating
vouchers are assigned to branch_id = '57a6ced5...' (the original Head Office
branch with no project_id). This mismatch means the voucher creation code
cannot find a matching workflow, so approval_workflow_id stays NULL on all
new vouchers — and the approval buttons never appear.

## Fix
1. Update the "General Fund" workflow's branch_id to '57a6ced5...' so it
   matches the branch that users are actually assigned to.
2. Backfill all August 2026 vouchers that have NULL approval_workflow_id
   with the correct workflow based on their project_id.
3. Also update the Epic Project workflow similarly if needed.

## Data Changes
- approval_workflows row "General Fund": branch_id → '57a6ced5...'
- vouchers with project_id = General Fund and NULL workflow: set workflow_id
- No data is lost; only NULL fields are populated and one FK is corrected.
*/

-- 1. Fix the General Fund workflow branch_id to match the actual user branch
UPDATE public.approval_workflows
SET branch_id = '57a6ced5-6556-4643-8725-e0586a4951e6',
    updated_at = now()
WHERE name = 'General Fund';

-- 2. Backfill August vouchers with the correct workflow_id
-- General Fund vouchers
UPDATE public.vouchers v
SET approval_workflow_id = (
  SELECT aw.id FROM public.approval_workflows aw
  WHERE aw.name = 'General Fund' AND aw.is_active = true
  LIMIT 1
),
current_step = 0
WHERE v.approval_workflow_id IS NULL
  AND v.project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
  AND v.status = 'submitted';

-- Epic Project vouchers (if any have null workflow)
UPDATE public.vouchers v
SET approval_workflow_id = (
  SELECT aw.id FROM public.approval_workflows aw
  WHERE aw.name = 'Epic Project' AND aw.is_active = true
  LIMIT 1
),
current_step = 0
WHERE v.approval_workflow_id IS NULL
  AND v.project_id = 'ba404d4a-eb6b-4763-8417-eac640860fee'
  AND v.status = 'submitted';
