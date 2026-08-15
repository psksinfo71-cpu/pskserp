'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ApprovalWorkflow, ApprovalWorkflowStep, Role } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { can, ROLE_LABELS, ALL_ROLES } from '@/lib/permissions';
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
import { Loader2, Plus, Trash2, Workflow, ArrowDown, Settings2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ApprovalWorkflowsPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const [workflows, setWorkflows] = useState<(ApprovalWorkflow & { steps: ApprovalWorkflowStep[]; project_name?: string; branch_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ApprovalWorkflow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('approval_workflows')
      .select('*, steps: approval_workflow_steps(*)')
      .order('created_at', { ascending: true });
    if (error) toast.error(error.message);

    const projectIds = (data ?? []).map((w: any) => w.project_id).filter(Boolean);
    let projectMap: Record<string, string> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabase.from('projects').select('id, name').in('id', projectIds);
      projectMap = Object.fromEntries((projects ?? []).map((p: any) => [p.id, p.name]));
    }

    const branchIds = (data ?? []).map((w: any) => w.branch_id).filter(Boolean);
    let branchMap: Record<string, string> = {};
    if (branchIds.length > 0) {
      const { data: branches } = await supabase.from('branches').select('id, name').in('id', branchIds);
      branchMap = Object.fromEntries((branches ?? []).map((b: any) => [b.id, b.name]));
    }

    const mapped = (data ?? []).map((w: any) => ({
      ...w,
      steps: (w.steps ?? []).sort((a: any, b: any) => a.step_number - b.step_number),
      project_name: w.project_id ? projectMap[w.project_id] : undefined,
      branch_name: w.branch_id ? branchMap[w.branch_id] : undefined,
    }));
    setWorkflows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing({
      id: '', name: '', office_type: 'project_office', project_id: null, branch_id: null, is_active: true,
      created_at: '', updated_at: '', steps: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (w: ApprovalWorkflow & { steps: ApprovalWorkflowStep[] }) => {
    setEditing({ ...w });
    setDialogOpen(true);
  };

  const [deleteTarget, setDeleteTarget] = useState<(ApprovalWorkflow & { steps: ApprovalWorkflowStep[] }) | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: stepErr } = await supabase.from('approval_workflow_steps').delete().eq('workflow_id', deleteTarget.id);
      if (stepErr) throw stepErr;
      const { error } = await supabase.from('approval_workflows').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Workflow deleted');
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!can(role, 'manage_approval_workflows')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approval Workflows" description="Configurable approval chains for each project and branch" />
        <EmptyState icon={Workflow} title="Access restricted" description="Only Super Admins can manage approval workflows." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Workflows"
        description="Configure approval chains for specific projects and branches"
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Workflow
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : workflows.length === 0 ? (
        <EmptyState icon={Workflow} title="No workflows" description="Create an approval workflow to define the approval chain for vouchers." action={<Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> New Workflow</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {workflows.map((w) => (
            <Card key={w.id} className="p-5">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{w.name}</h3>
                    {w.is_active ? (
                      <Badge variant="success" className="text-[10px]">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w.project_name ? w.project_name : 'All projects'}
                    {w.branch_name ? ` · ${w.branch_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)} title="Edit">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(w)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-0">
                {w.steps.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {s.step_number}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{ROLE_LABELS[s.role as Role] ?? s.role}</p>
                      <p className="text-xs text-muted-foreground">{s.action_label} → {s.result_status}</p>
                    </div>
                    {i < w.steps.length - 1 && <ArrowDown className="h-4 w-4 text-muted-foreground/40" />}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <WorkflowEditor
          workflow={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={load}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot; and all its approval steps. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface WorkflowEditorProps {
  workflow: ApprovalWorkflow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

interface ProjectOption { id: string; name: string; }
interface BranchOption { id: string; name: string; project_id: string; office_type: string; }

function WorkflowEditor({ workflow, open, onOpenChange, onSaved }: WorkflowEditorProps) {
  const [name, setName] = useState(workflow.name);
  const [projectId, setProjectId] = useState(workflow.project_id ?? '');
  const [branchId, setBranchId] = useState(workflow.branch_id ?? '');
  const [isActive, setIsActive] = useState(workflow.is_active);
  const [steps, setSteps] = useState<ApprovalWorkflowStep[]>(
    workflow.steps && workflow.steps.length > 0 ? [...workflow.steps] : [{ id: '', workflow_id: '', step_number: 1, role: 'finance_manager', action_label: 'Review', result_status: 'reviewed', created_at: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const isNew = !workflow.id;

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => {
      setProjects(data ?? []);
    });
    supabase.from('branches').select('id, name, project_id, office_type').order('name').then(({ data }) => {
      setBranches(data ?? []);
    });
  }, []);

  const filteredBranches = projectId
    ? branches.filter((b) => !b.project_id || b.project_id === projectId)
    : branches;

  const handleProjectChange = (val: string) => {
    setProjectId(val);
    setBranchId('');
  };

  const updateStep = (idx: number, field: keyof ApprovalWorkflowStep, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value, step_number: i + 1 } : s)));
  };

  const addStep = () => {
    setSteps((prev) => [...prev, { id: '', workflow_id: '', step_number: prev.length + 1, role: 'accountant', action_label: 'Review', result_status: 'reviewed', created_at: '' }]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Workflow name is required'); return; }
    if (steps.length === 0) { toast.error('At least one step is required'); return; }
    setSaving(true);
    try {
      let workflowId = workflow.id;
      const selectedBranch = branches.find((b) => b.id === branchId);
      const officeType = selectedBranch?.office_type ?? 'head_office';
      if (isNew) {
        const { data, error } = await supabase.from('approval_workflows').insert({
          name,
          office_type: officeType,
          project_id: projectId || null,
          branch_id: branchId || null,
          is_active: isActive,
        }).select().single();
        if (error) throw error;
        workflowId = data.id;
      } else {
        const { error } = await supabase.from('approval_workflows').update({
          name,
          office_type: officeType,
          project_id: projectId || null,
          branch_id: branchId || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        }).eq('id', workflowId);
        if (error) throw error;
        await supabase.from('approval_workflow_steps').delete().eq('workflow_id', workflowId);
      }

      const stepRows = steps.map((s, i) => ({
        workflow_id: workflowId,
        step_number: i + 1,
        role: s.role,
        action_label: s.action_label,
        result_status: s.result_status,
      }));
      const { error: stepErr } = await supabase.from('approval_workflow_steps').insert(stepRows);
      if (stepErr) throw stepErr;

      toast.success(isNew ? 'Workflow created' : 'Workflow updated');
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New Approval Workflow' : 'Edit Approval Workflow'}</DialogTitle>
          <DialogDescription>Define the step-by-step approval chain for vouchers from this project and branch.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Workflow Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Head Office Default" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project Name</Label>
              <Select value={projectId} onValueChange={handleProjectChange}>
                <SelectTrigger><SelectValue placeholder="All projects" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch Name</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  {filteredBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-input" />
            <Label htmlFor="active" className="text-sm font-normal cursor-pointer">Active</Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Approval Steps</Label>
              <Button variant="outline" size="sm" onClick={addStep}><Plus className="mr-1 h-3.5 w-3.5" /> Add Step</Button>
            </div>

            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </div>
                <Select value={s.role} onValueChange={(v) => updateStep(i, 'role', v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.filter((r) => r !== 'super_admin' && r !== 'branch_manager' && r !== 'auditor').map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={s.action_label} onChange={(e) => updateStep(i, 'action_label', e.target.value)} placeholder="Action label" className="w-[120px]" />
                <Select value={s.result_status} onValueChange={(v) => updateStep(i, 'result_status', v)}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['reviewed', 'checked', 'verified', 'approved', 'posted'].map((st) => (
                      <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {steps.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
