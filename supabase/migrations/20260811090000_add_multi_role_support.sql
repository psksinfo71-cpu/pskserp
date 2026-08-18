-- Allow each user to have multiple roles while keeping profiles.role as the legacy primary role.
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_read" ON public.user_roles;
CREATE POLICY "user_roles_read" ON public.user_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "user_roles_insert" ON public.user_roles;
CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "user_roles_delete" ON public.user_roles;
CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE TO authenticated USING (true);

INSERT INTO public.user_roles (user_id, role)
SELECT id, role FROM public.profiles
WHERE role IS NOT NULL AND role <> ''
ON CONFLICT (user_id, role) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Refresh PostgREST's schema cache immediately after the table is created.
NOTIFY pgrst, 'reload schema';
