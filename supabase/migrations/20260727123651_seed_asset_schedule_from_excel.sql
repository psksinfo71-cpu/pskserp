-- Seed the 9 asset categories with exact values from Fixed_asset_and_depriciation_Final.xlsx
-- VALUE AT COST: Opening Balance 01.07.2025, Transferred from Project, Addition for Year, Adjustment for Year
-- Total Cost 30.06.2026 = opening + transferred + addition + adjustment
-- DEPRECIATION: Opening Balance 30.06.2025, Transferred from Project, For the Year, Adjustment
-- Accumulated 30.06.2026 = opening + transferred + for_year + adjustment

UPDATE asset_categories SET
  opening_cost = 472082, transferred_cost = 0, addition_cost = 0, adjustment_cost = 0,
  opening_depn = 0, transferred_depn = 0, depn_for_year = 0, adjustment_depn = 0
WHERE code = 'LAND';

UPDATE asset_categories SET
  opening_cost = 9405860, transferred_cost = 0, addition_cost = 0, adjustment_cost = 0,
  opening_depn = 8534414, transferred_depn = 0, depn_for_year = 43572, adjustment_depn = 0
WHERE code = 'BLDG';

UPDATE asset_categories SET
  opening_cost = 2109641, transferred_cost = 275629, addition_cost = 0, adjustment_cost = 17565,
  opening_depn = 1245412, transferred_depn = 66359, depn_for_year = 86423, adjustment_depn = 11127
WHERE code = 'FURN';

UPDATE asset_categories SET
  opening_cost = 2646442, transferred_cost = 1149209, addition_cost = 251261, adjustment_cost = 716224,
  opening_depn = 1785286, transferred_depn = 274289, depn_for_year = 91577, adjustment_depn = 283555
WHERE code = 'OFFE';

UPDATE asset_categories SET
  opening_cost = 231696, transferred_cost = 0, addition_cost = 0, adjustment_cost = 0,
  opening_depn = 230605, transferred_depn = 0, depn_for_year = 164, adjustment_depn = 0
WHERE code = 'HUSK';

UPDATE asset_categories SET
  opening_cost = 69267, transferred_cost = 0, addition_cost = 0, adjustment_cost = 0,
  opening_depn = 65429, transferred_depn = 0, depn_for_year = 959, adjustment_depn = 0
WHERE code = 'BOOK';

UPDATE asset_categories SET
  opening_cost = 1119400, transferred_cost = 600000, addition_cost = 0, adjustment_cost = 400000,
  opening_depn = 1100138, transferred_depn = 225600, depn_for_year = 1926, adjustment_depn = 178134
WHERE code = 'VEHI';

UPDATE asset_categories SET
  opening_cost = 1848459, transferred_cost = 253412, addition_cost = 0, adjustment_cost = 92958,
  opening_depn = 1475176, transferred_depn = 146979, depn_for_year = 93321, adjustment_depn = 91191
WHERE code = 'COMP';

UPDATE asset_categories SET
  opening_cost = 0, transferred_cost = 0, addition_cost = 0, adjustment_cost = 0,
  opening_depn = 0, transferred_depn = 0, depn_for_year = 0, adjustment_depn = 0
WHERE code = 'MEDI';