'use client';

import { useOrgSettings } from '@/hooks/use-org-settings';

export function ReportHeader({ subtitle, title }: { subtitle?: string; title?: string }) {
  const { logoUrl, orgFullName, orgName } = useOrgSettings();
  const name = orgFullName || 'Palashipara Samaj Kallayan Samity';
  const sub = subtitle ?? `Gangni, Meherpur — ${orgName || 'General Fund'}`;

  return (
    <div className="mb-4 flex items-center justify-center gap-3 text-center">
      {logoUrl && (
        <img src={logoUrl} alt="Logo" className="h-16 w-16 shrink-0 object-contain" />
      )}
      <div>
        <p className="text-lg font-bold">{name}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
        {title && <p className="mt-1 text-base font-semibold">{title}</p>}
      </div>
    </div>
  );
}
