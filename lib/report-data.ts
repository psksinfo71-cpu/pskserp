import { supabase } from '@/lib/supabase/client';
import type { ChartAccount } from '@/lib/types';
import { fetchProjectOpeningBalances, resolveOpening, type ProjectOpeningBalanceMap } from '@/lib/opening-balances';

export type MovementMap = Map<string, { debit: number; credit: number }>;

export interface MovementPair {
  year: MovementMap;
  month: MovementMap;
}

/** Fetch posted voucher-detail movements for a date range, optionally filtered by project. */
export async function fetchMovements(from?: string, to?: string, projectId?: string): Promise<MovementMap> {
  let q = supabase
    .from('voucher_details')
    .select('account_id, debit, credit, voucher:vouchers!inner(status, voucher_date, project_id)')
    .eq('voucher.status', 'posted');
  if (from) q = q.gte('voucher.voucher_date', from);
  if (to) q = q.lte('voucher.voucher_date', to);
  if (projectId) q = q.eq('voucher.project_id', projectId);
  const { data } = await q;
  const map: MovementMap = new Map();
  for (const d of data ?? []) {
    const v = d.voucher as unknown as { status: string };
    if (v.status !== 'posted') continue;
    const cur = map.get(d.account_id) ?? { debit: 0, credit: 0 };
    cur.debit += Number(d.debit) || 0;
    cur.credit += Number(d.credit) || 0;
    map.set(d.account_id, cur);
  }
  return map;
}

/** Year-to-date (from FY start) and month-to-date movements as of `to`. */
export async function fetchMovementsYearAndMonth(to: string, projectId?: string): Promise<MovementPair> {
  const fyStart = fyStartOf(to);
  const mStart = monthStartOf(to);
  const [year, month] = await Promise.all([
    fetchMovements(fyStart, to, projectId),
    fetchMovements(mStart, to, projectId),
  ]);
  return { year, month };
}

/** NGO financial year start (July 1) for the FY containing `dateStr`. */
export function fyStartOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month <= 6 ? `${year - 1}-07-01` : `${year}-07-01`;
}

/** First day of the month containing `dateStr`. */
export function monthStartOf(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01';
}

/** Debit-natured balance: opening + debit − credit. */
export function debitBalance(acc: ChartAccount, mv: MovementMap, projectOB?: ProjectOpeningBalanceMap): number {
  const m = mv.get(acc.id) ?? { debit: 0, credit: 0 };
  const opening = projectOB ? resolveOpening(acc.id, acc.opening_balance || 0, projectOB) : (acc.opening_balance || 0);
  return opening + m.debit - m.credit;
}

/** Credit-natured balance: opening + credit − debit. */
export function creditBalance(acc: ChartAccount, mv: MovementMap, projectOB?: ProjectOpeningBalanceMap): number {
  const m = mv.get(acc.id) ?? { debit: 0, credit: 0 };
  const opening = projectOB ? resolveOpening(acc.id, acc.opening_balance || 0, projectOB) : (acc.opening_balance || 0);
  return opening + m.credit - m.debit;
}

/** Group leaf accounts under a parent group code. */
export function childrenOf(accounts: ChartAccount[], parentCode: string): ChartAccount[] {
  const parent = accounts.find((a) => a.code === parentCode);
  if (!parent) return [];
  return accounts.filter((a) => a.parent_id === parent.id && !a.is_group && a.is_active);
}

/** Format date as DD/MM/YYYY. */
export function fmtReportDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Amount display: 0 → '-', negative → '(n)', else comma-formatted integer. */
export function fmtAmt(n: number): string {
  if (n === 0) return '-';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `(${s})` : s;
}
