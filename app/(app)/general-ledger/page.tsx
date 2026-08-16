'use client';

import { useState, useEffect } from 'react';
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
import { getAccountLedger, getGeneralLedger, type LedgerRow, type GeneralLedgerRow } from '@/lib/queries';
import { formatCurrency, formatDate, toInputDate } from '@/lib/format';
import { printReport } from '@/lib/export';
import { ScrollText, Loader2 } from 'lucide-react';
import { filterProjectAccounts } from '@/lib/account-filter';
import { getVoucherTypeLabelWithLegacy } from '@/lib/voucher-types';
import { AccountCombobox } from '@/components/vouchers/AccountCombobox';

export default function GeneralLedgerPage() {
  const { activeProject } = useAuth();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [opening, setOpening] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ledgerRows, setLedgerRows] = useState<GeneralLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLedgerLoading(true);
    getGeneralLedger({ projectId: activeProject?.id })
      .then((data) => { if (!cancelled) setLedgerRows(data); })
      .catch(() => { if (!cancelled) setLedgerRows([]); })
      .finally(() => { if (!cancelled) setLedgerLoading(false); });
    return () => { cancelled = true; };
  }, [activeProject]);

  useEffect(() => {
    let q = supabase.from('chart_of_accounts').select('*').eq('is_active', true).eq('is_group', false).order('code');
    if (activeProject) q = q.or(`project_id.is.null,project_id.eq.${activeProject.id}`);
    q.then(({ data }) => { setAccounts(filterProjectAccounts((data as ChartAccount[] ?? []), activeProject?.id)); });
  }, [activeProject]);

  const run = async () => {
    if (!accountId) return;
    setLoading(true); setSearched(true);
    try {
      const r = await getAccountLedger(accountId, { from: from || undefined, to: to || undefined, projectId: activeProject?.id });
      setRows(r.rows); setOpening(r.opening);
    } finally { setLoading(false); }
  };

  const runAllLedger = async () => {
    setLedgerLoading(true);
    try {
      setLedgerRows(await getGeneralLedger({ from: from || undefined, to: to || undefined, projectId: activeProject?.id }));
    } finally {
      setLedgerLoading(false);
    }
  };

  const account = accounts.find((a) => a.id === accountId);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = opening + totalDebit - totalCredit;

  const headers = ['Date', 'Voucher No', 'Type', 'Narration', 'Debit', 'Credit', 'Balance'];
  const exportRows = [
    ['Opening Balance', '', '', '', '', '', opening.toFixed(2)],
    ...rows.map((r) => [formatDate(r.voucher_date), r.voucher_no, getVoucherTypeLabelWithLegacy(r.voucher_type), r.narration, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)]),
    ['Closing', '', '', '', totalDebit.toFixed(2), totalCredit.toFixed(2), closing.toFixed(2)],
  ];

  const handlePrint = () => {
    const body = `<h1>General Ledger - ${account?.code ?? ''} ${account?.name ?? ''}</h1>
      <div class="meta">${from ? 'From ' + formatDate(from) : ''} ${to ? 'To ' + formatDate(to) : ''}</div>
      <table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th></tr></thead>
      <tbody><tr class="totals"><td colspan="6">Opening Balance</td><td class="right">${formatCurrency(opening)}</td></tr>
      ${rows.map((r) => `<tr><td>${formatDate(r.voucher_date)}</td><td>${r.voucher_no}</td><td>${getVoucherTypeLabelWithLegacy(r.voucher_type)}</td><td>${r.narration}</td><td class="right">${r.debit ? formatCurrency(r.debit) : ''}</td><td class="right">${r.credit ? formatCurrency(r.credit) : ''}</td><td class="right">${formatCurrency(r.balance)}</td></tr>`).join('')}
      <tr class="totals"><td colspan="4">Closing</td><td class="right">${formatCurrency(totalDebit)}</td><td class="right">${formatCurrency(totalCredit)}</td><td class="right">${formatCurrency(closing)}</td></tr>
      </tbody></table>`;
    printReport('General Ledger', body);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Ledger"
        description="Account-wise transaction history with running balance"
        actions={searched && !loading && rows.length > 0 && (
          <ReportToolbar title="General_Ledger" headers={headers} rows={exportRows} onPrint={handlePrint} />
        )}
      />

      <Card className="p-4">
        <div className="mb-4 flex-wrap gap-2">
          <Button variant="outline" onClick={runAllLedger} disabled={ledgerLoading}>
            {ledgerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Refresh Ledger
          </Button>
          <span className="self-center text-xs text-muted-foreground">All ledger codes load automatically; only posted voucher entries are shown.</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ledger Head</Label>
            <AccountCombobox
              accounts={accounts}
              value={accountId}
              onChange={setAccountId}
              placeholder="Search or select ledger head..."
            />
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
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate Ledger
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {ledgerLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : ledgerRows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No posted ledger entries" description="Posted voucher entries will appear here with their ledger codes." />
        ) : (
          <>
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-semibold">All Ledger Codes</p>
            <p className="text-xs text-muted-foreground">Every posted voucher line for the selected project and date range</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr>
                <th className="px-4 py-2.5">Date</th><th className="px-3 py-2.5">Voucher No</th><th className="px-3 py-2.5">Ledger Code</th><th className="px-3 py-2.5">Account Head</th><th className="px-3 py-2.5">Narration</th><th className="px-3 py-2.5 text-right">Debit</th><th className="px-3 py-2.5 text-right">Credit</th><th className="px-3 py-2.5 text-right">Balance</th>
              </tr></thead>
              <tbody className="divide-y divide-border">{ledgerRows.map((r, i) => <tr key={`${r.voucher_no}-${r.account_code}-${i}`} className="hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-2 text-xs">{formatDate(r.voucher_date)}</td><td className="px-3 py-2 font-mono text-xs">{r.voucher_no}</td><td className="px-3 py-2 font-mono text-xs font-medium">{r.account_code}</td><td className="px-3 py-2 text-xs">{r.account_name}</td><td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={r.narration}>{r.narration}</td><td className="px-3 py-2 text-right font-mono text-xs">{r.debit ? formatCurrency(r.debit) : '-'}</td><td className="px-3 py-2 text-right font-mono text-xs">{r.credit ? formatCurrency(r.credit) : '-'}</td><td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(r.balance)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {searched && (
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <EmptyState icon={ScrollText} title="No transactions" description={`No posted transactions for ${account?.name ?? 'this account'} in the selected period.`} />
          ) : (
            <div className="overflow-x-auto">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{account?.code} - {account?.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{account?.account_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Opening: <span className="font-mono font-medium text-foreground">{formatCurrency(opening)}</span></p>
                    <p className="text-xs text-muted-foreground">Closing: <span className="font-mono font-medium text-foreground">{formatCurrency(closing)}</span></p>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Voucher No</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">Narration</th>
                    <th className="px-3 py-2.5 text-right font-medium">Debit</th>
                    <th className="px-3 py-2.5 text-right font-medium">Credit</th>
                    <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2 text-xs">{formatDate(r.voucher_date)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.voucher_no}</td>
                      <td className="px-3 py-2 text-xs">{getVoucherTypeLabelWithLegacy(r.voucher_type)}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={r.narration}>{r.narration}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.debit ? formatCurrency(r.debit) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.credit ? formatCurrency(r.credit) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatCurrency(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>Total Movement</td>
                    <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalDebit)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalCredit)}</td>
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
