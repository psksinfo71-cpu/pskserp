-- Keep generated voucher numbers unique even when legacy vouchers exist or multiple users save concurrently.
CREATE OR REPLACE FUNCTION public.generate_voucher_no(
  p_voucher_type text,
  p_project_id uuid,
  p_branch_id uuid,
  p_office_type text,
  p_financial_year text DEFAULT NULL,
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
  IF p_financial_year IS NOT NULL THEN
    v_fy := p_financial_year;
  ELSIF extract(month FROM COALESCE(p_voucher_date, CURRENT_DATE)) >= 7 THEN
    v_fy := extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE))::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) + 1 - 2000)::text;
  ELSE
    v_fy := (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 1)::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 2000)::text;
  END IF;

  IF p_office_type = 'head_office' THEN
    v_prefix := 'HQ-' || p_voucher_type || '-' || v_fy || '-';
  ELSE
    SELECT code INTO v_branch_code FROM branches WHERE id = p_branch_id;
    v_prefix := 'BO-' || COALESCE(v_branch_code, 'BO000') || '-' || p_voucher_type || '-' || v_fy || '-';
  END IF;

  LOOP
    INSERT INTO voucher_number_sequences (financial_year, project_id, branch_id, office_type, voucher_type, last_seq)
    VALUES (v_fy, p_project_id, p_branch_id, p_office_type, p_voucher_type, 1)
    ON CONFLICT (financial_year, project_id, branch_id, office_type, voucher_type)
    DO UPDATE SET last_seq = voucher_number_sequences.last_seq + 1, updated_at = now()
    RETURNING last_seq INTO v_seq;

    v_result := v_prefix || lpad(v_seq::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM vouchers WHERE voucher_no = v_result);
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_voucher_no(text, uuid, uuid, text, text, date) TO authenticated;

-- PostgREST may cache the old overload; remove it so RPC resolves to one signature.
DROP FUNCTION IF EXISTS public.generate_voucher_no(text, uuid, uuid, text, date);
NOTIFY pgrst, 'reload schema';
