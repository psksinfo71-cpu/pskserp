'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTheme } from '@/components/theme/ThemeProvider';
import { ROLE_LABELS } from '@/lib/permissions';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase/client';
import type { Notification } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Bell, Sun, Moon, LogOut, User as UserIcon, Settings, ChevronDown,
  Menu, CheckCheck, FolderKanban, Check,
} from 'lucide-react';

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { profile, signOut, userProjects, activeProject, setActiveProjectId } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (data) setNotifs(data as Notification[]);
    };
    load();
    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) {
        setProjectOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <button
        onClick={onOpenSidebar}
        className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Project switcher */}
      {userProjects.length > 0 && (
        <div className="relative" ref={projectRef}>
          <button
            onClick={() => setProjectOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted"
          >
            <FolderKanban className="h-4 w-4 text-primary" />
            <span className="hidden max-w-[140px] truncate font-medium sm:inline">
              {activeProject?.name ?? 'Select Project'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {projectOpen && (
            <div className="absolute left-0 top-full mt-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg z-50">
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Switch Project</p>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {userProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveProjectId(p.id);
                      setProjectOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-left">{p.name}</span>
                    {activeProject?.id === p.id && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label="Toggle theme"
        className="text-muted-foreground"
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setNotifOpen((o) => !o)}
          aria-label="Notifications"
          className="relative text-muted-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="scrollbar-thin max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No notifications yet
                </p>
              ) : (
                notifs.map((n) => (
                  <Link
                    key={n.id}
                    href={n.link || '/notifications'}
                    onClick={() => setNotifOpen(false)}
                    className={`block border-b border-border/60 px-4 py-3 last:border-0 hover:bg-muted/50 ${
                      !n.is_read ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <Link
              href="/notifications"
              onClick={() => setNotifOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-muted/50"
            >
              View all
            </Link>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setUserMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials(profile?.full_name ?? 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <p className="max-w-32 truncate text-xs font-medium leading-tight">
              {profile?.full_name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {profile ? ROLE_LABELS[profile.role] : ''}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
              <Badge variant="secondary" className="mt-2 text-[10px]">
                {profile ? ROLE_LABELS[profile.role] : ''}
              </Badge>
            </div>
            <div className="py-1">
              <Link
                href="/profile"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
              >
                <UserIcon className="h-4 w-4" /> Profile
              </Link>
              {profile?.role === 'super_admin' && (
                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
              )}
            </div>
            <div className="border-t border-border py-1">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
