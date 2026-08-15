import { supabase } from '@/lib/supabase/client';

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  depreciation_rate: number;
  depreciation_method: string;
  sort_order: number;
  is_active: boolean;
  gl_account_id: string | null;
  accum_depn_gl_account_id: string | null;
  opening_cost: number;
  transferred_cost: number;
  addition_cost: number;
  adjustment_cost: number;
  opening_depn: number;
  transferred_depn: number;
  depn_for_year: number;
  adjustment_depn: number;
}

export interface AssetRow {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  category?: AssetCategory | null;
  branch_id: string | null;
  location: string;
  purchase_date: string | null;
  purchase_cost: number;
  opening_value: number;
  salvage_value: number;
  useful_life_years: number | null;
  depreciation_method: string | null;
  accumulated_depreciation: number;
  current_value: number;
  status: string | null;
  is_active: boolean;
  gl_account_id: string | null;
  accum_dep_wdv_opening: number;
  disposal_date: string | null;
  disposal_value: number;
  transfer_date: string | null;
}

export interface AssetTransaction {
  id: string;
  asset_id: string;
  category_id: string | null;
  transaction_type: string;
  transaction_date: string;
  amount: number;
  from_branch_id: string | null;
  to_branch_id: string | null;
  narration: string;
  voucher_id: string | null;
  depreciation_run_id: string | null;
  posted: boolean;
  created_by: string | null;
  created_at: string;
  asset?: { code: string; name: string } | null;
}

export interface DepreciationRun {
  id: string;
  period_type: string;
  period_label: string;
  period_start: string;
  period_end: string;
  total_depreciation: number;
  voucher_id: string | null;
  status: string;
  run_by: string | null;
  run_at: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
}

/**
 * Compute WDV depreciation for a single asset for a given period.
 * WDV method: depn = (cost - accumulated_depreciation) * rate
 * For monthly: depn = annual_depn / 12
 */
export function computeDepreciation(
  asset: AssetRow,
  category: AssetCategory | null | undefined,
  mode: 'monthly' | 'yearly'
): number {
  if (!category || category.depreciation_rate === 0) return 0;
  if (asset.status === 'disposed') return 0;

  const wdv = Number(asset.purchase_cost) - Number(asset.accumulated_depreciation);
  if (wdv <= 0) return 0;

  const annualDepn = wdv * Number(category.depreciation_rate);
  return mode === 'monthly' ? annualDepn / 12 : annualDepn;
}

/**
 * Opening WDV = purchase_cost - accumulated_depreciation at FY start
 * (or opening_value if set for assets carried forward from prior year).
 */
export function openingWDV(asset: AssetRow): number {
  if (Number(asset.opening_value) > 0) {
    return Number(asset.opening_value) - Number(asset.accum_dep_wdv_opening);
  }
  return Number(asset.purchase_cost) - Number(asset.accumulated_depreciation);
}

/** Generate next voucher number for a given type prefix. */
export async function nextVoucherNo(prefix: string): Promise<string> {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const pattern = `${prefix}${yy}${mm}%`;

  const { data } = await supabase
    .from('vouchers')
    .select('voucher_no')
    .like('voucher_no', pattern)
    .order('voucher_no', { ascending: false })
    .limit(1);

  let next = 1;
  if (data && data.length > 0) {
    const lastNo = data[0].voucher_no;
    const parts = lastNo.match(/(\d+)$/);
    if (parts) next = parseInt(parts[1], 10) + 1;
  }

  return `${prefix}${yy}${mm}${String(next).padStart(4, '0')}`;
}
