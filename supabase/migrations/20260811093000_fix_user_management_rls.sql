-- Allow super admins to read and manage profiles and user role assignments.
-- Keep the legacy primary role as the fallback when user_roles is unavailable.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON public.profiles;
CREATE POLICY "profiles_select_own_or_staff" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_roles_read" ON public.user_roles;
CREATE POLICY "user_roles_read" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "user_roles_insert" ON public.user_roles;
CREATE POLICY "user_roles_insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "user_roles_delete" ON public.user_roles;
CREATE POLICY "user_roles_delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_super_admin());
