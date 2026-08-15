-- Preview function: shows what the next voucher number WOULD be without incrementing the sequence
CREATE OR REPLACE FUNCTION generate_voucher_no_preview(
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
  v_date date := COALESCE(p_voucher_date, CURRENT_DATE);
  v_prefix text;
  v_branch_code text;
  v_running text;
BEGIN
  IF extract(month from v_date) >= 7 THEN
    v_fy := extract(year from v_date)::text || '-' || (extract(year from v_date) + 1 - 2000)::text;
  ELSE
    v_fy := (extract(year from v_date) - 1)::text || '-' || (extract(year from v_date) - 2000)::text;
  END IF;

  SELECT last_seq INTO v_seq
  FROM voucher_number_sequences
  WHERE financial_year = v_fy
    AND project_id IS NOT DISTINCT FROM p_project_id
    AND branch_id IS NOT DISTINCT FROM p_branch_id
    AND office_type = p_office_type
    AND voucher_type = p_voucher_type;

  v_seq := COALESCE(v_seq, 0) + 1;
  v_running := lpad(v_seq::text, 6, '0');

  IF p_office_type = 'head_office' THEN
    v_prefix := 'HQ-' || p_voucher_type || '-' || v_fy || '-';
  ELSE
    SELECT code INTO v_branch_code FROM branches WHERE id = p_branch_id;
    IF v_branch_code IS NULL THEN v_branch_code := 'BO000'; END IF;
    v_prefix := 'BO-' || v_branch_code || '-' || p_voucher_type || '-' || v_fy || '-';
  END IF;

  RETURN v_prefix || v_running;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_voucher_no_preview(text, uuid, uuid, text) TO authenticated;
