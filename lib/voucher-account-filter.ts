import type { ChartAccount, VoucherTypeCode } from "@/lib/types";
import { isBankAccount, isCashAccount } from "@/lib/voucher-types";

export function isLedgerHeadAllowed(
  account: ChartAccount,
  voucherType: VoucherTypeCode,
): boolean {
  if (account.is_group || !account.is_active) return false;

  switch (voucherType) {
    case "BPV":
    case "CPV":
    case "PV":
      return account.account_type === "expense";
    case "BRV":
    case "CRV":
    case "RV":
      return account.account_type === "income";
    case "CV":
      return isCashAccount(account.code) || isBankAccount(account.code);
    case "JV":
      return (
        ["asset", "liability", "equity", "income", "expense"].includes(
          account.account_type,
        ) &&
        !isCashAccount(account.code) &&
        !isBankAccount(account.code)
      );
    default:
      return ["asset", "liability", "equity", "income", "expense"].includes(
        account.account_type,
      );
  }
}

export function getLedgerHeadAccounts(
  accounts: ChartAccount[],
  voucherType: VoucherTypeCode,
): ChartAccount[] {
  return accounts.filter((account) =>
    isLedgerHeadAllowed(account, voucherType),
  );
}
