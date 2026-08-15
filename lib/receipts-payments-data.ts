import { supabase } from '@/lib/supabase/client';
import type { ChartAccount } from '@/lib/types';
import { filterProjectAccounts } from '@/lib/account-filter';
import { fetchProjectOpeningBalances, resolveOpening, type ProjectOpeningBalanceMap } from '@/lib/opening-balances';
import type { MovementMap } from '@/lib/report-data';
import type { ReportRow } from '@/components/reports/ReceiptsPayments';

async function fetchMovementsForProject(fromDate: string, toDate: string, projectId?: string | null): Promise<MovementMap> {
  let q = supabase
    .from('voucher_details')
    .select('account_id, debit, credit, voucher:vouchers!inner(status, voucher_date, project_id)')
    .eq('voucher.status', 'posted')
    .gte('voucher.voucher_date', fromDate)
    .lte('voucher.voucher_date', toDate);
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

export async function fetchReceiptsPaymentsData(
  fromDate: string,
  toDate: string,
  projectId?: string | null
): Promise<ReportRow[]> {
  let accQ = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('is_active', true)
    .order('code');
  if (projectId) accQ = accQ.or(`project_id.is.null,project_id.eq.${projectId}`);
  const { data: accountsRaw } = await accQ;
  const accounts = filterProjectAccounts((accountsRaw ?? []) as ChartAccount[], projectId);

  const movements = await fetchMovementsForProject(fromDate, toDate, projectId);

  // Merge clone movements
  for (const a of accounts) {
    if (a.cloned_from_id && a.project_id === projectId) {
      const origMov = movements.get(a.cloned_from_id);
      if (origMov) {
        const cloneMov = movements.get(a.id) ?? { debit: 0, credit: 0 };
        cloneMov.debit += origMov.debit;
        cloneMov.credit += origMov.credit;
        movements.set(a.id, cloneMov);
      }
    }
  }

  const projectOB = await fetchProjectOpeningBalances(projectId);
  const leafAccounts = accounts.filter((a) => !a.is_group);

  const balanceOf = (acc: ChartAccount): number => {
    const m = movements.get(acc.id) ?? { debit: 0, credit: 0 };
    const opening = resolveOpening(acc.id, acc.opening_balance || 0, projectOB);
    if (acc.account_type === 'asset') return opening + m.debit - m.credit;
    return opening + m.credit - m.debit;
  };

  // Opening balance: cash + bank balances at the start of the period
  const cashBankAccounts = leafAccounts.filter((a) => ['1001', '10021', '10022'].includes(a.code));
  const openingOB = cashBankAccounts.reduce((s, a) => {
    const opening = resolveOpening(a.id, a.opening_balance || 0, projectOB);
    return s + opening;
  }, 0);

  // Closing balance: cash + bank balances at the end of the period
  const closingBalance = cashBankAccounts.reduce((s, a) => s + balanceOf(a), 0);

  // Receipts: all income accounts + any asset accounts that received money (debit side of cash/bank)
  // Payments: all expense accounts + any liability/equity accounts that were paid
  // For R&P, we look at cash/bank movements:
  // Receipts = credits to income accounts + debits to cash/bank (money received)
  // Payments = debits to expense accounts + credits to cash/bank (money paid)

  // Actually, for a proper R&P from vouchers:
  // Receipts = sum of credits to income accounts + sum of debits to cash/bank accounts (receipts)
  // Payments = sum of debits to expense accounts + sum of credits to cash/bank accounts (payments)

  // But the standard approach is: group by account type
  // Receipts side: opening cash/bank + income credits + other receipts
  // Payments side: expense debits + other payments + closing cash/bank

  const rows: ReportRow[] = [];
  let sortOrder = 10;

  // --- OPENING BALANCE ---
  rows.push({
    id: 'opening-cash',
    section: 'OPENING BALANCE',
    particulars: 'Cash in Hand',
    this_month: 0,
    this_year: cashBankAccounts.filter((a) => a.code === '1001').reduce((s, a) => s + resolveOpening(a.id, a.opening_balance || 0, projectOB), 0),
    previous_year: 0,
    is_subtotal: false,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  const bankOpening = cashBankAccounts.filter((a) => ['10021', '10022'].includes(a.code))
    .reduce((s, a) => s + resolveOpening(a.id, a.opening_balance || 0, projectOB), 0);
  rows.push({
    id: 'opening-bank',
    section: 'OPENING BALANCE',
    particulars: 'Cash at Bank',
    this_month: 0,
    this_year: bankOpening,
    previous_year: 0,
    is_subtotal: false,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  rows.push({
    id: 'opening-sub',
    section: 'OPENING BALANCE',
    particulars: 'To Balance b/d',
    this_month: 0,
    this_year: openingOB,
    previous_year: 0,
    is_subtotal: true,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  // --- RECEIPTS (income accounts) ---
  let receiptsTotal = 0;
  const incomeAccounts = leafAccounts.filter((a) => a.account_type === 'income');
  for (const acc of incomeAccounts) {
    const m = movements.get(acc.id);
    if (!m || (m.credit === 0 && m.debit === 0)) continue;
    const amount = (Number(m.credit) || 0) - (Number(m.debit) || 0);
    if (amount === 0) continue;
    rows.push({
      id: acc.id,
      section: 'RECEIPTS',
      particulars: acc.name,
      this_month: 0,
      this_year: amount,
      previous_year: 0,
      is_subtotal: false,
      sort_order: sortOrder,
    });
    sortOrder += 10;
    receiptsTotal += amount;
  }

  rows.push({
    id: 'receipts-sub',
    section: 'RECEIPTS',
    particulars: 'Total Receipts',
    this_month: 0,
    this_year: receiptsTotal,
    previous_year: 0,
    is_subtotal: true,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  // --- PAYMENTS (expense accounts) ---
  let paymentsTotal = 0;
  const expenseAccounts = leafAccounts.filter((a) => a.account_type === 'expense');
  for (const acc of expenseAccounts) {
    const m = movements.get(acc.id);
    if (!m || (m.debit === 0 && m.credit === 0)) continue;
    const amount = (Number(m.debit) || 0) - (Number(m.credit) || 0);
    if (amount === 0) continue;
    rows.push({
      id: acc.id,
      section: 'PAYMENTS',
      particulars: acc.name,
      this_month: 0,
      this_year: amount,
      previous_year: 0,
      is_subtotal: false,
      sort_order: sortOrder,
    });
    sortOrder += 10;
    paymentsTotal += amount;
  }

  rows.push({
    id: 'payments-sub',
    section: 'PAYMENTS',
    particulars: 'Total Payments',
    this_month: 0,
    this_year: paymentsTotal,
    previous_year: 0,
    is_subtotal: true,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  // --- CLOSING BALANCE ---
  const cashClosing = cashBankAccounts.filter((a) => a.code === '1001').reduce((s, a) => s + balanceOf(a), 0);
  const bankClosing = cashBankAccounts.filter((a) => ['10021', '10022'].includes(a.code)).reduce((s, a) => s + balanceOf(a), 0);

  rows.push({
    id: 'closing-cash',
    section: 'CLOSING BALANCE',
    particulars: 'Cash in Hand',
    this_month: 0,
    this_year: cashClosing,
    previous_year: 0,
    is_subtotal: false,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  rows.push({
    id: 'closing-bank',
    section: 'CLOSING BALANCE',
    particulars: 'Cash at Bank',
    this_month: 0,
    this_year: bankClosing,
    previous_year: 0,
    is_subtotal: false,
    sort_order: sortOrder,
  });
  sortOrder += 10;

  rows.push({
    id: 'closing-sub',
    section: 'CLOSING BALANCE',
    particulars: 'By Balance c/d',
    this_month: 0,
    this_year: closingBalance,
    previous_year: 0,
    is_subtotal: true,
    sort_order: sortOrder,
  });

  return rows;
}
