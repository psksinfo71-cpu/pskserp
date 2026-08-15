/*
# Add signature_url and seal_url to profiles

## Purpose
Each signing role (Accounts Manager, Finance Manager, Head of Finance,
Deputy Executive Director) needs a signature image and a seal/stamp image
that appear on printed vouchers. Super Admin uploads these per user via
User Management.

## Changes
1. Adds signature_url (text, nullable) to profiles.
2. Adds seal_url (text, nullable) to profiles.
3. Creates a public storage bucket "user-assets" for signature/seal uploads.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'signature_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN signature_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'seal_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN seal_url text;
  END IF;
END $$;

-- Create storage bucket for user signatures and seals
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-assets', 'user-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read (public bucket, but enforce via RLS)
CREATE POLICY "read_user_assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-assets');

-- Allow authenticated users to upload to user-assets
CREATE POLICY "insert_user_assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-assets');

-- Allow users to update/delete their own uploads
CREATE POLICY "update_user_assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'user-assets' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'user-assets');

CREATE POLICY "delete_user_assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'user-assets' AND auth.uid() = owner);
