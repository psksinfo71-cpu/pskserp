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
import { History, Search, ShieldAlert, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';

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

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
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
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter((l) => {
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

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Immutable record of all system changes — click a row to see what changed" />

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
