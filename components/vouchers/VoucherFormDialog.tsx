'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Voucher, VoucherDetail, ChartAccount, VoucherStatus, VoucherTypeCode } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { logAudit, notifyUser } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2, CheckCircle2, Landmark, Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { formatCurrency, toInputDate } from '@/lib/format';
import { toast } from 'sonner';
import { AccountCombobox } from '@/components/vouchers/AccountCombobox';
import { filterProjectAccounts } from '@/lib/account-filter';
import { VOUCHER_TYPES, VOUCHER_TYPE_MAP, hasControlAccount, isCashAccount, isBankAccount } from '@/lib/voucher-types';
import { getAccountBalance } from '@/lib/queries';
import { getLedgerHeadAccounts, isLedgerHeadAllowed } from '@/lib/voucher-account-filter';

interface Line {
  id: string;
  account_id: string;
  debit: string;
  credit: string;
  narration: string;
}

interface VoucherFormDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Voucher | null;
  onSaved: () => void;
}

let lineCounter = 0;
const newLine = (): Line => ({
  id: `line-${++lineCounter}`,
  account_id: '',
  debit: '',
  credit: '',
  narration: '',
});

export function VoucherFormDialog({ open, onOpenChange, editing, onSaved }: VoucherFormDialogProps) {
  const { profile, userProjects, activeProject } = useAuth();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [voucherType, setVoucherType] = useState<VoucherTypeCode>('BPV');
  const [voucherDate, setVoucherDate] = useState(toInputDate(new Date()));
  const [projectId, setProjectId] = useState('');
  const [narration, setNarration] = useState('');
  const [controlAccountId, setControlAccountId] = useState('');
  const [controlAmount, setControlAmount] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [previewVoucherNo, setPreviewVoucherNo] = useState('');
  const [accountBalance, setAccountBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [branchOfficeType, setBranchOfficeType] = useState<string>('head_office');

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const effectiveProjectId = editing?.project_id ?? activeProject?.id;
      let accQ = supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('code');
      if (effectiveProjectId) accQ = accQ.or(`project_id.is.null,project_id.eq.${effectiveProjectId}`);
      const { data: accData } = await accQ;
      setAccounts(filterProjectAccounts((accData as ChartAccount[] ?? []), effectiveProjectId));
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeProject, editing]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVoucherType(editing.voucher_type as VoucherTypeCode);
      setVoucherDate(toInputDate(editing.voucher_date));
      setProjectId(editing.project_id ?? '');
      setNarration(editing.narration);
      (async () => {
        const { data } = await supabase
          .from('voucher_details')
          .select('*')
          .eq('voucher_id', editing.id)
          .order('line_order');
        if (data && data.length > 0) {
          const details = data as VoucherDetail[];
          const typeDef = VOUCHER_TYPE_MAP[editing.voucher_type];
          if (typeDef && hasControlAccount(editing.voucher_type)) {
            // Separate the control account line from the offset lines
            const side = typeDef.controlSide!;
            const controlLine = details.find((d) => {
              const acc = accounts.find((a) => a.id === d.account_id);
              if (!acc) return false;
              if (typeDef.cashOrBank === 'bank' && !isBankAccount(acc.code)) return false;
              if (typeDef.cashOrBank === 'cash' && !isCashAccount(acc.code)) return false;
              return side === 'credit' ? Number(d.credit) > 0 : Number(d.debit) > 0;
            });
            if (controlLine) {
              setControlAccountId(controlLine.account_id);
              setControlAmount(String(side === 'credit' ? controlLine.credit : controlLine.debit));
              const rest = details.filter((d) => d.id !== controlLine.id);
              setLines(rest.length > 0 ? rest.map((d) => ({
                id: `line-${++lineCounter}`,
                account_id: d.account_id,
                debit: String(d.debit),
                credit: String(d.credit),
                narration: d.narration,
              })) : [newLine()]);
            } else {
              setLines(details.map((d) => ({
                id: `line-${++lineCounter}`,
                account_id: d.account_id,
                debit: String(d.debit),
                credit: String(d.credit),
                narration: d.narration,
              })));
            }
          } else {
            setLines(details.map((d) => ({
              id: `line-${++lineCounter}`,
              account_id: d.account_id,
              debit: String(d.debit),
              credit: String(d.credit),
              narration: d.narration,
            })));
          }
        } else {
          setLines([newLine()]);
        }
      })();
    } else {
      setVoucherType('BPV');
      setVoucherDate(toInputDate(new Date()));
      setProjectId(activeProject?.id ?? '');
      setNarration('');
      setControlAccountId('');
      setControlAmount('');
      setLines([newLine()]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open]);

  const typeDef = VOUCHER_TYPE_MAP[voucherType];
  const showControlAccount = !!typeDef && hasControlAccount(voucherType);

  // Filter control account options based on voucher type
  const controlAccountOptions = useMemo(() => {
    if (!showControlAccount || !typeDef) return [];
    return accounts.filter((a) => {
      if (!a || a.is_group) return false;
      if (typeDef.cashOrBank === 'bank') return isBankAccount(a.code);
      if (typeDef.cashOrBank === 'cash') return isCashAccount(a.code);
      return false;
    });
  }, [accounts, showControlAccount, typeDef]);

  // Auto-select first available control account when type changes
  useEffect(() => {
    if (showControlAccount && controlAccountOptions.length > 0 && !controlAccountOptions.find((a) => a.id === controlAccountId)) {
      setControlAccountId(controlAccountOptions[0].id);
    }
    if (!showControlAccount) {
      setControlAccountId('');
      setControlAmount('');
      setAccountBalance(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlAccountOptions, showControlAccount]);

  // Fetch branch office type for voucher number generation
  useEffect(() => {
    if (!open || editing) return;
    (async () => {
      const branchId = profile?.branch_id;
      if (branchId) {
        const { data } = await supabase.from('branches').select('office_type').eq('id', branchId).maybeSingle();
        if (data?.office_type) setBranchOfficeType(data.office_type);
        else setBranchOfficeType('head_office');
      } else {
        setBranchOfficeType('head_office');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, profile]);

  // Auto-generate preview voucher number when project + type are selected (new vouchers only)
  useEffect(() => {
    if (!open || editing) {
      setPreviewVoucherNo('');
      return;
    }
    if (!voucherType || !projectId) {
      setPreviewVoucherNo('');
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc('generate_voucher_no_preview', {
          p_voucher_type: voucherType,
          p_project_id: projectId || null,
          p_branch_id: profile?.branch_id ?? null,
          p_office_type: branchOfficeType,
          p_voucher_date: voucherDate,
        });
        if (!error && data) setPreviewVoucherNo(data as string);
        else setPreviewVoucherNo('');
      } catch {
        setPreviewVoucherNo('');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, voucherType, projectId, branchOfficeType, profile]);

  // Fetch account balance when control account changes
  useEffect(() => {
    if (!showControlAccount || !controlAccountId) {
      setAccountBalance(null);
      return;
    }
    (async () => {
      setBalanceLoading(true);
      try {
        const bal = await getAccountBalance(controlAccountId, projectId || undefined);
        setAccountBalance(bal);
      } catch {
        setAccountBalance(null);
      } finally {
        setBalanceLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlAccountId, showControlAccount, projectId]);

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [lines]);

  // For payment vouchers: control account is credited, offset lines are debited.
  // For receipt vouchers: control account is debited, offset lines are credited.
  const controlAmountNum = Number(controlAmount) || 0;
  const grandDebit = showControlAccount
    ? (typeDef.controlSide === 'debit' ? controlAmountNum : 0) + totalDebit
    : totalDebit;
  const grandCredit = showControlAccount
    ? (typeDef.controlSide === 'credit' ? controlAmountNum : 0) + totalCredit
    : totalCredit;
  const balanced = Math.abs(grandDebit - grandCredit) < 0.001;

  const validLines = lines.filter((l) => l.account_id && ((Number(l.debit) > 0) || (Number(l.credit) > 0)));

  // Insufficient balance check: only for payment vouchers (money going out)
  const insufficientBalance = showControlAccount && typeDef.isPayment && accountBalance !== null && controlAmountNum > accountBalance;

  const accountOptions = useMemo(
    () => getLedgerHeadAccounts(accounts, voucherType),
    [accounts, voucherType]
  );

  const updateLine = (id: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (patch.debit !== undefined && Number(patch.debit) > 0) next.credit = '';
      if (patch.credit !== undefined && Number(patch.credit) > 0) next.debit = '';
      return next;
    }));
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (id: string) => setLines((prev) => prev.length > 1 ? prev.filter((l) => l.id !== id) : prev);

  const nextVoucherNo = async (): Promise<string> => {
    const { data, error } = await supabase.rpc('generate_voucher_no', {
      p_voucher_type: voucherType,
      p_project_id: projectId || null,
      p_branch_id: profile?.branch_id ?? null,
      p_office_type: branchOfficeType,
    });
    if (error) throw new Error(`Failed to generate voucher number: ${error.message}`);
    return data as string;
  };

  const save = async (submit: boolean) => {
    // Validate control account for payment/receipt types
    if (showControlAccount) {
      if (!controlAccountId) { toast.error('Please select a payment/receipt account'); return; }
      if (controlAmountNum <= 0) { toast.error('Please enter a valid amount'); return; }
    }
    if (validLines.length < 1) { toast.error('At least one line entry is required'); return; }
    if (!balanced) { toast.error('Debit and credit must be equal'); return; }
    if (insufficientBalance) { toast.error('Insufficient Available Balance.'); return; }
    setSaving(true);
    try {
      const allLines: { account_id: string; debit: number; credit: number; narration: string }[] = [];

      const invalidLine = validLines.find((line) => {
        const account = accounts.find((a) => a.id === line.account_id);
        return !account || !isLedgerHeadAllowed(account, voucherType);
      });
      if (invalidLine) {
        toast.error('The selected Ledger Head is not valid for this Voucher Type');
        setSaving(false);
        return;
      }

      if (showControlAccount) {
        allLines.push({
          account_id: controlAccountId,
          debit: typeDef.controlSide === 'debit' ? controlAmountNum : 0,
          credit: typeDef.controlSide === 'credit' ? controlAmountNum : 0,
          narration: narration || '',
        });
      }
      for (const l of validLines) {
        allLines.push({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          narration: l.narration || '',
        });
      }

      const amount = grandDebit;
      const status: VoucherStatus = submit ? 'submitted' : 'draft';
      const branchId = profile?.branch_id ?? null;

      let workflowId: string | null = null;
      const selectedProjectId = projectId || null;
      if (selectedProjectId || branchId) {
        // Priority 1: workflow matching both project and branch (exact)
        if (selectedProjectId && branchId) {
          const { data: wf } = await supabase
            .from('approval_workflows')
            .select('id')
            .eq('is_active', true)
            .eq('project_id', selectedProjectId)
            .eq('branch_id', branchId)
            .order('created_at')
            .limit(1)
            .maybeSingle();
          if (wf) workflowId = wf.id;
        }
        // Priority 2: workflow matching project (any branch — including different branch)
        if (!workflowId && selectedProjectId) {
          const { data: wf } = await supabase
            .from('approval_workflows')
            .select('id')
            .eq('is_active', true)
            .eq('project_id', selectedProjectId)
            .order('created_at')
            .limit(1)
            .maybeSingle();
          if (wf) workflowId = wf.id;
        }
        // Priority 3: workflow matching branch only (no project)
        if (!workflowId && branchId) {
          const { data: wf } = await supabase
            .from('approval_workflows')
            .select('id')
            .eq('is_active', true)
            .is('project_id', null)
            .eq('branch_id', branchId)
            .order('created_at')
            .limit(1)
            .maybeSingle();
          if (wf) workflowId = wf.id;
        }
        // Priority 4: generic fallback (no project, no branch)
        if (!workflowId) {
          const { data: wf } = await supabase
            .from('approval_workflows')
            .select('id')
            .eq('is_active', true)
            .is('project_id', null)
            .is('branch_id', null)
            .order('created_at')
            .limit(1)
            .maybeSingle();
          if (wf) workflowId = wf.id;
        }
      }

      if (editing) {
        if (editing.status === 'locked') {
          toast.error('Locked vouchers cannot be edited');
          setSaving(false);
          return;
        }
        if (editing.status === 'posted' && profile?.role !== 'super_admin') {
          toast.error('Only Super Admin can edit posted vouchers');
          setSaving(false);
          return;
        }
        const { error } = await supabase.from('vouchers').update({
          voucher_type: voucherType, voucher_date: voucherDate,
          project_id: projectId || null,
          narration, amount, status, updated_at: new Date().toISOString(),
        }).eq('id', editing.id);
        if (error) throw error;
        await supabase.from('voucher_details').delete().eq('voucher_id', editing.id);
        await supabase.from('voucher_details').insert(
          allLines.map((l, i) => ({
            voucher_id: editing.id, account_id: l.account_id,
            debit: l.debit, credit: l.credit,
            narration: l.narration, line_order: i + 1,
          }))
        );
        await logAudit({ action: 'update', table_name: 'vouchers', record_id: editing.id, new_values: { status, amount }, user_id: profile?.id, user_email: profile?.email });
        toast.success(submit ? 'Voucher submitted for approval' : 'Draft saved');
      } else {
        const voucherNo = await nextVoucherNo();
        const { data, error } = await supabase.from('vouchers').insert({
          voucher_no: voucherNo, voucher_type: voucherType, voucher_date: voucherDate,
          branch_id: branchId, project_id: projectId || null,
          narration, amount, status, prepared_by: profile?.id,
          approval_workflow_id: workflowId, current_step: 0,
        }).select().single();
        if (error) throw error;
        await supabase.from('voucher_details').insert(
          allLines.map((l, i) => ({
            voucher_id: data.id, account_id: l.account_id,
            debit: l.debit, credit: l.credit,
            narration: l.narration, line_order: i + 1,
          }))
        );
        if (submit) {
          const [{ data: approvers }] = await Promise.all([
            supabase
              .from('profiles')
              .select('id')
              .in('role', ['finance_manager', 'head_of_finance', 'deputy_executive_director', 'super_admin']),
            logAudit({ action: 'insert', table_name: 'vouchers', record_id: data.id, new_values: { voucher_no: voucherNo, amount, status }, user_id: profile?.id, user_email: profile?.email }),
          ]);
          if (approvers && approvers.length > 0) {
            await notifyUser({
              user_ids: approvers.map((a) => a.id),
              title: 'Voucher awaiting review',
              message: `${voucherNo} (${formatCurrency(amount)}) submitted for review`,
              type: 'approval',
              link: '/vouchers',
              to: 'specific',
            });
          }
        } else {
          await logAudit({ action: 'insert', table_name: 'vouchers', record_id: data.id, new_values: { voucher_no: voucherNo, amount, status }, user_id: profile?.id, user_email: profile?.email });
        }
        toast.success(submit ? 'Voucher created and submitted' : `Draft saved as ${voucherNo}`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const controlLabel = typeDef?.isPayment ? (typeDef.cashOrBank === 'bank' ? 'Bank Account (Paid From)' : 'Cash Account (Paid From)')
    : typeDef?.isReceipt ? (typeDef.cashOrBank === 'bank' ? 'Bank Account (Received Into)' : 'Cash Account (Received Into)')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.voucher_no}` : 'New Voucher'}</DialogTitle>
          <DialogDescription>
            Record a double-entry voucher. Debit total must equal credit total.
          </DialogDescription>
        </DialogHeader>

        {/* Auto-generated voucher number (read-only, shown before save) */}
        {!editing && previewVoucherNo && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Voucher Number</span>
              <span className="font-mono text-sm font-bold text-primary">{previewVoucherNo}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Voucher Type</Label>
                <Select value={voucherType} onValueChange={(v) => {
                  const nextType = v as VoucherTypeCode;
                  setVoucherType(nextType);
                  setLines((previous) => previous.map((line) => (
                    line.account_id && (() => {
                      const selected = accounts.find((a) => a.id === line.account_id);
                      return !selected || !isLedgerHeadAllowed(selected, nextType);
                    })()
                      ? { ...line, account_id: '' }
                      : line
                  )));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VOUCHER_TYPES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Project Name</Label>
                {userProjects.length <= 1 ? (
                  <Input
                    value={userProjects[0]?.name ?? 'No project assigned'}
                    disabled
                    className="bg-muted/50"
                  />
                ) : (
                  <Select value={projectId || 'none'} onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {userProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Control account selector for payment/receipt vouchers */}
            {showControlAccount && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  {typeDef.isPayment ? (
                    <ArrowDownCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4 text-success" />
                  )}
                  <span className="text-sm font-semibold">{controlLabel}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {typeDef.cashOrBank === 'bank' ? (
                        <span className="flex items-center gap-1"><Landmark className="h-3 w-3" /> Bank Account</span>
                      ) : (
                        <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> Cash Account</span>
                      )}
                    </Label>
                    <Select value={controlAccountId || 'none'} onValueChange={(v) => setControlAccountId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select account</SelectItem>
                        {controlAccountOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount</Label>
                    <Input
                      type="number"
                      className="text-right"
                      value={controlAmount}
                      onChange={(e) => setControlAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {/* Current balance display */}
                {controlAccountId && (
                  <div className="mt-2 flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">Current Balance</span>
                    {balanceLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <span className={`font-mono text-sm font-semibold ${accountBalance !== null && typeDef.isPayment && controlAmountNum > accountBalance ? 'text-destructive' : 'text-foreground'}`}>
                        {formatCurrency(accountBalance ?? 0)}
                      </span>
                    )}
                  </div>
                )}
                {/* Insufficient balance warning */}
                {insufficientBalance && (
                  <div className="mt-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
                    Insufficient Available Balance.
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Narration / Description</Label>
              <Textarea
                rows={2}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Describe this transaction..."
              />
            </div>

            {/* Offset accounting lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{showControlAccount ? (typeDef.isPayment ? 'Debit To (Expense / Account)' : 'Credit From (Income / Account)') : 'Accounting Entries'}</Label>
                <Button variant="outline" size="sm" onClick={addLine} type="button">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 text-right font-medium w-28">Debit</th>
                      <th className="px-3 py-2 text-right font-medium w-28">Credit</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-1.5">
                          <AccountCombobox
                            accounts={accountOptions}
                            value={l.account_id}
                            onChange={(v) => updateLine(l.id, { account_id: v })}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            className="h-9 text-right"
                            value={l.debit}
                            onChange={(e) => updateLine(l.id, { debit: e.target.value })}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            className="h-9 text-right"
                            value={l.credit}
                            onChange={(e) => updateLine(l.id, { credit: e.target.value })}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => removeLine(l.id)} type="button">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {showControlAccount && (
                    <tfoot className="border-t border-border bg-primary/5">
                      <tr>
                        <td className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">
                          {typeDef.controlSide === 'credit' ? `${typeDef.label.split(' ')[0]} Account Credit` : `${typeDef.label.split(' ')[0]} Account Debit`}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-muted-foreground">
                          {typeDef.controlSide === 'debit' ? formatCurrency(controlAmountNum) : '-'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-muted-foreground">
                          {typeDef.controlSide === 'credit' ? formatCurrency(controlAmountNum) : '-'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                  <tfoot className="border-t border-border bg-muted/30">
                    <tr>
                      <td className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold">{formatCurrency(grandDebit)}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold">{formatCurrency(grandCredit)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {balanced ? (
                  <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Balanced</span>
                ) : (
                  <span className="text-destructive">Difference: {formatCurrency(Math.abs(grandDebit - grandCredit))}</span>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={saving || !balanced || insufficientBalance || (showControlAccount ? !controlAccountId || controlAmountNum <= 0 : false) || validLines.length < 1}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button onClick={() => save(true)} disabled={saving || !balanced || insufficientBalance || (showControlAccount ? !controlAccountId || controlAmountNum <= 0 : false) || validLines.length < 1}>
            {saving ? 'Saving...' : 'Submit for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
