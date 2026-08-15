'use client';

import { fmtAmt, fmtReportDate } from '@/lib/report-data';
import { ReportHeader } from '@/components/shared/ReportHeader';
import type { IESection, IERow } from '@/lib/income-expenditure-data';

interface Props {
  income: IESection;
  expense: IESection;
  surplusMonth: number;
  surplusYear: number;
  toDate: string;
}

function renderSection(section: IESection) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-foreground bg-muted/50">
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide">Particulars</th>
            <th className="w-28 px-2 py-2 text-right text-xs font-bold uppercase">This Month</th>
            <th className="w-28 px-2 py-2 text-right text-xs font-bold uppercase">This Year</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr className="bg-primary/5">
            <td colSpan={3} className="px-3 py-1.5 text-sm font-bold uppercase text-primary">{section.title}</td>
          </tr>
          {section.rows.length === 0 ? (
            <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">No transactions for this period</td></tr>
          ) : (
            section.rows.map((r: IERow, i: number) => {
              if (r.is_group_header) {
                return (
                  <tr key={i} className="bg-muted/30">
                    <td className="px-3 py-1.5 pl-6 text-sm font-semibold" colSpan={3}>{r.particulars}</td>
                  </tr>
                );
              }
              if (r.is_subtotal) {
                return (
                  <tr key={i} className="bg-muted/20 border-t border-border">
                    <td className="px-3 py-1.5 pl-6 text-sm font-semibold italic">{r.particulars}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(r.this_month)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(r.this_year)}</td>
                  </tr>
                );
              }
              return (
                <tr key={i} className="hover:bg-muted/10">
                  <td className="px-3 py-1.5 pl-10 text-sm">{r.particulars}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(r.this_month)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(r.this_year)}</td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot className="border-t-2 border-foreground bg-primary/10">
          <tr>
            <td className="px-3 py-2 text-sm font-bold">Total {section.title}</td>
            <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(section.totalMonth)}</td>
            <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(section.totalYear)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function IncomeExpenditure({ income, expense, surplusMonth, surplusYear, toDate }: Props) {
  return (
    <div className="space-y-4">
      <ReportHeader title={`Income & Expenditure Account — For the period up to ${fmtReportDate(toDate)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        {renderSection(income)}
        {renderSection(expense)}
      </div>
      <div className={`flex items-center justify-between rounded-md border-2 px-4 py-3 ${surplusYear >= 0 ? 'border-success bg-success/5' : 'border-destructive bg-destructive/5'}`}>
        <span className="text-sm font-bold">
          {surplusYear >= 0 ? 'Excess of Income over Expenditure' : 'Excess of Expenditure over Income'}
        </span>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">This Month</p>
            <p className={`font-mono text-sm font-bold tabular-nums ${surplusMonth >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtAmt(Math.abs(surplusMonth))}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">This Year</p>
            <p className={`font-mono text-sm font-bold tabular-nums ${surplusYear >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtAmt(Math.abs(surplusYear))}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-between px-6 pt-4 text-xs text-muted-foreground">
        <div>
          <p>Md. Mizanur Rahman</p>
          <p>Deputy Director (Finance)</p>
        </div>
        <div className="text-right">
          <p>Md. Kamruzzaman</p>
          <p>Deputy Executive Director</p>
        </div>
      </div>
    </div>
  );
}
