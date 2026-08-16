'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { logAudit } from '@/lib/audit';
import { useTheme } from '@/components/theme/ThemeProvider';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, Save, Building2, SlidersHorizontal, Upload, Trash2, Loader2, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import type { Setting } from '@/lib/types';

export default function SettingsPage() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('*');
    if (data) {
      const map: Record<string, string> = {};
      for (const s of data as Setting[]) map[s.key] = s.value;
      setSettings(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      }
      await logAudit({ action: 'update', table_name: 'settings', new_values: settings });
      toast.success('Settings saved');
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const update = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
      const path = `org-logo.${ext}`;
      const { error: upErr } = await supabase.storage.from('org-logos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('org-logos').getPublicUrl(path);
      const logoUrl = `${pub.publicUrl}?t=${Date.now()}`;
      await supabase.from('settings').upsert({ key: 'org_logo_url', value: logoUrl, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      update('org_logo_url', logoUrl);
      await logAudit({ action: 'update', table_name: 'settings', new_values: { org_logo_url: logoUrl } });
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleLogoRemove = async () => {
    const ext = settings.org_logo_url?.split('.').pop()?.split('?')[0] ?? 'png';
    await supabase.storage.from('org-logos').remove([`org-logo.${ext}`]);
    await supabase.from('settings').upsert({ key: 'org_logo_url', value: '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    update('org_logo_url', '');
    toast.success('Logo removed');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Organization and system configuration"
        actions={<Button onClick={saveAll} disabled={saving || loading}><Save className="mr-2 h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Organization</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Logo</Label>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30">
                  {settings.org_logo_url ? (
                    <Image src={settings.org_logo_url} alt="Org Logo" width={80} height={80} className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                  {settings.org_logo_url && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={handleLogoRemove}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">PNG, JPG or SVG. Max 2MB. Shown on login, reports &amp; vouchers.</p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Organization Name</Label><Input value={settings.org_name ?? ''} onChange={(e) => update('org_name', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={settings.org_full_name ?? ''} onChange={(e) => update('org_full_name', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Currency</Label><Input value={settings.currency ?? ''} onChange={(e) => update('currency', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Currency Symbol</Label><Input value={settings.currency_symbol ?? ''} onChange={(e) => update('currency_symbol', e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Voucher Prefix Year</Label><Input value={settings.voucher_prefix_year ?? ''} onChange={(e) => update('voucher_prefix_year', e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4" /> Appearance &amp; System</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${theme === 'light' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                ><Sun className="h-4 w-4" /> Light</button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${theme === 'dark' ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
                ><Moon className="h-4 w-4" /> Dark</button>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="mt-1 text-sm font-medium">{profile?.full_name}</p>
              <Badge variant="secondary" className="mt-1 text-[10px]">{profile?.email}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
