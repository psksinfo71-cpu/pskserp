/*
# Allow super_admin to manage other users' profiles and storage assets

## Problem
When a Super Admin uploads a signature or seal for another user from the
User Management page, two RLS-protected operations fail with
"new row violates row-level security policy":

1. Updating the target user's `profiles` row (signature_url / seal_url).
   The existing `profiles_update_own` policy only allows `auth.uid() = id`,
   so updating someone else's row is rejected.
2. Upserting or removing the file in the `user-assets` storage bucket.
   The existing storage UPDATE/DELETE policies require `auth.uid() = owner`,
   so replacing or deleting a file owned by another user is rejected.

## Changes

### 1. New helper function: is_super_admin()
- SECURITY DEFINER function that looks up the current user's role in
  `profiles` and returns true when it is 'super_admin'.
- SECURITY DEFINER bypasses RLS so the lookup doesn't recurse.

### 2. profiles table — UPDATE policy
- Replaces `profiles_update_own` with a new policy that allows a user to
  update their own row OR allows super_admin to update any row.

### 3. storage.objects (user-assets bucket) — INSERT / UPDATE / DELETE
- INSERT: any authenticated user can upload (unchanged behavior, rewritten
  for clarity).
- UPDATE / DELETE: the owner can manage their own files, OR a super_admin
  can manage any file in the user-assets bucket.
*/

-- 1. Helper function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 2. profiles UPDATE policy — own row OR super_admin
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_super_admin())
  WITH CHECK (auth.uid() = id OR public.is_super_admin());

-- 3. storage.objects policies for user-assets bucket
-- INSERT: any authenticated user
DROP POLICY IF EXISTS "insert_user_assets" ON storage.objects;
CREATE POLICY "insert_user_assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'user-assets');

-- UPDATE: owner OR super_admin
DROP POLICY IF EXISTS "update_user_assets" ON storage.objects;
CREATE POLICY "update_user_assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'user-assets' AND (auth.uid() = owner OR public.is_super_admin()))
  WITH CHECK (bucket_id = 'user-assets');

-- DELETE: owner OR super_admin
DROP POLICY IF EXISTS "delete_user_assets" ON storage.objects;
CREATE POLICY "delete_user_assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'user-assets' AND (auth.uid() = owner OR public.is_super_admin()));
