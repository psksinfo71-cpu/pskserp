'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type { ChartAccount } from '@/lib/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { ReportToolbar } from '@/components/shared/ReportToolbar';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { getAccountLedger, type LedgerRow } from '@/lib/queries';
import { formatCurrency, formatDate } from '@/lib/format';
import { printReport } from '@/lib/export';
import { Loader2 } from 'lucide-react';
import { filterProjectAccounts } from '@/lib/account-filter';

interface BookReportProps {
  title: string;
  description: string;
  accountType: 'cash' | 'bank';
}

export function BookReport({ title, description, accountType }: BookReportProps) {
  const { activeProject } = useAuth();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [opening, setOpening] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const codeFilter = accountType === 'cash' ? ['1001'] : ['10021', '10022'];
    let q = supabase.from('chart_of_accounts').select('*').eq('is_active', true).in('code', codeFilter).order('code');
    if (activeProject) q = q.or(`project_id.is.null,project_id.eq.${activeProject.id}`);
    q.then(({ data }) => {
      const accs = filterProjectAccounts((data as ChartAccount[]) ?? [], activeProject?.id);
      setAccounts(accs);
      if (accs[0]) setAccountId(accs[0].id);
    });
  }, [accountType, activeProject]);

  const run = useCallback(async () => {
    if (!accountId) return;
    setLoading(true); setSearched(true);
    try {
      const r = await getAccountLedger(accountId, { from: from || undefined, to: to || undefined, projectId: activeProject?.id });
      setRows(r.rows); setOpening(r.opening);
    } finally { setLoading(false); }
  }, [accountId, activeProject, from, to]);

  useEffect(() => { if (accountId) run(); }, [accountId, run]);

  const account = accounts.find((a) => a.id === accountId);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = opening + totalDebit - totalCredit;

  const headers = ['Date', 'Voucher No', 'Narration', 'Receipt', 'Payment', 'Balance'];
  const exportRows = [
    ['Opening', '', '', '', '', opening.toFixed(2)],
    ...rows.map((r) => [formatDate(r.voucher_date), r.voucher_no, r.narration, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)]),
    ['Closing', '', '', totalDebit.toFixed(2), totalCredit.toFixed(2), closing.toFixed(2)],
  ];

  const handlePrint = () => {
    const body = `<div class="org-header"><h1>Palashipara Samaj Kallayan Samity (PSKS)</h1><p>Gangni, Meherpur — General Fund</p></div>
      <h2>${title} - ${account?.name ?? ''}</h2>
      <div class="meta">${from ? 'From ' + formatDate(from) : ''} ${to ? 'To ' + formatDate(to) : ''}</div>
      <table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th class="right">Receipt</th><th class="right">Payment</th><th class="right">Balance</th></tr></thead>
      <tbody><tr class="totals"><td colspan="5">Opening Balance</td><td class="right">${formatCurrency(opening)}</td></tr>
      ${rows.map((r) => `<tr><td>${formatDate(r.voucher_date)}</td><td>${r.voucher_no}</td><td>${r.narration}</td><td class="right">${r.debit ? formatCurrency(r.debit) : ''}</td><td class="right">${r.credit ? formatCurrency(r.credit) : ''}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')}
      <tr class="totals"><td colspan="3">Closing</td><td class="right">${formatCurrency(totalDebit)}</td><td class="right">${formatCurrency(totalCredit)}</td><td class="right">${formatCurrency(closing)}</td></tr></tbody></table>`;
    printReport(title, body);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={searched && !loading && rows.length > 0 && (
          <ReportToolbar title={title.replace(/\s+/g, '_')} headers={headers} rows={exportRows} onPrint={handlePrint} />
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Account</Label>
            <Select value={accountId || 'none'} onValueChange={(v) => setAccountId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select account</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
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
        <div className="mt-3 flex justify-end">
          <Button onClick={run} disabled={!accountId || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate
          </Button>
        </div>
      </Card>

      {searched && (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 && opening === 0 ? (
            <EmptyState title="No transactions" description="No posted transactions for this account in the selected period." />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
                <p className="text-sm font-semibold">{account?.code} - {account?.name}</p>
                <div className="text-xs text-muted-foreground">
                  Opening: <span className="font-mono font-medium text-foreground">{formatCurrency(opening)}</span> &middot; Closing: <span className="font-mono font-medium text-foreground">{formatCurrency(closing)}</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Voucher No</th>
                    <th className="px-3 py-2.5 font-medium">Narration</th>
                    <th className="px-3 py-2.5 text-right font-medium">Receipt</th>
                    <th className="px-3 py-2.5 text-right font-medium">Payment</th>
                    <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="bg-muted/20">
                    <td className="px-4 py-2 text-xs text-muted-foreground" colSpan={3}>Opening Balance</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">-</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">-</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(opening)}</td>
                  </tr>
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2 text-xs">{formatDate(r.voucher_date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.voucher_no}</td>
                      <td className="max-w-[240px] truncate px-3 py-2 text-xs text-muted-foreground" title={r.narration}>{r.narration}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-success">{r.debit ? formatCurrency(r.debit) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-destructive">{r.credit ? formatCurrency(r.credit) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={3}>Total Movement</td>
                    <td className="px-3 py-3 text-right font-mono text-success">{formatCurrency(totalDebit)}</td>
                    <td className="px-3 py-3 text-right font-mono text-destructive">{formatCurrency(totalCredit)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatCurrency(closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
