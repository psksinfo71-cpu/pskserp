'use client';

import { useMemo } from 'react';
import type { ChartAccount } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TreeNode {
  account: ChartAccount;
  children: TreeNode[];
}

export function buildAccountTree(accounts: ChartAccount[]): TreeNode[] {
  const byParent = new Map<string | null, ChartAccount[]>();
  for (const a of accounts) {
    const key = a.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(a);
  }
  const build = (parent: string | null): TreeNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((account) => ({ account, children: build(account.id) }));
  return build(null);
}

export function flattenTree(nodes: TreeNode[], depth = 0, expanded: Set<string>): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children.length && expanded.has(n.account.id)) {
      out.push(...flattenTree(n.children, depth + 1, expanded));
    }
  }
  return out;
}

export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: 'text-primary',
  liability: 'text-warning',
  equity: 'text-chart-4',
  income: 'text-success',
  expense: 'text-destructive',
};

export function useAccountTree(accounts: ChartAccount[]) {
  return useMemo(() => buildAccountTree(accounts), [accounts]);
}

export function AccountTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    asset: 'Asset',
    liability: 'Liability',
    equity: 'Equity',
    income: 'Income',
    expense: 'Expense',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        type === 'asset' && 'bg-primary/10 text-primary',
        type === 'liability' && 'bg-warning/15 text-warning',
        type === 'equity' && 'bg-chart-4/10 text-chart-4',
        type === 'income' && 'bg-success/10 text-success',
        type === 'expense' && 'bg-destructive/10 text-destructive'
      )}
    >
      {labels[type] ?? type}
    </span>
  );
}
