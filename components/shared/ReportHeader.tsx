'use client';

import { useOrgSettings } from '@/hooks/use-org-settings';

export function ReportHeader({ title }: { title?: string }) {
  const { logoUrl } = useOrgSettings();

  return (
    <div className="mb-4 flex items-center justify-center gap-4 border-b pb-3 text-center print:border-black">
      {logoUrl && (
        <img src={logoUrl} alt="Palashipara Samaj Kallayan Samity logo" className="h-16 w-16 shrink-0 object-contain" />
      )}
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-lg font-bold">Palashipara Samaj Kallayan Samity</p>
        <p className="text-sm text-muted-foreground">Gangni, Meherpur</p>
        {title && <p className="text-base font-semibold">{title}</p>}
      </div>
    </div>
  );
}
