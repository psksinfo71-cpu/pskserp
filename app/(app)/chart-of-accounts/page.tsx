'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ChartAccount, AccountType } from '@/lib/types';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import {
  ChevronRight, ChevronDown, Plus, Search, BookOpen, Folder, FileText, Pencil, Lock, Unlock, Trash2,
  FileSpreadsheet, Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildAccountTree, flattenTree, AccountTypeBadge,
} from '@/lib/account-tree';
import { formatCurrency } from '@/lib/format';
import { exportToCSV, exportToExcel, printReport } from '@/lib/export';
import { fetchProjectOpeningBalances, resolveOpening, upsertProjectOpeningBalance, type ProjectOpeningBalanceMap } from '@/lib/opening-balances';
import { filterProjectAccounts } from '@/lib/account-filter';
import { toast } from 'sonner';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'Assets' },
  { value: 'liability', label: 'Liabilities' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
];

export default function ChartOfAccountsPage() {
  const { profile, activeProject } = useAuth();
  const role = profile?.role ?? 'accountant';
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [form, setForm] = useState({
    code: '', name: '', account_type: 'asset' as AccountType,
    parent_id: '', is_group: false, is_active: true, opening_balance: 0, description: '',
  });
  const [saving, setSaving] = useState(false);
  const [projectOB, setProjectOB] = useState<ProjectOpeningBalanceMap>(new Map());

  const canManage = can(role, 'manage_chart_of_accounts');
  const canCreateSubHead = can(role, 'create_sub_head');
  const canDelete = role === 'super_admin';
  const canAddChild = canManage || canCreateSubHead;
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ hasChildren: boolean; hasVouchers: boolean; hasBudgets: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('chart_of_accounts')
      .select('*')
      .order('code', { ascending: true });
    if (activeProject) q = q.or(`project_id.is.null,project_id.eq.${activeProject.id}`);
    const { data, error } = await q;
    if (error) toast.error('Failed to load accounts: ' + error.message);
    const obMap = await fetchProjectOpeningBalances(activeProject?.id);
    setProjectOB(obMap);
    if (data) {
      const filtered = filterProjectAccounts(data as ChartAccount[], activeProject?.id);
      setAccounts(filtered);
      setExpanded(new Set(filtered.filter((a) => a.is_group).map((a) => a.id)));
    }
    setLoading(false);
  }, [activeProject]);

  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => buildAccountTree(accounts), [accounts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    const matchIds = new Set(accounts.filter((a) =>
      a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    ).map((a) => a.id));
    // include ancestors of matches
    const include = new Set<string>();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const id of matchIds) {
      let cur = byId.get(id);
      while (cur) {
        include.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    }
    return accounts.filter((a) => include.has(a.id));
  }, [accounts, search]);

  const filteredTree = useMemo(() => buildAccountTree(filtered), [filtered]);
  const flat = useMemo(
    () => flattenTree(filteredTree, 0, search.trim() ? new Set(accounts.map((a) => a.id)) : expanded),
    [filteredTree, expanded, search, accounts]
  );

  const nextCode = useCallback((parentId: string | null, type: AccountType) => {
    const siblings = accounts.filter((a) => (a.parent_id ?? null) === (parentId ?? null));
    if (parentId) {
      const parent = accounts.find((a) => a.id === parentId);
      const base = parent?.code ?? '';
      const suffixes = siblings.map((s) => s.code.slice(base.length));
      const nums = suffixes.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      const padLen = suffixes.length > 0 ? Math.max(...suffixes.map((s) => s.length)) : 1;
      return `${base}${String(next).padStart(padLen, '0')}`;
    }
    const nums = siblings.map((s) => parseInt(s.code, 10)).filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(next);
  }, [accounts]);

  const openAdd = (parentId?: string, type?: AccountType) => {
    setEditing(null);
    const t = type ?? 'asset';
    setForm({
      code: nextCode(parentId ?? null, t), name: '', account_type: t,
      parent_id: parentId ?? '', is_group: false, is_active: true,
      opening_balance: 0, description: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (acc: ChartAccount) => {
    setEditing(acc);
    const effOpening = resolveOpening(acc.id, acc.opening_balance, projectOB);
    setForm({
      code: acc.code, name: acc.name, account_type: acc.account_type,
      parent_id: acc.parent_id ?? '', is_group: acc.is_group, is_active: acc.is_active,
      opening_balance: effOpening, description: acc.description,
    });
    setDialogOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    if (canCreateSubHead && !canManage && !form.parent_id) {
      toast.error('You can only create sub-head accounts under an existing main head');
      return;
    }
    setSaving(true);
    const newOpening = Number(form.opening_balance) || 0;
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      account_type: form.account_type,
      parent_id: form.parent_id || null,
      is_group: form.is_group,
      is_active: form.is_active,
      description: form.description,
    };
    try {
      if (editing) {
        const oldOpening = resolveOpening(editing.id, editing.opening_balance, projectOB);

        // If editing a global account from within a project, clone it first
        // so the change only applies to this project, not globally.
        let targetId = editing.id;
        let isCloned = false;
        if (activeProject && !editing.project_id && !editing.cloned_from_id) {
          const { data: cloneData, error: cloneError } = await supabase
            .from('chart_of_accounts')
            .insert({
              ...payload,
              opening_balance: 0,
              project_id: activeProject.id,
              cloned_from_id: editing.id,
            })
            .select()
            .single();
          if (cloneError) throw cloneError;
          targetId = cloneData.id;
          isCloned = true;
        } else {
          // A project must only update its own clone. Global accounts are
          // cloned above, so edits in Epic can never mutate General Fund.
          let updateQuery = supabase.from('chart_of_accounts').update(payload).eq('id', editing.id);
          if (activeProject) updateQuery = updateQuery.eq('project_id', activeProject.id);
          const { error } = await updateQuery;
          if (error) throw error;
        }

        if (activeProject && !editing.is_group) {
          await upsertProjectOpeningBalance(activeProject.id, targetId, newOpening);
        } else if (!activeProject && !editing.is_group) {
          await supabase.from('chart_of_accounts').update({ opening_balance: newOpening }).eq('id', targetId);
        }

        await logAudit({
          action: 'update',
          table_name: 'chart_of_accounts',
          record_id: targetId,
          old_values: { code: editing.code, name: editing.name, opening_balance: oldOpening, project: activeProject?.name ?? 'General', cloned: isCloned },
          new_values: { ...payload, opening_balance: newOpening, project: activeProject?.name ?? 'General', cloned: isCloned },
        });
        toast.success(isCloned ? 'Account customized for this project' : 'Account updated');
      } else {
        const { data, error } = await supabase.from('chart_of_accounts').insert({ ...payload, opening_balance: activeProject ? 0 : newOpening, project_id: activeProject?.id ?? null }).select().single();
        if (error) throw error;
        if (activeProject && !form.is_group) {
          await upsertProjectOpeningBalance(activeProject.id, data.id, newOpening);
        }
        await logAudit({
          action: 'insert',
          table_name: 'chart_of_accounts',
          record_id: data.id,
          old_values: null,
          new_values: { ...payload, opening_balance: newOpening, project: activeProject?.name ?? 'General' },
        });
        toast.success('Account created');
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openDelete = async (acc: ChartAccount) => {
    setDeleteTarget(acc);
    setDeleteCheck(null);
    const { count: childCount } = await supabase
      .from('chart_of_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', acc.id);
    const { count: voucherCount } = await supabase
      .from('voucher_details')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', acc.id);
    const { count: budgetCount } = await supabase
      .from('budgets')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', acc.id);
    setDeleteCheck({
      hasChildren: (childCount ?? 0) > 0,
      hasVouchers: (voucherCount ?? 0) > 0,
      hasBudgets: (budgetCount ?? 0) > 0,
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (activeProject) {
        await supabase.from('project_opening_balances')
          .delete().eq('project_id', activeProject.id).eq('account_id', deleteTarget.id);
      }
      const { error } = await supabase.from('chart_of_accounts').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      await logAudit({
        action: 'delete',
        table_name: 'chart_of_accounts',
        record_id: deleteTarget.id,
        old_values: { code: deleteTarget.code, name: deleteTarget.name },
        new_values: null,
      });
      toast.success('Account deleted');
      setDeleteTarget(null);
      setDeleteCheck(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (acc: ChartAccount) => {
    try {
      let targetId = acc.id;
      let isCloned = false;
      if (activeProject && !acc.project_id && !acc.cloned_from_id) {
        const { data, error } = await supabase.from('chart_of_accounts').insert({
          code: acc.code, name: acc.name, account_type: acc.account_type,
          parent_id: acc.parent_id, is_group: acc.is_group,
          is_active: !acc.is_active, description: acc.description,
          opening_balance: 0, project_id: activeProject.id, cloned_from_id: acc.id,
        }).select().single();
        if (error) throw error;
        targetId = data.id;
        isCloned = true;
      } else {
        let updateQuery = supabase.from('chart_of_accounts').update({ is_active: !acc.is_active }).eq('id', acc.id);
        if (activeProject) updateQuery = updateQuery.eq('project_id', activeProject.id);
        const { error } = await updateQuery;
        if (error) throw error;
      }
      await logAudit({
        action: 'update', table_name: 'chart_of_accounts', record_id: targetId,
        old_values: { is_active: acc.is_active, project: activeProject?.name ?? 'General', cloned: isCloned },
        new_values: { is_active: !acc.is_active, project: activeProject?.name ?? 'General', cloned: isCloned },
      });
      toast.success(isCloned ? 'Account customized for this project' : `Account ${acc.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const parentOptions = useMemo(() => accounts.filter((a) => a.id !== editing?.id), [accounts, editing]);
  const [parentSearch, setParentSearch] = useState('');
  const [parentOpen, setParentOpen] = useState(false);
  const selectedParent = accounts.find((a) => a.id === form.parent_id);

  const filteredParents = useMemo(() => {
    if (!parentSearch.trim()) return parentOptions;
    const q = parentSearch.toLowerCase();
    return parentOptions.filter((a) =>
      a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
    );
  }, [parentOptions, parentSearch]);

  const onParentChange = (pid: string) => {
    const parent = pid ? accounts.find((a) => a.id === pid) : undefined;
    const newCode = pid ? nextCode(pid, parent?.account_type ?? form.account_type) : nextCode(null, form.account_type);
    setForm({
      ...form,
      parent_id: pid,
      account_type: parent ? parent.account_type : form.account_type,
      code: editing ? form.code : newCode,
    });
    setParentOpen(false);
    setParentSearch('');
  };

  const coaHeaders = ['Code', 'Account Name', 'Type', 'Parent', 'Opening Balance', 'Status'];
  const coaRows = flat.map(({ node }) => {
    const acc = node.account;
    const parent = accounts.find((a) => a.id === acc.parent_id);
    return [
      acc.code,
      acc.name,
      acc.account_type,
      parent ? `${parent.code} - ${parent.name}` : '-',
      acc.is_group ? '-' : formatCurrency(resolveOpening(acc.id, acc.opening_balance, projectOB)),
      acc.is_active ? 'Active' : 'Inactive',
    ];
  });
  const coaPrint = () => {
    const body = `<h1>Chart of Accounts</h1>
      <table><thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th>Parent</th><th class="right">Opening Balance</th><th class="center">Status</th></tr></thead>
      <tbody>${flat.map(({ node }) => {
        const acc = node.account;
        const parent = accounts.find((a) => a.id === acc.parent_id);
        return `<tr><td class="font-mono">${acc.code}</td><td>${acc.name}</td><td>${acc.account_type}</td><td>${parent ? parent.code + ' - ' + parent.name : '-'}</td><td class="right">${acc.is_group ? '-' : formatCurrency(resolveOpening(acc.id, acc.opening_balance, projectOB))}</td><td class="center">${acc.is_active ? 'Active' : 'Inactive'}</td></tr>`;
      }).join('')}</tbody></table>`;
    printReport('Chart of Accounts', body);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        description="Hierarchical account structure for double-entry bookkeeping"
        actions={(
          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => exportToCSV('chart_of_accounts', coaHeaders, coaRows)}>
                  <FileText className="mr-1.5 h-4 w-4" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportToExcel('chart_of_accounts', coaHeaders, coaRows)}>
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={coaPrint}>
                  <Printer className="mr-1.5 h-4 w-4" /> Print
                </Button>
              </>
            )}
            {canManage && (
              <Button onClick={() => openAdd()}>
                <Plus className="mr-2 h-4 w-4" /> Add Account
              </Button>
            )}
          </div>
        )}
      />
      {canCreateSubHead && !canManage && (
        <p className="text-sm text-muted-foreground">You can add sub-head accounts under existing main heads.</p>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : flat.length === 0 ? (
          <>
            <EmptyState
              icon={BookOpen}
              title="No accounts found"
              description={search ? 'Try a different search term.' : 'Create your first account to begin.'}
              action={canManage && !search && (
                <Button size="sm" onClick={() => openAdd()}><Plus className="mr-1 h-4 w-4" /> Add Account</Button>
              )}
            />
            {canCreateSubHead && !canManage && !search && (
              <p className="text-sm text-muted-foreground">Expand a main head and click the + button to add a sub-head.</p>
            )}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code / Account</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Opening Balance</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  {(canManage || canCreateSubHead) && <th className="px-3 py-2.5 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flat.map(({ node, depth }) => {
                  const acc = node.account;
                  const hasChildren = node.children.length > 0;
                  return (
                    <tr key={acc.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center" style={{ paddingLeft: depth * 20 }}>
                          {hasChildren ? (
                            <button
                              onClick={() => toggleExpand(acc.id)}
                              className="mr-1 rounded p-0.5 hover:bg-muted"
                            >
                              {expanded.has(acc.id) || search
                                ? <ChevronDown className="h-4 w-4" />
                                : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="mr-1 inline-block w-5" />
                          )}
                          {acc.is_group
                            ? <Folder className="mr-2 h-4 w-4 text-primary" />
                            : <FileText className="mr-2 h-4 w-4 text-muted-foreground" />}
                          <span className="font-mono text-xs font-medium text-muted-foreground">{acc.code}</span>
                          <span className="ml-2 font-medium text-foreground">{acc.name}</span>
                          {canAddChild && acc.is_group && (
                            <button
                              onClick={() => openAdd(acc.id, acc.account_type)}
                              className="ml-2 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                              title="Add child account"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><AccountTypeBadge type={acc.account_type} /></td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {acc.is_group ? '-' : formatCurrency(resolveOpening(acc.id, acc.opening_balance, projectOB))}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={acc.is_active ? 'success' : 'secondary'} className="text-[10px]">
                          {acc.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      {(canManage || canCreateSubHead) && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {canManage && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(acc)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canManage && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(acc)}>
                                {acc.is_active ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => openDelete(acc)}
                                title="Delete account"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canCreateSubHead && !canManage && acc.is_group && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openAdd(acc.id, acc.account_type)}
                                title="Add sub-head"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update account details.' : 'Create a new account in the chart of accounts.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  readOnly={!!form.parent_id && !editing}
                  className={form.parent_id && !editing ? 'bg-muted/50 text-muted-foreground' : ''}
                />
                {form.parent_id && !editing && (
                  <p className="text-xs text-muted-foreground">Auto-generated from parent</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Select
                  value={form.account_type}
                  onValueChange={(v) => {
                    const newType = v as AccountType;
                    if (form.parent_id) return;
                    setForm({ ...form, account_type: newType, code: editing ? form.code : nextCode(null, newType) });
                  }}
                  disabled={!!form.parent_id || (canCreateSubHead && !canManage)}
                >
                  <SelectTrigger className={form.parent_id ? 'bg-muted/50' : ''}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.parent_id && (
                  <p className="text-xs text-muted-foreground">Inherited from parent</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cash on Hand" />
            </div>
            <div className="space-y-1.5">
              <Label>Parent Account</Label>
              <Popover open={parentOpen} onOpenChange={setParentOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={parentOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedParent
                        ? `${selectedParent.code} - ${selectedParent.name}${selectedParent.is_group ? ' [Group]' : ''}`
                        : 'None (top level)'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name or code..."
                      value={parentSearch}
                      onValueChange={setParentSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No account found.</CommandEmpty>
                      <CommandGroup>
                        {canManage && (
                          <CommandItem value="" onSelect={() => onParentChange('')}>
                            <Check className={cn('h-4 w-4', !form.parent_id ? 'opacity-100' : 'opacity-0')} />
                            <span>None (top level)</span>
                          </CommandItem>
                        )}
                        {filteredParents.map((a) => (
                          <CommandItem key={a.id} value={a.id} onSelect={() => onParentChange(a.id)}>
                            <Check className={cn('h-4 w-4 shrink-0', form.parent_id === a.id ? 'opacity-100' : 'opacity-0')} />
                            <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                            <span className="truncate">{a.name}</span>
                            {a.is_group && <Badge variant="secondary" className="text-[10px]">Group</Badge>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">Select a parent to create a sub-head. Code and account type auto-generate from parent.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <Input
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })}
                  disabled={form.is_group}
                />
              </div>
              <div className="flex items-end gap-4 pb-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_group}
                    onChange={(e) => setForm({ ...form, is_group: e.target.checked })}
                    disabled={canCreateSubHead && !canManage}
                    className="h-4 w-4 rounded border-input"
                  />
                  Group account
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteCheck(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account — {deleteTarget?.code} {deleteTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This will permanently remove the account from the chart of accounts.</p>
                {!deleteCheck && <p className="text-muted-foreground">Checking for references...</p>}
                {deleteCheck?.hasChildren && (
                  <p className="text-destructive font-medium">Cannot delete: this account has child accounts. Delete or reassign them first.</p>
                )}
                {deleteCheck?.hasVouchers && (
                  <p className="text-destructive font-medium">Cannot delete: this account is referenced in vouchers. Deactivate it instead.</p>
                )}
                {deleteCheck?.hasBudgets && (
                  <p className="text-destructive font-medium">Cannot delete: this account has budget entries. Remove them first.</p>
                )}
                {deleteCheck && !deleteCheck.hasChildren && !deleteCheck.hasVouchers && !deleteCheck.hasBudgets && (
                  <p className="text-muted-foreground">This account has no child accounts, vouchers, or budgets. It is safe to delete.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteCheck && !deleteCheck.hasChildren && !deleteCheck.hasVouchers && !deleteCheck.hasBudgets ? (
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction disabled className="opacity-50 cursor-not-allowed">
                Delete Account
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
