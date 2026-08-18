-- Keep the displayed preview aligned with every supported voucher type and the same numbering key used on save.
CREATE OR REPLACE FUNCTION public.generate_voucher_no_preview(
  p_voucher_type text,
  p_project_id uuid,
  p_branch_id uuid,
  p_office_type text,
  p_voucher_date date DEFAULT CURRENT_DATE
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text;
  v_seq integer;
  v_prefix text;
  v_branch_code text;
  v_result text;
BEGIN
  IF extract(month FROM COALESCE(p_voucher_date, CURRENT_DATE)) >= 7 THEN
    v_fy := extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE))::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) + 1 - 2000)::text;
  ELSE
    v_fy := (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 1)::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 2000)::text;
  END IF;

  SELECT last_seq INTO v_seq FROM voucher_number_sequences
  WHERE financial_year = v_fy
    AND project_id IS NOT DISTINCT FROM p_project_id
    AND branch_id IS NOT DISTINCT FROM p_branch_id
    AND office_type = p_office_type
    AND voucher_type = p_voucher_type;

  v_seq := COALESCE(v_seq, 0) + 1;
  IF p_office_type = 'head_office' THEN
    v_prefix := 'HQ-' || p_voucher_type || '-' || v_fy || '-';
  ELSE
    SELECT code INTO v_branch_code FROM branches WHERE id = p_branch_id;
    v_prefix := 'BO-' || COALESCE(v_branch_code, 'BO000') || '-' || p_voucher_type || '-' || v_fy || '-';
  END IF;

  v_result := v_prefix || lpad(v_seq::text, 6, '0');
  WHILE EXISTS (SELECT 1 FROM vouchers WHERE voucher_no = v_result) LOOP
    v_seq := v_seq + 1;
    v_result := v_prefix || lpad(v_seq::text, 6, '0');
  END LOOP;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_voucher_no_preview(text, uuid, uuid, text, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
