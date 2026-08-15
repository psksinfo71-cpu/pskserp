/*
# Create org-logos storage bucket for organization logo

1. Storage
- Create a new public bucket `org-logos` to store the organization logo image.
- This bucket is public so logos can be displayed on login page, reports, and vouchers without authentication.
2. Security
- Allow authenticated users to upload/update/delete logos (admin only in practice via UI).
- Allow public (anon) read access so the login page can display the logo before sign-in.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone (including anon on the login page) to read logos
DROP POLICY IF EXISTS "org_logos_public_read" ON storage.objects;
CREATE POLICY "org_logos_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'org-logos');

-- Allow authenticated users to upload logos
DROP POLICY IF EXISTS "org_logos_authenticated_insert" ON storage.objects;
CREATE POLICY "org_logos_authenticated_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'org-logos');

-- Allow authenticated users to update logos
DROP POLICY IF EXISTS "org_logos_authenticated_update" ON storage.objects;
CREATE POLICY "org_logos_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'org-logos')
WITH CHECK (bucket_id = 'org-logos');

-- Allow authenticated users to delete logos
DROP POLICY IF EXISTS "org_logos_authenticated_delete" ON storage.objects;
CREATE POLICY "org_logos_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'org-logos');
