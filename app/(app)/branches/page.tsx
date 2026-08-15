'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Branch, OfficeType } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { can } from '@/lib/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Building2, ChevronRight } from 'lucide-react';

const OFFICE_TYPE_LABELS: Record<OfficeType, string> = {
  head_office: 'Head Office',
  project_office: 'Project Office',
  field_office: 'Field Office',
  sub_office: 'Sub Office',
  branch: 'Branch',
};

const OFFICE_TYPE_COLORS: Record<OfficeType, 'default' | 'success' | 'warning' | 'secondary' | 'outline'> = {
  head_office: 'default',
  project_office: 'success',
  field_office: 'warning',
  sub_office: 'secondary',
  branch: 'outline',
};

export default function BranchesPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const [branches, setBranches] = useState<(Branch & { parent_name?: string; project_name?: string })[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('code');
    if (error) { toast.error(error.message); setLoading(false); return; }
    const { data: projData } = await supabase.from('projects').select('id, name').order('name');
    setProjects(projData ?? []);
    const projectMap = new Map<string, string>();
    for (const p of projData ?? []) projectMap.set(p.id, p.name);
    if (data) {
      const branchMap = new Map<string, string>();
      for (const b of data) branchMap.set(b.id, b.name);
      setBranches(data.map((b: any) => ({
        ...b,
        parent_name: b.parent_id ? branchMap.get(b.parent_id) ?? null : null,
        project_name: b.project_id ? projectMap.get(b.project_id) ?? null : null,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tree = useMemo(() => {
    const map = new Map<string, Branch & { parent_name?: string; project_name?: string; children: any[] }>();
    for (const b of branches) {
      map.set(b.id, { ...b, children: [] });
    }
    const roots: (Branch & { children: any[] })[] = [];
    for (const b of branches) {
      const node = map.get(b.id)!;
      if (b.parent_id && map.has(b.parent_id)) {
        map.get(b.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [branches]);

  const renderNode = (node: any, depth: number = 0): React.ReactNode => {
    const children: any[] = node.children || [];
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted/30"
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {children.length > 0 ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <div className="w-4" />
          )}
          <Building2 className="h-4 w-4 text-primary/70" />
          <span className="flex-1 text-sm font-medium">{node.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
          <Badge variant={OFFICE_TYPE_COLORS[node.office_type as OfficeType] ?? 'outline'} className="text-[10px]">
            {OFFICE_TYPE_LABELS[node.office_type as OfficeType] ?? node.office_type}
          </Badge>
          {node.project_name && (
            <Badge variant="secondary" className="text-[10px]">{node.project_name}</Badge>
          )}
          {can(role, 'manage_master_data') && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(node); setDialogOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const openCreate = () => {
    setEditing({ id: '', code: '', name: '', office_type: 'project_office', parent_id: null, project_id: null, division: '', region: '', district: '', address: '', phone: '', email: '', is_active: true, level: 0 });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing?.code || !editing?.name) { toast.error('Code and name are required'); return; }
    setSaving(true);
    try {
      const parentId = editing.parent_id || null;
      const parentLevel = parentId ? (branches.find((b) => b.id === parentId)?.level ?? 0) : -1;
      const payload = {
        code: editing.code,
        name: editing.name,
        office_type: editing.office_type ?? 'branch',
        parent_id: parentId,
        project_id: editing.project_id || null,
        level: parentLevel + 1,
        division: editing.division ?? '',
        region: editing.region ?? '',
        district: editing.district ?? '',
        address: editing.address ?? '',
        phone: editing.phone ?? '',
        email: editing.email ?? '',
        is_active: editing.is_active ?? true,
      };
      if (editing.id) {
        const { error } = await supabase.from('branches').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Office updated');
      } else {
        const { error } = await supabase.from('branches').insert(payload);
        if (error) throw error;
        toast.success('Office created');
      }
      setDialogOpen(false);
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Office Hierarchy"
        description="Manage Head Office, Project Offices, Field Offices and Sub Offices in a hierarchy"
        actions={can(role, 'manage_master_data') && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New Office</Button>
        )}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : branches.length === 0 ? (
          <EmptyState icon={Building2} title="No offices" description="Create your first office to get started." />
        ) : (
          <div className="divide-y divide-border">
            {tree.map((node) => renderNode(node))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit Office' : 'New Office'}</DialogTitle>
            <DialogDescription>Offices can be nested to create an unlimited hierarchy.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="HO-001" />
                </div>
                <div className="space-y-1.5">
                  <Label>Office Type</Label>
                  <Select value={editing.office_type ?? 'branch'} onValueChange={(v) => setEditing({ ...editing, office_type: v as OfficeType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(OFFICE_TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Head Office" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Parent Office</Label>
                  <Select value={editing.parent_id ?? 'none'} onValueChange={(v) => setEditing({ ...editing, parent_id: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="None (top level)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (top level)</SelectItem>
                      {branches.filter((b) => b.id !== editing.id).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Select value={editing.project_id ?? 'none'} onValueChange={(v) => setEditing({ ...editing, project_id: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Region</Label>
                  <Input value={editing.region ?? ''} onChange={(e) => setEditing({ ...editing, region: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>District</Label>
                  <Input value={editing.district ?? ''} onChange={(e) => setEditing({ ...editing, district: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="h-4 w-4 rounded border-input" />
                <Label htmlFor="active" className="text-sm font-normal cursor-pointer">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
