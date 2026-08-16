'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, toInputDate } from '@/lib/format';
import { getVoucherTypeLabelWithLegacy } from '@/lib/voucher-types';

import { BalanceSheet, type ReportRow } from '@/components/reports/BalanceSheet';
import { IncomeExpenditure } from '@/components/reports/IncomeExpenditure';
import { ReceiptsPayments } from '@/components/reports/ReceiptsPayments';
import { FixedAssetSchedule } from '@/components/reports/FixedAssetSchedule';
import { fetchIncomeExpenditureData, type IESection } from '@/lib/income-expenditure-data';
import { fetchBalanceSheetData } from '@/lib/balance-sheet-data';
import { fetchReceiptsPaymentsData } from '@/lib/receipts-payments-data';
import {
  Scale, TrendingUp, Wallet, FileText, BarChart3, Loader2, Printer, Landmark,
} from 'lucide-react';

type ReportType = 'balance_sheet' | 'income_expenditure' | 'receipts_payments' | 'day_book' | 'voucher_register' | 'fixed_assets';

const REPORTS: { id: ReportType; title: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'balance_sheet', title: 'Balance Sheet', description: 'Assets, liabilities and equity position as on a date', icon: Scale },
  { id: 'income_expenditure', title: 'Income & Expenditure', description: 'Income and expenditure for the period', icon: TrendingUp },
  { id: 'receipts_payments', title: 'Receipts & Payments', description: 'Cash receipts and payments summary', icon: Wallet },
  { id: 'fixed_assets', title: 'Fixed Asset & Depreciation', description: 'Category-wise fixed assets and WDV depreciation schedule', icon: Landmark },
  { id: 'day_book', title: 'Day Book', description: 'All transactions by date', icon: FileText },
  { id: 'voucher_register', title: 'Voucher Register', description: 'Complete voucher listing', icon: BarChart3 },
];

const FINANCIAL_REPORTS: ReportType[] = ['balance_sheet', 'income_expenditure', 'receipts_payments'];

export default function ReportsPage() {
  const { activeProject } = useAuth();
  const [active, setActive] = useState<ReportType | null>(null);
  const [to, setTo] = useState(toInputDate(new Date()));
  const [from, setFrom] = useState('');
  const [filterMode, setFilterMode] = useState<'as_on' | 'range'>('as_on');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [ieData, setIeData] = useState<{ income: IESection; expense: IESection; surplusMonth: number; surplusYear: number } | null>(null);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const effectiveFromDate = filterMode === 'range' ? (from || undefined) : undefined;

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    if (m) {
      setFilterMode('range');
      setFrom(`${m}-01`);
      const [y, mo] = m.split('-');
      const lastDay = new Date(parseInt(y), parseInt(mo), 0).getDate();
      setTo(`${m}-${String(lastDay).padStart(2, '0')}`);
    }
  };

  const loadData = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    if (active === 'income_expenditure') {
      const data = await fetchIncomeExpenditureData(to, effectiveFromDate, activeProject?.id);
      setIeData(data);
    } else if (active === 'balance_sheet') {
      // A balance sheet is cumulative as at the selected end date. The range
      // selector must not limit voucher movements to the selected month;
      // otherwise July's opening balances and prior activity disappear and
      // the August report can appear to be a copy of July.
      const rows = await fetchBalanceSheetData(to, activeProject?.id);
      setReportRows(rows);
    } else if (active === 'receipts_payments') {
      const rpFrom = effectiveFromDate || `${new Date(to).getFullYear()}-${String(new Date(to).getMonth() + 1).padStart(2, '0')}-01`;
      const rows = await fetchReceiptsPaymentsData(rpFrom, to, activeProject?.id);
      setReportRows(rows);
    } else {
      let voucherQ = supabase.from('vouchers').select('*, branch: branches!vouchers_branch_id_fkey ( name )').eq('status', 'posted')
        .order('voucher_date', { ascending: true });
      if (activeProject) voucherQ = voucherQ.eq('project_id', activeProject.id);
      if (effectiveFromDate) voucherQ = voucherQ.gte('voucher_date', effectiveFromDate);
      if (to) voucherQ = voucherQ.lte('voucher_date', to);
      const { data: vdata } = await voucherQ;
      setVouchers((vdata ?? []) as any[]);
    }
    setLoading(false);
  }, [active, to, activeProject, effectiveFromDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderDayBook = () => (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2.5">Date</th><th className="px-3 py-2.5">Voucher</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Narration</th><th className="px-3 py-2.5 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vouchers.map((v) => (<tr key={v.id} className="hover:bg-muted/30"><td className="px-4 py-2 text-xs">{formatDate(v.voucher_date)}</td><td className="px-3 py-2 font-mono text-xs">{v.voucher_no}</td><td className="px-3 py-2 text-xs">{getVoucherTypeLabelWithLegacy(v.voucher_type)}</td><td className="max-w-[260px] truncate px-3 py-2 text-xs">{v.narration}</td><td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(v.amount)}</td></tr>))}
          </tbody>
        </table>
        {vouchers.length === 0 && <EmptyState title="No transactions" description="No posted vouchers in the selected period." />}
      </div>
    </Card>
  );

  const renderVoucherRegister = () => (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2.5">Voucher No</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Branch</th><th className="px-3 py-2.5">Narration</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-center">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vouchers.map((v) => (<tr key={v.id} className="hover:bg-muted/30"><td className="px-4 py-2 font-mono text-xs">{v.voucher_no}</td><td className="px-3 py-2 text-xs">{formatDate(v.voucher_date)}</td><td className="px-3 py-2 text-xs">{getVoucherTypeLabelWithLegacy(v.voucher_type)}</td><td className="px-3 py-2 text-xs">{v.branch?.name ?? '-'}</td><td className="max-w-[200px] truncate px-3 py-2 text-xs">{v.narration}</td><td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(v.amount)}</td><td className="px-3 py-2 text-center"><Badge variant="success" className="text-[10px]">{v.status}</Badge></td></tr>))}
          </tbody>
        </table>
        {vouchers.length === 0 && <EmptyState title="No vouchers" description="No posted vouchers in the selected period." />}
      </div>
    </Card>
  );

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

  const activeReport = REPORTS.find((r) => r.id === active);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Financial statements and registers with export to CSV, Excel and print" className="no-print" />

      {!active && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <Card key={r.id} className="cursor-pointer transition-shadow hover:shadow-md" >
              <button onClick={() => setActive(r.id)} className="w-full p-5 text-left">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><r.icon className="h-5 w-5 text-primary" /></div>
                <p className="text-sm font-semibold">{r.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
              </button>
            </Card>
          ))}
        </div>
      )}

      {active && (
        <div className="space-y-4">
          <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setActive(null)}>&larr; All Reports</Button>
            {FINANCIAL_REPORTS.includes(active) ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFilterMode('as_on')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${filterMode === 'as_on' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    {active === 'balance_sheet' ? 'As at' : 'Up to'}
                  </button>
                  <button
                    onClick={() => setFilterMode('range')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${filterMode === 'range' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Range
                  </button>
                </div>
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Month</option>
                  {monthOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                {filterMode === 'as_on' ? (
                  <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setSelectedMonth(''); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
                ) : (
                  <div className="flex items-center gap-1">
                    <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setSelectedMonth(''); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setSelectedMonth(''); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                  </div>
                )}
              </div>
            ) : active === 'fixed_assets' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">As on</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            )}
          </div>

          <Card>
            <CardHeader className="no-print flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{activeReport?.title}</CardTitle>
              <div className="flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button variant="outline" size="sm" onClick={() => window.print()} disabled={loading}>
                  <Printer className="mr-1.5 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <div className="py-12 text-center text-sm text-muted-foreground">Generating report...</div> : (
                <>
                  {active === 'balance_sheet' && <BalanceSheet rows={reportRows} asOnDate={to} projectName={activeProject?.name} />}
                  {active === 'income_expenditure' && ieData && <IncomeExpenditure income={ieData.income} expense={ieData.expense} surplusMonth={ieData.surplusMonth} surplusYear={ieData.surplusYear} toDate={to} />}
                  {active === 'receipts_payments' && <ReceiptsPayments rows={reportRows} toDate={to} />}
                  {active === 'fixed_assets' && <FixedAssetSchedule asOnDate={to} />}
                  {active === 'day_book' && renderDayBook()}
                  {active === 'voucher_register' && renderVoucherRegister()}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
