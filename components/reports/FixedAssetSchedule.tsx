'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fmtAmt, fmtReportDate } from '@/lib/report-data';
import { useAuth } from '@/components/auth/AuthProvider';
import { can } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { logAudit } from '@/lib/audit';

interface AssetCategory {
  id: string;
  code: string;
  name: string;
  depreciation_rate: number;
  sort_order: number;
  opening_cost: number;
  transferred_cost: number;
  addition_cost: number;
  adjustment_cost: number;
  opening_depn: number;
  transferred_depn: number;
  depn_for_year: number;
  adjustment_depn: number;
}

interface CategoryLine {
  category: AssetCategory;
  totalCost: number;
  accumDepn: number;
  wdv: number;
}

const COST_FIELDS = [
  { key: 'opening_cost', label: 'Opening Balance (01.07.2025)' },
  { key: 'transferred_cost', label: 'Transferred from Project' },
  { key: 'addition_cost', label: 'Addition for the Year' },
  { key: 'adjustment_cost', label: 'Adjustment for the Year' },
];

const DEPN_FIELDS = [
  { key: 'opening_depn', label: 'Opening Balance (30.06.2025)' },
  { key: 'transferred_depn', label: 'Transferred from Project' },
  { key: 'depn_for_year', label: 'Depreciation for the Year' },
  { key: 'adjustment_depn', label: 'Adjustment for the Year' },
];

const ALL_FIELDS = [...COST_FIELDS, ...DEPN_FIELDS];

export function FixedAssetSchedule({ asOnDate }: { asOnDate: string }) {
  const { profile } = useAuth();
  const role = profile?.role ?? 'accountant';
  const canEdit = can(role, 'manage_master_data');
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('asset_categories').select('*').order('sort_order');
    setCategories((data as AssetCategory[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (cat: AssetCategory) => {
    setEditing(cat);
    const f: Record<string, string> = {};
    for (const field of ALL_FIELDS) {
      f[field.key] = String(cat[field.key as keyof AssetCategory] ?? 0);
    }
    setForm(f);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const payload: Record<string, number> = {};
    for (const field of ALL_FIELDS) {
      payload[field.key] = Number(form[field.key]) || 0;
    }
    try {
      const { error } = await supabase.from('asset_categories').update(payload).eq('id', editing.id);
      if (error) throw error;
      await logAudit({ action: 'update', table_name: 'asset_categories', record_id: editing.id, new_values: payload });
      toast.success('Updated');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const lines: CategoryLine[] = categories.map((cat) => {
    const totalCost =
      Number(cat.opening_cost) + Number(cat.transferred_cost) +
      Number(cat.addition_cost) - Number(cat.adjustment_cost);
    const accumDepn =
      Number(cat.opening_depn) + Number(cat.transferred_depn) +
      Number(cat.depn_for_year) - Number(cat.adjustment_depn);
    const wdv = totalCost - accumDepn;
    return { category: cat, totalCost, accumDepn, wdv };
  });

  const totalOpeningCost = lines.reduce((s, l) => s + Number(l.category.opening_cost), 0);
  const totalTransferredCost = lines.reduce((s, l) => s + Number(l.category.transferred_cost), 0);
  const totalAdditionCost = lines.reduce((s, l) => s + Number(l.category.addition_cost), 0);
  const totalAdjustmentCost = lines.reduce((s, l) => s + Number(l.category.adjustment_cost), 0);
  const totalCost = lines.reduce((s, l) => s + l.totalCost, 0);

  const totalOpeningDepn = lines.reduce((s, l) => s + Number(l.category.opening_depn), 0);
  const totalTransferredDepn = lines.reduce((s, l) => s + Number(l.category.transferred_depn), 0);
  const totalForYear = lines.reduce((s, l) => s + Number(l.category.depn_for_year), 0);
  const totalAdjustmentDepn = lines.reduce((s, l) => s + Number(l.category.adjustment_depn), 0);
  const totalAccumDepn = lines.reduce((s, l) => s + l.accumDepn, 0);
  const totalWDV = lines.reduce((s, l) => s + l.wdv, 0);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Generating schedule...</div>;
  }

  const pct = (r: number) => (r === 0 ? '-' : `${(r * 100).toFixed(0)}%`);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-lg font-bold">Palashipara Samaj Kallayan Samity</p>
        <p className="text-sm text-muted-foreground">Gangni, Meherpur — General Fund</p>
        <p className="text-base font-semibold">Fixed Assets &amp; Depreciation Schedule as at {fmtReportDate(asOnDate)}</p>
      </div>

      {/* Value at Cost */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-foreground bg-primary/10">
              <th className="px-2 py-2 text-center text-xs font-bold uppercase" rowSpan={2}>Sl No</th>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase" rowSpan={2}>Particulars</th>
              <th className="px-2 py-1 text-center text-xs font-bold uppercase" colSpan={5}>Value at Cost</th>
              {canEdit && <th className="px-2 py-2 text-center text-xs font-bold uppercase" rowSpan={2}>Edit</th>}
            </tr>
            <tr className="border-b-2 border-foreground bg-primary/10">
              <th className="w-28 px-2 py-1 text-right text-[10px] font-bold uppercase">Opening<br/>01.07.2025</th>
              <th className="w-24 px-2 py-1 text-right text-[10px] font-bold uppercase">Transferred<br/>from Project</th>
              <th className="w-20 px-2 py-1 text-right text-[10px] font-bold uppercase">Addition<br/>for Year</th>
              <th className="w-20 px-2 py-1 text-right text-[10px] font-bold uppercase">Adjustment<br/>for Year</th>
              <th className="w-28 px-2 py-1 text-right text-[10px] font-bold uppercase">Total Cost<br/>30.06.2026</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => (
              <tr key={l.category.id} className="hover:bg-muted/20">
                <td className="px-2 py-1.5 text-center text-xs">{i + 1}</td>
                <td className="px-3 py-1.5 text-sm">{l.category.name}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.opening_cost))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.transferred_cost))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.addition_cost))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.adjustment_cost))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(l.totalCost)}</td>
                {canEdit && (
                  <td className="px-2 py-1.5 text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l.category)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-foreground bg-primary/10">
            <tr>
              <td className="px-2 py-2 text-center text-xs font-bold">#</td>
              <td className="px-3 py-2 text-sm font-bold">Total Taka:</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalOpeningCost)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalTransferredCost)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalAdditionCost)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalAdjustmentCost)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalCost)}</td>
              {canEdit && <td className="px-2 py-2" />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Depreciation */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-foreground bg-primary/10">
              <th className="px-2 py-2 text-center text-xs font-bold uppercase" rowSpan={2}>Sl No</th>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase" rowSpan={2}>Particulars</th>
              <th className="px-2 py-1 text-center text-xs font-bold uppercase" colSpan={6}>Depreciation</th>
              <th className="px-2 py-2 text-right text-xs font-bold uppercase" rowSpan={2}>WDV<br/>30.06.2026</th>
              {canEdit && <th className="px-2 py-2 text-center text-xs font-bold uppercase" rowSpan={2}>Edit</th>}
            </tr>
            <tr className="border-b-2 border-foreground bg-primary/10">
              <th className="w-24 px-2 py-1 text-right text-[10px] font-bold uppercase">Opening<br/>30.06.2025</th>
              <th className="w-20 px-2 py-1 text-right text-[10px] font-bold uppercase">Transferred<br/>from Project</th>
              <th className="w-12 px-2 py-1 text-right text-[10px] font-bold uppercase">Rate</th>
              <th className="w-20 px-2 py-1 text-right text-[10px] font-bold uppercase">For the<br/>Year</th>
              <th className="w-20 px-2 py-1 text-right text-[10px] font-bold uppercase">Adjustment</th>
              <th className="w-24 px-2 py-1 text-right text-[10px] font-bold uppercase">Accumulated<br/>30.06.2026</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => (
              <tr key={l.category.id} className="hover:bg-muted/20">
                <td className="px-2 py-1.5 text-center text-xs">{i + 1}</td>
                <td className="px-3 py-1.5 text-sm">{l.category.name}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.opening_depn))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.transferred_depn))}</td>
                <td className="px-2 py-1.5 text-right text-xs text-muted-foreground">{pct(Number(l.category.depreciation_rate))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.depn_for_year))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{fmtAmt(Number(l.category.adjustment_depn))}</td>
                <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums">{fmtAmt(l.accumDepn)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold tabular-nums">{fmtAmt(l.wdv)}</td>
                {canEdit && (
                  <td className="px-2 py-1.5 text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l.category)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-foreground bg-primary/10">
            <tr>
              <td className="px-2 py-2 text-center text-xs font-bold">#</td>
              <td className="px-3 py-2 text-sm font-bold">Total Taka:</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalOpeningDepn)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalTransferredDepn)}</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalForYear)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalAdjustmentDepn)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalAccumDepn)}</td>
              <td className="px-2 py-2 text-right font-mono text-sm font-bold tabular-nums">{fmtAmt(totalWDV)}</td>
              {canEdit && <td className="px-2 py-2" />}
            </tr>
          </tfoot>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit — {editing?.name}</DialogTitle>
            <DialogDescription>Update the cost and depreciation figures for this asset category.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Value at Cost</p>
            </div>
            {COST_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input type="number" value={form[f.key] ?? '0'} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Depreciation</p>
            </div>
            {DEPN_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input type="number" value={form[f.key] ?? '0'} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="sm:col-span-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              Note: Adjustment values are subtracted from the total. Total Cost = Opening + Transferred + Addition − Adjustment.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
