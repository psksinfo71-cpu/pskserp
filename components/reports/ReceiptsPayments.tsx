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
  toDate: string;
}

export function ReceiptsPayments({ rows, toDate }: Props) {
  const openingRows = rows.filter((r) => r.section === 'OPENING BALANCE' && !r.is_subtotal);
  const openingTotal = rows.find((r) => r.section === 'OPENING BALANCE' && r.is_subtotal);
  const receiptRows = rows.filter((r) => r.section === 'RECEIPTS' && !r.is_subtotal);
  const receiptTotal = rows.find((r) => r.section === 'RECEIPTS' && r.is_subtotal);
  const paymentRows = rows.filter((r) => r.section === 'PAYMENTS' && !r.is_subtotal);
  const paymentTotal = rows.find((r) => r.section === 'PAYMENTS' && r.is_subtotal);
  const closingRows = rows.filter((r) => r.section === 'CLOSING BALANCE' && !r.is_subtotal);
  const closingTotal = rows.find((r) => r.section === 'CLOSING BALANCE' && r.is_subtotal);

  const openMonth = Number(openingTotal?.this_month ?? 0);
  const openYear = Number(openingTotal?.this_year ?? 0);
  const recvMonth = Number(receiptTotal?.this_month ?? 0);
  const recvYear = Number(receiptTotal?.this_year ?? 0);
  const payMonth = Number(paymentTotal?.this_month ?? 0);
  const payYear = Number(paymentTotal?.this_year ?? 0);
  const closeMonth = Number(closingTotal?.this_month ?? 0);
  const closeYear = Number(closingTotal?.this_year ?? 0);

  const grandReceiptMonth = openMonth + recvMonth;
  const grandReceiptYear = openYear + recvYear;
  const grandPaymentMonth = payMonth + closeMonth;
  const grandPaymentYear = payYear + closeYear;

  const renderColumn = (
    title: string,
    list: ReportRow[],
    mTotal: number,
    yTotal: number,
    showOpening?: boolean,
    showClosing?: boolean,
  ) => (
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
          <tr className="bg-primary/5"><td colSpan={3} className="px-3 py-1.5 text-sm font-bold uppercase text-primary">{title}</td></tr>
          {showOpening && (
            <>
              <tr className="bg-muted/20"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">Opening Balance</td></tr>
              {openingRows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-sm">{r.particulars}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_month))}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_year))}</td>
                </tr>
              ))}
              <tr className="bg-muted/30">
                <td className="px-3 py-1.5 text-sm font-semibold">To Balance b/d (Opening)</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(openMonth)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(openYear)}</td>
              </tr>
            </>
          )}
          {list.map((r) => (
            <tr key={r.id} className="hover:bg-muted/20">
              <td className="px-3 py-1.5 text-sm">{r.particulars}</td>
              <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_month))}</td>
              <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_year))}</td>
            </tr>
          ))}
          {showClosing && (
            <>
              <tr className="bg-muted/30">
                <td className="px-3 py-1.5 text-sm font-semibold">By Balance c/d (Closing)</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(closeMonth)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(closeYear)}</td>
              </tr>
              <tr className="bg-muted/20"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">Closing Balance</td></tr>
              {closingRows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-sm">{r.particulars}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_month))}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">{fmtAmt(Number(r.this_year))}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
        <tfoot className="border-t-2 border-foreground bg-primary/10">
          <tr>
            <td className="px-3 py-2 text-sm font-bold">Total</td>
            <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(mTotal)}</td>
            <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(yTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <ReportHeader title="Receipts & Payments Account" />
      <p className="text-center text-sm text-muted-foreground">For the period up to {fmtReportDate(toDate)}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {renderColumn('Receipts', receiptRows, grandReceiptMonth, grandReceiptYear, true, false)}
        {renderColumn('Payments', paymentRows, grandPaymentMonth, grandPaymentYear, false, true)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-6 rounded-md border-2 border-foreground bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Opening Balance</span>
          <span className="font-mono text-sm font-bold tabular-nums">{fmtAmt(openYear)}</span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Closing Balance</span>
          <span className="font-mono text-sm font-bold tabular-nums text-primary">{fmtAmt(closeYear)}</span>
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
