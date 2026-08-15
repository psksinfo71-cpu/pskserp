import { supabase } from '@/lib/supabase/client';
import type { ChartAccount } from '@/lib/types';
import { fetchProjectOpeningBalances, resolveOpening, type ProjectOpeningBalanceMap } from '@/lib/opening-balances';
import { filterProjectAccounts } from '@/lib/account-filter';
import type { MovementMap } from '@/lib/report-data';
import type { ReportRow } from '@/components/reports/BalanceSheet';

interface BSSectionDef {
  section: string;
  accountType: 'asset' | 'liability' | 'equity';
  groupCodes: string[];
}

// Each entry lists the DIRECT-PARENT group codes whose leaf children should appear
// in that section. Never include leaf account codes here — they are picked up
// automatically when their parent group is listed.
const ASSET_SECTIONS: BSSectionDef[] = [
  { section: 'PROPERTY AND ASSETS', accountType: 'asset', groupCodes: ['11', '12', '110'] },
  { section: 'CURRENT ASSETS', accountType: 'asset', groupCodes: ['10', '100', '1002', '101', '102', '103'] },
];

const LIABILITY_SECTIONS: BSSectionDef[] = [
  { section: 'FUND AND LIABILITIES', accountType: 'equity', groupCodes: ['30', '31', '32'] },
  { section: 'CURRENT LIABILITIES', accountType: 'liability', groupCodes: ['20', '200', '201', '202', '210'] },
];

/** Fetch posted voucher-detail movements, optionally filtered by project and date range. */
async function fetchMovementsForProject(asOnDate: string, projectId?: string | null, fromDate?: string): Promise<MovementMap> {
  let q = supabase
    .from('voucher_details')
    .select('account_id, debit, credit, voucher:vouchers!inner(status, voucher_date, project_id)')
    .eq('voucher.status', 'posted')
    .lte('voucher.voucher_date', asOnDate);
  if (fromDate) q = q.gte('voucher.voucher_date', fromDate);
  if (projectId) q = q.eq('voucher.project_id', projectId);
  const { data } = await q;
  const map: MovementMap = new Map();
  for (const d of data ?? []) {
    const cur = map.get(d.account_id) ?? { debit: 0, credit: 0 };
    cur.debit += Number(d.debit) || 0;
    cur.credit += Number(d.credit) || 0;
    map.set(d.account_id, cur);
  }
  return map;
}

export async function fetchBalanceSheetData(
  asOnDate: string,
  projectId?: string | null,
  fromDate?: string
): Promise<ReportRow[]> {
  let accQ = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('is_active', true)
    .in('account_type', ['asset', 'liability', 'equity'])
    .order('code');
  if (projectId) accQ = accQ.or(`project_id.is.null,project_id.eq.${projectId}`);
  const { data: accountsRaw } = await accQ;
  const accounts = filterProjectAccounts((accountsRaw ?? []) as ChartAccount[], projectId);

  const movements = await fetchMovementsForProject(asOnDate, projectId, fromDate);

  const cloneOrigins = new Map<string, string>();
  for (const a of accounts) {
    if (a.cloned_from_id && a.project_id === projectId) {
      cloneOrigins.set(a.id, a.cloned_from_id);
    }
  }
  for (const [cloneId, origId] of cloneOrigins) {
    const origMov = movements.get(origId);
    if (origMov) {
      const cloneMov = movements.get(cloneId) ?? { debit: 0, credit: 0 };
      cloneMov.debit += origMov.debit;
      cloneMov.credit += origMov.credit;
      movements.set(cloneId, cloneMov);
    }
  }

  const projectOB: ProjectOpeningBalanceMap = await fetchProjectOpeningBalances(projectId);

  const leafAccounts = accounts.filter((a) => !a.is_group);

  const balanceOf = (acc: ChartAccount): number => {
    const m = movements.get(acc.id) ?? { debit: 0, credit: 0 };
    const opening = resolveOpening(acc.id, acc.opening_balance || 0, projectOB);
    if (acc.account_type === 'asset') {
      return opening + m.debit - m.credit;
    }
    return opening + m.credit - m.debit;
  };

  const assetLeaves = leafAccounts.filter((a) => a.account_type === 'asset');
  const liabilityLeaves = leafAccounts.filter((a) => a.account_type === 'liability');
  const equityLeaves = leafAccounts.filter((a) => a.account_type === 'equity');

  const fixedAssetLeaves = assetLeaves.filter(
    (a) => a.code.startsWith('11') || a.code.startsWith('12') || a.code.startsWith('110')
  );
  const currentAssetLeaves = assetLeaves.filter((a) => !fixedAssetLeaves.includes(a));

  const { data: cats } = await supabase
    .from('asset_categories')
    .select('opening_cost, transferred_cost, addition_cost, adjustment_cost, opening_depn, transferred_depn, depn_for_year, adjustment_depn');
  const liveWdv = (cats ?? []).reduce((s: number, c: any) => {
    const tc = Number(c.opening_cost) + Number(c.transferred_cost) + Number(c.addition_cost) - Number(c.adjustment_cost);
    const ad = Number(c.opening_depn) + Number(c.transferred_depn) + Number(c.depn_for_year) - Number(c.adjustment_depn);
    return s + (tc - ad);
  }, 0);

  const fixedAssetTotal = liveWdv !== 0 ? liveWdv : fixedAssetLeaves.reduce((s, a) => s + balanceOf(a), 0);
  const currentAssetTotal = currentAssetLeaves.reduce((s, a) => s + balanceOf(a), 0);
  const totalAssets = fixedAssetTotal + currentAssetTotal;
  const totalLiabilities = liabilityLeaves.reduce((s, a) => s + balanceOf(a), 0);
  const explicitEquity = equityLeaves.reduce((s, a) => s + balanceOf(a), 0);

  let incExpQ = supabase
    .from('voucher_details')
    .select('debit, credit, account: chart_of_accounts!inner(account_type), voucher: vouchers!inner(status, project_id, voucher_date)')
    .eq('voucher.status', 'posted')
    .lte('voucher.voucher_date', asOnDate);
  if (fromDate) incExpQ = incExpQ.gte('voucher.voucher_date', fromDate);
  if (projectId) incExpQ = incExpQ.eq('voucher.project_id', projectId);
  const { data: incExpData } = await incExpQ;

  let incomeOB = 0;
  let expenseOB = 0;
  if (projectId) {
    const { data: obData } = await supabase
      .from('project_opening_balances')
      .select('account_id, opening_balance, account: chart_of_accounts!inner(account_type)')
      .eq('project_id', projectId);
    for (const r of obData ?? []) {
      const acc = r.account as unknown as { account_type: string };
      if (acc?.account_type === 'income') incomeOB += Number(r.opening_balance) || 0;
      if (acc?.account_type === 'expense') expenseOB += Number(r.opening_balance) || 0;
    }
  }

  let incMov = 0;
  let expMov = 0;
  for (const d of incExpData ?? []) {
    const acc = d.account as unknown as { account_type: string };
    if (acc?.account_type === 'income') incMov += (Number(d.credit) || 0) - (Number(d.debit) || 0);
    if (acc?.account_type === 'expense') expMov += (Number(d.debit) || 0) - (Number(d.credit) || 0);
  }
  const surplus = (incomeOB + incMov) - (expenseOB + expMov);
  const fundAccount = equityLeaves.find((a) => a.code === '3001') ?? equityLeaves[0];

  const rows: ReportRow[] = [];
  let sortOrder = 10;

  const leavesUnderGroupCode = (groupCode: string): ChartAccount[] => {
    const parent = accounts.find((a) => a.code === groupCode && a.is_group);
    if (!parent) {
      const leaf = accounts.find((a) => a.code === groupCode && !a.is_group);
      return leaf ? [leaf] : [];
    }
    return leafAccounts.filter((a) => a.parent_id === parent.id);
  };

  // Track account IDs already added to avoid cross-group duplicates
  const addedIds = new Set<string>();

  // --- ASSET SECTIONS ---
  for (const sec of ASSET_SECTIONS) {
    let sectionTotal = 0;

    if (sec.section === 'PROPERTY AND ASSETS') {
      // Always show WDV as a single row, not per group code
      if (liveWdv !== 0) {
        rows.push({
          id: 'fa-wdv',
          section: sec.section,
          particulars: 'Fixed Assets (at WDV)',
          this_month: 0,
          this_year: liveWdv,
          previous_year: 0,
          is_subtotal: false,
          sort_order: sortOrder,
        });
        sortOrder += 10;
        sectionTotal += liveWdv;
      }
    } else {
      for (const gCode of sec.groupCodes) {
        const leaves = leavesUnderGroupCode(gCode);
        for (const leaf of leaves) {
          if (addedIds.has(leaf.id)) continue;
          const bal = balanceOf(leaf);
          if (bal === 0) continue;
          addedIds.add(leaf.id);
          rows.push({
            id: leaf.id,
            section: sec.section,
            particulars: leaf.name,
            this_month: 0,
            this_year: bal,
            previous_year: 0,
            is_subtotal: false,
            sort_order: sortOrder,
          });
          sortOrder += 10;
          sectionTotal += bal;
        }
      }
      for (const leaf of currentAssetLeaves) {
        if (addedIds.has(leaf.id)) continue;
        const bal = balanceOf(leaf);
        if (bal === 0) continue;
        addedIds.add(leaf.id);
        rows.push({
          id: leaf.id,
          section: sec.section,
          particulars: leaf.name,
          this_month: 0,
          this_year: bal,
          previous_year: 0,
          is_subtotal: false,
          sort_order: sortOrder,
        });
        sortOrder += 10;
        sectionTotal += bal;
      }
    }

    if (sectionTotal !== 0) {
      rows.push({
        id: `sub-${sec.section}`,
        section: sec.section,
        particulars: `Total ${sec.section}`,
        this_month: 0,
        this_year: sectionTotal,
        previous_year: 0,
        is_subtotal: true,
        sort_order: sortOrder,
      });
      sortOrder += 10;
    }
  }

  // --- LIABILITY & EQUITY SECTIONS ---
  for (const sec of LIABILITY_SECTIONS) {
    let sectionTotal = 0;
    for (const gCode of sec.groupCodes) {
      const leaves = leavesUnderGroupCode(gCode);
      if (leaves.length === 0) continue;

      for (const leaf of leaves) {
        if (addedIds.has(leaf.id)) continue;
        const bal = balanceOf(leaf);
        if (bal === 0) continue;
        addedIds.add(leaf.id);
        rows.push({
          id: leaf.id,
          section: sec.section,
          particulars: leaf.name,
          this_month: 0,
          this_year: bal + (sec.section === 'FUND AND LIABILITIES' && leaf.id === fundAccount?.id ? surplus : 0),
          previous_year: 0,
          is_subtotal: false,
          sort_order: sortOrder,
        });
        sortOrder += 10;
        sectionTotal += bal + (sec.section === 'FUND AND LIABILITIES' && leaf.id === fundAccount?.id ? surplus : 0);
      }
    }
    if (sec.section === 'CURRENT LIABILITIES') {
      for (const leaf of liabilityLeaves) {
        if (addedIds.has(leaf.id)) continue;
        const bal = balanceOf(leaf);
        if (bal === 0) continue;
        addedIds.add(leaf.id);
        rows.push({
          id: leaf.id,
          section: sec.section,
          particulars: leaf.name,
          this_month: 0,
          this_year: bal,
          previous_year: 0,
          is_subtotal: false,
          sort_order: sortOrder,
        });
        sortOrder += 10;
        sectionTotal += bal;
      }
    }

    if (sec.section === 'FUND AND LIABILITIES') {
      const equityGap = totalAssets - totalLiabilities - explicitEquity - surplus;
      if (equityGap !== 0) {
        rows.push({
          id: 'computed-fund',
          section: sec.section,
          particulars: explicitEquity === 0 ? 'General Fund (Balancing Figure)' : 'Accumulated Surplus / Balancing Figure',
          this_month: 0,
          this_year: equityGap,
          previous_year: 0,
          is_subtotal: false,
          sort_order: sortOrder,
        });
        sortOrder += 10;
        sectionTotal += equityGap;
      }

    }

    if (sectionTotal !== 0) {
      rows.push({
        id: `sub-${sec.section}`,
        section: sec.section,
        particulars: `Total ${sec.section}`,
        this_month: 0,
        this_year: sectionTotal,
        previous_year: 0,
        is_subtotal: true,
        sort_order: sortOrder,
      });
      sortOrder += 10;
    }
  }

  return rows;
}
