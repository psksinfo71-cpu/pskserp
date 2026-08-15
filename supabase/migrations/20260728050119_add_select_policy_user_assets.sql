/*
# Fix signature/seal upload: add SELECT policy on storage.objects

## Root cause
The `user-assets` storage bucket had INSERT, UPDATE, and DELETE policies
but NO SELECT policy on `storage.objects`. When the Supabase storage SDK
uploads with `upsert: true`, it first runs a SELECT to check whether the
target object already exists (to decide INSERT vs UPDATE). Without a
SELECT policy, RLS hides all rows, the SDK assumes the object is new and
attempts an INSERT — but if a file already exists at that path the INSERT
conflicts, and the fallback UPDATE is rejected by the USING clause,
producing "new row violates row-level security policy".

The bucket is already `public = true` (anyone can read via public URL),
so allowing authenticated users to SELECT object metadata is consistent
with the existing visibility model.
*/

-- SELECT policy for user-assets bucket
DROP POLICY IF EXISTS "select_user_assets" ON storage.objects;
CREATE POLICY "select_user_assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'user-assets');
