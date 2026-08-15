/*
# Allow anon read access to settings table

1. Security
- Add a SELECT policy for the `anon` role on the `settings` table.
- This is required so the login page (which runs before sign-in, using the anon key) can read the organization logo URL from settings.
- Only SELECT is granted; writes remain restricted to authenticated users with the 'update' permission.
*/

DROP POLICY IF EXISTS "settings_anon_read" ON settings;
CREATE POLICY "settings_anon_read"
ON settings FOR SELECT
TO anon
USING (true);
