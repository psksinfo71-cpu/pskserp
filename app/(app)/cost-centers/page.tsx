'use client';

import { MasterDataPage, type FieldDef, type ColumnDef } from '@/components/shared/MasterDataPage';
import { Badge } from '@/components/ui/badge';
import { Receipt } from 'lucide-react';

const fields: FieldDef[] = [
  { key: 'code', label: 'Code', required: true, placeholder: 'CC-001' },
  { key: 'name', label: 'Name', required: true, full: true },
  { key: 'branch_id', label: 'Branch', type: 'select', optionsTable: 'branches', optionsLabel: 'name' },
  { key: 'project_id', label: 'Project', type: 'select', optionsTable: 'projects', optionsLabel: 'name' },
  { key: 'is_active', label: 'Active', type: 'checkbox' },
];

const columns: ColumnDef[] = [
  { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
  { key: 'name', label: 'Cost Center', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'success' : 'secondary'} className="text-[10px]">{r.is_active ? 'Active' : 'Inactive'}</Badge> },
];

export default function CostCentersPage() {
  return (
    <MasterDataPage
      table="cost_centers"
      title="Cost Centers"
      description="Track expenses by cost center for granular reporting"
      icon={Receipt}
      fields={fields}
      columns={columns}
      orderBy="code"
    />
  );
}
