'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { Bell, CheckCheck, Trash2, Inbox } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setNotifs(data as Notification[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    if (!profile) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    toast.success('All marked as read');
  };

  const remove = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Your activity alerts and system messages"
        actions={unreadCount > 0 && <Button variant="outline" size="sm" onClick={markAllRead}><CheckCheck className="mr-2 h-4 w-4" /> Mark all read</Button>}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : notifs.length === 0 ? (
          <EmptyState icon={Inbox} title="No notifications" description="You're all caught up. New alerts will appear here." />
        ) : (
          <div className="divide-y divide-border">
            {notifs.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${!n.is_read ? 'bg-primary/5' : ''}`}>
                <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${!n.is_read ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {n.link && <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href={n.link}>Open</Link></Button>}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => remove(n.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
