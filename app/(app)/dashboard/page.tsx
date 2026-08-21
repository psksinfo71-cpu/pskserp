'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  formatCurrency, formatDate,
} from '@/lib/format';
import {
  getDashboardKPIs, getMonthlyTrend, getBranchSummary, getRecentVouchers,
  type DashboardKPIs,
} from '@/lib/queries';
import {
  Wallet, Landmark, TrendingUp, TrendingDown, Clock, FileText,
  ArrowRight, Activity, AlertCircle, Receipt,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import Link from 'next/link';
import { usePettyCash, PETTY_CASH_MAX } from '@/hooks/use-petty-cash';
import { PettyCashRequisition } from '@/components/petty-cash/PettyCashRequisition';

const PIE_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'warning',
  reviewed: 'default',
  approved: 'default',
  rejected: 'destructive',
  posted: 'success',
  locked: 'outline',
};

export default function DashboardPage() {
  const { profile, activeProject } = useAuth();
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [trend, setTrend] = useState<{ label: string; income: number; expense: number }[]>([]);
  const [branches, setBranches] = useState<{ branch: string; income: number; expense: number }[]>([]);
  const [recent, setRecent] = useState<(any)[]>([]);
  const [loading, setLoading] = useState(true);
  const [pettyCashOpen, setPettyCashOpen] = useState(false);
  const pettyCash = usePettyCash();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, t, b, r] = await Promise.all([
        getDashboardKPIs(activeProject?.id),
        getMonthlyTrend(6, activeProject?.id),
        getBranchSummary(activeProject?.id),
        getRecentVouchers(8, activeProject?.id),
      ]);
      setKpis(k);
      setTrend(t);
      setBranches(b);
      setRecent(r);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => { load(); }, [load]);

  const stats = [
    {
      label: 'Total Cash in Hand',
      value: kpis?.totalCash,
      icon: Wallet,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Total Bank Balance',
      value: kpis?.totalBank,
      icon: Landmark,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: "Today's Income",
      value: kpis?.todayIncome,
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: "Today's Expense",
      value: kpis?.todayExpense,
      icon: TrendingDown,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      label: 'Monthly Income',
      value: kpis?.monthIncome,
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Monthly Expense',
      value: kpis?.monthExpense,
      icon: TrendingDown,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      label: 'Pending Approvals',
      value: kpis?.pendingApprovals,
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10',
      raw: true,
    },
    {
      label: 'Pending Vouchers',
      value: kpis?.pendingVouchers,
      icon: FileText,
      color: 'text-muted-foreground',
      bg: 'bg-muted',
      raw: true,
    },
  ];

  const expenseDist = branches.map((b) => ({ name: b.branch, value: b.expense }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? ''}`}
        description="Financial overview of your organization"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/vouchers">
              <FileText className="mr-2 h-4 w-4" /> New Voucher
            </Link>
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {loading
                  ? '...'
                  : s.raw
                    ? (s.value ?? 0).toLocaleString('en-BD')
                    : formatCurrency(s.value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts */}
      {kpis && (kpis.pendingApprovals > 0 || kpis.totalCash < 50000 || pettyCash.alert) && (
      <div className="grid gap-3 sm:grid-cols-2">
        {kpis.pendingApprovals > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-warning-foreground">{kpis.pendingApprovals} voucher(s) awaiting approval</p>
              <Link href="/vouchers" className="text-xs text-primary hover:underline">Review now</Link>
            </div>
          </div>
        )}
        {kpis.totalCash < 50000 && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Low cash alert</p>
              <p className="text-xs text-muted-foreground">Cash in hand below ৳50,000</p>
            </div>
          </div>
        )}
        {pettyCash.alert && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 sm:col-span-2">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Petty Cash at {pettyCash.burnRate.toFixed(1)}% used</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(pettyCash.totalExpenses)} of {formatCurrency(PETTY_CASH_MAX)} spent ({formatCurrency(pettyCash.balance)} remaining)</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setPettyCashOpen(true)}>
              <Receipt className="mr-1.5 h-3.5 w-3.5" /> Petty Cash Requisition
            </Button>
          </div>
        )}
      </div>
      )}

      {/* Petty Cash Requisition Modal */}
      <PettyCashRequisition
        open={pettyCashOpen}
        onOpenChange={setPettyCashOpen}
        expenses={pettyCash.expenses}
        totalExpenses={pettyCash.totalExpenses}
      />

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Income vs Expense Trend</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="income" name="Income" stroke="hsl(var(--chart-2))" fill="url(#incomeGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" name="Expense" stroke="hsl(var(--destructive))" fill="url(#expenseGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Expense by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseDist.length === 0 || expenseDist.every((e) => e.value === 0) ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No expense data</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={expenseDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {expenseDist.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Branch summary + recent */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Branch-wise Summary</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/reports">Reports <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={branches} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="branch" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/vouchers">All <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="scrollbar-thin max-h-[240px] overflow-y-auto p-0">
            <div className="divide-y divide-border">
              {recent.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No transactions yet</p>
              )}
              {recent.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.voucher_no}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.narration || v.branch_name || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(v.amount)}</p>
                    <Badge variant={STATUS_COLORS[v.status] ?? 'secondary'} className="mt-0.5 text-[10px]">
                      {v.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
