/*
# Multi-Project User Access

## Purpose
Allows a single user to be assigned to multiple projects and switch
between them from the dashboard. Currently `profiles.project_id` only
supports one project per user. This migration adds a junction table
for many-to-many user-project assignments while keeping the existing
`profiles.project_id` as a default/primary project for backward
compatibility.

## Changes

### 1. New Table: user_projects
A junction table linking users to projects they can access.
- `user_id` (uuid, FK to profiles, ON DELETE CASCADE)
- `project_id` (uuid, FK to projects, ON DELETE CASCADE)
- `assigned_at` (timestamptz, default now())
- Primary key: (user_id, project_id) — prevents duplicate assignments

### 2. Backfill user_projects from profiles.project_id
For every user who already has a `project_id` set on their profile,
insert a row into `user_projects` so existing single-project
assignments carry over.

### 3. RLS on user_projects
- SELECT: users can see their own project assignments (auth.uid() = user_id).
  Super admins can see all assignments.
- INSERT/UPDATE/DELETE: super admins only (via is_super_admin()).
- Regular users cannot self-assign projects.

## Security
- No data is lost. Existing profiles.project_id is untouched.
- RLS is enabled immediately.
- Super admins manage all assignments; users can only read their own.
*/

-- =========================================================
-- 1. Create user_projects junction table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_projects (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2. Backfill from profiles.project_id
-- =========================================================
INSERT INTO public.user_projects (user_id, project_id)
SELECT p.id, p.project_id
FROM public.profiles p
WHERE p.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_projects up
    WHERE up.user_id = p.id AND up.project_id = p.project_id
  );

-- =========================================================
-- 3. RLS Policies for user_projects
-- =========================================================
DROP POLICY IF EXISTS "up_select_own" ON public.user_projects;
CREATE POLICY "up_select_own" ON public.user_projects
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "up_insert_admin" ON public.user_projects;
CREATE POLICY "up_insert_admin" ON public.user_projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "up_update_admin" ON public.user_projects;
CREATE POLICY "up_update_admin" ON public.user_projects
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "up_delete_admin" ON public.user_projects;
CREATE POLICY "up_delete_admin" ON public.user_projects
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
