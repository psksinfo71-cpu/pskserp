'use client';

import { fmtAmt, fmtReportDate } from '@/lib/report-data';
import { ReportHeader } from '@/components/shared/ReportHeader';

export interface ReportRow {
  id: string;
  section: string;
  particulars: string;
  this_month: number;
  this_year: number;
  previous_year: number;
  is_subtotal: boolean;
  sort_order: number;
}

interface Props {
  rows: ReportRow[];
  asOnDate: string;
  projectName?: string;
}

const ASSET_SECTIONS = ['PROPERTY AND ASSETS', 'CURRENT ASSETS'];
const LIABILITY_SECTIONS = ['FUND AND LIABILITIES', 'CURRENT LIABILITIES'];

export function BalanceSheet({ rows, asOnDate, projectName }: Props) {
  const assetRows = rows.filter((r) => ASSET_SECTIONS.includes(r.section));
  const liabilityRows = rows.filter((r) => LIABILITY_SECTIONS.includes(r.section));

  // Grand totals = sum of all section subtotals on each side
  const assetTotal = rows
    .filter((r) => r.is_subtotal && ASSET_SECTIONS.includes(r.section))
    .reduce((s, r) => s + Number(r.this_year), 0);
  const liabilityTotal = rows
    .filter((r) => r.is_subtotal && LIABILITY_SECTIONS.includes(r.section))
    .reduce((s, r) => s + Number(r.this_year), 0);
  const diff = assetTotal - liabilityTotal;

  // The comparative column is the immediately preceding financial year-end.
  // Bangladesh FY runs July 1 through June 30: for July 2026, the prior
  // year-end is June 30, 2026 (not June 30, 2025).
  const asOn = new Date(`${asOnDate}T00:00:00`);
  const month = asOn.getMonth() + 1;
  const comparativeYear = month <= 6 ? asOn.getFullYear() - 1 : asOn.getFullYear();
  const prevYearEnd = `${comparativeYear}-06-30`;

  const groupBySection = (list: ReportRow[]) => {
    const map = new Map<string, ReportRow[]>();
    for (const r of list) {
      const arr = map.get(r.section) ?? [];
      arr.push(r);
      map.set(r.section, arr);
    }
    return map;
  };

  const renderTable = (title: string, list: ReportRow[], grandTotal: number) => {
    const grouped = groupBySection(list);
    const comparativeTotal = list
      .filter((r) => r.is_subtotal)
      .reduce((sum, r) => sum + Number(r.previous_year || 0), 0);
    return (
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-foreground bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide">Particulars</th>
              <th className="w-32 px-3 py-2 text-right text-xs font-bold uppercase">{fmtReportDate(asOnDate)}</th>
              <th className="w-32 px-3 py-2 text-right text-xs font-bold uppercase">{fmtReportDate(prevYearEnd)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="bg-primary/5">
              <td colSpan={3} className="px-3 py-1.5 text-sm font-bold uppercase text-primary">{title}</td>
            </tr>
            {[...grouped.entries()].map(([section, secRows]) => (
              <SectionRows key={section} section={section} rows={secRows} />
            ))}
          </tbody>
          <tfoot className="border-t-2 border-foreground bg-primary/10">
            <tr>
              <td className="px-3 py-2 text-sm font-bold">Total {title}</td>
              <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandTotal)}</td>
              <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(comparativeTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <ReportHeader title={`Balance Sheet as at ${fmtReportDate(asOnDate)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        {renderTable('Property and Assets', assetRows, assetTotal)}
        {renderTable('Fund and Liabilities', liabilityRows, liabilityTotal)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-6 rounded-md border-2 border-foreground bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Total Assets</span>
          <span className="font-mono text-sm font-bold tabular-nums">{fmtAmt(assetTotal)}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Total Liabilities &amp; Fund</span>
          <span className="font-mono text-sm font-bold tabular-nums">{fmtAmt(liabilityTotal)}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className={`flex items-center gap-2 ${diff === 0 ? 'text-success' : 'text-destructive'}`}>
          <span className="text-xs font-semibold uppercase">Difference</span>
          <span className="font-mono text-sm font-bold tabular-nums">{fmtAmt(diff)}</span>
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

function SectionRows({ section, rows }: { section: string; rows: ReportRow[] }) {
  return (
    <>
      <tr className="bg-muted/20">
        <td className="px-3 py-1.5 text-sm font-semibold" colSpan={3}>{section}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.id} className={`hover:bg-muted/20 ${r.is_subtotal ? 'bg-muted/30 font-semibold' : ''}`}>
          <td className={`px-3 py-1.5 text-sm ${r.is_subtotal ? 'font-semibold' : ''}`}>{r.particulars}</td>
          <td className="px-3 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_year))}</td>
          <td className="px-3 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.previous_year))}</td>
        </tr>
      ))}
    </>
  );
}
