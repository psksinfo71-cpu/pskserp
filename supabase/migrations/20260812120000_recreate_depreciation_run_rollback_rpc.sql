-- Ensure the depreciation rollback RPC is available to PostgREST clients.
-- Run this migration in the Supabase project, then refresh the schema cache.
CREATE OR REPLACE FUNCTION public.delete_depreciation_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.asset_depreciation_runs%ROWTYPE;
  v_role text;
  v_has_later_run boolean;
  v_txn record;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('super_admin', 'finance_manager') THEN
    RAISE EXCEPTION 'You are not authorized to delete a depreciation run';
  END IF;

  SELECT * INTO v_run FROM public.asset_depreciation_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Depreciation run not found'; END IF;
  IF v_run.status <> 'completed' THEN RAISE EXCEPTION 'Only completed runs can be deleted'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.asset_depreciation_runs r
    WHERE r.status = 'completed' AND r.run_at > v_run.run_at
  ) INTO v_has_later_run;
  IF v_has_later_run THEN RAISE EXCEPTION 'Delete the latest depreciation run first'; END IF;

  FOR v_txn IN SELECT asset_id, amount FROM public.asset_transactions WHERE depreciation_run_id = v_run.id LOOP
    UPDATE public.assets
    SET accumulated_depreciation = GREATEST(0, accumulated_depreciation - v_txn.amount),
        current_value = current_value + v_txn.amount
    WHERE id = v_txn.asset_id;
  END LOOP;

  DELETE FROM public.asset_transactions WHERE depreciation_run_id = v_run.id;
  IF v_run.voucher_id IS NOT NULL THEN
    DELETE FROM public.voucher_details WHERE voucher_id = v_run.voucher_id;
    DELETE FROM public.vouchers WHERE id = v_run.voucher_id;
  END IF;
  DELETE FROM public.asset_depreciation_runs WHERE id = v_run.id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_depreciation_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_depreciation_run(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
