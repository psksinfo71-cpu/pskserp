/*
# Remove seeded General Fund vouchers and set opening balances

## Purpose
The previously-seeded GF-* vouchers are being removed per user request.
The user will enter vouchers manually starting from the current July period.
The three financial reports (Balance Sheet, Receipts & Payments, Income &
Expenditure) remain unchanged — they read from financial_report_data, not
from vouchers.

## Changes
1. Deletes all voucher_details and vouchers with voucher_no starting with
   'GF-' (the seeded vouchers only). Any user-created vouchers are untouched.
2. Sets opening balances on cash/bank accounts:
   - Cash in Hand (1001): 34,704  (R&P closing Cash in Hand)
   - Sonali Bank (10021): 761,979 (Balance Sheet Cash & Bank minus Cash in Hand)
   - Bangladesh Krishi Bank (10022): 0
   Total bank opening = 761,979, matching the Balance Sheet's
   "Cash and Bank Balance" of 796,683 (= 34,704 + 761,979).
3. Sets FDR (1003) opening balance to 2,340,225 (Balance Sheet FDR figure).
4. Removes the helper function created in the previous migration.

## Notes
- The user can adjust bank opening balances per-bank via Chart of Accounts
  if the split between Sonali and Krishi needs to differ.
- Cash Book and Bank Book will now show only the opening balance plus any
  vouchers the user enters going forward.
*/

-- 1. Delete seeded GF-* voucher details and vouchers
DELETE FROM voucher_details
WHERE voucher_id IN (SELECT id FROM vouchers WHERE voucher_no LIKE 'GF-%');

DELETE FROM vouchers WHERE voucher_no LIKE 'GF-%';

-- 2. Remove helper function from previous migration
DROP FUNCTION IF EXISTS make_general_fund_voucher(text, text, date, text, numeric, text, text, uuid, uuid, uuid);

-- 3. Set opening balances
UPDATE chart_of_accounts SET opening_balance = 34704 WHERE code = '1001';
UPDATE chart_of_accounts SET opening_balance = 761979 WHERE code = '10021';
UPDATE chart_of_accounts SET opening_balance = 0 WHERE code = '10022';
UPDATE chart_of_accounts SET opening_balance = 2340225 WHERE code = '1003';
