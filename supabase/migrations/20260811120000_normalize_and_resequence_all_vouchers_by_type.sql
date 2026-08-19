-- Normalize legacy voucher types, re-sequence all existing vouchers sequentially by voucher type,
-- and reset sequence counters to maintain 1, 2, 3... ordering per voucher type.

-- Step 1: Map any legacy 'PV' and 'RV' voucher types to standard voucher types (BPV, CPV, BRV, CRV)
DO $$
BEGIN
  -- Update PV with Bank account lines to BPV
  UPDATE public.vouchers v
  SET voucher_type = 'BPV'
  WHERE v.voucher_type = 'PV'
    AND EXISTS (
      SELECT 1 FROM public.voucher_details vd
      JOIN public.chart_of_accounts a ON a.id = vd.account_id
      WHERE vd.voucher_id = v.id AND (a.code LIKE '1002%' OR a.code LIKE '112%')
    );

  -- Update PV with Cash account lines to CPV
  UPDATE public.vouchers v
  SET voucher_type = 'CPV'
  WHERE v.voucher_type = 'PV'
    AND EXISTS (
      SELECT 1 FROM public.voucher_details vd
      JOIN public.chart_of_accounts a ON a.id = vd.account_id
      WHERE vd.voucher_id = v.id AND (a.code LIKE '1001%' OR a.code LIKE '111%')
    );

  -- Remaining PV to BPV default
  UPDATE public.vouchers
  SET voucher_type = 'BPV'
  WHERE voucher_type = 'PV';

  -- Update RV with Bank account lines to BRV
  UPDATE public.vouchers v
  SET voucher_type = 'BRV'
  WHERE v.voucher_type = 'RV'
    AND EXISTS (
      SELECT 1 FROM public.voucher_details vd
      JOIN public.chart_of_accounts a ON a.id = vd.account_id
      WHERE vd.voucher_id = v.id AND (a.code LIKE '1002%' OR a.code LIKE '112%')
    );

  -- Update RV with Cash account lines to CRV
  UPDATE public.vouchers v
  SET voucher_type = 'CRV'
  WHERE v.voucher_type = 'RV'
    AND EXISTS (
      SELECT 1 FROM public.voucher_details vd
      JOIN public.chart_of_accounts a ON a.id = vd.account_id
      WHERE vd.voucher_id = v.id AND (a.code LIKE '1001%' OR a.code LIKE '111%')
    );

  -- Remaining RV to BRV default
  UPDATE public.vouchers
  SET voucher_type = 'BRV'
  WHERE voucher_type = 'RV';
END $$;

-- Step 2: Temporarily disable unique check while renumbering
ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_voucher_no_key;

-- Step 3: Renumber ALL existing vouchers strictly 1, 2, 3... per voucher_type, financial year, and office/branch
WITH voucher_fy AS (
  SELECT
    v.id,
    v.voucher_type,
    v.voucher_date,
    v.created_at,
    v.branch_id,
    b.office_type AS branch_office_type,
    b.code AS branch_code,
    CASE
      WHEN EXTRACT(MONTH FROM v.voucher_date) >= 7
        THEN EXTRACT(YEAR FROM v.voucher_date)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) + 1 - 2000)::text
      ELSE (EXTRACT(YEAR FROM v.voucher_date) - 1)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) - 2000)::text
    END AS fy
  FROM public.vouchers v
  LEFT JOIN public.branches b ON b.id = v.branch_id
),
numbered AS (
  SELECT
    id,
    voucher_type,
    fy,
    branch_office_type,
    branch_code,
    ROW_NUMBER() OVER (
      PARTITION BY voucher_type, fy, COALESCE(branch_office_type, 'head_office'), branch_id
      ORDER BY voucher_date ASC, created_at ASC, id ASC
    ) AS seq
  FROM voucher_fy
)
UPDATE public.vouchers v
SET voucher_no = CASE
  WHEN n.branch_office_type = 'head_office' OR n.branch_code IS NULL
    THEN 'HQ-' || n.voucher_type || '-' || n.fy || '-' || LPAD(n.seq::text, 6, '0')
  ELSE 'BO-' || COALESCE(n.branch_code, 'BO000') || '-' || n.voucher_type || '-' || n.fy || '-' || LPAD(n.seq::text, 6, '0')
END
FROM numbered n
WHERE v.id = n.id;

-- Step 4: Re-add UNIQUE constraint on voucher_no
ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_voucher_no_key UNIQUE (voucher_no);

-- Step 5: Reset voucher_number_sequences table completely based on new clean numbers
DELETE FROM public.voucher_number_sequences;

INSERT INTO public.voucher_number_sequences (
  sequence_key,
  financial_year,
  project_id,
  branch_id,
  office_type,
  voucher_type,
  last_seq,
  updated_at
)
SELECT
  CASE
    WHEN b.office_type = 'head_office' OR v.branch_id IS NULL
      THEN 'HQ-' || v.voucher_type || '-' || (
        CASE
          WHEN EXTRACT(MONTH FROM v.voucher_date) >= 7
            THEN EXTRACT(YEAR FROM v.voucher_date)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) + 1 - 2000)::text
          ELSE (EXTRACT(YEAR FROM v.voucher_date) - 1)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) - 2000)::text
        END
      ) || '-'
    ELSE 'BO-' || COALESCE(b.code, 'BO000') || '-' || v.voucher_type || '-' || (
      CASE
        WHEN EXTRACT(MONTH FROM v.voucher_date) >= 7
          THEN EXTRACT(YEAR FROM v.voucher_date)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) + 1 - 2000)::text
        ELSE (EXTRACT(YEAR FROM v.voucher_date) - 1)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) - 2000)::text
      END
    ) || '-'
  END AS sequence_key,
  CASE
    WHEN EXTRACT(MONTH FROM v.voucher_date) >= 7
      THEN EXTRACT(YEAR FROM v.voucher_date)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) + 1 - 2000)::text
    ELSE (EXTRACT(YEAR FROM v.voucher_date) - 1)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) - 2000)::text
  END AS financial_year,
  NULL AS project_id,
  CASE WHEN b.office_type = 'head_office' OR v.branch_id IS NULL THEN NULL ELSE v.branch_id END AS branch_id,
  COALESCE(b.office_type, 'head_office') AS office_type,
  v.voucher_type,
  COUNT(*)::integer AS last_seq,
  now() AS updated_at
FROM public.vouchers v
LEFT JOIN public.branches b ON b.id = v.branch_id
GROUP BY 1, 2, 3, 4, 5, 6
ON CONFLICT (sequence_key)
DO UPDATE SET last_seq = EXCLUDED.last_seq, updated_at = now();

-- Step 6: Atomic sequential generator ensuring strict +1 per voucher type
CREATE OR REPLACE FUNCTION public.generate_voucher_no(
  p_voucher_type text,
  p_project_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_office_type text DEFAULT 'head_office',
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
  v_max_existing integer;
BEGIN
  -- Determine financial year
  IF p_financial_year IS NOT NULL AND p_financial_year <> '' THEN
    v_fy := p_financial_year;
  ELSIF extract(month FROM COALESCE(p_voucher_date, CURRENT_DATE)) >= 7 THEN
    v_fy := extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE))::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) + 1 - 2000)::text;
  ELSE
    v_fy := (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 1)::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 2000)::text;
  END IF;

  -- Build prefix based on office type
  IF COALESCE(p_office_type, 'head_office') = 'head_office' OR p_branch_id IS NULL THEN
    v_prefix := 'HQ-' || p_voucher_type || '-' || v_fy || '-';
  ELSE
    SELECT code INTO v_branch_code FROM public.branches WHERE id = p_branch_id;
    v_prefix := 'BO-' || COALESCE(v_branch_code, 'BO000') || '-' || p_voucher_type || '-' || v_fy || '-';
  END IF;

  -- Find highest existing serial in vouchers table with this exact prefix
  SELECT COALESCE(MAX(
    CASE 
      WHEN voucher_no ~ ('^' || regexp_replace(v_prefix, '([-[\]{}()*+?.,\\^$|#\s])', '\\\1', 'g') || '[0-9]+$')
      THEN substring(voucher_no from '[0-9]+$')::integer
      ELSE 0
    END
  ), 0) INTO v_max_existing
  FROM public.vouchers
  WHERE voucher_no LIKE v_prefix || '%';

  -- Atomically increment sequence for this prefix
  INSERT INTO public.voucher_number_sequences (
    sequence_key, financial_year, project_id, branch_id, office_type, voucher_type, last_seq
  )
  VALUES (
    v_prefix,
    v_fy,
    NULL,
    CASE WHEN COALESCE(p_office_type, 'head_office') = 'head_office' THEN NULL ELSE p_branch_id END,
    COALESCE(p_office_type, 'head_office'),
    p_voucher_type,
    GREATEST(v_max_existing, 0) + 1
  )
  ON CONFLICT (sequence_key)
  DO UPDATE SET last_seq = GREATEST(public.voucher_number_sequences.last_seq, v_max_existing) + 1, updated_at = now()
  RETURNING last_seq INTO v_seq;

  -- Avoid collisions if any exists
  v_result := v_prefix || lpad(v_seq::text, 6, '0');
  WHILE EXISTS (SELECT 1 FROM public.vouchers WHERE voucher_no = v_result) LOOP
    v_seq := v_seq + 1;
    v_result := v_prefix || lpad(v_seq::text, 6, '0');
  END LOOP;

  -- Synchronize sequence table to the final sequence
  UPDATE public.voucher_number_sequences
  SET last_seq = v_seq, updated_at = now()
  WHERE sequence_key = v_prefix;

  RETURN v_result;
END;
$$;

-- Step 7: Preview generator matching the exact next number without advancing sequence
CREATE OR REPLACE FUNCTION public.generate_voucher_no_preview(
  p_voucher_type text,
  p_project_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_office_type text DEFAULT 'head_office',
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
  v_max_existing integer;
BEGIN
  IF extract(month FROM COALESCE(p_voucher_date, CURRENT_DATE)) >= 7 THEN
    v_fy := extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE))::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) + 1 - 2000)::text;
  ELSE
    v_fy := (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 1)::text || '-' ||
      (extract(year FROM COALESCE(p_voucher_date, CURRENT_DATE)) - 2000)::text;
  END IF;

  IF COALESCE(p_office_type, 'head_office') = 'head_office' OR p_branch_id IS NULL THEN
    v_prefix := 'HQ-' || p_voucher_type || '-' || v_fy || '-';
  ELSE
    SELECT code INTO v_branch_code FROM public.branches WHERE id = p_branch_id;
    v_prefix := 'BO-' || COALESCE(v_branch_code, 'BO000') || '-' || p_voucher_type || '-' || v_fy || '-';
  END IF;

  SELECT last_seq INTO v_seq FROM public.voucher_number_sequences
  WHERE sequence_key = v_prefix;

  SELECT COALESCE(MAX(
    CASE 
      WHEN voucher_no ~ ('^' || regexp_replace(v_prefix, '([-[\]{}()*+?.,\\^$|#\s])', '\\\1', 'g') || '[0-9]+$')
      THEN substring(voucher_no from '[0-9]+$')::integer
      ELSE 0
    END
  ), 0) INTO v_max_existing
  FROM public.vouchers
  WHERE voucher_no LIKE v_prefix || '%';

  v_seq := GREATEST(COALESCE(v_seq, 0), v_max_existing) + 1;
  v_result := v_prefix || lpad(v_seq::text, 6, '0');

  WHILE EXISTS (SELECT 1 FROM public.vouchers WHERE voucher_no = v_result) LOOP
    v_seq := v_seq + 1;
    v_result := v_prefix || lpad(v_seq::text, 6, '0');
  END LOOP;

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
