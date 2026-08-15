import { supabase } from '@/lib/supabase/client';
import { fetchMovements, type MovementMap } from '@/lib/report-data';
import type { ChartAccount } from '@/lib/types';

export interface BudgetVersion {
  id: string;
  fiscal_year_id: string | null;
  project_id: string | null;
  version_label: string;
  version_type: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetRow {
  id: string;
  budget_version_id: string | null;
  financial_year_id: string | null;
  project_id: string | null;
  branch_id: string | null;
  account_id: string | null;
  amount: number;
  prev_year_actual: number;
  period: string;
  status: string;
  version_label: string | null;
  area: string | null;
  ledger_group: string | null;
  account_code?: string;
  account_name?: string;
  account_type?: string;
  parent_id?: string | null;
  branch_name?: string;
  project_name?: string;
  fy_name?: string;
}

export interface BudgetWithActual extends BudgetRow {
  actual: number;
  variance: number;
  variance_pct: number | null;
}

export interface BudgetTreeNode {
  account: ChartAccount;
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
  children: BudgetTreeNode[];
  isGroup: boolean;
}

export interface BudgetFilters {
  fiscalYearId: string;
  projectId: string;
  versionId: string;
  branchId: string;
  area: string;
  ledgerGroup: string;
  fromDate: string;
  toDate: string;
}

export async function fetchBudgetVersions(): Promise<BudgetVersion[]> {
  const { data, error } = await supabase
    .from('budget_versions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BudgetVersion[];
}

export async function fetchBudgets(filters: Partial<BudgetFilters>): Promise<BudgetRow[]> {
  let q = supabase
    .from('budgets')
    .select(`
      *,
      account: chart_of_accounts ( id, code, name, account_type, parent_id, is_group ),
      branch: branches ( name ),
      project: projects ( name ),
      fy: financial_years ( name )
    `)
    .order('created_at', { ascending: false });

  if (filters.fiscalYearId) q = q.eq('financial_year_id', filters.fiscalYearId);
  if (filters.projectId) q = q.eq('project_id', filters.projectId);
  if (filters.versionId) q = q.eq('budget_version_id', filters.versionId);
  if (filters.branchId) q = q.eq('branch_id', filters.branchId);
  if (filters.area) q = q.eq('area', filters.area);
  if (filters.ledgerGroup) q = q.eq('ledger_group', filters.ledgerGroup);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((b) => {
    const acc = b.account as unknown as { id: string; code: string; name: string; account_type: string; parent_id: string | null; is_group: boolean } | null;
    const branch = b.branch as unknown as { name?: string } | null;
    const project = b.project as unknown as { name?: string } | null;
    const fy = b.fy as unknown as { name?: string } | null;
    return {
      id: b.id,
      budget_version_id: b.budget_version_id,
      financial_year_id: b.financial_year_id,
      project_id: b.project_id,
      branch_id: b.branch_id,
      account_id: b.account_id,
      amount: Number(b.amount) || 0,
      prev_year_actual: Number(b.prev_year_actual) || 0,
      period: b.period,
      status: b.status,
      version_label: b.version_label,
      area: b.area,
      ledger_group: b.ledger_group,
      account_code: acc?.code,
      account_name: acc?.name,
      account_type: acc?.account_type,
      parent_id: acc?.parent_id,
      branch_name: branch?.name,
      project_name: project?.name,
      fy_name: fy?.name,
    } as BudgetRow;
  });
}

export async function fetchActualMovements(
  accountIds: string[],
  filters: Partial<BudgetFilters>
): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('voucher_details')
    .select(`
      debit, credit,
      account: chart_of_accounts!inner ( id, account_type ),
      voucher: vouchers!inner ( status, voucher_date, project_id, branch_id )
    `)
    .eq('voucher.status', 'posted')
    .in('account_id', accountIds)
    .gte('voucher.voucher_date', filters.fromDate || '1900-01-01')
    .lte('voucher.voucher_date', filters.toDate || '9999-12-31');

  if (error) throw error;

  const map = new Map<string, number>();
  for (const d of data ?? []) {
    const acc = d.account as unknown as { id: string; account_type: string };
    const v = d.voucher as unknown as { status: string; project_id: string | null; branch_id: string | null };
    if (v.status !== 'posted') continue;
    if (filters.projectId && v.project_id !== filters.projectId) continue;
    if (filters.branchId && v.branch_id !== filters.branchId) continue;
    const isIncome = acc.account_type === 'income';
    const isExpense = acc.account_type === 'expense';
    if (!isIncome && !isExpense) continue;
    const amt = isIncome ? (Number(d.credit) || 0) - (Number(d.debit) || 0) : (Number(d.debit) || 0) - (Number(d.credit) || 0);
    map.set(acc.id, (map.get(acc.id) ?? 0) + amt);
  }
  return map;
}

export function computeVariance(budget: number, actual: number): { variance: number; variance_pct: number | null } {
  const variance = budget - actual;
  const variance_pct = budget === 0 ? null : (variance / budget) * 100;
  return { variance, variance_pct };
}

export async function fetchBudgetVsActual(filters: Partial<BudgetFilters>): Promise<{ rows: BudgetWithActual[]; totalBudget: number; totalActual: number }> {
  const budgets = await fetchBudgets(filters);
  const accountIds = budgets.map((b) => b.account_id).filter(Boolean) as string[];
  const actualMap = await fetchActualMovements(accountIds, filters);

  const rows: BudgetWithActual[] = budgets.map((b) => {
    const actual = b.account_id ? (actualMap.get(b.account_id) ?? 0) : 0;
    const { variance, variance_pct } = computeVariance(b.amount, actual);
    return { ...b, actual, variance, variance_pct };
  });

  const totalBudget = rows.reduce((s, r) => s + r.amount, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  return { rows, totalBudget, totalActual };
}

export async function fetchBudgetTree(
  filters: Partial<BudgetFilters>
): Promise<{ incomeTree: BudgetTreeNode[]; expenseTree: BudgetTreeNode[]; grandBudget: number; grandActual: number }> {
  const { data: accountsData } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('is_active', true)
    .order('code');
  const accounts = (accountsData ?? []) as ChartAccount[];

  const budgets = await fetchBudgets(filters);
  const budgetByAccount = new Map<string, number>();
  for (const b of budgets) {
    if (b.account_id) budgetByAccount.set(b.account_id, (budgetByAccount.get(b.account_id) ?? 0) + b.amount);
  }

  const accountIds = budgets.map((b) => b.account_id).filter(Boolean) as string[];
  const actualMap = await fetchActualMovements(accountIds, filters);

  const byParent = new Map<string | null, ChartAccount[]>();
  for (const a of accounts) {
    const key = a.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(a);
  }

  const buildTree = (parentId: string | null, type: string): BudgetTreeNode[] => {
    return (byParent.get(parentId) ?? [])
      .filter((a) => a.account_type === type)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => {
        const children = buildTree(account.id, type);
        const budget = budgetByAccount.get(account.id) ?? 0;
        const actual = actualMap.get(account.id) ?? 0;
        const { variance, variance_pct } = computeVariance(budget, actual);
        if (!account.is_group && budget === 0 && actual === 0 && children.length === 0) return null;
        return {
          account,
          budget,
          actual,
          variance,
          variance_pct,
          children,
          isGroup: account.is_group,
        } as BudgetTreeNode;
      })
      .filter((n): n is BudgetTreeNode => n !== null);
  };

  const incomeRoot = accounts.find((a) => a.account_type === 'income' && a.parent_id === null);
  const expenseRoot = accounts.find((a) => a.account_type === 'expense' && a.parent_id === null);
  const incomeTree = incomeRoot ? buildTree(incomeRoot.id, 'income') : [];
  const expenseTree = expenseRoot ? buildTree(expenseRoot.id, 'expense') : [];

  const sumTree = (nodes: BudgetTreeNode[]): { budget: number; actual: number } => {
    let budget = 0, actual = 0;
    for (const n of nodes) {
      if (n.children.length > 0) {
        const childSums = sumTree(n.children);
        budget += childSums.budget;
        actual += childSums.actual;
      } else {
        budget += n.budget;
        actual += n.actual;
      }
    }
    return { budget, actual };
  };

  const incSums = sumTree(incomeTree);
  const expSums = sumTree(expenseTree);

  return {
    incomeTree,
    expenseTree,
    grandBudget: incSums.budget + expSums.budget,
    grandActual: incSums.actual + expSums.actual,
  };
}

export function flattenBudgetTree(
  nodes: BudgetTreeNode[],
  depth: number,
  expanded: Set<string>,
  isIncome: boolean
): { node: BudgetTreeNode; depth: number; isIncome: boolean }[] {
  const out: { node: BudgetTreeNode; depth: number; isIncome: boolean }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth, isIncome });
    if (n.children.length > 0 && expanded.has(n.account.id)) {
      out.push(...flattenBudgetTree(n.children, depth + 1, expanded, isIncome));
    }
  }
  return out;
}

export function aggregateTree(nodes: BudgetTreeNode[]): { budget: number; actual: number; variance: number } {
  let budget = 0, actual = 0, variance = 0;
  for (const n of nodes) {
    if (n.children.length > 0) {
      const childAgg = aggregateTree(n.children);
      budget += childAgg.budget;
      actual += childAgg.actual;
      variance += childAgg.variance;
    } else {
      budget += n.budget;
      actual += n.actual;
      variance += n.variance;
    }
  }
  return { budget, actual, variance };
}
