'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { can, isReadOnlyRole, ROLE_LABELS } from '@/lib/permissions';
import type { Role } from '@/lib/types';
import {
  LayoutDashboard, Wallet, FileText, BookOpen, Scale, Landmark,
  Building2, FolderKanban, HeartHandshake, Users, ShieldCheck,
  Bell, Settings, PiggyBank, Receipt, ClipboardList, History,
  ChevronLeft, X, ScrollText, Workflow, GitBranch,
} from 'lucide-react';
interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
  roles?: Role[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Chart of Accounts', href: '/chart-of-accounts', icon: BookOpen, roles: ['super_admin', 'finance_manager', 'head_of_finance'] },
      { label: 'Voucher Entry', href: '/vouchers', icon: FileText },
      { label: 'Cash Book', href: '/cash-book', icon: Wallet },
      { label: 'Bank Book', href: '/bank-book', icon: Landmark },
      { label: 'General Ledger', href: '/general-ledger', icon: ScrollText },
      { label: 'Trial Balance', href: '/trial-balance', icon: Scale },
      { label: 'Consolidated Reports', href: '/consolidated-reports', icon: GitBranch, roles: ['super_admin', 'executive_director', 'deputy_executive_director', 'head_of_finance', 'finance_manager', 'auditor', 'project_manager'] },
      { label: 'Reports', href: '/reports', icon: ClipboardList },
    ],
  },
  {
    title: 'Master Data',
    roles: ['super_admin'],
    items: [
      { label: 'Branches', href: '/branches', icon: Building2 },
      { label: 'Departments', href: '/departments', icon: Users },
      { label: 'Projects', href: '/projects', icon: FolderKanban },
      { label: 'Donors', href: '/donors', icon: HeartHandshake },
      { label: 'Cost Centers', href: '/cost-centers', icon: Receipt },
      { label: 'Assets', href: '/assets', icon: Landmark },
    ],
  },
  {
    title: 'Budget & Reports',
    items: [
      { label: 'Budget', href: '/budget', icon: PiggyBank },
    ],
  },
  {
    title: 'Administration',
    roles: ['super_admin'],
    items: [
      { label: 'User Management', href: '/users', icon: Users },
      { label: 'Approval Workflows', href: '/approval-workflows', icon: Workflow },
      { label: 'Audit Log', href: '/audit-log', icon: History },
      { label: 'Notifications', href: '/notifications', icon: Bell },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const collapsed = false;

  const visibleGroups = NAV_GROUPS
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.roles || it.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">PSKS ERP</p>
                <p className="truncate text-[10px] text-sidebar-foreground/60">Accounting &amp; Finance</p>
              </div>
            )}
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-4">
          {visibleGroups.map((group) => (
            <div key={group.title} className="mb-5">
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground shadow-sm'
                          : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground'
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {profile?.full_name?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {profile?.full_name}
                </p>
                <p className="truncate text-[10px] text-sidebar-foreground/50">
                  {ROLE_LABELS[role]}
                </p>
              </div>
            )}
            {isReadOnlyRole(role) && !collapsed && (
              <ShieldCheck className="h-3.5 w-3.5 text-warning" />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
      aria-label="Open menu"
    >
      <ChevronLeft className="h-5 w-5 rotate-180" />
    </button>
  );
}
