import { supabase } from '@/lib/supabase/client';
import type { ChartAccount, Voucher, VoucherDetail } from '@/lib/types';
import { fetchProjectOpeningBalances, resolveOpening } from '@/lib/opening-balances';
import { filterProjectAccounts } from '@/lib/account-filter';

export interface LedgerRow {
  voucher_no: string;
  voucher_date: string;
  voucher_type: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Fetch posted voucher details joined with the account for a given account.
 *  When a project clone account is queried, movements posted against the original
 *  global account are automatically merged in so the ledger is complete. */
export async function getAccountLedger(
  accountId: string,
  opts: { from?: string; to?: string; branchId?: string; projectId?: string } = {}
): Promise<{ rows: LedgerRow[]; opening: number }> {
  const accountQ = await supabase
    .from('chart_of_accounts')
    .select('id, opening_balance, account_type, cloned_from_id, project_id')
    .eq('id', accountId)
    .maybeSingle();
  const account = accountQ.data as
    | { id: string; opening_balance: string; account_type: string; cloned_from_id: string | null; project_id: string | null }
    | null;
  const defaultOpening = Number(account?.opening_balance) || 0;
  const projectOB = await fetchProjectOpeningBalances(opts.projectId);
  const accountOpening = resolveOpening(accountId, defaultOpening, projectOB);

  // Collect all account IDs to query: the account itself + its global origin (if it's a clone)
  const accountIds = [accountId];
  if (account?.cloned_from_id) {
    accountIds.push(account.cloned_from_id);
  }

  let q = supabase
    .from('voucher_details')
    .select(`
      id, debit, credit, narration, account_id,
      voucher: vouchers!inner ( id, voucher_no, voucher_date, voucher_type, status, branch_id, narration, created_at )
    `)
    .in('account_id', accountIds)
    .eq('voucher.status', 'posted');

  if (opts.branchId) q = q.eq('voucher.branch_id', opts.branchId);
  if (opts.projectId) q = q.eq('voucher.project_id', opts.projectId);

  const { data, error } = await q;
  if (error) throw error;

  const all = (data ?? []).map((d) => {
    const v = d.voucher as unknown as {
      voucher_no: string; voucher_date: string; voucher_type: string; status: string; branch_id: string; narration: string; created_at: string;
    };
    return {
      voucher_no: v.voucher_no,
      voucher_date: v.voucher_date,
      voucher_type: v.voucher_type,
      narration: d.narration || v.narration,
      debit: Number(d.debit) || 0,
      credit: Number(d.credit) || 0,
      created_at: v.created_at,
    };
  });

  all.sort((a, b) => {
    if (a.voucher_date !== b.voucher_date) return a.voucher_date.localeCompare(b.voucher_date);
    if (a.voucher_no !== b.voucher_no) return a.voucher_no.localeCompare(b.voucher_no);
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });

  let trueOpening = accountOpening;
  for (const d of all) {
    if (opts.from && d.voucher_date < opts.from) {
      trueOpening += d.debit - d.credit;
    }
  }

  const rows: LedgerRow[] = [];
  let running = trueOpening;
  for (const d of all) {
    if (opts.from && d.voucher_date < opts.from) continue;
    if (opts.to && d.voucher_date > opts.to) continue;
    running += d.debit - d.credit;
    rows.push({
      voucher_no: d.voucher_no,
      voucher_date: d.voucher_date,
      voucher_type: d.voucher_type,
      narration: d.narration,
      debit: d.debit,
      credit: d.credit,
      balance: running,
    });
  }
  return { rows, opening: trueOpening };
}

export interface TrialBalanceRow {
  account: ChartAccount;
  debit: number;
  credit: number;
}

/** Compute the trial balance from posted vouchers + opening balances. */
export async function getTrialBalance(
  projectId?: string,
  dateRange?: { from?: string; to?: string }
): Promise<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> {
  let accQ = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('is_active', true)
    .order('code', { ascending: true });
  if (projectId) accQ = accQ.or(`project_id.is.null,project_id.eq.${projectId}`);
  const { data: accounts } = await accQ;

  const projectOB = await fetchProjectOpeningBalances(projectId);

  let vq = supabase
    .from('voucher_details')
    .select('account_id, debit, credit, voucher: vouchers!inner ( status, project_id, voucher_date )');
  if (projectId) vq = vq.eq('voucher.project_id', projectId);
  if (dateRange?.from) vq = vq.gte('voucher.voucher_date', dateRange.from);
  if (dateRange?.to) vq = vq.lte('voucher.voucher_date', dateRange.to);
  const { data: details } = await vq;

  const movement = new Map<string, { debit: number; credit: number }>();
  for (const d of details ?? []) {
    const v = d.voucher as unknown as { status: string };
    if (v.status !== 'posted') continue;
    const cur = movement.get(d.account_id) ?? { debit: 0, credit: 0 };
    cur.debit += Number(d.debit) || 0;
    cur.credit += Number(d.credit) || 0;
    movement.set(d.account_id, cur);
  }

  // Merge movements from original global accounts into their project clones
  const filteredAccounts = filterProjectAccounts((accounts ?? []) as ChartAccount[], projectId);
  for (const a of filteredAccounts) {
    if (a.cloned_from_id && a.project_id === projectId) {
      const origMov = movement.get(a.cloned_from_id);
      if (origMov) {
        const cloneMov = movement.get(a.id) ?? { debit: 0, credit: 0 };
        cloneMov.debit += origMov.debit;
        cloneMov.credit += origMov.credit;
        movement.set(a.id, cloneMov);
      }
    }
  }

  // In range mode (from date provided), show only period movements — no opening balances.
  // In as-on mode (no from date), show cumulative balance including opening.
  const isRangeMode = !!dateRange?.from;

  const rows: TrialBalanceRow[] = filteredAccounts
    .filter((a) => !a.is_group)
    .map((a) => {
      const m = movement.get(a.id) ?? { debit: 0, credit: 0 };

      if (isRangeMode) {
        return {
          account: a as ChartAccount,
          debit: m.debit,
          credit: m.credit,
        };
      }

      const opening = resolveOpening(a.id, a.opening_balance || 0, projectOB);
      const isDebitNature = ['asset', 'expense'].includes(a.account_type);

      // Opening balance is positive on its natural side.
      // For debit-nature (asset/expense): net = opening + debit - credit
      // For credit-nature (liability/equity/income): net = opening + credit - debit
      const net = isDebitNature
        ? opening + m.debit - m.credit
        : opening + m.credit - m.debit;

      // Positive net → natural side; negative net → opposite side
      const debit = isDebitNature ? Math.max(net, 0) : Math.max(-net, 0);
      const credit = !isDebitNature ? Math.max(net, 0) : Math.max(-net, 0);

      return {
        account: a as ChartAccount,
        debit,
        credit,
      };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit };
}

export interface DashboardKPIs {
  totalCash: number;
  totalBank: number;
  todayIncome: number;
  todayExpense: number;
  monthIncome: number;
  monthExpense: number;
  pendingApprovals: number;
  pendingVouchers: number;
}

export async function getDashboardKPIs(projectId?: string): Promise<DashboardKPIs> {
  // Fetch cash and bank accounts to include their opening balances
  let accQ = supabase
    .from('chart_of_accounts')
    .select('id, code, opening_balance, cloned_from_id, project_id')
    .in('code', ['1001', '10021', '10022']);
  if (projectId) accQ = accQ.or(`project_id.is.null,project_id.eq.${projectId}`);
  const { data: cashBankAccountsRaw } = await accQ;
  const cashBankAccounts = filterProjectAccounts((cashBankAccountsRaw ?? []) as ChartAccount[], projectId);

  const projectOB = await fetchProjectOpeningBalances(projectId);

  let totalCash = 0;
  let totalBank = 0;
  for (const a of cashBankAccounts) {
    const opening = resolveOpening(a.id, Number(a.opening_balance) || 0, projectOB);
    if (a.code === '1001') totalCash += opening;
    if (a.code === '10021' || a.code === '10022') totalBank += opening;
  }

  // Collect all account IDs to query movements for (clones + their origins)
  const movementAccountIds = new Set<string>();
  for (const a of cashBankAccounts) {
    movementAccountIds.add(a.id);
    if (a.cloned_from_id) movementAccountIds.add(a.cloned_from_id);
  }

  let postedQ = supabase
    .from('voucher_details')
    .select(`
      debit, credit, account_id,
      account: chart_of_accounts!inner ( account_type, code ),
      voucher: vouchers!inner ( voucher_date, status, project_id )
    `)
    .eq('voucher.status', 'posted');
  if (projectId) postedQ = postedQ.eq('voucher.project_id', projectId);
  const { data: posted } = await postedQ;

  // Map movements from original accounts to their clones
  const cloneMap = new Map<string, string>(); // originId -> cloneId
  for (const a of cashBankAccounts) {
    if (a.cloned_from_id) cloneMap.set(a.cloned_from_id, a.id);
  }

  let pendQ = supabase
    .from('vouchers')
    .select('id', { count: 'exact', head: true })
    .in('status', ['submitted', 'reviewed', 'verified']);
  if (projectId) pendQ = pendQ.eq('project_id', projectId);
  const { count: pending } = await pendQ;

  let draftQ = supabase
    .from('vouchers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft');
  if (projectId) draftQ = draftQ.eq('project_id', projectId);
  const { count: drafts } = await draftQ;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  let todayIncome = 0;
  let todayExpense = 0;
  let monthIncome = 0;
  let monthExpense = 0;

  for (const d of posted ?? []) {
    const acc = d.account as unknown as { account_type: string; code: string };
    const v = d.voucher as unknown as { voucher_date: string; status: string; project_id: string | null };
    if (v.status !== 'posted') continue;
    const debit = Number(d.debit) || 0;
    const credit = Number(d.credit) || 0;
    const date = v.voucher_date;

    // Resolve to the visible account ID (map origin to clone if needed)
    const effectiveAccountId = cloneMap.get(d.account_id) ?? d.account_id;
    const visibleAccount = cashBankAccounts.find((a) => a.id === effectiveAccountId);
    if (visibleAccount?.code === '1001') totalCash += debit - credit;
    if (visibleAccount?.code === '10021' || visibleAccount?.code === '10022') totalBank += debit - credit;

    if (acc.account_type === 'income') {
      const amt = credit - debit;
      if (date === todayStr) todayIncome += amt;
      if (date >= monthStart) monthIncome += amt;
    }
    if (acc.account_type === 'expense') {
      const amt = debit - credit;
      if (date === todayStr) todayExpense += amt;
      if (date >= monthStart) monthExpense += amt;
    }
  }

  return {
    totalCash,
    totalBank,
    todayIncome,
    todayExpense,
    monthIncome,
    monthExpense,
    pendingApprovals: pending ?? 0,
    pendingVouchers: drafts ?? 0,
  };
}

export async function getMonthlyTrend(months = 6, projectId?: string): Promise<{ label: string; income: number; expense: number }[]> {
  let q = supabase
    .from('voucher_details')
    .select(`
      debit, credit,
      account: chart_of_accounts!inner ( account_type ),
      voucher: vouchers!inner ( voucher_date, status, project_id )
    `)
    .eq('voucher.status', 'posted');
  if (projectId) q = q.eq('voucher.project_id', projectId);
  const { data } = await q;

  const buckets = new Map<string, { income: number; expense: number }>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { income: 0, expense: 0 });
  }

  for (const row of data ?? []) {
    const acc = row.account as unknown as { account_type: string };
    const v = row.voucher as unknown as { voucher_date: string; status: string; project_id: string | null };
    if (v.status !== 'posted') continue;
    const key = v.voucher_date.slice(0, 7);
    const b = buckets.get(key);
    if (!b) continue;
    if (acc.account_type === 'income') b.income += Number(row.credit) - Number(row.debit);
    if (acc.account_type === 'expense') b.expense += Number(row.debit) - Number(row.credit);
  }

  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return [...buckets.entries()].map(([k, v]) => {
    const m = Number(k.slice(5, 7)) - 1;
    return { label: `${labels[m]} ${k.slice(2, 4)}`, income: v.income, expense: v.expense };
  });
}

export async function getBranchSummary(projectId?: string): Promise<{ branch: string; income: number; expense: number }[]> {
  let bQ = supabase.from('branches').select('id, name').order('name');
  if (projectId) bQ = bQ.or(`project_id.is.null,project_id.eq.${projectId}`);
  const { data: branches } = await bQ;
  let q = supabase
    .from('voucher_details')
    .select(`
      debit, credit,
      account: chart_of_accounts!inner ( account_type ),
      voucher: vouchers!inner ( status, branch_id, project_id )
    `)
    .eq('voucher.status', 'posted');
  if (projectId) q = q.eq('voucher.project_id', projectId);
  const { data } = await q;

  const map = new Map<string, { income: number; expense: number }>();
  for (const b of branches ?? []) map.set(b.id, { income: 0, expense: 0 });

  for (const row of data ?? []) {
    const acc = row.account as unknown as { account_type: string };
    const v = row.voucher as unknown as { status: string; branch_id: string; project_id: string | null };
    if (v.status !== 'posted' || !v.branch_id) continue;
    const b = map.get(v.branch_id);
    if (!b) continue;
    if (acc.account_type === 'income') b.income += Number(row.credit) - Number(row.debit);
    if (acc.account_type === 'expense') b.expense += Number(row.debit) - Number(row.credit);
  }

  return (branches ?? []).map((b) => ({
    branch: b.name,
    income: map.get(b.id)?.income ?? 0,
    expense: map.get(b.id)?.expense ?? 0,
  }));
}

/** Compute the current balance of a single account from opening balance + posted voucher movements.
 *  For asset/expense accounts: balance = opening + debit - credit.
 *  For liability/equity/income accounts: balance = opening + credit - debit. */
export async function getAccountBalance(accountId: string, projectId?: string): Promise<number> {
  const accountQ = await supabase
    .from('chart_of_accounts')
    .select('id, opening_balance, account_type, cloned_from_id, project_id')
    .eq('id', accountId)
    .maybeSingle();
  const account = accountQ.data as
    | { id: string; opening_balance: string; account_type: string; cloned_from_id: string | null; project_id: string | null }
    | null;
  if (!account) return 0;
  const defaultOpening = Number(account.opening_balance) || 0;
  const projectOB = await fetchProjectOpeningBalances(projectId);
  const opening = resolveOpening(accountId, defaultOpening, projectOB);

  const accountIds = [accountId];
  if (account.cloned_from_id) accountIds.push(account.cloned_from_id);

  let q = supabase
    .from('voucher_details')
    .select('debit, credit, account_id, voucher: vouchers!inner ( status, project_id )')
    .in('account_id', accountIds)
    .eq('voucher.status', 'posted');
  if (projectId) q = q.eq('voucher.project_id', projectId);
  const { data } = await q;

  let totalDebit = 0;
  let totalCredit = 0;
  for (const d of data ?? []) {
    totalDebit += Number(d.debit) || 0;
    totalCredit += Number(d.credit) || 0;
  }

  const isDebitNature = ['asset', 'expense'].includes(account.account_type);
  return isDebitNature
    ? opening + totalDebit - totalCredit
    : opening + totalCredit - totalDebit;
}

export async function getRecentVouchers(limit = 8, projectId?: string): Promise<(Voucher & { branch_name?: string })[]> {
  let q = supabase
    .from('vouchers')
    .select('*, branch: branches!vouchers_branch_id_fkey ( name )')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((v) => ({
    ...(v as Voucher),
    branch_name: (v as { branch?: { name?: string } }).branch?.name,
  }));
}
