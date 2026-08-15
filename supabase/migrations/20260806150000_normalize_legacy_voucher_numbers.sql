-- Normalize legacy voucher numbers to the current type-prefixed concept.
-- Existing sequence counters are initialized from existing voucher numbers so
-- new vouchers continue after the highest number for each scope/type.

DO $$
DECLARE
  v record;
  v_seq integer;
BEGIN
  FOR v IN
    SELECT
      COALESCE(v.financial_year, CASE
        WHEN EXTRACT(MONTH FROM v.voucher_date) >= 7
          THEN EXTRACT(YEAR FROM v.voucher_date)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) + 1 - 2000)::text
        ELSE (EXTRACT(YEAR FROM v.voucher_date) - 1)::text || '-' || (EXTRACT(YEAR FROM v.voucher_date) - 2000)::text
      END) AS financial_year,
      v.project_id, v.branch_id, COALESCE(v.office_type, 'head_office') AS office_type,
      v.voucher_type,
      MAX(NULLIF(REGEXP_REPLACE(v.voucher_no, '\D', '', 'g'), '')::integer) AS max_seq
    FROM public.vouchers v
    WHERE v.voucher_no IS NOT NULL AND v.voucher_type IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5
  LOOP
    v_seq := COALESCE(v.max_seq, 0);
    INSERT INTO public.voucher_number_sequences
      (financial_year, project_id, branch_id, office_type, voucher_type, last_seq)
    VALUES
      (v.financial_year, v.project_id, v.branch_id, v.office_type, v.voucher_type, v_seq)
    ON CONFLICT (financial_year, project_id, branch_id, office_type, voucher_type)
    DO UPDATE SET last_seq = GREATEST(voucher_number_sequences.last_seq, EXCLUDED.last_seq), updated_at = now();
  END LOOP;
END $$;

-- Enforce the type prefix for newly inserted/updated voucher numbers.
ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_voucher_no_type_prefix_check;

ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_voucher_no_type_prefix_check
  CHECK (voucher_no IS NULL OR voucher_type IS NULL OR position('-' || voucher_type || '-' in voucher_no) > 0);
