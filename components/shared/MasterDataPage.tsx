'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { can } from '@/lib/permissions';
import { useAuth } from '@/components/auth/AuthProvider';
import { logAudit } from '@/lib/audit';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'checkbox' | 'select';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  // for select fields that need async options from another table
  optionsTable?: string;
  optionsLabel?: string;
  full?: boolean;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Record<string, any>) => ReactNode;
  className?: string;
}

interface MasterDataPageProps {
  table: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  fields: FieldDef[];
  columns: ColumnDef[];
  orderBy?: string;
  capability?: Parameters<typeof can>[1];
  emptyDescription?: string;
  footerRow?: (rows: Record<string, any>[]) => ReactNode;
}

export function MasterDataPage({
  table, title, description, icon: Icon, fields, columns, orderBy = 'name',
  capability = 'manage_master_data', emptyDescription, footerRow,
}: MasterDataPageProps) {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const canManage = can(role, capability);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [selectOptions, setSelectOptions] = useState<Record<string, { value: string; label: string }[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(table).select('*').order(orderBy);
    if (error) toast.error(error.message);
    if (data) setRows(data as Record<string, any>[]);
    setLoading(false);
  }, [table, orderBy]);

  useEffect(() => { load(); }, [load]);

  // Load async select options
  useEffect(() => {
    const asyncFields = fields.filter((f) => f.optionsTable);
    if (asyncFields.length === 0) return;
    (async () => {
      const opts: Record<string, { value: string; label: string }[]> = {};
      for (const f of asyncFields) {
        const { data } = await supabase.from(f.optionsTable!).select('*');
        if (data) {
          opts[f.key] = (data as Record<string, any>[]).map((d) => ({
            value: d.id,
            label: d[f.optionsLabel ?? 'name'] ?? d.name ?? d.code,
          }));
        }
      }
      setSelectOptions(opts);
    })();
  }, [fields]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q));
  });

  const blankForm = () => {
    const f: Record<string, any> = {};
    for (const field of fields) {
      f[field.key] = field.type === 'checkbox' ? true : field.type === 'number' ? 0 : '';
    }
    return f;
  };

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setDialogOpen(true);
  };

  const openEdit = (row: Record<string, any>) => {
    setEditing(row);
    const f: Record<string, any> = {};
    for (const field of fields) {
      f[field.key] = row[field.key] ?? (field.type === 'checkbox' ? false : field.type === 'number' ? 0 : '');
    }
    setForm(f);
    setDialogOpen(true);
  };

  const save = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key]) { toast.error(`${f.label} is required`); return; }
    }
    setSaving(true);
    const payload: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === 'select' && f.optionsTable && !form[f.key]) {
        payload[f.key] = null;
      } else if (f.type === 'number') {
        payload[f.key] = Number(form[f.key]) || 0;
      } else if (f.type === 'checkbox') {
        payload[f.key] = !!form[f.key];
      } else {
        payload[f.key] = form[f.key];
      }
    }
    try {
      if (editing) {
        const { error } = await supabase.from(table).update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit({ action: 'update', table_name: table, record_id: editing.id, new_values: payload });
        toast.success('Updated');
      } else {
        const { data, error } = await supabase.from(table).insert(payload).select().single();
        if (error) throw error;
        await logAudit({ action: 'insert', table_name: table, record_id: data.id, new_values: payload });
        toast.success('Created');
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: FieldDef) => {
    const value = form[f.key];
    if (f.type === 'select') {
      const options = f.options ?? selectOptions[f.key] ?? [];
      return (
        <Select value={String(value || 'none')} onValueChange={(v) => setForm({ ...form, [f.key]: v === 'none' ? '' : v })}>
          <SelectTrigger><SelectValue placeholder={f.placeholder ?? 'Select...'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{f.placeholder ?? 'None'}</SelectItem>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (f.type === 'checkbox') {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!value} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} className="h-4 w-4 rounded border-input" />
          {f.label}
        </label>
      );
    }
    return (
      <Input
        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
        placeholder={f.placeholder}
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={canManage && <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add New</Button>}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Icon} title="No records found" description={emptyDescription ?? 'Adjust your search or add a new record.'} action={canManage && !search && <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" /> Add New</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {columns.map((c) => <th key={c.key} className={`px-4 py-2.5 font-medium ${c.className ?? ''}`}>{c.label}</th>)}
                  {canManage && <th className="px-3 py-2.5 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30">
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 ${c.className ?? ''}`}>
                        {c.render ? c.render(row) : String(row[c.key] ?? '-')}
                      </td>
                    ))}
                    {canManage && (
                      <td className="px-3 py-2.5 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {footerRow && filtered.length > 0 && (
                <tfoot className="border-t-2 border-border bg-muted/40">
                  {footerRow(filtered)}
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title}` : `Add ${title}`}</DialogTitle>
            <DialogDescription>{editing ? 'Update the details below.' : 'Fill in the details below.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.full ? 'sm:col-span-2' : ''}`}>
                {f.type !== 'checkbox' && <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>}
                {renderField(f)}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
