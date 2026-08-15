'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { can } from '@/lib/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { logAudit } from '@/lib/audit';
import { Loader2, Plus, Copy, FolderKanban, CheckCircle2, Pencil, Trash2, MoreVertical } from 'lucide-react';

const COPY_OPTIONS = [
  { key: 'chart_of_accounts', label: 'Chart of Accounts', table: 'chart_of_accounts' },
  { key: 'cost_centers', label: 'Cost Centers', table: 'cost_centers' },
  { key: 'voucher_types', label: 'Voucher Types', table: 'voucher_types' },
  { key: 'asset_categories', label: 'Fixed Asset Categories', table: 'asset_categories' },
  { key: 'budgets', label: 'Budget Heads', table: 'budgets' },
];

export default function ProjectsPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const [projects, setProjects] = useState<(Project & { donor_name?: string; branch_name?: string; office_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<Project | null>(null);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [donors, setDonors] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*, donor: donors ( name ), branch: branches!projects_branch_id_fkey ( name )')
      .order('code');
    if (error) toast.error(error.message);
    if (data) {
      const projectIds = data.map((p: any) => p.id);
      let officeCounts: Record<string, number> = {};
      if (projectIds.length > 0) {
        const { data: officeData } = await supabase
          .from('branches')
          .select('project_id')
          .in('project_id', projectIds);
        officeCounts = (officeData ?? []).reduce((acc: Record<string, number>, row: any) => {
          acc[row.project_id] = (acc[row.project_id] ?? 0) + 1;
          return acc;
        }, {});
      }
      setProjects(data.map((p: any) => ({
        ...p,
        donor_name: p.donor?.name,
        branch_name: p.branch?.name,
        office_count: officeCounts[p.id] ?? 0,
      })));
    }
    const { data: donorData } = await supabase.from('donors').select('id, name').order('name');
    setDonors(donorData ?? []);
    const { data: branchData } = await supabase.from('branches').select('id, name').order('name');
    setBranches(branchData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Donor-funded projects with independent accounting and master data"
        actions={can(role, 'manage_master_data') && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> New Project</Button>
        )}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FolderKanban className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                  </div>
                </div>
                <Badge variant={p.status === 'active' ? 'success' : 'secondary'} className="text-[10px] capitalize">{p.status}</Badge>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {p.donor_name && <p>Donor: <span className="text-foreground">{p.donor_name}</span></p>}
                <p>Period: <span className="text-foreground">{p.start_date ? formatDate(p.start_date) : '-'} — {p.end_date ? formatDate(p.end_date) : '-'}</span></p>
                <p>Budget: <span className="font-mono text-foreground">{formatCurrency(p.budget_amount)}</span></p>
                <p>Offices: <span className="text-foreground">{p.office_count ?? 0}</span></p>
              </div>
              {can(role, 'copy_master_data') && (
                <div className="mt-4 flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setCopyTarget(p); setCopyOpen(true); }}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> Copy Master Data
                  </Button>
                  {can(role, 'manage_master_data') && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="px-2"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(p)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Project
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          donors={donors}
          branches={branches}
          onSaved={load}
        />
      )}

      {editTarget && (
        <EditProjectDialog
          target={editTarget}
          donors={donors}
          branches={branches}
          open={!!editTarget}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          onSaved={load}
        />
      )}

      {copyTarget && (
        <CopyMasterDataDialog
          target={copyTarget}
          projects={projects}
          open={copyOpen}
          onOpenChange={(o) => { setCopyOpen(o); if (!o) setCopyTarget(null); }}
          onSaved={load}
        />
      )}

      {deleteTarget && (
        <DeleteProjectDialog
          target={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          onDeleted={load}
        />
      )}
    </div>
  );
}

function CreateProjectDialog({ open, onOpenChange, donors, branches, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  donors: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [donorId, setDonorId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code || !name) { toast.error('Code and name are required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('projects').insert({
        code, name,
        donor_id: donorId || null,
        branch_id: branchId || null,
        start_date: startDate || null,
        end_date: endDate || null,
        budget_amount: budgetAmount ? Number(budgetAmount) : 0,
        status: 'active',
        is_active: true,
      });
      if (error) throw error;
      toast.success('Project created');
      onOpenChange(false);
      setCode(''); setName(''); setDonorId(''); setBranchId(''); setStartDate(''); setEndDate(''); setBudgetAmount('');
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Create a new project. After creation, use Copy Master Data to set up its accounting structure.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PRJ-004" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Education Project" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Donor</Label>
              <Select value={donorId || 'none'} onValueChange={(v) => setDonorId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {donors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={branchId || 'none'} onValueChange={(v) => setBranchId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Budget Amount</Label>
            <Input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyMasterDataDialog({ target, projects, open, onOpenChange, onSaved }: {
  target: Project;
  projects: Project[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [selected, setSelected] = useState<string[]>(COPY_OPTIONS.map((o) => o.key));
  const [copying, setCopying] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const doCopy = async () => {
    if (!sourceId) { toast.error('Select a source project'); return; }
    if (sourceId === target.id) { toast.error('Cannot copy from the same project'); return; }
    setCopying(true);
    try {
      let copiedCount = 0;

      if (selected.includes('chart_of_accounts')) {
        const { data: sourceCoa } = await supabase
          .from('chart_of_accounts')
          .select('*')
          .or(`project_id.eq.${sourceId},project_id.is.null`)
          .order('code');
        if (sourceCoa && sourceCoa.length > 0) {
          const oldIdMap = new Map<string, string>();
          for (const acc of sourceCoa) {
            const oldId = acc.id;
            const newId = crypto.randomUUID();
            oldIdMap.set(oldId, newId);
          }
          const rows = sourceCoa.map((acc: any) => ({
            id: oldIdMap.get(acc.id),
            code: acc.code,
            name: acc.name,
            account_type: acc.account_type,
            parent_id: acc.parent_id ? (oldIdMap.get(acc.parent_id) ?? null) : null,
            is_group: acc.is_group,
            is_active: true,
            opening_balance: 0,
            description: acc.description ?? '',
            project_id: target.id,
            cloned_from_id: acc.project_id === null ? acc.id : (acc.cloned_from_id ?? null),
          }));
          const { error } = await supabase.from('chart_of_accounts').insert(rows);
          if (error) throw error;
          copiedCount += rows.length;
        }
      }

      if (selected.includes('cost_centers')) {
        const { data: sourceCc } = await supabase
          .from('cost_centers')
          .select('*')
          .eq('project_id', sourceId);
        if (sourceCc && sourceCc.length > 0) {
          const rows = sourceCc.map((cc: any) => ({
            code: cc.code,
            name: cc.name,
            branch_id: cc.branch_id ?? null,
            project_id: target.id,
            is_active: true,
          }));
          const { error } = await supabase.from('cost_centers').insert(rows);
          if (error) throw error;
          copiedCount += rows.length;
        }
      }

      if (selected.includes('asset_categories')) {
        const { data: sourceCats } = await supabase
          .from('asset_categories')
          .select('*')
          .eq('project_id', sourceId);
        if (sourceCats && sourceCats.length > 0) {
          const rows = sourceCats.map((cat: any) => ({
            name: cat.name,
            code: cat.code,
            gl_account_id: cat.gl_account_id,
            accum_depn_gl_account_id: cat.accum_depn_gl_account_id,
            project_id: target.id,
            opening_cost: 0,
            transferred_cost: 0,
            addition_cost: 0,
            adjustment_cost: 0,
            opening_depn: 0,
            transferred_depn: 0,
            depn_for_year: 0,
            adjustment_depn: 0,
          }));
          const { error } = await supabase.from('asset_categories').insert(rows);
          if (error) throw error;
          copiedCount += rows.length;
        }
      }

      if (selected.includes('budgets')) {
        const { data: sourceBudgets } = await supabase
          .from('budgets')
          .select('*')
          .eq('project_id', sourceId);
        if (sourceBudgets && sourceBudgets.length > 0) {
          const rows = sourceBudgets.map((b: any) => ({
            financial_year_id: b.financial_year_id,
            branch_id: null,
            department_id: null,
            project_id: target.id,
            account_id: b.account_id,
            amount: b.amount,
            period: b.period,
            status: 'draft',
          }));
          const { error } = await supabase.from('budgets').insert(rows);
          if (error) throw error;
          copiedCount += rows.length;
        }
      }

      toast.success(`Copied ${copiedCount} master data records to ${target.name}`);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Master Data to {target.name}</DialogTitle>
          <DialogDescription>
            Copy accounting structure from an existing project. Only master data is copied — no vouchers, balances, or transaction history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Source Project</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Select source project" /></SelectTrigger>
              <SelectContent>
                {projects.filter((p) => p.id !== target.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data to Copy</Label>
            {COPY_OPTIONS.map((opt) => (
              <div key={opt.key} className="flex items-center gap-3 rounded-md border border-border p-2.5">
                <Checkbox
                  id={opt.key}
                  checked={selected.includes(opt.key)}
                  onCheckedChange={() => toggle(opt.key)}
                />
                <Label htmlFor={opt.key} className="text-sm font-normal cursor-pointer flex-1">{opt.label}</Label>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
            <p>All copied data will be independent in {target.name}. Future changes in the source project will not affect it. Opening balances start at zero.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doCopy} disabled={copying || !sourceId}>
            {copying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Copying...</> : <><Copy className="mr-2 h-4 w-4" /> Copy Data</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProjectDialog({ target, donors, branches, open, onOpenChange, onSaved }: {
  target: Project;
  donors: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(target.code);
  const [name, setName] = useState(target.name);
  const [donorId, setDonorId] = useState(target.donor_id ?? '');
  const [branchId, setBranchId] = useState(target.branch_id ?? '');
  const [startDate, setStartDate] = useState(target.start_date ?? '');
  const [endDate, setEndDate] = useState(target.end_date ?? '');
  const [budgetAmount, setBudgetAmount] = useState(String(target.budget_amount || 0));
  const [status, setStatus] = useState(target.status);
  const [isActive, setIsActive] = useState(target.is_active);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code || !name) { toast.error('Code and name are required'); return; }
    setSaving(true);
    try {
      const oldValues = {
        code: target.code, name: target.name, donor_id: target.donor_id,
        branch_id: target.branch_id, start_date: target.start_date,
        end_date: target.end_date, budget_amount: target.budget_amount,
        status: target.status, is_active: target.is_active,
      };
      const newValues = {
        code, name,
        donor_id: donorId || null,
        branch_id: branchId || null,
        start_date: startDate || null,
        end_date: endDate || null,
        budget_amount: budgetAmount ? Number(budgetAmount) : 0,
        status,
        is_active: isActive,
      };
      const { error } = await supabase.from('projects').update(newValues).eq('id', target.id);
      if (error) throw error;
      await logAudit({ action: 'update', table_name: 'projects', record_id: target.id, old_values: oldValues, new_values: newValues });
      toast.success('Project updated');
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details. Changes are logged in the audit trail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Donor</Label>
              <Select value={donorId || 'none'} onValueChange={(v) => setDonorId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {donors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={branchId || 'none'} onValueChange={(v) => setBranchId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Budget Amount</Label>
              <Input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border p-2.5">
            <Checkbox id="proj-active" checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
            <Label htmlFor="proj-active" className="text-sm font-normal cursor-pointer">Active (visible in project selector)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({ target, open, onOpenChange, onDeleted }: {
  target: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('projects').delete().eq('id', target.id);
      if (error) throw error;
      await logAudit({ action: 'delete', table_name: 'projects', record_id: target.id, old_values: { code: target.code, name: target.name } });
      toast.success('Project deleted');
      onOpenChange(false);
      onDeleted();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{target.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the project and all its associated data (chart of accounts, cost centers, budgets, opening balances).
            Vouchers linked to this project will have their project reference cleared but will not be deleted.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={doDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete Project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
