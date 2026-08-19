'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Voucher, VoucherStatus, ApprovalWorkflow, ApprovalWorkflowStep } from '@/lib/types';
import { can, canEditVoucher, canDeleteVoucher, isReadOnlyRole, ROLE_LABELS } from '@/lib/permissions';
import { useAuth } from '@/components/auth/AuthProvider';
import { logAudit, notifyUser } from '@/lib/audit';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { VoucherFormDialog } from '@/components/vouchers/VoucherFormDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import { exportToCSV, exportToExcel, printReport } from '@/lib/export';
import { toast } from 'sonner';
import { VOUCHER_TYPES, getVoucherTypeLabelWithLegacy } from '@/lib/voucher-types';
import { runFinancialAuditChecks } from '@/lib/financial-audit';
import {
  Plus, Search, FileText, Pencil, CheckCircle2, XCircle, Send, Lock, Eye, Trash2, Printer,
  FileSpreadsheet,
} from 'lucide-react';

const STATUS_BADGE: Record<VoucherStatus, 'secondary' | 'warning' | 'default' | 'destructive' | 'success' | 'outline'> = {
  draft: 'secondary',
  submitted: 'warning',
  reviewed: 'default',
  checked: 'default',
  verified: 'default',
  approved: 'default',
  rejected: 'destructive',
  posted: 'success',
  locked: 'outline',
};

const STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  checked: 'Checked',
  verified: 'Verified',
  approved: 'Approved',
  rejected: 'Rejected',
  posted: 'Posted',
  locked: 'Locked',
};

export default function VouchersPage() {
  const { profile, activeProject } = useAuth();
  const role = profile?.role ?? 'accountant';
  const [vouchers, setVouchers] = useState<(Voucher & { branch_name?: string; project_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [projectFilterInitialized, setProjectFilterInitialized] = useState(false);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [viewing, setViewing] = useState<Voucher | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Voucher | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewLines, setViewLines] = useState<{ code: string; name: string; debit: number; credit: number }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null);
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<Record<string, ApprovalWorkflowStep[]>>({});
  const [approvals, setApprovals] = useState<Record<string, { step_number: number; user_email: string; action: string; role_at_time: string; created_at: string }[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('vouchers')
      .select('*, branch: branches!vouchers_branch_id_fkey ( name, office_type ), project: projects!vouchers_project_id_fkey ( name )')
      .order('voucher_date', { ascending: false })
      .order('voucher_no', { ascending: false })
      .limit(200);
    if (activeProject && role !== 'super_admin') q = q.eq('project_id', activeProject.id);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    if (data) {
      setVouchers(data.map((v) => ({
        ...(v as Voucher),
        branch_name: (v as { branch?: { name?: string } }).branch?.name,
        project_name: (v as { project?: { name?: string } }).project?.name,
      })));
    }

    const { data: wfData } = await supabase
      .from('approval_workflows')
      .select('*, steps: approval_workflow_steps(*)')
      .eq('is_active', true);
    if (wfData) {
      setWorkflows(wfData as any);
      const stepMap: Record<string, ApprovalWorkflowStep[]> = {};
      for (const wf of wfData as any[]) {
        stepMap[wf.id] = (wf.steps ?? []).sort((a: any, b: any) => a.step_number - b.step_number);
      }
      setWorkflowSteps(stepMap);
    }

    const voucherIds = (data ?? []).map((v: any) => v.id);
    if (voucherIds.length > 0) {
      const { data: apprData } = await supabase
        .from('voucher_approvals')
        .select('voucher_id, step_number, user_email, action, role_at_time, created_at')
        .in('voucher_id', voucherIds)
        .order('created_at', { ascending: true });
      if (apprData) {
        const apprMap: Record<string, any[]> = {};
        for (const a of apprData as any[]) {
          if (!apprMap[a.voucher_id]) apprMap[a.voucher_id] = [];
          apprMap[a.voucher_id].push(a);
        }
        setApprovals(apprMap);
      }
    }

    setLoading(false);
  }, [activeProject, role]);

  useEffect(() => { load(); }, [load]);

  // Sync project filter to active project for super_admin
  useEffect(() => {
    if (role === 'super_admin' && activeProject) {
      setProjectFilter(activeProject.id);
      setProjectFilterInitialized(true);
    } else {
      setProjectFilter('all');
    }
  }, [role, activeProject]);

  // Super admin: load all projects for filtering
  useEffect(() => {
    if (role !== 'super_admin') return;
    supabase.from('projects').select('id, name').eq('is_active', true).order('name').then(({ data }) => {
      setAllProjects(data ?? []);
    });
  }, [role]);

  const filtered = useMemo(() => {
    return vouchers.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (typeFilter !== 'all' && v.voucher_type !== typeFilter) return false;
    if (projectFilter !== 'all' && v.project_id !== projectFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return v.voucher_no.toLowerCase().includes(q) ||
          v.narration?.toLowerCase().includes(q) ||
          v.branch_name?.toLowerCase().includes(q) ||
          v.project_name?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [vouchers, search, statusFilter, typeFilter, projectFilter]);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (v: Voucher) => { setEditing(v); setDialogOpen(true); };

  const openView = async (v: Voucher) => {
    setViewing(v);
    const { data } = await supabase
      .from('voucher_details')
      .select('debit, credit, narration, account: chart_of_accounts ( code, name )')
      .eq('voucher_id', v.id)
      .order('line_order');
    if (data) {
      setViewLines(data.map((d) => {
        const acc = (d as { account?: { code?: string; name?: string } }).account;
        return {
          code: acc?.code ?? '', name: acc?.name ?? '',
          debit: Number(d.debit) || 0, credit: Number(d.credit) || 0,
        };
      }));
    }
  };

  const advanceStatus = async (v: Voucher, newStatus: VoucherStatus, reason?: string) => {
    const patch: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      current_step: v.current_step + 1,
    };
    if (newStatus === 'reviewed') patch.reviewed_by = profile?.id;
    if (newStatus === 'checked') patch.checked_by = profile?.id;
    if (newStatus === 'verified') patch.verified_by = profile?.id;
    if (newStatus === 'approved' || newStatus === 'posted') {
      patch.approved_by = profile?.id;
      patch.status = 'posted';
      patch.posted_at = new Date().toISOString();
    }
    if (newStatus === 'rejected') {
      patch.rejected_reason = reason ?? '';
      patch.current_step = 0;
    }
    const { error } = await supabase.from('vouchers').update(patch).eq('id', v.id);
    if (error) { toast.error(error.message); return; }

    await supabase.from('voucher_approvals').insert({
      voucher_id: v.id,
      step_number: v.current_step + 1,
      user_id: profile?.id,
      user_email: profile?.email ?? '',
      action: newStatus === 'rejected' ? 'rejected' : newStatus,
      role_at_time: role,
      comments: reason ?? '',
    });

    await logAudit({ action: 'status_change', table_name: 'vouchers', record_id: v.id, old_values: { status: v.status }, new_values: { status: newStatus === 'approved' ? 'posted' : newStatus }, user_id: profile?.id, user_email: profile?.email });
    if (v.prepared_by) {
      await notifyUser({
        user_id: v.prepared_by,
        title: `Voucher ${newStatus}`,
        message: `${v.voucher_no} has been ${newStatus}${reason ? ': ' + reason : ''}`,
        type: newStatus === 'approved' || newStatus === 'posted' ? 'approval' : 'system',
        link: '/vouchers',
      });
    }
    toast.success(`Voucher ${newStatus}`);
    load();
  };

  const getCurrentStep = (v: Voucher): ApprovalWorkflowStep | null => {
    if (!v.approval_workflow_id) return null;
    const steps = workflowSteps[v.approval_workflow_id];
    if (!steps) return null;
    return steps.find((s) => s.step_number === v.current_step + 1) ?? null;
  };

  const canActOnStep = (v: Voucher): boolean => {
    const step = getCurrentStep(v);
    if (!step) return false;
    if (role === 'super_admin') return true;
    return step.role === role;
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { data: details, error: detailReadError } = await supabase.from('voucher_details').select('account_id, debit, credit').eq('voucher_id', deleteTarget.id);
    if (detailReadError) { toast.error(detailReadError.message); return; }
    try {
      await runFinancialAuditChecks({
        voucherId: deleteTarget.id,
        voucherDate: deleteTarget.voucher_date,
        amount: Number(deleteTarget.amount) || 0,
        lines: (details ?? []).map((d) => ({ account_id: d.account_id, debit: Number(d.debit) || 0, credit: Number(d.credit) || 0 })),
        userId: profile?.id,
        userEmail: profile?.email,
        mode: 'delete',
      });
    } catch (auditError) {
      toast.error((auditError as Error).message);
      return;
    }
    const { error: delDetails } = await supabase.from('voucher_details').delete().eq('voucher_id', deleteTarget.id);
    if (delDetails) { toast.error(delDetails.message); return; }
    const { error: delVoucher } = await supabase.from('vouchers').delete().eq('id', deleteTarget.id);
    if (delVoucher) { toast.error(delVoucher.message); return; }
    await logAudit({ action: 'delete', table_name: 'vouchers', record_id: deleteTarget.id, old_values: { voucher_no: deleteTarget.voucher_no }, user_id: profile?.id, user_email: profile?.email });
    toast.success('Voucher deleted');
    setDeleteTarget(null);
    load();
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.error('Reason is required'); return; }
    await advanceStatus(rejectTarget, 'rejected', rejectReason);
    setRejectOpen(false);
    setRejectTarget(null);
    setRejectReason('');
  };

  const readOnly = isReadOnlyRole(role);
  const canCreate = can(role, 'create_voucher');
  const canReview = can(role, 'review_voucher');
  const canCheck = can(role, 'check_voucher');
  const canVerify = can(role, 'verify_voucher');
  const canApproveRole = can(role, 'approve_voucher');
  const canDelete = role === 'super_admin';

  const voucherHeaders = ['Voucher No', 'Type', 'Date', 'Project', 'Branch', 'Narration', 'Amount', 'Status'];
  const voucherRows = filtered.map((v) => [
    v.voucher_no,
    getVoucherTypeLabelWithLegacy(v.voucher_type),
    formatDate(v.voucher_date),
    v.project_name ?? '-',
    v.branch_name ?? '-',
    v.narration ?? '-',
    v.amount,
    STATUS_LABELS[v.status],
  ]);
  const voucherPrint = () => {
    const body = `<h1>Vouchers</h1>
      <div class="meta">${statusFilter !== 'all' ? 'Status: ' + statusFilter + ' · ' : ''}${typeFilter !== 'all' ? 'Type: ' + typeFilter : ''}</div>
      <table><thead><tr><th>Voucher No</th><th>Type</th><th>Date</th><th>Project</th><th>Narration</th><th class="right">Amount</th><th class="center">Status</th></tr></thead>
      <tbody>${filtered.map((v) => `<tr><td class="font-mono">${v.voucher_no}</td><td>${getVoucherTypeLabelWithLegacy(v.voucher_type)}</td><td>${formatDate(v.voucher_date)}</td><td>${v.project_name ?? '-'}</td><td>${v.narration ?? '-'}</td><td class="right">${formatCurrency(v.amount)}</td><td class="center">${STATUS_LABELS[v.status]}</td></tr>`).join('')}</tbody></table>`;
    printReport('Vouchers', body);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voucher Entry"
        description="Create, review, verify, approve and post double-entry vouchers"
        actions={canCreate && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New Voucher
          </Button>
        )}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search voucher no, narration, branch, project..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {VOUCHER_TYPES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {role === 'super_admin' && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {allProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['draft', 'submitted', 'reviewed', 'checked', 'verified', 'approved', 'rejected', 'posted', 'locked'].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCSV('vouchers', voucherHeaders, voucherRows)}>
              <FileText className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToExcel('vouchers', voucherHeaders, voucherRows)}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={voucherPrint}>
              <Printer className="mr-1.5 h-4 w-4" /> Print
            </Button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No vouchers found" description="Adjust filters or create a new voucher." action={canCreate && <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> New Voucher</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Voucher No</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 font-medium">Narration</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((v) => {
                  const isPreparer = v.prepared_by === profile?.id;
                  const editable = canEditVoucher(role, v.status, isPreparer);
                  const deletable = canDeleteVoucher(role, v.status);
                  return (
                    <tr key={v.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium">{v.voucher_no}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs"><Badge variant="outline" className="text-[10px]">{getVoucherTypeLabelWithLegacy(v.voucher_type)}</Badge></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatDate(v.voucher_date)}</td>
                      <td className="px-3 py-2.5 text-xs">{v.project_name ?? '-'}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-muted-foreground" title={v.narration}>{v.narration || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-medium">{formatCurrency(v.amount)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={STATUS_BADGE[v.status]} className="text-[10px]">{STATUS_LABELS[v.status]}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openView(v)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                          {editable && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                          )}
                          {/* Workflow-driven approval buttons */}
                          {canActOnStep(v) && v.status !== 'draft' && v.status !== 'rejected' && v.status !== 'posted' && v.status !== 'locked' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => {
                              const step = getCurrentStep(v);
                              if (step) advanceStatus(v, step.result_status as VoucherStatus);
                            }} title={getCurrentStep(v)?.action_label ?? 'Approve'}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* Reject: available to anyone who can act on current step, or legacy fallback by role */}
                          {((canActOnStep(v) && ['submitted', 'reviewed', 'checked', 'verified'].includes(v.status))
                            || (!v.approval_workflow_id && (
                              (canReview && v.status === 'submitted') ||
                              (canVerify && v.status === 'reviewed') ||
                              (canApproveRole && v.status === 'verified')
                            ))) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setRejectTarget(v); setRejectOpen(true); }} title="Reject"><XCircle className="h-3.5 w-3.5" /></Button>
                          )}
                          {/* Super Admin: Delete */}
                          {deletable && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(v)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <VoucherFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} onSaved={load} />

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{viewing?.voucher_no}</DialogTitle>
            <DialogDescription>
              {viewing && getVoucherTypeLabelWithLegacy(viewing.voucher_type)} &middot; {viewing && formatDate(viewing.voucher_date)}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="flex justify-end print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.open(`/vouchers/${viewing.id}`, '_blank')}>
                  <Printer className="mr-1 h-3.5 w-3.5" /> Print Voucher
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={STATUS_BADGE[viewing.status]} className="mt-1">{STATUS_LABELS[viewing.status]}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Amount</p><p className="mt-1 font-semibold">{formatCurrency(viewing.amount)}</p></div>
                <div><p className="text-xs text-muted-foreground">Project</p><p className="mt-1">{vouchers.find((v) => v.id === viewing.id)?.project_name ?? '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Branch</p><p className="mt-1">{vouchers.find((v) => v.id === viewing.id)?.branch_name ?? '-'}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Narration</p><p className="mt-1">{viewing.narration || '-'}</p></div>
                {viewing.rejected_reason && (
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Rejected reason</p><p className="mt-1 text-destructive">{viewing.rejected_reason}</p></div>
                )}
                {approvals[viewing.id] && approvals[viewing.id].length > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1.5">Approval History</p>
                    <div className="space-y-1.5">
                      {approvals[viewing.id].map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge variant={a.action === 'rejected' ? 'destructive' : 'success'} className="text-[10px] capitalize">{a.action}</Badge>
                          <span className="text-muted-foreground">{(ROLE_LABELS as Record<string, string>)[a.role_at_time] ?? a.role_at_time}</span>
                          <span>{a.user_email}</span>
                          <span className="ml-auto text-muted-foreground">{formatDate(a.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewLines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2"><span className="font-mono text-xs">{l.code}</span> {l.name}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.debit ? formatCurrency(l.debit) : '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.credit ? formatCurrency(l.credit) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-semibold">
                    <tr><td className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(viewLines.reduce((s, l) => s + l.debit, 0))}</td><td className="px-3 py-2 text-right font-mono">{formatCurrency(viewLines.reduce((s, l) => s + l.credit, 0))}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Voucher</DialogTitle>
            <DialogDescription>Provide a reason for rejecting {rejectTarget?.voucher_no}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Explain why this voucher is rejected..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject}>Reject Voucher</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Voucher</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete voucher {deleteTarget?.voucher_no}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
