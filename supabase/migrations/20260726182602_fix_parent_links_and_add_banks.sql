/*
# Fix parent_id links across chart of accounts + add two banks

The original migration used subqueries referencing rows in the same INSERT,
which returned NULL for every parent_id. This rebuilds the tree using
explicit code-to-parent-code mapping, then adds Sonali Bank and Bangladesh
Krishi Bank under "Cash at Bank" (converted to a group account).
*/

-- 1. Rebuild parent_id from code mapping using a CTE
WITH parent_map(code, parent_code) AS (
  VALUES
    -- Assets
    ('10','1'), ('11','1'),
    ('100','10'), ('1001','100'), ('1002','100'),
    ('101','10'), ('1011','101'), ('1012','101'),
    ('102','10'), ('1021','102'), ('1022','102'),
    ('103','10'), ('1031','103'),
    ('110','11'), ('1101','110'), ('1102','110'), ('1103','110'), ('1104','110'), ('1105','110'),
    ('111','11'), ('1111','111'), ('1112','111'), ('1113','111'), ('1114','111'), ('1115','111'),
    -- Liabilities
    ('20','2'), ('21','2'),
    ('200','20'), ('2001','200'), ('2002','200'),
    ('201','20'), ('2011','201'), ('2012','201'),
    ('202','20'), ('2021','202'),
    ('210','21'), ('2101','210'),
    -- Fund / Equity
    ('30','3'), ('3001','30'),
    ('31','3'), ('3101','31'),
    ('32','3'), ('3201','32'),
    -- Income
    ('40','4'), ('4001','40'), ('4002','40'),
    ('41','4'), ('4101','41'), ('4102','41'), ('4103','41'),
    ('42','4'), ('4201','42'), ('4202','42'), ('4203','42'),
    ('43','4'), ('4301','43'), ('4302','43'),
    -- Expenditure
    ('50','5'), ('5001','50'), ('5002','50'), ('5003','50'), ('5004','50'),
    ('51','5'), ('5101','51'), ('5102','51'), ('5103','51'), ('5104','51'),
    ('5105','51'), ('5106','51'), ('5107','51'), ('5108','51'), ('5109','51'),
    ('5110','51'), ('5111','51'), ('5112','51'), ('5113','51'), ('5114','51'), ('5115','51'),
    ('52','5'), ('5201','52'), ('5202','52'), ('5203','52')
)
UPDATE public.chart_of_accounts AS c
SET parent_id = p.id
FROM parent_map AS pm
JOIN public.chart_of_accounts AS p ON p.code = pm.parent_code
WHERE c.code = pm.code;

-- 2. Convert "Cash at Bank" (1002) from leaf to group account
--    Groups don't hold balances directly, so zero its opening balance
UPDATE public.chart_of_accounts
SET is_group = true, opening_balance = 0
WHERE code = '1002';

-- 3. Add two bank accounts under "Cash at Bank"
INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id, is_group, is_active, opening_balance, description)
VALUES
  ('10021', 'Sonali Bank', 'asset',
    (SELECT id FROM public.chart_of_accounts WHERE code='1002'),
    false, true, 0, ''),
  ('10022', 'Bangladesh Krishi Bank', 'asset',
    (SELECT id FROM public.chart_of_accounts WHERE code='1002'),
    false, true, 0, '')
ON CONFLICT (code) DO NOTHING;
