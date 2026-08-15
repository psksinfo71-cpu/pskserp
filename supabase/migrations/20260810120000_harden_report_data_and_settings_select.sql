-- Security hardening: report reference data must not be writable by anon/authenticated users.
-- Reads remain available to signed-in users; settings anon read is retained for the
-- pre-login organization logo lookup.

DROP POLICY IF EXISTS "anon_insert_report_data" ON public.financial_report_data;
DROP POLICY IF EXISTS "anon_update_report_data" ON public.financial_report_data;
DROP POLICY IF EXISTS "anon_delete_report_data" ON public.financial_report_data;

CREATE POLICY "report_data_admin_insert" ON public.financial_report_data
  FOR INSERT TO authenticated
  WITH CHECK (public.is_write_allowed('insert', 'financial_report_data'));

CREATE POLICY "report_data_admin_update" ON public.financial_report_data
  FOR UPDATE TO authenticated
  USING (public.is_write_allowed('update', 'financial_report_data'))
  WITH CHECK (public.is_write_allowed('update', 'financial_report_data'));

CREATE POLICY "report_data_admin_delete" ON public.financial_report_data
  FOR DELETE TO authenticated
  USING (public.is_write_allowed('delete', 'financial_report_data'));

-- Do not expose all organization settings to anonymous users. The application
-- should store only the public logo URL in a public-safe key if pre-login logo
-- display is required.
DROP POLICY IF EXISTS "settings_anon_read" ON public.settings;
CREATE POLICY "settings_anon_read_logo_only" ON public.settings
  FOR SELECT TO anon
  USING (key = 'org_logo_url');
