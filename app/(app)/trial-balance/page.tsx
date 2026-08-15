'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { ReportToolbar } from '@/components/shared/ReportToolbar';
import { getTrialBalance, type TrialBalanceRow } from '@/lib/queries';
import { formatCurrency, toInputDate } from '@/lib/format';
import { printReport } from '@/lib/export';
import { Scale, Loader2 } from 'lucide-react';
export default function TrialBalancePage() {
  const { activeProject } = useAuth();
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'as_on' | 'range'>('as_on');
  const [asOnDate, setAsOnDate] = useState(toInputDate(new Date()));
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(toInputDate(new Date()));
  const [selectedMonth, setSelectedMonth] = useState('');

  const effectiveRange = filterMode === 'as_on'
    ? { to: asOnDate }
    : { from: fromDate || undefined, to: toDate };

  useEffect(() => {
    setLoading(true);
    getTrialBalance(activeProject?.id, effectiveRange)
      .then((r) => { setRows(r.rows); setTotalDebit(r.totalDebit); setTotalCredit(r.totalCredit); })
      .finally(() => setLoading(false));
  }, [activeProject, filterMode, asOnDate, fromDate, toDate, selectedMonth]);

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    if (m) {
      setFilterMode('range');
      setFromDate(`${m}-01`);
      const [y, mo] = m.split('-');
      const lastDay = new Date(parseInt(y), parseInt(mo), 0).getDate();
      setToDate(`${m}-${String(lastDay).padStart(2, '0')}`);
    }
  };

  const headers = ['Code', 'Account', 'Type', 'Debit', 'Credit'];
  const exportRows = rows.map((r) => [r.account.code, r.account.name, r.account.account_type, r.debit.toFixed(2), r.credit.toFixed(2)]);

  const dateLabel = filterMode === 'as_on'
    ? `As at ${new Date(asOnDate).toLocaleDateString()}`
    : `For ${fromDate ? new Date(fromDate).toLocaleDateString() : 'start'} to ${new Date(toDate).toLocaleDateString()}`;

  const handlePrint = () => {
    const body = `<h1>Trial Balance</h1><div class="meta">${dateLabel}</div>
      <table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.account.code}</td><td>${r.account.name}</td><td>${r.account.account_type}</td><td class="right">${formatCurrency(r.debit)}</td><td class="right">${formatCurrency(r.credit)}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="totals"><td colspan="3">Total</td><td class="right">${formatCurrency(totalDebit)}</td><td class="right">${formatCurrency(totalCredit)}</td></tr></tfoot></table>`;
    printReport('Trial Balance', body);
  };

  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ value: v, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description="Balanced debit and credit totals across all active accounts"
        actions={!loading && <ReportToolbar title="Trial Balance" headers={headers} rows={exportRows} onPrint={handlePrint} />}
      />

      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterMode('as_on')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${filterMode === 'as_on' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              As on Date
            </button>
            <button
              onClick={() => setFilterMode('range')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${filterMode === 'range' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              Date Range
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select Month</option>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {filterMode === 'as_on' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">As at</span>
                <input type="date" value={asOnDate} onChange={(e) => { setAsOnDate(e.target.value); setSelectedMonth(''); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setSelectedMonth(''); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setSelectedMonth(''); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Scale className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No posted transactions in this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">Account Name</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Debit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.account.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{r.account.code}</td>
                    <td className="px-3 py-2 font-medium">{r.account.name}</td>
                    <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{r.account.account_type}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.debit ? formatCurrency(r.debit) : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.credit ? formatCurrency(r.credit) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/50">
                <tr className="font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Total</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalDebit)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
