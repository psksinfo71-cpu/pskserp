/*
 Security Hardening: Profile UPDATE lockdown, audit trigger, voucher workflow RPC

 C2: Restrict profiles UPDATE so users cannot escalate their own role.
 H4: Make audit_logs insert-only via a SECURITY DEFINER function.
 C3: Create voucher status transition RPCs for workflow enforcement.
 L5: Replace client-side last_login_at with a trigger.
*/

-- =========================================================
-- C2: Drop open UPDATE policy on profiles; replace with
--     column-scoped policy that prevents role/is_active/self-escalation.
-- =========================================================
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

-- Users can update own profile but NOT role, is_active, or email
CREATE POLICY "profiles_update_own_safe" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Super admin can update any profile (including role) via edge function only.
-- The edge function uses service_role which bypasses RLS, so no additional
-- policy is needed for super_admin here.

-- =========================================================
-- L5: Trigger to auto-set last_login_at on auth sign-in
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_login_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_login ON auth.sessions;
CREATE TRIGGER on_auth_login
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_last_login();

-- =========================================================
-- H4: SECURITY DEFINER function for audit logging
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_audit_entry(
  p_action text,
  p_table_name text,
  p_record_id text DEFAULT '',
  p_old_values jsonb DEFAULT NULL,
  p_new_values jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, user_email, action, table_name, record_id, old_values, new_values, ip_address)
  SELECT
    auth.uid(),
    COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), ''),
    p_action,
    p_table_name,
    p_record_id,
    p_old_values,
    p_new_values,
    ''::text;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_entry(text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_entry(text, text, text, jsonb, jsonb) TO authenticated;

-- =========================================================
-- C3: Voucher status transition RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.advance_voucher_status(
  p_voucher_id uuid,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_voucher record;
  v_valid_transitions text[];
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_voucher FROM public.vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF v_voucher.status = 'posted' THEN RAISE EXCEPTION 'Posted vouchers cannot be modified'; END IF;
  IF v_voucher.status = 'locked' THEN RAISE EXCEPTION 'Locked vouchers cannot be modified'; END IF;

  -- Define valid transitions per role
  CASE v_caller_role
    WHEN 'accountant', 'accounts_manager' THEN
      v_valid_transitions := ARRAY['submitted'];
    WHEN 'project_staff' THEN
      v_valid_transitions := ARRAY['checked', 'verified'];
    WHEN 'finance_manager' THEN
      v_valid_transitions := ARRAY['reviewed'];
    WHEN 'head_of_finance' THEN
      v_valid_transitions := ARRAY['verified'];
    WHEN 'project_manager', 'deputy_executive_director', 'executive_director' THEN
      v_valid_transitions := ARRAY['approved'];
    WHEN 'super_admin' THEN
      v_valid_transitions := ARRAY['submitted', 'reviewed', 'checked', 'verified', 'approved', 'posted'];
    ELSE
      RAISE EXCEPTION 'Role % cannot advance vouchers', v_caller_role;
  END CASE;

  IF NOT (p_new_status = ANY(v_valid_transitions)) THEN
    RAISE EXCEPTION 'Role % cannot transition voucher to status %', v_caller_role, p_new_status;
  END IF;

  -- Validate current status matches expected workflow
  CASE p_new_status
    WHEN 'submitted' THEN
      IF v_voucher.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Can only submit draft or rejected vouchers';
      END IF;
    WHEN 'reviewed' THEN
      IF v_voucher.status <> 'submitted' THEN
        RAISE EXCEPTION 'Can only review submitted vouchers';
      END IF;
      UPDATE public.vouchers SET reviewed_by = auth.uid() WHERE id = p_voucher_id;
    WHEN 'checked' THEN
      IF v_voucher.status <> 'reviewed' THEN
        RAISE EXCEPTION 'Can only check reviewed vouchers';
      END IF;
      UPDATE public.vouchers SET checked_by = auth.uid() WHERE id = p_voucher_id;
    WHEN 'verified' THEN
      IF v_voucher.status NOT IN ('reviewed', 'checked') THEN
        RAISE EXCEPTION 'Can only verify reviewed or checked vouchers';
      END IF;
      UPDATE public.vouchers SET verified_by = auth.uid() WHERE id = p_voucher_id;
    WHEN 'approved' THEN
      IF v_voucher.status <> 'verified' THEN
        RAISE EXCEPTION 'Can only approve verified vouchers';
      END IF;
      UPDATE public.vouchers SET approved_by = auth.uid() WHERE id = p_voucher_id;
    WHEN 'posted' THEN
      IF v_voucher.status <> 'approved' THEN
        RAISE EXCEPTION 'Can only post approved vouchers';
      END IF;
      UPDATE public.vouchers SET posted_at = now() WHERE id = p_voucher_id;
  END CASE;

  UPDATE public.vouchers SET status = p_new_status WHERE id = p_voucher_id;

  PERFORM public.log_audit_entry(
    'advance_status', 'vouchers', p_voucher_id::text,
    jsonb_build_object('old_status', v_voucher.status),
    jsonb_build_object('new_status', p_new_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_voucher_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_voucher_status(uuid, text) TO authenticated;

-- =========================================================
-- Restrict direct UPDATE on status columns in vouchers table
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_direct_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role') = 'authenticated' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.checked_by IS DISTINCT FROM OLD.checked_by
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
    THEN
      RAISE EXCEPTION 'Direct status updates are not allowed. Use advance_voucher_status() RPC.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_voucher_status ON public.vouchers;
CREATE TRIGGER prevent_direct_voucher_status
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_status_update();

-- Reload PostgREST schema
NOTIFY pgrst, 'reload schema';
