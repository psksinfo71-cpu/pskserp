'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/audit';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ROLE_LABELS } from '@/lib/permissions';
import { initials, formatDateTime } from '@/lib/format';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [designation, setDesignation] = useState(profile?.designation ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName, phone, designation }).eq('id', profile.id);
      if (error) throw error;
      await logAudit({ action: 'update', table_name: 'profiles', record_id: profile.id, new_values: { full_name: fullName, phone, designation } });
      toast.success('Profile updated');
      refreshProfile();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Manage your account details" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="h-20 w-20"><AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">{initials(profile.full_name)}</AvatarFallback></Avatar>
            <p className="mt-3 text-sm font-semibold">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground">{profile.email}</p>
            <Badge variant="secondary" className="mt-2 text-[10px]">{ROLE_LABELS[profile.role]}</Badge>
            <div className="mt-4 w-full space-y-2 border-t border-border pt-4 text-left text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Last login</span><span>{formatDateTime(profile.last_login_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{formatDateTime(profile.created_at)}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Edit Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Deputy Executive Director" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={profile.email} disabled className="bg-muted/50" /></div>
            <Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
