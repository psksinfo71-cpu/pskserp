-- Renumber all existing General Fund vouchers from old pattern (e.g. "CV-2026-000001")
-- to the new voucher numbering pattern (e.g. "HQ-CV-2026-27-000001").
-- All current vouchers belong to General Fund project, Head Office branch, office_type = 'head_office'.
-- Serials are assigned per voucher_type, ordered by voucher_date then created_at, starting from 1.

-- Step 1: Build a mapping of old voucher id -> new voucher number using ROW_NUMBER()
WITH ranked AS (
  SELECT
    id,
    voucher_type,
    voucher_date,
    ROW_NUMBER() OVER (
      PARTITION BY voucher_type
      ORDER BY voucher_date, created_at
    ) AS seq
  FROM vouchers
  WHERE voucher_no NOT LIKE 'HQ-%' AND voucher_no NOT LIKE 'BO-%'
)
-- Step 2: Update vouchers with new pattern: HQ-{type}-2026-27-{6-digit-seq}
UPDATE vouchers v
SET voucher_no = 'HQ-' || r.voucher_type || '-2026-27-' || lpad(r.seq::text, 6, '0')
FROM ranked r
WHERE v.id = r.id;

-- Step 3: Upsert voucher_number_sequences so future vouchers continue from the correct last_seq
INSERT INTO voucher_number_sequences (financial_year, project_id, branch_id, office_type, voucher_type, last_seq)
SELECT
  '2026-27',
  v.project_id,
  v.branch_id,
  b.office_type,
  v.voucher_type,
  COUNT(*)::integer
FROM vouchers v
JOIN branches b ON b.id = v.branch_id
WHERE v.voucher_no LIKE 'HQ-%'
GROUP BY v.project_id, v.branch_id, b.office_type, v.voucher_type
ON CONFLICT (financial_year, project_id, branch_id, office_type, voucher_type)
DO UPDATE SET last_seq = GREATEST(voucher_number_sequences.last_seq, EXCLUDED.last_seq),
              updated_at = now();
