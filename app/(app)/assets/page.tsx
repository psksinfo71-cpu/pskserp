'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { formatCurrency, formatDate, toInputDate } from '@/lib/format';
import { fmtAmt, fmtReportDate } from '@/lib/report-data';
import {
  type AssetCategory, type AssetRow, type AssetTransaction, type DepreciationRun,
  type Branch, computeDepreciation, openingWDV, nextVoucherNo,
} from '@/lib/asset-helpers';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, ArrowRightLeft, Ban, Calculator,
  Loader2, FileText, BookOpen, TrendingDown,
} from 'lucide-react';

export default function AssetsPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const canManage = can(role, 'manage_master_data');
  const [tab, setTab] = useState('register');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixed Assets"
        description="Asset register, transactions, depreciation run & schedules"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="register" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Register</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Transactions</TabsTrigger>
          <TabsTrigger value="depreciation" className="gap-1.5"><Calculator className="h-3.5 w-3.5" />Depreciation Run</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5"><TrendingDown className="h-3.5 w-3.5" />Schedules</TabsTrigger>
        </TabsList>
        <TabsContent value="register"><AssetRegister canManage={canManage} /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab canManage={canManage} /></TabsContent>
        <TabsContent value="depreciation"><DepreciationTab canManage={canManage} /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================
// ASSET REGISTER TAB
// =============================================================
function AssetRegister({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Transfer & Disposal state
  const [transferTarget, setTransferTarget] = useState<AssetRow | null>(null);
  const [disposalTarget, setDisposalTarget] = useState<AssetRow | null>(null);

  const [txnForm, setTxnForm] = useState({
    amount: '', to_branch_id: '', from_branch_id: '', transaction_date: toInputDate(new Date()), narration: '',
  });
  const [txnSaving, setTxnSaving] = useState(false);

  const [form, setForm] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, cRes, bRes] = await Promise.all([
      supabase.from('assets').select('*, category:asset_categories(*)').order('code'),
      supabase.from('asset_categories').select('*').order('sort_order'),
      supabase.from('branches').select('*').order('name'),
    ]);
    if (aRes.data) setAssets(aRes.data as unknown as AssetRow[]);
    if (cRes.data) setCategories(cRes.data as AssetCategory[]);
    if (bRes.data) setBranches(bRes.data as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = assets.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
      (a.category?.name ?? '').toLowerCase().includes(q);
  });

  const blankForm = () => ({
    code: '', name: '', category_id: '', branch_id: '', location: '',
    purchase_date: toInputDate(new Date()), purchase_cost: 0, opening_value: 0,
    salvage_value: 0, useful_life_years: 5, depreciation_method: 'wdv',
    status: 'in_service', is_active: true,
  });

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setDialogOpen(true);
  };

  const openEdit = (a: AssetRow) => {
    setEditing(a);
    setForm({
      code: a.code, name: a.name, category_id: a.category_id ?? '',
      branch_id: a.branch_id ?? '', location: a.location,
      purchase_date: a.purchase_date ? toInputDate(a.purchase_date) : '',
      purchase_cost: a.purchase_cost, opening_value: a.opening_value,
      salvage_value: a.salvage_value, useful_life_years: a.useful_life_years ?? 5,
      depreciation_method: a.depreciation_method ?? 'wdv', status: a.status ?? 'in_service',
      is_active: a.is_active,
    });
    setDialogOpen(true);
  };

  const selectedCategory = categories.find((c) => c.id === form.category_id);
  const autoDepnRate = selectedCategory?.depreciation_rate ?? 0;

  const save = async () => {
    if (!form.code || !form.name || !form.category_id) {
      toast.error('Code, Name and Category are required');
      return;
    }
    setSaving(true);
    try {
      const cat = categories.find((c) => c.id === form.category_id);
      const payload = {
        code: form.code, name: form.name,
        category_id: form.category_id,
        category: cat?.name ?? '',
        branch_id: form.branch_id || null,
        location: form.location ?? '',
        purchase_date: form.purchase_date || null,
        purchase_cost: Number(form.purchase_cost) || 0,
        opening_value: Number(form.opening_value) || 0,
        salvage_value: Number(form.salvage_value) || 0,
        useful_life_years: Number(form.useful_life_years) || 5,
        depreciation_method: form.depreciation_method ?? 'wdv',
        status: form.status ?? 'in_service',
        is_active: !!form.is_active,
        gl_account_id: cat?.gl_account_id ?? null,
        current_value: Number(form.purchase_cost) || 0,
      };

      if (editing) {
        const { error } = await supabase.from('assets').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit({ action: 'update', table_name: 'assets', record_id: editing.id, new_values: payload });
        toast.success('Asset updated');
      } else {
        const { data, error } = await supabase.from('assets').insert(payload).select().single();
        if (error) throw error;
        await logAudit({ action: 'insert', table_name: 'assets', record_id: data.id, new_values: payload });

        // Record purchase transaction
        if (Number(form.purchase_cost) > 0) {
          await supabase.from('asset_transactions').insert({
            asset_id: data.id, category_id: form.category_id,
            transaction_type: 'purchase',
            transaction_date: form.purchase_date || toInputDate(new Date()),
            amount: Number(form.purchase_cost),
            narration: `Purchase of ${form.name}`,
            created_by: profile?.id,
          });
        }
        toast.success('Asset created');
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteAsset = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('assets').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      await logAudit({ action: 'delete', table_name: 'assets', record_id: deleteTarget.id });
      toast.success('Asset deleted');
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  // --- Transaction actions (Transfer & Disposal) ---
  const openTransfer = (a: AssetRow) => {
    setTransferTarget(a);
    setTxnForm({ ...txnForm, from_branch_id: a.branch_id ?? '', to_branch_id: '', amount: '0', narration: `Transfer of ${a.name}` });
  };

  const openDisposal = (a: AssetRow) => {
    setDisposalTarget(a);
    setTxnForm({ ...txnForm, amount: String(a.current_value), narration: `Disposal of ${a.name}` });
  };

  const saveTransfer = async () => {
    if (!transferTarget) return;
    if (!txnForm.to_branch_id) { toast.error('Select destination branch'); return; }
    setTxnSaving(true);
    try {
      const { error: aErr } = await supabase.from('assets')
        .update({ branch_id: txnForm.to_branch_id, transfer_date: txnForm.transaction_date }).eq('id', transferTarget.id);
      if (aErr) throw aErr;

      await supabase.from('asset_transactions').insert({
        asset_id: transferTarget.id,
        category_id: transferTarget.category_id,
        transaction_type: 'transfer',
        transaction_date: txnForm.transaction_date,
        amount: 0,
        from_branch_id: txnForm.from_branch_id || null,
        to_branch_id: txnForm.to_branch_id,
        narration: txnForm.narration,
        created_by: profile?.id,
      });

      await logAudit({ action: 'transfer', table_name: 'assets', record_id: transferTarget.id, new_values: { from: txnForm.from_branch_id, to: txnForm.to_branch_id } });
      toast.success('Asset transferred');
      setTransferTarget(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTxnSaving(false);
    }
  };

  const saveDisposal = async () => {
    if (!disposalTarget) return;
    setTxnSaving(true);
    try {
      const disposalAmt = Number(txnForm.amount) || 0;
      const { error: aErr } = await supabase.from('assets')
        .update({ status: 'disposed', disposal_date: txnForm.transaction_date, disposal_value: disposalAmt, is_active: false })
        .eq('id', disposalTarget.id);
      if (aErr) throw aErr;

      await supabase.from('asset_transactions').insert({
        asset_id: disposalTarget.id,
        category_id: disposalTarget.category_id,
        transaction_type: 'disposal',
        transaction_date: txnForm.transaction_date,
        amount: disposalAmt,
        narration: txnForm.narration,
        created_by: profile?.id,
      });

      await logAudit({ action: 'disposal', table_name: 'assets', record_id: disposalTarget.id, new_values: { disposal_value: disposalAmt } });
      toast.success('Asset disposed');
      setDisposalTarget(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTxnSaving(false);
    }
  };

  const totalCost = filtered.reduce((s, a) => s + (Number(a.purchase_cost) || 0), 0);
  const totalAccumDepn = filtered.reduce((s, a) => s + (Number(a.accumulated_depreciation) || 0), 0);
  const totalWDV = filtered.reduce((s, a) => s + (Number(a.current_value) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Input placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canManage && <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Asset</Button>}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading assets...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No assets found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acc. Depn</th>
                  <th className="px-4 py-2.5 text-right font-medium">WDV</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {canManage && <th className="px-3 py-2.5 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{a.code}</td>
                    <td className="px-4 py-2.5 font-medium">{a.name}</td>
                    <td className="px-4 py-2.5 text-xs">{a.category?.name ?? '-'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(a.purchase_cost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(a.accumulated_depreciation)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">{formatCurrency(a.current_value)}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={a.status === 'in_service' ? 'success' : a.status === 'disposed' ? 'destructive' : 'warning'} className="text-[10px] capitalize">
                        {a.status?.replace('_', ' ')}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                          {a.status !== 'disposed' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTransfer(a)} title="Transfer"><ArrowRightLeft className="h-3.5 w-3.5" /></Button>
                          )}
                          {a.status !== 'disposed' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => openDisposal(a)} title="Disposal"><Ban className="h-3.5 w-3.5" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(a)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/40">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-bold uppercase text-muted-foreground">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums">{formatCurrency(totalCost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums">{formatCurrency(totalAccumDepn)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums">{formatCurrency(totalWDV)}</td>
                  <td className="px-4 py-2.5" />
                  {canManage && <td className="px-3 py-2.5" />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
            <DialogDescription>{editing ? 'Update asset details.' : 'Register a new fixed asset.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Code <span className="text-destructive">*</span></Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="AST-001" /></div>
            <div className="space-y-1.5"><Label>Asset Name <span className="text-destructive">*</span></Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={form.category_id || 'none'} onValueChange={(v) => {
                const cat = categories.find((c) => c.id === v);
                setForm({ ...form, category_id: v === 'none' ? '' : v, depreciation_method: cat?.depreciation_method ?? 'wdv' });
              }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({(c.depreciation_rate * 100).toFixed(0)}%)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Depreciation Rate (auto from category)</Label>
              <Input value={`${(autoDepnRate * 100).toFixed(2)}%`} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={form.branch_id || 'none'} onValueChange={(v) => setForm({ ...form, branch_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Purchase Cost</Label><Input type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Opening Value (WDV at FY start)</Label><Input type="number" value={form.opening_value} onChange={(e) => setForm({ ...form, opening_value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Salvage Value</Label><Input type="number" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Useful Life (Years)</Label><Input type="number" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Depreciation Method</Label>
              <Select value={form.depreciation_method || 'wdv'} onValueChange={(v) => setForm({ ...form, depreciation_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wdv">Written Down Value (WDV)</SelectItem>
                  <SelectItem value="straight_line">Straight Line</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || 'in_service'} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_service">In Service</SelectItem>
                  <SelectItem value="under_maintenance">Under Maintenance</SelectItem>
                  <SelectItem value="disposed">Disposed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={!!transferTarget} onOpenChange={(open) => { if (!open) setTransferTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Asset</DialogTitle>
            <DialogDescription>{transferTarget?.name} ({transferTarget?.code})</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>From Branch</Label>
              <Select value={txnForm.from_branch_id || 'none'} onValueChange={(v) => setTxnForm({ ...txnForm, from_branch_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To Branch <span className="text-destructive">*</span></Label>
              <Select value={txnForm.to_branch_id || 'none'} onValueChange={(v) => setTxnForm({ ...txnForm, to_branch_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Transfer Date</Label><Input type="date" value={txnForm.transaction_date} onChange={(e) => setTxnForm({ ...txnForm, transaction_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Narration</Label><Input value={txnForm.narration} onChange={(e) => setTxnForm({ ...txnForm, narration: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferTarget(null)}>Cancel</Button>
            <Button onClick={saveTransfer} disabled={txnSaving}>{txnSaving ? 'Saving...' : 'Transfer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disposal Dialog */}
      <Dialog open={!!disposalTarget} onOpenChange={(open) => { if (!open) setDisposalTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dispose Asset</DialogTitle>
            <DialogDescription>{disposalTarget?.name} ({disposalTarget?.code}) — Current WDV: {formatCurrency(disposalTarget?.current_value ?? 0)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label>Disposal Date</Label><Input type="date" value={txnForm.transaction_date} onChange={(e) => setTxnForm({ ...txnForm, transaction_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Disposal/Sale Value</Label><Input type="number" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Narration</Label><Input value={txnForm.narration} onChange={(e) => setTxnForm({ ...txnForm, narration: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposalTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={saveDisposal} disabled={txnSaving}>{txnSaving ? 'Saving...' : 'Dispose'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.code}) and all its transactions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAsset} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================
// TRANSACTIONS TAB
// =============================================================
function TransactionsTab({ canManage }: { canManage: boolean }) {
  const [txns, setTxns] = useState<AssetTransaction[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, aRes] = await Promise.all([
      supabase.from('asset_transactions').select('*, asset:assets(code, name)').order('transaction_date', { ascending: false }),
      supabase.from('assets').select('*, category:asset_categories(*)').order('code'),
    ]);
    if (tRes.data) setTxns(tRes.data as unknown as AssetTransaction[]);
    if (aRes.data) setAssets(aRes.data as unknown as AssetRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = txns.filter((t) => filterType === 'all' || t.transaction_type === filterType);

  const typeBadge = (type: string) => {
    const map: Record<string, 'success' | 'default' | 'warning' | 'destructive'> = {
      purchase: 'success', addition: 'default', transfer: 'warning', disposal: 'destructive', revaluation: 'default',
    };
    return map[type] ?? 'default';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="addition">Addition</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="disposal">Disposal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading transactions...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No transactions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Narration</th>
                  <th className="px-4 py-2.5 font-medium">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs">{formatDate(t.transaction_date)}</td>
                    <td className="px-4 py-2.5"><Badge variant={typeBadge(t.transaction_type)} className="text-[10px] capitalize">{t.transaction_type}</Badge></td>
                    <td className="px-4 py-2.5 text-xs">{t.asset ? `${t.asset.code} - ${t.asset.name}` : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(t.amount)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{t.narration}</td>
                    <td className="px-4 py-2.5">{t.posted ? <Badge variant="success" className="text-[10px]">Yes</Badge> : <Badge variant="secondary" className="text-[10px]">No</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// =============================================================
// DEPRECIATION RUN TAB
// =============================================================
function DepreciationTab({ canManage }: { canManage: boolean }) {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMode, setRunMode] = useState<'monthly' | 'yearly'>('monthly');
  const [runDate, setRunDate] = useState(toInputDate(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, cRes, rRes] = await Promise.all([
      supabase.from('assets').select('*, category:asset_categories(*)').order('code'),
      supabase.from('asset_categories').select('*').order('sort_order'),
      supabase.from('asset_depreciation_runs').select('*').order('run_at', { ascending: false }),
    ]);
    if (aRes.data) setAssets(aRes.data as unknown as AssetRow[]);
    if (cRes.data) setCategories(cRes.data as AssetCategory[]);
    if (rRes.data) setRuns(rRes.data as unknown as DepreciationRun[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeAssets = assets.filter((a) => a.status !== 'disposed' && a.is_active);

  // Preview depreciation amounts
  const preview = activeAssets.map((a) => {
    const cat = a.category ?? categories.find((c) => c.id === a.category_id);
    const depn = computeDepreciation(a, cat, runMode);
    return { asset: a, category: cat, depn };
  }).filter((p) => p.depn > 0);

  const totalPreview = preview.reduce((s, p) => s + p.depn, 0);

  const runDepreciation = async () => {
    if (preview.length === 0) { toast.error('No assets eligible for depreciation'); return; }
    setRunning(true);
    try {
      // Determine period
      const date = new Date(runDate + 'T00:00:00');
      let periodLabel: string, periodStart: string, periodEnd: string;
      if (runMode === 'monthly') {
        const y = date.getFullYear();
        const m = date.getMonth();
        periodLabel = `${y}-${String(m + 1).padStart(2, '0')}`;
        periodStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        periodEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else {
        const y = date.getFullYear();
        const month = date.getMonth() + 1;
        const fyStartYear = month <= 6 ? y - 1 : y;
        periodLabel = `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
        periodStart = `${fyStartYear}-07-01`;
        periodEnd = `${fyStartYear + 1}-06-30`;
      }

      // Check for duplicate run
      const { data: existing } = await supabase
        .from('asset_depreciation_runs')
        .select('id')
        .eq('period_label', periodLabel)
        .eq('status', 'completed')
        .maybeSingle();
      if (existing) {
        toast.error(`Depreciation already run for ${periodLabel}`);
        return;
      }

      // Get depreciation expense GL account
      const { data: depnAcc } = await supabase
        .from('chart_of_accounts').select('id').eq('code', '5014').maybeSingle();
      if (!depnAcc) { toast.error('Depreciation expense account (5014) not found'); return; }

      // Post journal voucher: Dr Depreciation Expense, Cr Accumulated Depreciation (per category)
      // We'll post one voucher per category that has depreciation
      const byCategory = new Map<string, number>();
      for (const p of preview) {
        if (!p.category) continue;
        const cur = byCategory.get(p.category.id) ?? 0;
        byCategory.set(p.category.id, cur + p.depn);
      }

      const vNo = await nextVoucherNo('JV');
      const totalDepn = totalPreview;

      // Create voucher with combined narration
      const { data: voucher, error: vErr } = await supabase
        .from('vouchers').insert({
          voucher_no: vNo,
          voucher_type: 'JV',
          voucher_date: runDate,
          narration: `Depreciation for ${periodLabel} (${runMode})`,
          amount: totalDepn,
          status: 'posted',
          prepared_by: profile?.id,
          posted_at: new Date().toISOString(),
        }).select().single();
      if (vErr) throw new Error(`Voucher error: ${vErr.message}`);

      // Create voucher details: Dr Depreciation Expense (total), Cr each Accumulated Depn account
      const details: Record<string, any>[] = [];
      // Single Dr line for total depreciation expense
      details.push({
        voucher_id: voucher.id,
        account_id: depnAcc.id,
        debit: totalDepn,
        credit: 0,
        narration: `Depreciation expense for ${periodLabel}`,
        line_order: 1,
      });
      // Cr lines per category
      let order = 2;
      for (const [catId, amt] of byCategory.entries()) {
        const cat = categories.find((c) => c.id === catId);
        if (!cat?.accum_depn_gl_account_id) continue;
        details.push({
          voucher_id: voucher.id,
          account_id: cat.accum_depn_gl_account_id,
          debit: 0,
          credit: amt,
          narration: `Accumulated depreciation - ${cat.name}`,
          line_order: order++,
        });
      }
      const { error: dErr } = await supabase.from('voucher_details').insert(details);
      if (dErr) throw new Error(`Details error: ${dErr.message}`);

      // Create depreciation run record
      const { data: runRec, error: rErr } = await supabase
        .from('asset_depreciation_runs').insert({
          period_type: runMode,
          period_label: periodLabel,
          period_start: periodStart,
          period_end: periodEnd,
          total_depreciation: totalDepn,
          voucher_id: voucher.id,
          status: 'completed',
          run_by: profile?.id,
        }).select().single();
      if (rErr) throw new Error(`Run record error: ${rErr.message}`);

      // Update each asset's accumulated_depreciation and current_value
      for (const p of preview) {
        const newAccumDepn = Number(p.asset.accumulated_depreciation) + p.depn;
        const newCurrentValue = Number(p.asset.purchase_cost) - newAccumDepn;
        await supabase.from('assets')
          .update({ accumulated_depreciation: newAccumDepn, current_value: newCurrentValue })
          .eq('id', p.asset.id);

        // Record depreciation transaction
        await supabase.from('asset_transactions').insert({
          asset_id: p.asset.id,
          category_id: p.category?.id ?? null,
          transaction_type: 'revaluation',
          transaction_date: runDate,
          amount: p.depn,
          narration: `Depreciation for ${periodLabel}`,
          voucher_id: voucher.id,
          depreciation_run_id: runRec.id,
          posted: true,
          created_by: profile?.id,
        });
      }

      await logAudit({ action: 'depreciation_run', table_name: 'asset_depreciation_runs', record_id: runRec.id, new_values: { period: periodLabel, total: totalDepn } });
      toast.success(`Depreciation posted: ${formatCurrency(totalDepn)} for ${periodLabel}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Run control */}
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-semibold">Run Depreciation</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={runMode} onValueChange={(v) => setRunMode(v as 'monthly' | 'yearly')}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly (Full FY)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{runMode === 'monthly' ? 'Month' : 'FY End Date'}</Label>
            <Input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} className="w-[180px]" />
          </div>
          {canManage && (
            <Button onClick={runDepreciation} disabled={running || preview.length === 0}>
              {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</> : <><Calculator className="mr-2 h-4 w-4" /> Run Depreciation</>}
            </Button>
          )}
          <div className="ml-auto rounded-lg bg-primary/10 px-4 py-2 text-sm">
            <span className="text-muted-foreground">Total Depreciation: </span>
            <span className="font-bold tabular-nums">{formatCurrency(totalPreview)}</span>
            <span className="ml-2 text-xs text-muted-foreground">({preview.length} assets)</span>
          </div>
        </div>
      </Card>

      {/* Preview table */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Depreciation Preview</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : preview.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No assets eligible for depreciation in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                  <th className="px-4 py-2.5 text-right font-medium">WDV</th>
                  <th className="px-4 py-2.5 text-right font-medium">Depn ({runMode === 'monthly' ? 'month' : 'year'})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((p) => (
                  <tr key={p.asset.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.asset.code}</td>
                    <td className="px-4 py-2.5 font-medium">{p.asset.name}</td>
                    <td className="px-4 py-2.5 text-xs">{p.category?.name ?? '-'}</td>
                    <td className="px-4 py-2.5 text-right text-xs">{((p.category?.depreciation_rate ?? 0) * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(p.asset.current_value)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">{formatCurrency(p.depn)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/40">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-bold uppercase text-muted-foreground">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums">{formatCurrency(totalPreview)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Run history */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Depreciation Run History</h3>
        </div>
        {runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No depreciation runs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Period</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Run At</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total Depn</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{r.period_label}</td>
                    <td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px] capitalize">{r.period_type}</Badge></td>
                    <td className="px-4 py-2.5 text-xs">{formatDate(r.run_at)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(r.total_depreciation)}</td>
                    <td className="px-4 py-2.5"><Badge variant={r.status === 'completed' ? 'success' : 'warning'} className="text-[10px] capitalize">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// =============================================================
// SCHEDULE TAB (Year-wise & Month-wise)
// =============================================================
function ScheduleTab() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, cRes] = await Promise.all([
      supabase.from('assets').select('*, category:asset_categories(*)').order('code'),
      supabase.from('asset_categories').select('*').order('sort_order'),
    ]);
    if (aRes.data) setAssets(aRes.data as unknown as AssetRow[]);
    if (cRes.data) setCategories(cRes.data as AssetCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeAssets = assets.filter((a) => a.status !== 'disposed');

  // Year-wise schedule: by category
  const yearlyByCategory = categories.map((cat) => {
    const catAssets = activeAssets.filter((a) => a.category_id === cat.id);
    const totalCost = catAssets.reduce((s, a) => s + (Number(a.purchase_cost) || 0), 0);
    const totalOpeningWDV = catAssets.reduce((s, a) => s + openingWDV(a), 0);
    const accumDepn = catAssets.reduce((s, a) => s + (Number(a.accumulated_depreciation) || 0), 0);
    const yearDepn = catAssets.reduce((s, a) => s + computeDepreciation(a, cat, 'yearly'), 0);
    const closingWDV = totalCost - accumDepn - yearDepn;
    return { category: cat, totalCost, openingWDV: totalOpeningWDV, accumDepn, yearDepn, closingWDV, count: catAssets.length };
  }).filter((r) => r.totalCost > 0 || r.yearDepn > 0);

  const grandCost = yearlyByCategory.reduce((s, r) => s + r.totalCost, 0);
  const grandOpening = yearlyByCategory.reduce((s, r) => s + r.openingWDV, 0);
  const grandAccum = yearlyByCategory.reduce((s, r) => s + r.accumDepn, 0);
  const grandYearDepn = yearlyByCategory.reduce((s, r) => s + r.yearDepn, 0);
  const grandClosing = yearlyByCategory.reduce((s, r) => s + r.closingWDV, 0);

  // Monthly schedule: 12 months for selected year
  const months = Array.from({ length: 12 }, (_, i) => i);
  const monthlyData = months.map((m) => {
    const monthAssets = activeAssets.map((a) => {
      const cat = a.category ?? categories.find((c) => c.id === a.category_id);
      const depn = computeDepreciation(a, cat, 'monthly');
      return { asset: a, depn };
    }).filter((p) => p.depn > 0);
    return { month: m, total: monthAssets.reduce((s, p) => s + p.depn, 0), count: monthAssets.length };
  });

  const yearTotal = monthlyData.reduce((s, m) => s + m.total, 0);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Generating schedules...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Select value={view} onValueChange={(v) => setView(v as 'yearly' | 'monthly')}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yearly">Year-wise</SelectItem>
            <SelectItem value="monthly">Month-wise</SelectItem>
          </SelectContent>
        </Select>
        {view === 'monthly' && (
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {view === 'yearly' ? (
        <>
          {/* Year-wise Fixed Asset Register */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Fixed Asset Register (Year-wise)</h3>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2 border-border bg-primary/10 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold" rowSpan={2}>Category</th>
                    <th className="px-2 py-1 text-center font-bold" colSpan={5}>Value at Cost</th>
                    <th className="px-2 py-1 text-center font-bold" colSpan={3}>Depreciation</th>
                    <th className="px-3 py-2 text-right font-bold" rowSpan={2}>Closing WDV</th>
                  </tr>
                  <tr className="border-b-2 border-border bg-primary/10">
                    <th className="px-2 py-1 text-right font-bold">Assets</th>
                    <th className="px-2 py-1 text-right font-bold">Total Cost</th>
                    <th className="px-2 py-1 text-right font-bold">Opening WDV</th>
                    <th className="px-2 py-1 text-right font-bold">Rate</th>
                    <th className="px-2 py-1 text-right font-bold">Year Depn</th>
                    <th className="px-2 py-1 text-right font-bold">Accum. Depn</th>
                    <th className="px-2 py-1 text-right font-bold">Rate</th>
                    <th className="px-2 py-1 text-right font-bold">Year Depn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {yearlyByCategory.map((r) => (
                    <tr key={r.category.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{r.category.name}</td>
                      <td className="px-2 py-2 text-center text-xs">{r.count}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(r.totalCost)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(r.openingWDV)}</td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">{(r.category.depreciation_rate * 100).toFixed(0)}%</td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(r.yearDepn)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(r.accumDepn)}</td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">{(r.category.depreciation_rate * 100).toFixed(0)}%</td>
                      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(r.yearDepn)}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(r.closingWDV)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-primary/10">
                  <tr>
                    <td className="px-3 py-2 font-bold">Total</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandCost)}</td>
                    <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandOpening)}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandYearDepn)}</td>
                    <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandAccum)}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandYearDepn)}</td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(grandClosing)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* Month-wise Depreciation Schedule */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Depreciation Schedule — Month-wise ({selectedYear})</h3>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2 border-border bg-primary/10 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">Month</th>
                    <th className="px-3 py-2 text-right font-bold">Assets</th>
                    <th className="px-3 py-2 text-right font-bold">Monthly Depn</th>
                    <th className="px-3 py-2 text-right font-bold">Cumulative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthlyData.map((m) => {
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const cumulative = monthlyData.slice(0, m.month + 1).reduce((s, x) => s + x.total, 0);
                    return (
                      <tr key={m.month} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{monthNames[m.month]} {selectedYear}</td>
                        <td className="px-3 py-2 text-center text-xs">{m.count}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(m.total)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">{fmtAmt(cumulative)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-border bg-primary/10">
                  <tr>
                    <td className="px-3 py-2 font-bold">Annual Total</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(yearTotal)}</td>
                    <td className="px-3 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(yearTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          </div>
        </>
      )}

      {/* Accumulated Depreciation Ledger (per asset) */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Accumulated Depreciation Ledger (per Asset)</h3>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Asset</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-right font-medium">Opening WDV</th>
                <th className="px-3 py-2 text-right font-medium">Accum. Depn</th>
                <th className="px-3 py-2 text-right font-medium">Current WDV</th>
                <th className="px-3 py-2 text-right font-medium">Annual Depn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeAssets.map((a) => {
                const cat = a.category ?? categories.find((c) => c.id === a.category_id);
                const annualDepn = computeDepreciation(a, cat, 'yearly');
                return (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="px-3 py-2 text-xs">{cat?.name ?? '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(a.purchase_cost))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(openingWDV(a))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(a.accumulated_depreciation))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">{fmtAmt(Number(a.current_value))}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{fmtAmt(annualDepn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
