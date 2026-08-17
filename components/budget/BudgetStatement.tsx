"use client";

import type { BudgetWithActual } from "@/lib/budget-data";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Plus } from "lucide-react";

interface Props {
  rows: BudgetWithActual[];
  fyName: string;
  projectName: string;
  printDate: string;
  canManage?: boolean;
  onAdd?: (accountType: "income" | "expense") => void;
  onEdit?: (row: BudgetWithActual) => void;
  onDelete?: (row: BudgetWithActual) => void;
}

export function BudgetStatement({
  rows,
  fyName,
  projectName,
  printDate,
  canManage = false,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  const sortByCode = (a: BudgetWithActual, b: BudgetWithActual) =>
    (a.account_code ?? "").localeCompare(b.account_code ?? "", undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    (a.account_name ?? "").localeCompare(b.account_name ?? "", undefined, {
      sensitivity: "base",
    });
  const income = rows
    .filter((row) => row.account_type === "income")
    .sort(sortByCode);
  const expenditure = rows
    .filter((row) => row.account_type !== "income")
    .sort(sortByCode);
  const total = (
    items: BudgetWithActual[],
    field: "amount" | "actual" | "prev_year_actual",
  ) => items.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
  const incomePrevious = total(income, "prev_year_actual");
  const incomeBudget = total(income, "amount");
  const expenditurePrevious = total(expenditure, "prev_year_actual");
  const expenditureBudget = total(expenditure, "amount");
  const tableRows = (items: BudgetWithActual[]) =>
    items.map((row, index) => (
      <tr
        key={`${row.account_id ?? row.account_code}-${index}`}
        className="border-b border-black/70"
      >
        <td className="px-2 py-1 text-xs font-mono">
          {row.account_code ?? ""}
        </td>
        <td className="px-2 py-1 text-sm">{row.account_name ?? ""}</td>
        <td className="px-2 py-1 text-right font-mono text-sm">
          {formatCurrency(row.prev_year_actual)}
        </td>
        <td className="px-2 py-1 text-right font-mono text-sm">
          {formatCurrency(row.amount)}
        </td>
        {canManage && (
          <td className="w-20 px-1 py-1 print:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onEdit?.(row)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => onDelete?.(row)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </td>
        )}
      </tr>
    ));
  return (
    <Card className="overflow-hidden border-2 border-foreground bg-white text-black shadow-none">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="w-[12%] border-r border-black px-2 py-3 text-left text-sm font-bold">
                Code
              </th>
              <th className="w-[48%] border-r border-black px-2 py-3 text-left text-sm font-bold">
                PARTICULARS
              </th>
              <th className="w-[20%] border-r border-black px-2 py-3 text-center text-sm font-bold">
                Income &amp; Expenditure
                <br />
                {fyName || "2025-2026"}
              </th>
              <th className="w-[20%] px-2 py-3 text-center text-sm font-bold">
                BUDGET
                <br />
                2026-2027
              </th>
              {canManage && (
                <th className="w-20 px-2 py-3 print:hidden">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black bg-muted/40">
              <td colSpan={canManage ? 5 : 4} className="px-2 py-1 font-bold">
                INCOME:{" "}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-3 h-7 border-primary px-2 text-primary print:hidden"
                    onClick={() => onAdd?.("income")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add Income
                  </Button>
                )}
              </td>
            </tr>
            {tableRows(income)}
            <tr className="border-b-2 border-black font-bold">
              <td colSpan={2} className="px-2 py-1 text-right">
                Total Taka:
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatCurrency(incomePrevious)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatCurrency(incomeBudget)}
              </td>
            </tr>
            <tr className="border-b border-black bg-muted/40">
              <td colSpan={canManage ? 5 : 4} className="px-2 py-1 font-bold">
                EXPENDITURE{" "}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-3 h-7 border-primary px-2 text-primary print:hidden"
                    onClick={() => onAdd?.("expense")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add Expenditure
                  </Button>
                )}
              </td>
            </tr>
            {tableRows(expenditure)}
            <tr className="border-b-2 border-black font-bold">
              <td colSpan={2} className="px-2 py-1 text-right">
                Total Expenditure :
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatCurrency(expenditurePrevious)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatCurrency(expenditureBudget)}
              </td>
            </tr>
            <tr className="border-b border-black">
              <td colSpan={2} className="px-2 py-2">
                Surplus/(Deficit) of Income over Expenditure
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {formatCurrency(incomePrevious - expenditurePrevious)}
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {formatCurrency(incomeBudget - expenditureBudget)}
              </td>
            </tr>
            <tr className="font-bold">
              <td colSpan={2} className="px-2 py-2 text-right">
                Total Taka :
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {formatCurrency(incomePrevious)}
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {formatCurrency(incomeBudget)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground print:hidden">
        {projectName} · {fyName} · Printed {printDate}
      </div>
    </Card>
  );
}
