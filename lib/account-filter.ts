import type { ChartAccount } from '@/lib/types';

/**
 * Given the raw list of accounts visible to a project (global + project-specific),
 * deduplicate so that if a project-specific clone exists for a global account,
 * only the clone is shown. Global accounts without a clone are shown as-is.
 *
 * This is used by the chart-of-accounts page, trial balance, and balance sheet
 * so that editing an account in one project does not affect other projects.
 */
export function filterProjectAccounts(accounts: ChartAccount[], projectId?: string | null): ChartAccount[] {
  if (!projectId) return accounts;

  // Map: cloned_from_id -> clone account (only project-specific clones)
  const clonesByOrigin = new Map<string, ChartAccount>();
  for (const a of accounts) {
    if (a.cloned_from_id && a.project_id === projectId) {
      clonesByOrigin.set(a.cloned_from_id, a);
    }
  }

  const result: ChartAccount[] = [];
  for (const a of accounts) {
    // Skip global accounts that have been cloned for this project
    if (!a.project_id && clonesByOrigin.has(a.id)) continue;
    result.push(a);
  }
  return result;
}

/**
 * Find the project-specific clone of a global account, if one exists.
 * Otherwise return the original account.
 */
export function resolveProjectAccount(accounts: ChartAccount[], account: ChartAccount, projectId?: string | null): ChartAccount {
  if (!projectId || !account.cloned_from_id) return account;
  // If this is already a clone, return it
  if (account.project_id === projectId && account.cloned_from_id) return account;
  // Look for a clone of this global account
  const clone = accounts.find((a) => a.cloned_from_id === account.id && a.project_id === projectId);
  return clone ?? account;
}
