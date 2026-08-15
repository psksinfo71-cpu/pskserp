'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ChartAccount } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { can } from '@/lib/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/EmptyState';
import { printReport } from '@/lib/export';
import { fetchProjectOpeningBalances, resolveOpening } from '@/lib/opening-balances';
import { Loader2, Scale, TrendingUp, Wallet, FileText, Building2, ArrowLeft, Printer } from 'lucide-react';

type ReportType = 'trial_balance' | 'income_expenditure' | 'balance_sheet' | 'cash_book' | 'bank_book' | 'day_book';

interface ConsolidatedRow {
  account: ChartAccount;
  totalDebit: number;
  totalCredit: number;
  opening: number;
  net: number;
}

export default function ConsolidatedReportsPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [active, setActive] = useState<ReportType | null>(null);
  const [rows, setRows] = useState<ConsolidatedRow[]>([]);
  const [dayBookRows, setDayBookRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => {
      setProjects(data ?? []);
      if (data && data[0]) setProjectId(data[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!projectId || !active) return;
    setLoading(true);

    const { data: offices } = await supabase
      .from('branches')
      .select('id')
      .eq('project_id', projectId);

    const officeIds = (offices ?? []).map((o: any) => o.id);
    const { data: hoOffices } = await supabase
      .from('branches')
      .select('id')
      .eq('office_type', 'head_office');
    const allOfficeIds = [...officeIds, ...(hoOffices ?? []).map((o: any) => o.id)];

    if (allOfficeIds.length === 0) {
      setRows([]); setDayBookRows([]); setLoading(false); return;
    }

    if (active === 'day_book') {
      let vq = supabase
        .from('vouchers')
        .select('*, branch: branches!vouchers_branch_id_fkey ( name ), details: voucher_details ( account: chart_of_accounts ( code, name ), debit, credit )')
        .eq('status', 'posted')
        .in('branch_id', allOfficeIds)
        .order('voucher_date', { ascending: true });
      if (from) vq = vq.gte('voucher_date', from);
      if (to) vq = vq.lte('voucher_date', to);
      const { data } = await vq;
      setDayBookRows(data ?? []);
      setLoading(false);
      return;
    }

    let vdq = supabase
      .from('voucher_details')
      .select(`
        debit, credit,
        account: chart_of_accounts!inner ( id, code, name, account_type, is_group, opening_balance, parent_id ),
        voucher: vouchers!inner ( status, voucher_date, branch_id )
      `)
      .eq('voucher.status', 'posted')
      .in('voucher.branch_id', allOfficeIds);
    if (from) vdq = vdq.gte('voucher.voucher_date', from);
    if (to) vdq = vdq.lte('voucher.voucher_date', to);
    const { data: details } = await vdq;

    const accountMap = new Map<string, ConsolidatedRow>();
    const projectOB = await fetchProjectOpeningBalances(projectId);
    for (const d of details ?? []) {
      const acc = d.account as unknown as ChartAccount;
      if (!acc || acc.is_group) continue;
      if (!accountMap.has(acc.id)) {
        const opening = resolveOpening(acc.id, Number(acc.opening_balance) || 0, projectOB);
        accountMap.set(acc.id, { account: acc, totalDebit: 0, totalCredit: 0, opening, net: 0 });
      }
      const row = accountMap.get(acc.id)!;
      row.totalDebit += Number(d.debit) || 0;
      row.totalCredit += Number(d.credit) || 0;
    }

    for (const row of accountMap.values()) {
      const isDebitNature = ['asset', 'expense'].includes(row.account.account_type);
      row.net = isDebitNature
        ? row.opening + row.totalDebit - row.totalCredit
        : row.opening + row.totalCredit - row.totalDebit;
    }

    const allRows = [...accountMap.values()].sort((a, b) => a.account.code.localeCompare(b.account.code));
    setRows(allRows);
    setLoading(false);
  }, [projectId, active, from, to]);

  useEffect(() => { load(); }, [load]);

  if (!can(role, 'view_consolidated')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Consolidated Reports" description="Project-wide financial consolidation across all offices" />
        <EmptyState icon={Scale} title="Access restricted" description="You need permission to view consolidated reports." />
      </div>
    );
  }

  const REPORTS: { id: ReportType; title: string; icon: any }[] = [
    { id: 'trial_balance', title: 'Consolidated Trial Balance', icon: Scale },
    { id: 'income_expenditure', title: 'Consolidated Income & Expenditure', icon: TrendingUp },
    { id: 'balance_sheet', title: 'Consolidated Balance Sheet', icon: FileText },
    { id: 'cash_book', title: 'Consolidated Cash Book', icon: Wallet },
    { id: 'bank_book', title: 'Consolidated Bank Book', icon: Building2 },
    { id: 'day_book', title: 'Consolidated Day Book', icon: FileText },
  ];

  const trialBalanceRows = rows.filter((r) => r.net !== 0);
  const totalDebit = trialBalanceRows.reduce((s, r) => {
    const isDebitNature = ['asset', 'expense'].includes(r.account.account_type);
    return s + (isDebitNature ? Math.max(r.net, 0) : Math.max(-r.net, 0));
  }, 0);
  const totalCredit = trialBalanceRows.reduce((s, r) => {
    const isDebitNature = ['asset', 'expense'].includes(r.account.account_type);
    return s + (isDebitNature ? Math.max(-r.net, 0) : Math.max(r.net, 0));
  }, 0);

  const incomeRows = rows.filter((r) => r.account.account_type === 'income' && (r.totalCredit - r.totalDebit) !== 0);
  const expenseRows = rows.filter((r) => r.account.account_type === 'expense' && (r.totalDebit - r.totalCredit) !== 0);
  const totalIncome = incomeRows.reduce((s, r) => s + (r.totalCredit - r.totalDebit), 0);
  const totalExpense = expenseRows.reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);

  const assetRows = rows.filter((r) => r.account.account_type === 'asset' && r.net !== 0);
  const liabilityRows = rows.filter((r) => r.account.account_type === 'liability' && r.net !== 0);
  const equityRows = rows.filter((r) => r.account.account_type === 'equity' && r.net !== 0);
  const totalAssets = assetRows.reduce((s, r) => s + r.net, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + Math.abs(r.net), 0);
  const totalEquity = equityRows.reduce((s, r) => s + r.net, 0);

  const cashRows = rows.filter((r) => r.account.code === '1001');
  const bankRows = rows.filter((r) => ['10021', '10022'].includes(r.account.code));

  const handlePrint = () => {
    const projName = projects.find((p) => p.id === projectId)?.name ?? '';
    const title = `Consolidated ${activeReport?.title ?? ''} - ${projName}`;
    let body = '';
    if (active === 'trial_balance') {
      body = `<table><thead><tr><th>Code</th><th>Account</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead><tbody>
        ${trialBalanceRows.map((r) => `<tr><td>${r.account.code}</td><td>${r.account.name}</td><td class="right">${r.net > 0 ? formatCurrency(r.net) : ''}</td><td class="right">${r.net < 0 ? formatCurrency(-r.net) : ''}</td></tr>`).join('')}
        <tr class="totals"><td colspan="2">Total</td><td class="right">${formatCurrency(totalDebit)}</td><td class="right">${formatCurrency(totalCredit)}</td></tr></tbody></table>`;
    } else if (active === 'income_expenditure') {
      body = `<table><thead><tr><th>Particulars</th><th class="right">Amount</th></tr></thead><tbody>
        <tr><td colspan="2"><b>Income</b></td></tr>
        ${incomeRows.map((r) => `<tr><td>${r.account.name}</td><td class="right">${formatCurrency(r.totalCredit - r.totalDebit)}</td></tr>`).join('')}
        <tr class="totals"><td>Total Income</td><td class="right">${formatCurrency(totalIncome)}</td></tr>
        <tr><td colspan="2"><b>Expenditure</b></td></tr>
        ${expenseRows.map((r) => `<tr><td>${r.account.name}</td><td class="right">${formatCurrency(r.totalDebit - r.totalCredit)}</td></tr>`).join('')}
        <tr class="totals"><td>Total Expenditure</td><td class="right">${formatCurrency(totalExpense)}</td></tr>
        <tr class="totals"><td>Surplus / (Deficit)</td><td class="right">${formatCurrency(totalIncome - totalExpense)}</td></tr></tbody></table>`;
    } else if (active === 'balance_sheet') {
      body = `<table><thead><tr><th>Particulars</th><th class="right">Amount</th></tr></thead><tbody>
        <tr><td colspan="2"><b>Assets</b></td></tr>
        ${assetRows.map((r) => `<tr><td>${r.account.name}</td><td class="right">${formatCurrency(r.net)}</td></tr>`).join('')}
        <tr class="totals"><td>Total Assets</td><td class="right">${formatCurrency(totalAssets)}</td></tr>
        <tr><td colspan="2"><b>Liabilities</b></td></tr>
        ${liabilityRows.map((r) => `<tr><td>${r.account.name}</td><td class="right">${formatCurrency(Math.abs(r.net))}</td></tr>`).join('')}
        <tr class="totals"><td>Total Liabilities</td><td class="right">${formatCurrency(totalLiabilities)}</td></tr>
        <tr><td colspan="2"><b>Equity</b></td></tr>
        ${equityRows.map((r) => `<tr><td>${r.account.name}</td><td class="right">${formatCurrency(r.net)}</td></tr>`).join('')}
        <tr class="totals"><td>Total Equity</td><td class="right">${formatCurrency(totalEquity)}</td></tr></tbody></table>`;
    }
    printReport(title, body);
  };

  const activeReport = REPORTS.find((r) => r.id === active);

  return (
    <div className="space-y-6">
      <PageHeader title="Consolidated Reports" description="Automatic monthly consolidation across Head Office and Project Offices" />

      {!active && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {REPORTS.map((r) => (
              <Card key={r.id} className="cursor-pointer transition-shadow hover:shadow-md">
                <button onClick={() => setActive(r.id)} className="w-full p-5 text-left">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><r.icon className="h-5 w-5 text-primary" /></div>
                  <p className="text-sm font-semibold">{r.title}</p>
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {active && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setActive(null)}><ArrowLeft className="mr-1 h-4 w-4" /> All Reports</Button>
            <div className="flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading}><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
            </div>
          </div>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{activeReport?.title}</h3>
              <div className="text-xs text-muted-foreground">
                {projects.find((p) => p.id === projectId)?.name}
                {from && ` · ${formatDate(from)}`}
                {to && ` → ${formatDate(to)}`}
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Generating consolidated report...</div>
            ) : active === 'trial_balance' && trialBalanceRows.length > 0 ? (
              <ReportTable headers={['Code', 'Account', 'Debit', 'Credit']}>
                {trialBalanceRows.map((r) => (
                  <tr key={r.account.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{r.account.code}</td>
                    <td className="px-3 py-2 text-xs">{r.account.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.net > 0 ? formatCurrency(r.net) : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.net < 0 ? formatCurrency(-r.net) : '-'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalDebit)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalCredit)}</td>
                </tr>
              </ReportTable>
            ) : active === 'income_expenditure' ? (
              <div className="space-y-4">
                <ReportSection title="Income">
                  {incomeRows.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">No income recorded</p> : incomeRows.map((r) => (
                    <tr key={r.account.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs">{r.account.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-success">{formatCurrency(r.totalCredit - r.totalDebit)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5 text-xs">Total Income</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{formatCurrency(totalIncome)}</td>
                  </tr>
                </ReportSection>
                <ReportSection title="Expenditure">
                  {expenseRows.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">No expenditure recorded</p> : expenseRows.map((r) => (
                    <tr key={r.account.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs">{r.account.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-destructive">{formatCurrency(r.totalDebit - r.totalCredit)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5 text-xs">Total Expenditure</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{formatCurrency(totalExpense)}</td>
                  </tr>
                  <tr className="border-t-2 border-border bg-primary/5 font-semibold">
                    <td className="px-4 py-3 text-sm">Surplus / (Deficit)</td>
                    <td className={`px-3 py-3 text-right font-mono text-sm ${totalIncome - totalExpense >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(totalIncome - totalExpense)}</td>
                  </tr>
                </ReportSection>
              </div>
            ) : active === 'balance_sheet' ? (
              <div className="space-y-4">
                <ReportSection title="Assets">
                  {assetRows.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">No assets recorded</p> : assetRows.map((r) => (
                    <tr key={r.account.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs">{r.account.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.net)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5 text-xs">Total Assets</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{formatCurrency(totalAssets)}</td>
                  </tr>
                </ReportSection>
                <ReportSection title="Liabilities">
                  {liabilityRows.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">No liabilities recorded</p> : liabilityRows.map((r) => (
                    <tr key={r.account.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs">{r.account.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(Math.abs(r.net))}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5 text-xs">Total Liabilities</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{formatCurrency(totalLiabilities)}</td>
                  </tr>
                </ReportSection>
                <ReportSection title="Equity">
                  {equityRows.length === 0 ? <p className="px-4 py-3 text-xs text-muted-foreground">No equity recorded</p> : equityRows.map((r) => (
                    <tr key={r.account.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs">{r.account.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.net)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-4 py-2.5 text-xs">Total Equity</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{formatCurrency(totalEquity)}</td>
                  </tr>
                </ReportSection>
              </div>
            ) : active === 'cash_book' || active === 'bank_book' ? (
              <ReportTable headers={['Code', 'Account', 'Opening', 'Receipts', 'Payments', 'Closing']}>
                {(active === 'cash_book' ? cashRows : bankRows).length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No accounts found</td></tr>
                ) : (active === 'cash_book' ? cashRows : bankRows).map((r) => {
                  const receipts = r.totalDebit;
                  const payments = r.totalCredit;
                  return (
                    <tr key={r.account.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{r.account.code}</td>
                      <td className="px-3 py-2 text-xs">{r.account.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(r.opening)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-success">{formatCurrency(receipts)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-destructive">{formatCurrency(payments)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(r.net)}</td>
                    </tr>
                  );
                })}
              </ReportTable>
            ) : active === 'day_book' ? (
              <ReportTable headers={['Date', 'Voucher No', 'Branch', 'Narration', 'Amount']}>
                {dayBookRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No transactions in the selected period</td></tr>
                ) : dayBookRows.map((v: any) => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-xs">{formatDate(v.voucher_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{v.voucher_no}</td>
                    <td className="px-3 py-2 text-xs">{v.branch?.name ?? '-'}</td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-xs text-muted-foreground">{v.narration}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatCurrency(v.amount)}</td>
                  </tr>
                ))}
              </ReportTable>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No data available</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>{headers.map((h, i) => <th key={h} className={`px-${i === 0 ? 4 : 3} py-2.5 ${i >= 2 ? 'text-right' : ''} font-medium`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
