'use client';

import { MasterDataPage, type FieldDef, type ColumnDef } from '@/components/shared/MasterDataPage';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

const fields: FieldDef[] = [
  { key: 'code', label: 'Code', required: true, placeholder: 'DEP-001' },
  { key: 'name', label: 'Name', required: true, full: true },
  { key: 'branch_id', label: 'Branch', type: 'select', optionsTable: 'branches', optionsLabel: 'name' },
  { key: 'is_active', label: 'Active', type: 'checkbox' },
];

const columns: ColumnDef[] = [
  { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
  { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'success' : 'secondary'} className="text-[10px]">{r.is_active ? 'Active' : 'Inactive'}</Badge> },
];

export default function DepartmentsPage() {
  return (
    <MasterDataPage
      table="departments"
      title="Departments"
      description="Departments within branches"
      icon={Users}
      fields={fields}
      columns={columns}
      orderBy="code"
    />
  );
}
