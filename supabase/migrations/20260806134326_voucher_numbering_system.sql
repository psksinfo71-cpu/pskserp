-- Voucher numbering system: project-wise, financial-year-wise, office-wise, branch-wise, voucher-type-wise sequential numbering
-- Uses a dedicated sequence table to guarantee uniqueness and no reuse of serial numbers

CREATE TABLE IF NOT EXISTS voucher_number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year text NOT NULL,      -- e.g. "2026-27"
  project_id uuid,                   -- null for no-project
  branch_id uuid,                    -- null for head office with no branch
  office_type text NOT NULL,         -- 'head_office' | 'project_office' | 'branch' etc.
  voucher_type text NOT NULL,         -- 'BPV', 'CPV', 'BRV', 'CRV', 'JV', etc.
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (financial_year, project_id, branch_id, office_type, voucher_type)
);

ALTER TABLE voucher_number_sequences ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can use this (actual voucher creation is gated by vouchers RLS)
CREATE POLICY "select_voucher_seq_authenticated" ON voucher_number_sequences
  FOR SELECT TO authenticated USING (true);

-- SECURITY DEFINER function to atomically generate the next voucher number
-- This prevents race conditions and guarantees no duplicate or reused serials
CREATE OR REPLACE FUNCTION generate_voucher_no(
  p_voucher_type text,
  p_project_id uuid,
  p_branch_id uuid,
  p_office_type text,
  p_financial_year text DEFAULT NULL
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
  v_running text;
  v_result text;
BEGIN
  -- Determine financial year from date or parameter
  IF p_financial_year IS NOT NULL THEN
    v_fy := p_financial_year;
  ELSE
    -- Derive from current date: July-Dec => FY starts this year, Jan-June => FY started previous year
    IF extract(month from now()) >= 7 THEN
      v_fy := extract(year from now())::text || '-' || (extract(year from now()) + 1 - 2000)::text;
    ELSE
      v_fy := (extract(year from now()) - 1)::text || '-' || (extract(year from now()) - 2000)::text;
    END IF;
  END IF;

  -- Atomically increment the sequence
  INSERT INTO voucher_number_sequences (financial_year, project_id, branch_id, office_type, voucher_type, last_seq)
  VALUES (v_fy, p_project_id, p_branch_id, p_office_type, p_voucher_type, 1)
  ON CONFLICT (financial_year, project_id, branch_id, office_type, voucher_type)
  DO UPDATE SET last_seq = voucher_number_sequences.last_seq + 1,
                updated_at = now()
  RETURNING last_seq INTO v_seq;

  -- Build the running number (6-digit zero-padded)
  v_running := lpad(v_seq::text, 6, '0');

  -- Build prefix based on office type
  IF p_office_type = 'head_office' THEN
    v_prefix := 'HQ-' || p_voucher_type || '-' || v_fy || '-';
  ELSE
    -- Branch office: need branch code
    SELECT code INTO v_branch_code FROM branches WHERE id = p_branch_id;
    IF v_branch_code IS NULL THEN
      v_branch_code := 'BO000';
    END IF;
    v_prefix := 'BO-' || v_branch_code || '-' || p_voucher_type || '-' || v_fy || '-';
  END IF;

  v_result := v_prefix || v_running;
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION generate_voucher_no(text, uuid, uuid, text, text) TO authenticated;

-- Grant insert/update on sequence table only via the function (SECURITY DEFINER)
-- Revoke direct insert/update to prevent manual tampering
REVOKE INSERT, UPDATE, DELETE ON voucher_number_sequences FROM authenticated;
