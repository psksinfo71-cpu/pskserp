'use client';

import { MasterDataPage, type FieldDef, type ColumnDef } from '@/components/shared/MasterDataPage';
import { Badge } from '@/components/ui/badge';
import { HeartHandshake } from 'lucide-react';

const fields: FieldDef[] = [
  { key: 'code', label: 'Code', required: true, placeholder: 'DON-001' },
  { key: 'name', label: 'Name', required: true, full: true },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address', full: true },
  { key: 'is_active', label: 'Active', type: 'checkbox' },
];

const columns: ColumnDef[] = [
  { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
  { key: 'name', label: 'Donor', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'contact_person', label: 'Contact' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'success' : 'secondary'} className="text-[10px]">{r.is_active ? 'Active' : 'Inactive'}</Badge> },
];

export default function DonorsPage() {
  return (
    <MasterDataPage
      table="donors"
      title="Donors"
      description="Grant providers and funding organizations"
      icon={HeartHandshake}
      fields={fields}
      columns={columns}
      orderBy="code"
    />
  );
}
