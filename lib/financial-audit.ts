"use client";

import { supabase } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";

export interface AuditLineInput {
  account_id: string;
  debit: number;
  credit: number;
}

export interface FinancialAuditResult {
  duplicate: boolean;
  varianceAccounts: string[];
  globalImbalance: number;
}

export class VoucherAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoucherAuditError";
  }
}

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const today = (date: string) => date.slice(0, 10);

export async function runFinancialAuditChecks(params: {
  voucherId?: string;
  voucherDate: string;
  amount: number;
  lines: AuditLineInput[];
  userId?: string;
  userEmail?: string;
  mode: "insert" | "update" | "delete";
}): Promise<FinancialAuditResult> {
  const totalDebit = money(
    params.lines.reduce((sum, line) => sum + money(line.debit), 0),
  );
  const totalCredit = money(
    params.lines.reduce((sum, line) => sum + money(line.credit), 0),
  );
  if (params.mode !== "delete" && Math.abs(totalDebit - totalCredit) > 0.001) {
    await logAudit({
      action: "critical_voucher_imbalance",
      table_name: "vouchers",
      record_id: params.voucherId,
      user_id: params.userId,
      user_email: params.userEmail,
      new_values: {
        total_debit: totalDebit,
        total_credit: totalCredit,
        discrepancy: money(totalDebit - totalCredit),
      },
    });
    throw new VoucherAuditError(
      `Voucher imbalance: debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}`,
    );
  }

  const { data: globalRows, error: globalError } = await supabase
    .from("voucher_details")
    .select("debit, credit, voucher:vouchers!inner(status)")
    .eq("voucher.status", "posted");
  if (globalError) throw globalError;
  const globalDebit = money(
    (globalRows ?? []).reduce((sum, row) => sum + Number(row.debit || 0), 0),
  );
  const globalCredit = money(
    (globalRows ?? []).reduce((sum, row) => sum + Number(row.credit || 0), 0),
  );
  const globalImbalance = money(globalDebit - globalCredit);
  if (Math.abs(globalImbalance) > 0.001) {
    await logAudit({
      action: "critical_global_ledger_imbalance",
      table_name: "voucher_details",
      record_id: params.voucherId,
      user_id: params.userId,
      user_email: params.userEmail,
      new_values: {
        total_debit: globalDebit,
        total_credit: globalCredit,
        discrepancy: globalImbalance,
      },
    });
  }

  const accountIds = params.lines.map((line) => line.account_id);
  const { data: duplicates, error: duplicateError } = await supabase
    .from("voucher_details")
    .select(
      "account_id, debit, credit, voucher:vouchers!inner(id, voucher_date, amount, status)",
    )
    .in(
      "account_id",
      accountIds.length ? accountIds : ["00000-0000-0000-0000-000"],
    )
    .eq("voucher.voucher_date", params.voucherDate)
    .eq("voucher.amount", params.amount)
    .neq("voucher.status", "draft");
  if (duplicateError) throw duplicateError;
  const duplicate = (duplicates ?? []).some((row) => {
    const voucher = row.voucher as unknown as { id: string } | { id: string }[];
    const voucherId = Array.isArray(voucher) ? voucher[0]?.id : voucher?.id;
    return Boolean(
      voucherId && (!params.voucherId || voucherId !== params.voucherId),
    );
  });
  if (duplicate) {
    await logAudit({
      action: "warning_duplicate_voucher",
      table_name: "vouchers",
      record_id: params.voucherId,
      user_id: params.userId,
      user_email: params.userEmail,
      new_values: {
        voucher_date: params.voucherDate,
        amount: params.amount,
        account_ids: accountIds,
        message: "Real-time Duplicate Voucher Flagged",
      },
    });
  }

  const varianceAccounts: string[] = [];
  const threeMonthsAgo = new Date(`${params.voucherDate}T00:00:00`);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  for (const accountId of accountIds) {
    const { data: history, error: historyError } = await supabase
      .from("voucher_details")
      .select("debit, credit, voucher:vouchers!inner(voucher_date, status)")
      .eq("account_id", accountId)
      .eq("voucher.status", "posted")
      .gte("voucher.voucher_date", today(threeMonthsAgo.toISOString()))
      .lt("voucher.voucher_date", params.voucherDate);
    if (historyError) throw historyError;
    const amounts = (history ?? [])
      .map((row) => Math.max(Number(row.debit || 0), Number(row.credit || 0)))
      .filter((value) => value > 0);
    const average = amounts.length
      ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length
      : 0;
    if (average > 0 && params.amount > average * 2) {
      varianceAccounts.push(accountId);
      await logAudit({
        action: "warning_expense_variance",
        table_name: "vouchers",
        record_id: params.voucherId,
        user_id: params.userId,
        user_email: params.userEmail,
        new_values: {
          account_id: accountId,
          amount: params.amount,
          historical_average: money(average),
          threshold: money(average * 2),
          message: "Unusual Expense Variance",
        },
      });
    }
  }
  return { duplicate, varianceAccounts, globalImbalance };
}
