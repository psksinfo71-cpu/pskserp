/*
# Scope SELECT policy on user-assets bucket

## Problem
The previous `select_user_assets` policy was broad — any authenticated
user could list ALL files in the `user-assets` bucket. The Supabase
security audit warns that public buckets don't need a broad SELECT policy
for public URL access, and it exposes more data than intended.

## Fix
Replace the broad policy with a scoped one: a user can only SELECT
(list/get metadata) objects they own, OR a super_admin can see all
objects in the bucket (required so admin can upsert/replace signature
and seal files for other users).

Public URL reads still work without any SELECT policy because the bucket
is `public = true` — those go through the CDN, not RLS.
*/

DROP POLICY IF EXISTS "select_user_assets" ON storage.objects;
CREATE POLICY "select_user_assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'user-assets' AND (auth.uid() = owner OR public.is_super_admin()));
