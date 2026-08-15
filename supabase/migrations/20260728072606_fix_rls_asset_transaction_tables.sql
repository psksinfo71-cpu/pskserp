/*
# Fix RLS on asset_transactions and asset_depreciation_runs

The initial migration created these tables with USING (true) / WITH CHECK (true)
policies. Replace them with role-gated policies using is_write_allowed() to
match the security pattern used on all other financial tables.
*/

DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_transactions','asset_depreciation_runs'] LOOP
    -- Drop all existing INSERT/UPDATE/DELETE policies
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND cmd IN ('INSERT','UPDATE','DELETE')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', pol.policyname, t);
    END LOOP;

    -- Recreate with role-gated policies
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (public.is_write_allowed(''insert'', %L));',
      t || '_insert', t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (public.is_write_allowed(''update'', %L)) WITH CHECK (public.is_write_allowed(''update'', %L));',
      t || '_update', t, t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (public.is_write_allowed(''delete'', %L));',
      t || '_delete', t, t
    );
  END LOOP;
END $$;
