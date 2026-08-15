'use client';

import { supabase } from '@/lib/supabase/client';

export async function logAudit(params: {
  action: string;
  table_name: string;
  record_id?: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  user_id?: string;
  user_email?: string;
}) {
  let userId = params.user_id;
  let userEmail = params.user_email;

  if (!userId || !userEmail) {
    const { data: userData } = await supabase.auth.getUser();
    userId = userId ?? userData.user?.id ?? undefined;
    if (userId && !userEmail) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      userEmail = profile?.email ?? userData.user?.email ?? '';
    } else {
      userEmail = userEmail ?? userData.user?.email ?? '';
    }
  }

  return supabase.from('audit_logs').insert({
    user_id: userId ?? null,
    user_email: userEmail ?? '',
    action: params.action,
    table_name: params.table_name,
    record_id: params.record_id ?? '',
    old_values: params.old_values ?? null,
    new_values: params.new_values ?? null,
    ip_address: '',
  });
}

interface NotifyParams {
  title: string;
  message: string;
  type?: string;
  link?: string;
  user_id?: string;
  user_ids?: string[];
  to?: 'approvers' | 'specific';
}

/**
 * Send in-app notifications. Writes go through the `notify` edge function
 * (service-role) because RLS restricts direct notification inserts to
 * super_admin only — regular staff cannot forge notifications for others.
 */
export async function notifyUser(params: NotifyParams) {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) return;

  const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`;
  const payload: NotifyParams = {
    title: params.title,
    message: params.message,
    type: params.type,
    link: params.link,
  };

  if (params.user_id) {
    payload.to = 'specific';
    payload.user_ids = [params.user_id];
  } else if (params.user_ids && params.user_ids.length > 0) {
    payload.to = 'specific';
    payload.user_ids = params.user_ids;
  } else {
    payload.to = 'approvers';
  }

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('notify failed:', err?.error ?? res.status);
    }
  } catch (e) {
    console.error('notify error:', (e as Error).message);
  }
}
