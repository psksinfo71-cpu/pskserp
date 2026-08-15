'use client';

import { formatCurrency, formatDateTime } from '@/lib/format';
import { exportToExcel, printReport } from '@/lib/export';
import type { BudgetWithActual } from '@/lib/budget-data';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Printer } from 'lucide-react';

interface Props {
  rows: BudgetWithActual[];
  totalBudget: number;
  totalActual: number;
  fyName: string;
  projectName: string;
  versionLabel: string;
  printDate: string;
}

function variancePctStr(pct: number | null): string {
  if (pct === null) return 'N/A';
  return `${pct >= 0 ? '' : ''}${pct.toFixed(1)}%`;
}

export function BudgetVsActual({ rows, totalBudget, totalActual, fyName, projectName, versionLabel, printDate }: Props) {
  const totalVariance = totalBudget - totalActual;
  const totalVariancePct = totalBudget === 0 ? null : (totalVariance / totalBudget) * 100;

  const headers = ['Particulars', 'Code', 'Budget', 'Actual', 'Variance', 'Variance %'];
  const exportRows = rows.map((r) => [
    r.account_name ?? '',
    r.account_code ?? '',
    r.amount.toFixed(2),
    r.actual.toFixed(2),
    r.variance.toFixed(2),
    r.variance_pct === null ? 'N/A' : `${r.variance_pct.toFixed(1)}%`,
  ]);
  exportRows.push(['TOTAL', '', totalBudget.toFixed(2), totalActual.toFixed(2), totalVariance.toFixed(2), totalVariancePct === null ? 'N/A' : `${totalVariancePct.toFixed(1)}%`]);

  const handlePrint = () => {
    const body = `
      <div class="org-header">
        <h1>Palashipara Samaj Kallayan Samity (PSKS)</h1>
        <p>Fund/Project: ${projectName} &middot; Fiscal Year: ${fyName} &middot; Version: ${versionLabel}</p>
        <p>Budget vs Actual Report &middot; Printed: ${formatDateTime(printDate)}</p>
      </div>
      <table>
        <thead><tr><th>Particulars</th><th>Code</th><th class="right">Budget</th><th class="right">Actual</th><th class="right">Variance</th><th class="right">Variance %</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${r.account_name ?? ''}</td><td>${r.account_code ?? ''}</td>
            <td class="right">${formatCurrency(r.amount)}</td>
            <td class="right">${formatCurrency(r.actual)}</td>
            <td class="right" style="color:${r.variance >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(r.variance)}</td>
            <td class="right">${r.variance_pct === null ? 'N/A' : r.variance_pct.toFixed(1) + '%'}</td>
          </tr>`).join('')}
          <tr class="totals">
            <td colspan="2">GRAND TOTAL</td>
            <td class="right">${formatCurrency(totalBudget)}</td>
            <td class="right">${formatCurrency(totalActual)}</td>
            <td class="right" style="color:${totalVariance >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(totalVariance)}</td>
            <td class="right">${totalVariancePct === null ? 'N/A' : totalVariancePct.toFixed(1) + '%'}</td>
          </tr>
        </tbody>
      </table>`;
    printReport('Budget vs Actual', body);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => exportToExcel('budget_vs_actual', headers, exportRows)}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-1.5 h-4 w-4" /> Print / PDF
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/30 px-4 py-3 text-center">
          <p className="text-sm font-bold">Palashipara Samaj Kallayan Samity (PSKS)</p>
          <p className="text-xs text-muted-foreground">Fund: {projectName} &middot; FY: {fyName} &middot; Version: {versionLabel}</p>
          <p className="text-xs text-muted-foreground">Budget vs Actual Report &middot; {formatDateTime(printDate)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-2 border-border bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Particulars</th>
                <th className="px-2 py-2 text-left font-semibold">Code</th>
                <th className="px-3 py-2 text-right font-semibold">Budget</th>
                <th className="px-3 py-2 text-right font-semibold">Actual</th>
                <th className="px-3 py-2 text-right font-semibold">Variance</th>
                <th className="px-3 py-2 text-right font-semibold">Variance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No budget data found for the selected filters</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/10">
                    <td className="px-3 py-1.5">{r.account_name ?? '—'}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{r.account_code ?? ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCurrency(r.actual)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-medium ${r.variance >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(r.variance)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">
                      {variancePctStr(r.variance_pct)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-t-2 border-foreground bg-primary/10">
              <tr className="font-bold">
                <td className="px-3 py-2.5" colSpan={2}>GRAND TOTAL</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(totalBudget)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCurrency(totalActual)}</td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${totalVariance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(totalVariance)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-xs">
                  {variancePctStr(totalVariancePct)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
