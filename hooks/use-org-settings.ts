'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface OrgSettings {
  orgName: string;
  orgFullName: string;
  logoUrl: string | null;
  loading: boolean;
}

let cache: Record<string, string> | null = null;

export function useOrgSettings(): OrgSettings {
  const [settings, setSettings] = useState<Record<string, string>>(cache ?? {});
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (cache) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.from('settings').select('key, value');
      if (data && mounted) {
        const map: Record<string, string> = {};
        for (const s of data) map[s.key] = s.value;
        cache = map;
        setSettings(map);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return {
    orgName: settings.org_name ?? '',
    orgFullName: settings.org_full_name ?? '',
    logoUrl: settings.org_logo_url ?? null,
    loading,
  };
}

export function getLogoUrl(): string | null {
  return cache?.org_logo_url ?? null;
}

export function getOrgName(): string {
  return cache?.org_name ?? '';
}

export function getOrgFullName(): string {
  return cache?.org_full_name ?? '';
}
