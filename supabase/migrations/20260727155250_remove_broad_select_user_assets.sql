/*
# Remove broad SELECT policy on user-assets bucket

## Purpose
The Security Audit flagged that the `read_user_assets` SELECT policy on
storage.objects allows clients to list/enumerate all files in the public
user-assets bucket. Public buckets already serve objects via their public
URL without any RLS SELECT policy, so this policy is unnecessary and
exposes more data than intended (file listing/enumeration).

## Changes
1. Drops the `read_user_assets` SELECT policy from storage.objects.
   Object URL access is unaffected — public buckets serve files by URL
   regardless of RLS.
2. Retains insert/update/delete policies so authenticated users can
   still upload and manage their own files.
*/

DROP POLICY IF EXISTS "read_user_assets" ON storage.objects;
