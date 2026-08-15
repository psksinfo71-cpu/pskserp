-- Set opening balances for fixed asset accounts (cost & accumulated depreciation)
-- to match the asset_categories WDV for the General Fund project.
-- This makes the Trial Balance include fixed assets and balance correctly.

-- First, get the General Fund project ID
-- 83e3a2cf-f80a-4e03-a96e-80ad1ed70e65

-- Cost accounts (debit/natural side) - set positive opening balances
-- Accumulated depreciation accounts (contra-asset/credit side) - set negative opening balances

-- Land (1201): cost 472,082, depn 0
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1201' AND project_id IS NULL),
       472082
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1201' AND project_id IS NULL)
);

-- Building (1202): cost 9,405,860
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1202' AND project_id IS NULL),
       9405860
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1202' AND project_id IS NULL)
);

-- Acc Depn - Building (1211): -8,577,986
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1211' AND project_id IS NULL),
       -8577986
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1211' AND project_id IS NULL)
);

-- Furniture & Fixture (1203): cost 2,367,705
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1203' AND project_id IS NULL),
       2367705
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1203' AND project_id IS NULL)
);

-- Acc Depn - Furniture (1212): -1,387,067
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1212' AND project_id IS NULL),
       -1387067
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1212' AND project_id IS NULL)
);

-- Office Equipment (1204): cost 3,330,688
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1204' AND project_id IS NULL),
       3330688
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1204' AND project_id IS NULL)
);

-- Acc Depn - Office Equipment (1213): -1,867,597
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1213' AND project_id IS NULL),
       -1867597
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1213' AND project_id IS NULL)
);

-- Husking Mill (1205): cost 231,696
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1205' AND project_id IS NULL),
       231696
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1205' AND project_id IS NULL)
);

-- Acc Depn - Husking Mill (1214): -230,769
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1214' AND project_id IS NULL),
       -230769
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1214' AND project_id IS NULL)
);

-- Books & Periodicals (1206): cost 69,267
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1206' AND project_id IS NULL),
       69267
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1206' AND project_id IS NULL)
);

-- Acc Depn - Books (1215): -66,388
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1215' AND project_id IS NULL),
       -66388
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1215' AND project_id IS NULL)
);

-- Vehicles (1207): cost 1,319,400
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1207' AND project_id IS NULL),
       1319400
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1207' AND project_id IS NULL)
);

-- Acc Depn - Vehicles (1216): -1,149,530
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1216' AND project_id IS NULL),
       -1149530
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1216' AND project_id IS NULL)
);

-- Computer Equipments (1208): cost 2,008,913
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1208' AND project_id IS NULL),
       2008913
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1208' AND project_id IS NULL)
);

-- Acc Depn - Computer Equipments (1217): -1,624,285
INSERT INTO project_opening_balances (id, project_id, account_id, opening_balance)
SELECT gen_random_uuid(), '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65',
       (SELECT id FROM chart_of_accounts WHERE code = '1217' AND project_id IS NULL),
       -1624285
WHERE NOT EXISTS (
  SELECT 1 FROM project_opening_balances
  WHERE project_id = '83e3a2cf-f80a-4e03-a96e-80ad1ed70e65'
    AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '1217' AND project_id IS NULL)
);
