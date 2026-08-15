import { supabase } from '@/lib/supabase/client';

export type ProjectOpeningBalanceMap = Map<string, number>;

/**
 * Fetch project-specific opening balances for a given project.
 * Returns a Map keyed by account_id → opening_balance.
 * If no project is given, returns an empty map (caller falls back to chart_of_accounts.opening_balance).
 */
export async function fetchProjectOpeningBalances(projectId?: string | null): Promise<ProjectOpeningBalanceMap> {
  if (!projectId) return new Map();
  const { data, error } = await supabase
    .from('project_opening_balances')
    .select('account_id, opening_balance')
    .eq('project_id', projectId);
  if (error) {
    console.error('Failed to load project opening balances:', error.message);
    return new Map();
  }
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.account_id, Number(row.opening_balance) || 0);
  }
  return map;
}

/**
 * Resolve the effective opening balance for an account.
 * If a project-specific override exists, use it; otherwise fall back to the default.
 */
export function resolveOpening(
  accountId: string,
  defaultOpening: number,
  projectMap: ProjectOpeningBalanceMap
): number {
  if (projectMap.has(accountId)) {
    return projectMap.get(accountId) ?? 0;
  }
  return defaultOpening;
}

/**
 * Upsert a project-specific opening balance for an account.
 */
export async function upsertProjectOpeningBalance(
  projectId: string,
  accountId: string,
  openingBalance: number
): Promise<void> {
  const { error } = await supabase
    .from('project_opening_balances')
    .upsert(
      { project_id: projectId, account_id: accountId, opening_balance: openingBalance, updated_at: new Date().toISOString() },
      { onConflict: 'project_id,account_id' }
    );
  if (error) throw error;
}
