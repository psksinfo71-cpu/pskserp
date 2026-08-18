-- Fix voucher numbering uniqueness, handle NULL project_id/branch_id safely, and prevent duplicate voucher_no errors.

-- 1. Ensure sequence_key column exists on voucher_number_sequences
ALTER TABLE public.voucher_number_sequences ADD COLUMN IF NOT EXISTS sequence_key text;

-- 2. Populate sequence_key for any existing rows where it is missing
UPDATE public.voucher_number_sequences
SET sequence_key = CASE 
  WHEN office_type = 'head_office' OR branch_id IS NULL THEN 'HQ-' || voucher_type || '-' || financial_year || '-'
  ELSE 'BO-' || COALESCE((SELECT code FROM public.branches WHERE id = voucher_number_sequences.branch_id), 'BO000') || '-' || voucher_type || '-' || financial_year || '-'
END
WHERE sequence_key IS NULL;

-- 3. Clean up duplicates in voucher_number_sequences by keeping highest last_seq per sequence_key
WITH ranked_seqs AS (
  SELECT id, sequence_key, last_seq,
         ROW_NUMBER() OVER (PARTITION BY sequence_key ORDER BY last_seq DESC, updated_at DESC) as rn
  FROM public.voucher_number_sequences
  WHERE sequence_key IS NOT NULL
)
DELETE FROM public.voucher_number_sequences
WHERE id IN (SELECT id FROM ranked_seqs WHERE rn > 1);

-- 4. Create unique index on sequence_key
CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_number_sequences_key ON public.voucher_number_sequences (sequence_key);

-- 5. Atomic voucher number generator function
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

  -- Find highest existing serial in vouchers table with this prefix
  SELECT COALESCE(MAX(
    CASE 
      WHEN voucher_no ~ ('^' || regexp_replace(v_prefix, '([-[\]{}()*+?.,\\^$|#\s])', '\\\1', 'g') || '[0-9]+$')
      THEN substring(voucher_no from '[0-9]+$')::integer
      ELSE 0
    END
  ), 0) INTO v_max_existing
  FROM public.vouchers
  WHERE voucher_no LIKE v_prefix || '%';

  -- Upsert sequence using unique sequence_key
  INSERT INTO public.voucher_number_sequences (sequence_key, financial_year, project_id, branch_id, office_type, voucher_type, last_seq)
  VALUES (
    v_prefix,
    v_fy,
    p_project_id,
    CASE WHEN COALESCE(p_office_type, 'head_office') = 'head_office' THEN NULL ELSE p_branch_id END,
    COALESCE(p_office_type, 'head_office'),
    p_voucher_type,
    GREATEST(v_max_existing, 0) + 1
  )
  ON CONFLICT (sequence_key)
  DO UPDATE SET last_seq = GREATEST(public.voucher_number_sequences.last_seq, v_max_existing) + 1, updated_at = now()
  RETURNING last_seq INTO v_seq;

  -- Ensure candidate does not collide with any existing voucher_no
  v_result := v_prefix || lpad(v_seq::text, 6, '0');
  WHILE EXISTS (SELECT 1 FROM public.vouchers WHERE voucher_no = v_result) LOOP
    v_seq := v_seq + 1;
    v_result := v_prefix || lpad(v_seq::text, 6, '0');
  END LOOP;

  -- Sync back sequence table if loop advanced past duplicates
  UPDATE public.voucher_number_sequences
  SET last_seq = v_seq, updated_at = now()
  WHERE sequence_key = v_prefix;

  RETURN v_result;
END;
$$;

-- 6. Preview function matching identical logic without sequence modification
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

-- 7. Permissions and cache reload
GRANT EXECUTE ON FUNCTION public.generate_voucher_no(text, uuid, uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_voucher_no_preview(text, uuid, uuid, text, date) TO authenticated;

-- PostgREST cache cleanup
DROP FUNCTION IF EXISTS public.generate_voucher_no(text, uuid, uuid, text, date);
DROP FUNCTION IF EXISTS public.generate_voucher_no_preview(text, uuid, uuid, text);
NOTIFY pgrst, 'reload schema';
