'use client';

import { useState, useMemo } from 'react';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { exportToExcel, printReport } from '@/lib/export';
import type { BudgetTreeNode, BudgetVarianceSummary } from '@/lib/budget-data';
import { flattenBudgetTree, aggregateTree } from '@/lib/budget-data';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, FileSpreadsheet, Printer } from 'lucide-react';

interface Props {
  incomeTree: BudgetTreeNode[];
  expenseTree: BudgetTreeNode[];
  grandBudget: number;
  grandActual: number;
  fyName: string;
  projectName: string;
  versionLabel: string;
  printDate: string;
  varianceSummary?: BudgetVarianceSummary;
}

function VarianceSection({ title, rows, previousTotal, targetTotal, actualTotal }: { title: string; rows: BudgetTreeNode[]; previousTotal: number; targetTotal: number; actualTotal: number }) {
  const expanded = new Set<string>();
  const collect = (nodes: BudgetTreeNode[]) => nodes.forEach((node) => { if (node.children.length > 0) { expanded.add(node.account.id); collect(node.children); } });
  collect(rows);
  const lines = flattenBudgetTree(rows, 0, expanded, title === 'Income').filter(({ node }) => !node.isGroup).sort((a, b) => (a.node.account.code ?? '').localeCompare(b.node.account.code ?? '', undefined, { numeric: true, sensitivity: 'base' }) || a.node.account.name.localeCompare(b.node.account.name, undefined, { sensitivity: 'base' }));
  return <div className="overflow-x-auto rounded-lg border-2 border-foreground"><table className="w-full text-sm"><thead className="bg-muted/30"><tr><th className="px-3 py-2 text-left">Particulars</th><th className="px-3 py-2 text-right">Previous FS Year Actual</th><th className="px-3 py-2 text-right">Budget 2026-27</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th></tr></thead><tbody className="divide-y divide-border">{lines.map(({ node }) => { const target = node.budget; const actual = node.actual; return <tr key={node.account.id}><td className="px-3 py-1.5">{node.account.name}</td><td className="px-3 py-1.5 text-right font-mono">{formatCurrency(node.previous)}</td><td className="px-3 py-1.5 text-right font-mono">{formatCurrency(target)}</td><td className="px-3 py-1.5 text-right font-mono">{formatCurrency(actual)}</td><td className="px-3 py-1.5 text-right font-mono">{formatCurrency(target - actual)}</td></tr>; })}<tr className="border-t-2 border-foreground font-bold"><td className="px-3 py-2">{title === 'Income' ? 'Total Income Taka:' : 'Total Expenditure:'}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(previousTotal)}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(targetTotal)}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(actualTotal)}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(targetTotal - actualTotal)}</td></tr></tbody></table></div>;
}

function variancePctStr(pct: number | null): string {
  if (pct === null) return 'N/A';
  return `${pct.toFixed(1)}%`;
}

function TreeSection({ nodes, title, expanded, toggle }: {
  nodes: BudgetTreeNode[];
  title: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const flat = useMemo(() => flattenBudgetTree(nodes, 0, expanded, title === 'Income'), [nodes, expanded, title]);
  const agg = useMemo(() => aggregateTree(nodes), [nodes]);

  if (flat.length === 0) {
    return (
      <div className="rounded-lg border border-border">
        <div className="bg-muted/30 px-4 py-2 text-sm font-bold uppercase">{title}</div>
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">No budget data for this section</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b-2 border-foreground bg-primary/5 px-4 py-2">
        <span className="text-sm font-bold uppercase">{title}</span>
        <div className="flex gap-4 text-xs">
          <span>Budget: <span className="font-mono font-semibold">{formatCurrency(agg.budget)}</span></span>
          <span>Actual: <span className="font-mono font-semibold">{formatCurrency(agg.actual)}</span></span>
          <span className={agg.variance >= 0 ? 'text-success' : 'text-destructive'}>
            Variance: <span className="font-mono font-semibold">{formatCurrency(agg.variance)}</span>
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Particulars</th>
            <th className="px-2 py-2 text-left font-medium">Code</th>
            <th className="px-3 py-2 text-right font-medium">Budget</th>
            <th className="px-3 py-2 text-right font-medium">Actual</th>
            <th className="px-3 py-2 text-right font-medium">Variance</th>
            <th className="px-3 py-2 text-right font-medium">Variance %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {flat.map(({ node, depth }, i) => {
            const hasChildren = node.children.length > 0;
            const isOpen = expanded.has(node.account.id);
            const indent = depth * 20;
            const isGroup = node.isGroup;
            const childAgg = hasChildren ? aggregateTree(node.children) : null;
            const displayBudget = isGroup && childAgg ? childAgg.budget : node.budget;
            const displayActual = isGroup && childAgg ? childAgg.actual : node.actual;
            const displayVariance = isGroup && childAgg ? childAgg.variance : node.variance;
            const displayPct = displayBudget === 0 ? null : (displayVariance / displayBudget) * 100;

            return (
              <tr
                key={i}
                className={`${isGroup ? 'bg-muted/20 font-medium' : 'hover:bg-muted/10'} ${depth === 0 ? 'border-t border-border' : ''}`}
              >
                <td className="px-3 py-1.5" style={{ paddingLeft: `${12 + indent}px` }}>
                  {hasChildren ? (
                    <button
                      onClick={() => toggle(node.account.id)}
                      className="mr-1 inline-flex items-center"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span className="mr-1 inline-block w-[14px]" />
                  )}
                  {node.account.name}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">{node.account.code}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCurrency(displayBudget)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCurrency(displayActual)}</td>
                <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${displayVariance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(displayVariance)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">{variancePctStr(displayPct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetVariance({ incomeTree, expenseTree, grandBudget, grandActual, fyName, projectName, versionLabel, printDate, varianceSummary }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const grandVariance = grandBudget - grandActual;
  const grandVariancePct = grandBudget === 0 ? null : (grandVariance / grandBudget) * 100;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    const collect = (nodes: BudgetTreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) { all.add(n.account.id); collect(n.children); }
      }
    };
    collect(incomeTree);
    collect(expenseTree);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded(new Set());

  const buildExportRows = (): (string | number)[][] => {
    const headers = ['Section', 'Particulars', 'Code', 'Budget', 'Actual', 'Variance', 'Variance %'];
    const rows: (string | number)[][] = [headers];

    const walk = (nodes: BudgetTreeNode[], section: string, depth: number) => {
      for (const n of nodes) {
        const childAgg = n.children.length > 0 ? aggregateTree(n.children) : null;
        const b = n.isGroup && childAgg ? childAgg.budget : n.budget;
        const a = n.isGroup && childAgg ? childAgg.actual : n.actual;
        const v = n.isGroup && childAgg ? childAgg.variance : n.variance;
        const p = b === 0 ? 'N/A' : `${(v / b * 100).toFixed(1)}%`;
        rows.push([section, n.account.name, n.account.code, b.toFixed(2), a.toFixed(2), v.toFixed(2), p]);
        if (n.children.length > 0) walk(n.children, section, depth + 1);
      }
    };
    walk(incomeTree, 'Income', 0);
    walk(expenseTree, 'Expense', 0);
    rows.push(['', 'GRAND TOTAL', '', grandBudget.toFixed(2), grandActual.toFixed(2), grandVariance.toFixed(2), grandVariancePct === null ? 'N/A' : `${grandVariancePct.toFixed(1)}%`]);
    return rows;
  };

  const handlePrint = () => {
    let body = `
      <div class="org-header">
        <h1>Palashipara Samaj Kallayan Samity (PSKS)</h1>
        <p>Fund/Project: ${projectName} &middot; Fiscal Year: ${fyName} &middot; Version: ${versionLabel}</p>
        <p>Budget Variance Report &middot; Printed: ${formatDateTime(printDate)}</p>
      </div>`;

    const renderSection = (nodes: BudgetTreeNode[], title: string): string => {
      const agg = aggregateTree(nodes);
      let html = `<table><thead><tr class="totals"><th colspan="6">${title}</th></tr>
        <tr><th>Particulars</th><th>Code</th><th class="right">Budget</th><th class="right">Actual</th><th class="right">Variance</th><th class="right">Variance %</th></tr></thead><tbody>`;
      const walk = (ns: BudgetTreeNode[], depth: number) => {
        for (const n of ns) {
          const childAgg = n.children.length > 0 ? aggregateTree(n.children) : null;
          const b = n.isGroup && childAgg ? childAgg.budget : n.budget;
          const a = n.isGroup && childAgg ? childAgg.actual : n.actual;
          const v = n.isGroup && childAgg ? childAgg.variance : n.variance;
          const p = b === 0 ? 'N/A' : `${(v / b * 100).toFixed(1)}%`;
          const cls = n.isGroup ? ' class="totals"' : '';
          const indent = depth * 12;
          html += `<tr${cls}><td style="padding-left:${12 + indent}px">${n.account.name}</td><td>${n.account.code}</td><td class="right">${formatCurrency(b)}</td><td class="right">${formatCurrency(a)}</td><td class="right" style="color:${v >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(v)}</td><td class="right">${p}</td></tr>`;
          if (n.children.length > 0) walk(n.children, depth + 1);
        }
      };
      walk(nodes, 0);
      html += `<tr class="totals"><td colspan="2">${title} Total</td><td class="right">${formatCurrency(agg.budget)}</td><td class="right">${formatCurrency(agg.actual)}</td><td class="right" style="color:${agg.variance >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(agg.variance)}</td><td class="right">${agg.budget === 0 ? 'N/A' : (agg.variance / agg.budget * 100).toFixed(1) + '%'}</td></tr>`;
      html += '</tbody></table>';
      return html;
    };

    body += renderSection(incomeTree, 'Income');
    body += `<div style="height:12px"></div>`;
    body += renderSection(expenseTree, 'Expense');
    body += `<table><tr class="totals"><td colspan="2">GRAND TOTAL</td><td class="right">${formatCurrency(grandBudget)}</td><td class="right">${formatCurrency(grandActual)}</td><td class="right" style="color:${grandVariance >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(grandVariance)}</td><td class="right">${grandVariancePct === null ? 'N/A' : grandVariancePct.toFixed(1) + '%'}</td></tr></table>`;
    printReport('Budget Variance Report', body);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expand All</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Collapse All</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToExcel('budget_variance', ['Section', 'Particulars', 'Code', 'Budget', 'Actual', 'Variance', 'Variance %'], buildExportRows())}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border-2 border-foreground bg-primary/5">
        <div className="px-4 py-3 text-center">
          <p className="text-sm font-bold">Palashipara Samaj Kallayan Samity (PSKS)</p>
          <p className="text-xs text-muted-foreground">Fund: {projectName} &middot; FY: {fyName} &middot; Version: {versionLabel}</p>
          <p className="text-xs text-muted-foreground">Budget Variance Report &middot; {formatDateTime(printDate)}</p>
        </div>
      </div>

      {varianceSummary ? (
        <>
          <VarianceSection title="Income" rows={incomeTree} previousTotal={varianceSummary.income.previous} targetTotal={varianceSummary.income.target} actualTotal={varianceSummary.income.actual} />
          <VarianceSection title="Expenditure" rows={expenseTree} previousTotal={varianceSummary.expenditure.previous} targetTotal={varianceSummary.expenditure.target} actualTotal={varianceSummary.expenditure.actual} />
          <div className="overflow-x-auto rounded-lg border-2 border-foreground"><table className="w-full text-sm"><tbody><tr className="font-bold"><td className="px-3 py-2">Surplus/(Deficit) of Income over Expenditure</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(varianceSummary.surplus.previous)}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(varianceSummary.surplus.target)}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(varianceSummary.surplus.actual)}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(varianceSummary.surplus.variance)}</td></tr></tbody></table></div>
        </>
      ) : (
        <><TreeSection nodes={incomeTree} title="Income" expanded={expanded} toggle={toggle} /><TreeSection nodes={expenseTree} title="Expense" expanded={expanded} toggle={toggle} /></>
      )}

      <div className={`flex items-center justify-between rounded-lg border-2 px-4 py-3 ${grandVariance >= 0 ? 'border-success bg-success/5' : 'border-destructive bg-destructive/5'}`}>
        <span className="text-sm font-bold">GRAND TOTAL (Income + Expense)</span>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Budget</p>
            <p className="font-mono text-sm font-bold tabular-nums">{formatCurrency(grandBudget)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Actual</p>
            <p className="font-mono text-sm font-bold tabular-nums">{formatCurrency(grandActual)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Variance</p>
            <p className={`font-mono text-sm font-bold tabular-nums ${grandVariance >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(grandVariance)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Variance %</p>
            <p className="font-mono text-sm font-bold tabular-nums">{variancePctStr(grandVariancePct)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
