'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { can } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { BudgetUpload } from '@/components/budget/BudgetUpload';
import { BudgetVsActual } from '@/components/budget/BudgetVsActual';
import { BudgetStatement } from '@/components/budget/BudgetStatement';
import { BudgetVariance } from '@/components/budget/BudgetVariance';
import {
  fetchBudgetVersions, fetchBudgetVsActual, fetchBudgetTree, fetchBudgetVarianceSummary,
  type BudgetVersion, type BudgetWithActual, type BudgetTreeNode, type BudgetFilters, type BudgetVarianceSummary,
} from '@/lib/budget-data';
import { formatCurrency, formatDateTime, toInputDate } from '@/lib/format';
import { PiggyBank, Plus, Upload, Loader2, Trash2, FileBarChart, GitCompare, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { Budget, Branch, Project, FinancialYear, ChartAccount } from '@/lib/types';

const emptyBudgetForm = { accountId: '', previous: '', amount: '', accountType: 'income' as 'income' | 'expense' };

export default function BudgetPage() {
  const { profile, activeProject, userProjects } = useAuth();
  const role = profile?.role ?? 'accountant';
  const canManage = can(role, 'manage_budget');
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<'upload' | 'budget' | 'vs_actual' | 'variance'>('budget');
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [versions, setVersions] = useState<BudgetVersion[]>([]);
  const [existingBudgets, setExistingBudgets] = useState<(Budget & { fy_name?: string; project_name?: string; account_name?: string; version_label?: string | null; prev_year_actual?: number })[]>([]);

  const [filters, setFilters] = useState<Partial<BudgetFilters>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [budgetDialog, setBudgetDialog] = useState<{ mode: 'add' | 'edit'; row?: BudgetWithActual } | null>(null);
  const [budgetForm, setBudgetForm] = useState(emptyBudgetForm);

  const [vsActualRows, setVsActualRows] = useState<BudgetWithActual[]>([]);
  const [vsActualTotals, setVsActualTotals] = useState({ totalBudget: 0, totalActual: 0 });
  const [incomeTree, setIncomeTree] = useState<BudgetTreeNode[]>([]);
  const [expenseTree, setExpenseTree] = useState<BudgetTreeNode[]>([]);
  const [grandTotals, setGrandTotals] = useState({ grandBudget: 0, grandActual: 0 });
  const [varianceSummary, setVarianceSummary] = useState<BudgetVarianceSummary | null>(null);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    setTab(requestedTab === 'variance' ? 'variance' : requestedTab === 'vs_actual' ? 'vs_actual' : 'budget');
  }, [searchParams]);
  const [loading, setLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    const [fyRes, brRes, accRes, verRes] = await Promise.all([
      supabase.from('financial_years').select('*').order('start_date', { ascending: false }),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('chart_of_accounts').select('*').order('code'),
      fetchBudgetVersions(),
    ]);
    setFys((fyRes.data as FinancialYear[]) ?? []);
    setBranches((brRes.data as Branch[]) ?? []);
    setAccounts((accRes.data as ChartAccount[]) ?? []);
    setVersions(verRes);
    setProjects(userProjects.length > 0 ? userProjects : ((await supabase.from('projects').select('*').eq('is_active', true).order('name')).data as Project[]) ?? []);

    const activeFy = (fyRes.data as FinancialYear[])?.find((f) => f.is_active) ?? (fyRes.data as FinancialYear[])?.[0];
    setFilters((prev) => ({
      ...prev,
      fiscalYearId: prev.fiscalYearId ?? activeFy?.id ?? '',
      projectId: prev.projectId ?? activeProject?.id ?? '',
      fromDate: prev.fromDate ?? activeFy?.start_date ?? '',
      toDate: prev.toDate ?? toInputDate(new Date()) ?? '',
    }));
  }, [userProjects, activeProject]);

  const loadExistingBudgets = useCallback(async () => {
    let bq = supabase
      .from('budgets')
      .select(`
        *,
        fy: financial_years ( name ),
        project: projects ( name ),
        account: chart_of_accounts ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    const { data } = await bq;
    setExistingBudgets((data ?? []).map((b) => ({
      ...(b as Budget),
      fy_name: (b as { fy?: { name?: string } }).fy?.name,
      project_name: (b as { project?: { name?: string } }).project?.name,
      account_name: (b as { account?: { name?: string } }).account?.name,
    })));
  }, []);

  const loadReports = useCallback(async () => {
    if (!filters.fiscalYearId || !filters.projectId) return;
    setLoading(true);
    try {
      if (tab === 'vs_actual') {
        const { rows, totalBudget, totalActual } = await fetchBudgetVsActual(filters);
        setVsActualRows(rows);
        setVsActualTotals({ totalBudget, totalActual });
      } else if (tab === 'budget') {
        const { rows, totalBudget, totalActual } = await fetchBudgetVsActual(filters);
        setVsActualRows(rows);
        setVsActualTotals({ totalBudget, totalActual });
      } else if (tab === 'variance') {
        const summary = await fetchBudgetVarianceSummary(filters);
        setVarianceSummary(summary);
        const { incomeTree: it, expenseTree: et, grandBudget, grandActual } = await fetchBudgetTree(filters);
        setIncomeTree(it);
        setExpenseTree(et);
        setGrandTotals({ grandBudget, grandActual });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, tab]);

  useEffect(() => { loadMeta(); loadExistingBudgets(); }, [loadMeta, loadExistingBudgets]);
  useEffect(() => { if (filters.fiscalYearId && filters.projectId) loadReports(); }, [filters.fiscalYearId, filters.projectId, loadReports]);

  const selectedFy = fys.find((f) => f.id === filters.fiscalYearId);
  const selectedProject = projects.find((p) => p.id === filters.projectId);
  const selectedVersion = versions.find((v) => v.id === filters.versionId);
  const versionLabel = selectedVersion?.version_label ?? 'All Versions';
  const fyName = selectedFy?.name ?? '';
  const projectName = selectedProject?.name ?? '';
  const printDate = new Date().toISOString();

  const openBudgetForm = (mode: 'add' | 'edit', row?: BudgetWithActual, accountType: 'income' | 'expense' = 'income') => {
    setBudgetForm({ accountId: row?.account_id ?? '', previous: row ? String(row.prev_year_actual) : '', amount: row ? String(row.amount) : '', accountType: row?.account_type === 'income' ? 'income' : accountType });
    setBudgetDialog({ mode, row });
  };

  const saveBudgetRow = async () => {
    if (!filters.fiscalYearId || !filters.projectId || !budgetForm.accountId) { toast.error('Select project, financial year and account head'); return; }
    const payload = { financial_year_id: filters.fiscalYearId, project_id: filters.projectId, account_id: budgetForm.accountId, amount: Number(budgetForm.amount) || 0, prev_year_actual: Number(budgetForm.previous) || 0, period: 'annual', status: 'draft' };
    const query = budgetDialog?.mode === 'edit' && budgetDialog.row ? supabase.from('budgets').update(payload).eq('id', budgetDialog.row.id) : supabase.from('budgets').insert(payload);
    const { error } = await query;
    if (error) { toast.error(error.message); return; }
    toast.success(budgetDialog?.mode === 'edit' ? 'Budget row updated' : 'Budget row added');
    setBudgetDialog(null); setBudgetForm(emptyBudgetForm); await loadExistingBudgets(); await loadReports();
  };

  const deleteBudget = async (b: Budget) => {
    if (!confirm('Delete this budget row?')) return;
    const { error } = await supabase.from('budgets').delete().eq('id', b.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: 'delete', table_name: 'budgets', record_id: b.id });
    toast.success('Budget row deleted');
    loadExistingBudgets();
    loadReports();
  };

  const areas = Array.from(new Set(existingBudgets.map((b) => (b as { area?: string }).area).filter(Boolean))) as string[];
  const ledgerGroups = ['Income', 'Expense'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget Management"
        description="Upload budgets, compare budget vs actual, and analyze variances"
        actions={canManage && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Upload Budget
          </Button>
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <div className="space-y-1.5">
            <Label className="text-xs">Fiscal Year</Label>
            <Select value={filters.fiscalYearId || 'none'} onValueChange={(v) => setFilters({ ...filters, fiscalYearId: v === 'none' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="FY" /></SelectTrigger>
              <SelectContent>{fys.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fund/Project</Label>
            <Select value={filters.projectId || 'none'} onValueChange={(v) => setFilters({ ...filters, projectId: v === 'none' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Fund" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Version</Label>
            <Select value={filters.versionId || 'all'} onValueChange={(v) => setFilters({ ...filters, versionId: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Version" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Versions</SelectItem>
                {versions.map((v) => <SelectItem key={v.id} value={v.id}>{v.version_label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Branch</Label>
            <Select value={filters.branchId || 'all'} onValueChange={(v) => setFilters({ ...filters, branchId: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Area</Label>
            <Select value={filters.area || 'all'} onValueChange={(v) => setFilters({ ...filters, area: v === 'all' ? '' : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From Date</Label>
            <input
              type="date"
              value={filters.fromDate || ''}
              onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To Date</Label>
            <input
              type="date"
              value={filters.toDate || ''}
              onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="budget"><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Budget</TabsTrigger>
          <TabsTrigger value="vs_actual"><GitCompare className="mr-1.5 h-4 w-4" /> Budget vs Actual</TabsTrigger>
          <TabsTrigger value="variance"><FileBarChart className="mr-1.5 h-4 w-4" /> Variance Report</TabsTrigger>
          {canManage && <TabsTrigger value="upload"><Upload className="mr-1.5 h-4 w-4" /> Manage</TabsTrigger>}
        </TabsList>

        <TabsContent value="budget" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : vsActualRows.length === 0 ? (
            <Card><EmptyState icon={PiggyBank} title="No budget data" description="Upload a budget to see Budget vs Actual comparison." /></Card>
          ) : (
            <BudgetStatement rows={vsActualRows} fyName={fyName} projectName={projectName} printDate={printDate} canManage={canManage} onAdd={(type) => openBudgetForm('add', undefined, type)} onEdit={(row) => openBudgetForm('edit', row)} onDelete={(row) => row.id && deleteBudget({ id: row.id } as Budget)} />
          )}
        </TabsContent>

        <TabsContent value="vs_actual" className="mt-4">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : <BudgetVsActual rows={vsActualRows} totalBudget={vsActualTotals.totalBudget} totalActual={vsActualTotals.totalActual} fyName={fyName} projectName={projectName} versionLabel={versionLabel} printDate={printDate} />}
        </TabsContent>

        <TabsContent value="variance" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : incomeTree.length === 0 && expenseTree.length === 0 ? (
            <Card><EmptyState icon={FileBarChart} title="No variance data" description="Upload a budget to see the variance tree report." /></Card>
          ) : (
            <BudgetVariance
              incomeTree={incomeTree}
              expenseTree={expenseTree}
              grandBudget={grandTotals.grandBudget}
              grandActual={grandTotals.grandActual}
              fyName={fyName}
              projectName={projectName}
              versionLabel={versionLabel}
              printDate={printDate}
              varianceSummary={varianceSummary ?? undefined}
            />
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="upload" className="mt-4 space-y-4">
            <Card>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Existing Budget Entries</p>
                  <p className="text-xs text-muted-foreground">{existingBudgets.length} rows</p>
                </div>
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Upload New
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 text-left uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">FY</th>
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 font-medium">Version</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 text-right font-medium">Prev Yr</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {existingBudgets.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No budgets uploaded yet</td></tr>
                    ) : (
                      existingBudgets.map((b) => (
                        <tr key={b.id} className="hover:bg-muted/10">
                          <td className="px-3 py-1.5">{b.fy_name ?? '—'}</td>
                          <td className="px-3 py-1.5">{b.project_name ?? '—'}</td>
                          <td className="px-3 py-1.5">{b.account_name ?? '—'}</td>
                          <td className="px-3 py-1.5"><Badge variant="secondary" className="text-[10px]">{b.version_label ?? 'Original'}</Badge></td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(b.amount)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{b.prev_year_actual ? formatCurrency(b.prev_year_actual) : '-'}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteBudget(b)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {budgetDialog && <Dialog open onOpenChange={(open) => { if (!open) setBudgetDialog(null); }}><DialogContent><DialogHeader><DialogTitle>{budgetDialog.mode === 'edit' ? 'Edit Budget Row' : 'Add Budget Row'}</DialogTitle><DialogDescription>Changes automatically flow to Budget vs Actual and Variance Report.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Account Head</Label><Select value={budgetForm.accountId || 'none'} onValueChange={(value) => setBudgetForm({ ...budgetForm, accountId: value === 'none' ? '' : value })}><SelectTrigger><SelectValue placeholder="Select account head" /></SelectTrigger><SelectContent>{accounts.filter((account) => !account.is_group && account.account_type === budgetForm.accountType).map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Previous Actual</Label><input type="number" value={budgetForm.previous} onChange={(event) => setBudgetForm({ ...budgetForm, previous: event.target.value })} className="flex h-9 w-full rounded-md border-input bg-background px-3 text-sm" /></div><div><Label>Budget 2026-27</Label><input type="number" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })} className="flex h-9 w-full rounded-md border-input bg-background px-3 text-sm" /></div></div><DialogFooter><Button variant="outline" onClick={() => setBudgetDialog(null)}>Cancel</Button><Button onClick={saveBudgetRow}>Save Budget Row</Button></DialogFooter></DialogContent></Dialog>}
            {canManage && (
        <BudgetUpload
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          fys={fys}
          projects={projects}
          accounts={accounts}
          onSaved={() => { loadExistingBudgets(); loadReports(); }}
        />
      )}
    </div>
  );
}
