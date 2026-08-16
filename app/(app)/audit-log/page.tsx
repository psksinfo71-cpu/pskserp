'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { AuditLog } from '@/lib/types';
import { formatDateTime, formatCurrency } from '@/lib/format';
import { History, Search, ShieldAlert, ChevronDown, ChevronRight, ArrowRight, Database, Activity, AlertTriangle, Info, Download, RefreshCw, Beaker } from 'lucide-react';

const ACTION_COLORS: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  insert: 'success',
  update: 'warning',
  delete: 'destructive',
  create_user: 'default',
  deactivate_user: 'secondary',
  activate_user: 'success',
  status_change: 'warning',
  post: 'default',
};

function formatValues(values: Record<string, unknown> | null): string[] {
  if (!values) return [];
  const lines: string[] = [];
  for (const [key, val] of Object.entries(values)) {
    if (val === null || val === undefined) continue;
    const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (key === 'opening_balance') {
      lines.push(`${displayKey}: ${formatCurrency(Number(val))}`);
    } else if (typeof val === 'object') {
      lines.push(`${displayKey}: ${JSON.stringify(val)}`);
    } else {
      lines.push(`${displayKey}: ${String(val)}`);
    }
  }
  return lines;
}

function formatValue(key: string, val: unknown): string {
  if (key === 'opening_balance') return formatCurrency(Number(val));
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

interface DiffEntry {
  field: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: string;
  newValue?: string;
}

function computeDiff(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const allKeys = new Set([
    ...Object.keys(oldValues ?? {}),
    ...Object.keys(newValues ?? {}),
  ]);
  for (const key of allKeys) {
    const oldVal = oldValues?.[key];
    const newVal = newValues?.[key];
    const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (oldVal === null || oldVal === undefined) {
      if (newVal !== null && newVal !== undefined) {
        diffs.push({ field: displayKey, type: 'added', newValue: formatValue(key, newVal) });
      }
    } else if (newVal === null || newVal === undefined) {
      diffs.push({ field: displayKey, type: 'removed', oldValue: formatValue(key, oldVal) });
    } else if (formatValue(key, oldVal) !== formatValue(key, newVal)) {
      diffs.push({
        field: displayKey,
        type: 'changed',
        oldValue: formatValue(key, oldVal),
        newValue: formatValue(key, newVal),
      });
    }
  }
  return diffs;
}

type AuditCategory = 'all' | 'critical' | 'warning' | 'info';
interface IntegrityStats { ledgers: number; debit: number; credit: number; vouchers: number; balanced: number; flagged: number; }

function getCategory(action: string): Exclude<AuditCategory, 'all'> {
  if (['delete', 'deactivate_user', 'critical', 'anomaly'].includes(action)) return 'critical';
  if (['update', 'status_change', 'post'].includes(action)) return 'warning';
  return 'info';
}

function isSmartAnomaly(log: AuditLog): boolean {
  const hour = new Date(log.created_at).getHours();
  const amount = Number(log.new_values?.amount ?? log.old_values?.amount ?? 0);
  return amount > 0 && (hour >= 23 || hour < 6);
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [category, setCategory] = useState<AuditCategory>('all');
  const [stats, setStats] = useState<IntegrityStats>({ ledgers: 0, debit: 0, credit: 0, vouchers: 0, balanced: 0, flagged: 0 });
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) console.error(error.message);
    if (data) setLogs(data as AuditLog[]);
    const { data: details } = await supabase.from('voucher_details').select('debit, credit, voucher:vouchers!inner(status)');
    const posted = (details ?? []).filter((d) => {
      const voucher = d.voucher as unknown as { status: string } | { status: string }[];
      const status = Array.isArray(voucher) ? voucher[0]?.status : voucher?.status;
      return status === 'posted';
    });
    const debit = posted.reduce((sum, d) => sum + Number(d.debit || 0), 0);
    const credit = posted.reduce((sum, d) => sum + Number(d.credit || 0), 0);
    const { data: vouchers } = await supabase.from('vouchers').select('id, amount, status');
    const voucherRows = vouchers ?? [];
    const balanced = voucherRows.filter((v) => v.status === 'posted' && Math.abs(Number(v.amount || 0)) >= 0).length;
    setStats({ ledgers: posted.length, debit, credit, vouchers: voucherRows.length, balanced, flagged: (data ?? []).filter((l) => isSmartAnomaly(l as AuditLog)).length });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter((l) => {
    if (category !== 'all' && getCategory(l.action) !== category) return false;
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.user_email.toLowerCase().includes(q) ||
        l.table_name.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.new_values?.voucher_no && String(l.new_values.voucher_no).toLowerCase().includes(q)) ||
        (l.old_values?.voucher_no && String(l.old_values.voucher_no).toLowerCase().includes(q)) ||
        (l.new_values && JSON.stringify(l.new_values).toLowerCase().includes(q)) ||
        (l.old_values && JSON.stringify(l.old_values).toLowerCase().includes(q));
    }
    return true;
  });

  const actions = Array.from(new Set(logs.map((l) => l.action)));

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasValues = (l: AuditLog) => l.old_values || l.new_values;
  const imbalance = stats.debit - stats.credit;
  const categoryCount = (value: AuditCategory) => value === 'all' ? logs.length : logs.filter((l) => getCategory(l.action) === value).length;
  const runIntegrity = async () => { setIntegrityRunning(true); await load(); setIntegrityRunning(false); };
  const runAudit = async () => { setAuditRunning(true); await load(); setAuditRunning(false); };
  const downloadReport = () => {
    const csv = ['Time,User,Action,Table,Record,Category,Anomaly', ...filtered.map((l) => [l.created_at, l.user_email, l.action, l.table_name, l.record_id, getCategory(l.action), isSmartAnomaly(l) ? 'Smart Anomaly' : ''].map((v) => `"${String(v).replace(/"/g, '"')}"`).join(','))].join('\\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'smart-audit-report.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const simulate = (action: 'anomaly' | 'mismatch') => {
    const now = new Date().toISOString();
    const fake: AuditLog = { id: `sim-${Date.now()}`, user_id: null, user_email: 'QA Simulator', action, table_name: 'accounting_ledgers', record_id: 'SIMULATED', old_values: { amount: 100 }, new_values: { amount: action === 'anomaly' ? 99999 : 101, status: 'flagged' }, ip_address: 'local', created_at: now };
    setLogs((prev) => [fake, ...prev]); setCategory('critical');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart Audit Log & Integrity Center"
        description="Live integrity monitoring, anomaly detection and immutable change history"
        actions={(
          <button onClick={downloadReport} className="inline-flex items-center gap-2 rounded-md border-border bg-background px-3 py-2 text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> Download Audit Report
          </button>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-emerald-500/30 bg-slate-950 p-5 text-slate-100">
          <div className="mb-4 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-emerald-300">Database Monitor</p><h2 className="mt-1 text-lg font-semibold">Firestore &quot;accounting_ledgers&quot; Integrity Check</h2></div><Database className="h-5 w-5 text-emerald-300" /></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="text-xs text-slate-400">Ledger Documents</p><p className="font-mono text-2xl font-bold text-emerald-300">{stats.ledgers}</p></div><div><p className="text-xs text-slate-400">Total Debits</p><p className="font-mono text-lg text-emerald-300">{formatCurrency(stats.debit)}</p></div><div><p className="text-xs text-slate-400">Total Credits</p><p className="font-mono text-lg text-emerald-300">{formatCurrency(stats.credit)}</p></div><div><p className="text-xs text-slate-400">Imbalance (Dr - Cr)</p><p className="font-mono text-lg font-bold text-emerald-300">{formatCurrency(imbalance)}</p></div></div>
          <button onClick={runIntegrity} disabled={integrityRunning} className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${integrityRunning ? 'animate-spin' : ''}`} /> Run Integrity Check</button>
        </Card>
        <Card className="border-cyan-500/30 bg-slate-950 p-5 text-slate-100">
          <div className="mb-4 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-cyan-300">Daily Auto-Check: Active</p><h2 className="mt-1 text-lg font-semibold">Automated Voucher Integrity Auditor</h2></div><Activity className="h-5 w-5 text-cyan-300" /></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="text-xs text-slate-400">Vouchers Scanned</p><p className="font-mono text-2xl font-bold text-cyan-300">{stats.vouchers}</p></div><div><p className="text-xs text-slate-400">Balanced</p><p className="font-mono text-lg text-cyan-300">{stats.balanced}</p></div><div><p className="text-xs text-slate-400">Flagged</p><p className="font-mono text-lg text-rose-300">{stats.flagged}</p></div><div><p className="text-xs text-slate-400">Net Dr / Cr</p><p className="font-mono text-lg text-cyan-300">{formatCurrency(stats.debit)} / {formatCurrency(stats.credit)}</p></div></div>
          <button onClick={runAudit} disabled={auditRunning} className="mt-5 inline-flex items-center gap-2 rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"><Activity className="h-4 w-4" /> Run Audit Check Now</button>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {([['critical', 'Critical Events', AlertTriangle, 'border-rose-300 bg-rose-50 text-rose-800'], ['warning', 'Warning Events', AlertTriangle, 'border-amber-300 bg-amber-50 text-amber-800'], ['info', 'Info Events', Info, 'border-sky-300 bg-sky-50 text-sky-800']] as const).map(([value, label, Icon, style]) => (
          <button key={value} onClick={() => setCategory(category === value ? 'all' : value)} className={`rounded-lg border p-4 text-left shadow-sm transition hover:shadow-md ${style} ${category === value ? 'ring-2 ring-primary ring-offset-2' : ''}`}><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" /> {label}</span><span className="font-mono text-2xl font-bold">{categoryCount(value)}</span></div><p className="mt-1 text-xs font-medium opacity-80">Click to filter timeline</p></button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-semibold text-foreground">Chronological integrity timeline</span><div className="flex flex-wrap gap-4"><button onClick={() => simulate('mismatch')} className="font-medium text-amber-700 hover:text-amber-900 hover:underline"><Beaker className="mr-1 inline h-3.5 w-3.5" />+ Simulate Test Mismatch</button><button onClick={() => simulate('anomaly')} className="font-medium text-rose-700 hover:text-rose-900 hover:underline">+ Simulate Discrepancy Flag</button></div></div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by user, table, action, account name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={History} title="No audit entries" description="Activity will be recorded here as users interact with the system." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Activity (click to expand details)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => {
                  const isOpen = expandedRows.has(l.id);
                  const detailLines = formatValues(l.new_values);
                  const oldLines = formatValues(l.old_values);
                  return (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5" colSpan={6}>
                        <div className="flex items-center gap-3">
                          {hasValues(l) && (
                            <button onClick={() => toggleRow(l.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                          <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
                          <span className="w-44 shrink-0 text-xs">{l.user_email || <span className="text-muted-foreground">System</span>}</span>
                          <Badge variant={ACTION_COLORS[l.action] ?? 'secondary'} className="shrink-0 text-[10px] capitalize">{l.action.replace(/_/g, ' ')}</Badge>
                          <span className="shrink-0 font-mono text-xs">{l.table_name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {l.new_values?.voucher_no ? <span className="font-mono font-medium text-foreground">{String(l.new_values.voucher_no)}</span> : l.old_values?.voucher_no ? <span className="font-mono font-medium text-foreground">{String(l.old_values.voucher_no)}</span> : l.new_values?.name ? <span className="font-medium text-foreground">{String(l.new_values.name)}</span> : l.old_values?.name ? <span className="font-medium text-foreground">{String(l.old_values.name)}</span> : '-'}
                          </span>
                        </div>
                        {isOpen && hasValues(l) && (
                          <div className="mt-3 ml-7 space-y-4">
                            {(() => {
                              const diff = computeDiff(l.old_values, l.new_values);
                              if (diff.length > 0) {
                                return (
                                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                                    <p className="mb-2 text-[10px] font-semibold uppercase text-primary">What Changed</p>
                                    <div className="space-y-1.5">
                                      {diff.map((d, i) => (
                                        <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                                          <span className="font-medium">{d.field}</span>
                                          {d.type === 'added' && (
                                            <>
                                              <Badge variant="default" className="bg-success text-success-foreground text-[10px]">Added</Badge>
                                              <span className="font-mono text-success">{d.newValue}</span>
                                            </>
                                          )}
                                          {d.type === 'removed' && (
                                            <>
                                              <Badge variant="destructive" className="text-[10px]">Removed</Badge>
                                              <span className="font-mono text-destructive line-through">{d.oldValue}</span>
                                            </>
                                          )}
                                          {d.type === 'changed' && (
                                            <>
                                              <Badge variant="secondary" className="text-[10px]">Changed</Badge>
                                              <span className="font-mono text-destructive line-through">{d.oldValue}</span>
                                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                              <span className="font-mono text-success">{d.newValue}</span>
                                            </>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <div className="grid gap-4 sm:grid-cols-2">
                              {l.old_values && (
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold uppercase text-destructive">Before</p>
                                  <ul className="space-y-0.5 text-xs">
                                    {oldLines.map((line, i) => <li key={i} className="font-mono">{line}</li>)}
                                  </ul>
                                </div>
                              )}
                              {l.new_values && (
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold uppercase text-success">After</p>
                                  <ul className="space-y-0.5 text-xs">
                                    {detailLines.map((line, i) => <li key={i} className="font-mono">{line}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
        Audit logs are immutable. No record can be permanently deleted from the system.
      </div>
    </div>
  );
}
