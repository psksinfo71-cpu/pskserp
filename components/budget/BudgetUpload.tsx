'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/format';
import { Upload, ClipboardPaste, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Table } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import type { FinancialYear, Project, ChartAccount } from '@/lib/types';

interface ParsedRow {
  code: string;
  name: string;
  amount: number;
  prevYearActual: number;
}

interface ValidationIssue {
  row: number;
  message: string;
  code?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fys: FinancialYear[];
  projects: Project[];
  accounts: ChartAccount[];
  onSaved: () => void;
}

const VERSION_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'revised-1', label: 'Revised-1' },
  { value: 'revised-2', label: 'Revised-2' },
  { value: 'final', label: 'Final' },
];

export function BudgetUpload({ open, onOpenChange, fys, projects, accounts, onSaved }: Props) {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fyId, setFyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [versionType, setVersionType] = useState('original');
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [matched, setMatched] = useState(0);
  const [unmatched, setUnmatched] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const accountByCode = useMemo(() => new Map(accounts.filter((a) => !a.is_group).map((a) => [a.code, a])), [accounts]);
  const leafAccounts = useMemo(() => accounts.filter((a) => !a.is_group), [accounts]);

  const normalize = (s: string): string =>
    s.toLowerCase().trim()
      .replace(/[/&\-_,.()]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(s)\b/g, '') // simple de-pluralize
      .trim();

  const levenshtein = (a: string, b: string): number => {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  };

  const matchAccount = useCallback((rawText: string): ChartAccount | undefined => {
    const text = rawText.trim();
    if (!text) return undefined;
    // 1. Exact code match
    const byCode = accountByCode.get(text);
    if (byCode) return byCode;
    // 2. Exact name match (case-insensitive)
    const norm = normalize(text);
    for (const a of leafAccounts) {
      if (normalize(a.name) === norm) return a;
    }
    // 3. Word-based match: all words in input appear in COA name (or vice versa), prefer longest name
    const inputWords = norm.split(' ').filter((w) => w.length > 2);
    if (inputWords.length > 0) {
      let best: ChartAccount | undefined;
      let bestScore = 0;
      for (const a of leafAccounts) {
        const aNorm = normalize(a.name);
        const aWords = aNorm.split(' ').filter((w) => w.length > 2);
        // Count how many input words appear in the COA name
        const matchedWords = inputWords.filter((w) => aWords.some((aw) => aw.includes(w) || w.includes(aw)));
        // Require ALL significant input words to match
        if (matchedWords.length === inputWords.length) {
          // Prefer the match where COA name has fewer extra words (tighter match)
          const score = inputWords.length / Math.max(aWords.length, 1);
          if (score > bestScore) { best = a; bestScore = score; }
        }
      }
      if (best) return best;
    }
    // 4. Fuzzy: Levenshtein distance with threshold
    let bestFuzzy: ChartAccount | undefined;
    let bestDist = Infinity;
    for (const a of leafAccounts) {
      const aNorm = normalize(a.name);
      const dist = levenshtein(norm, aNorm);
      // Threshold: allow up to 30% of the longer string length as edit distance
      const threshold = Math.ceil(Math.max(norm.length, aNorm.length) * 0.3);
      if (dist <= threshold && dist < bestDist) {
        bestFuzzy = a;
        bestDist = dist;
      }
    }
    return bestFuzzy;
  }, [accountByCode, leafAccounts]);

  const reset = () => {
    setParsedRows([]);
    setIssues([]);
    setMatched(0);
    setUnmatched(0);
    setPasteText('');
    setShowPaste(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const validateAndSet = useCallback((rows: ParsedRow[]) => {
    const valid: ParsedRow[] = [];
    const newIssues: ValidationIssue[] = [];
    let m = 0, u = 0;
    const seenCodes = new Set<string>();

    rows.forEach((r, i) => {
      if (!r.code) {
        newIssues.push({ row: i + 1, message: 'Missing ledger code' });
        u++;
        return;
      }
      if (seenCodes.has(r.code)) {
        newIssues.push({ row: i + 1, message: `Duplicate code: ${r.code}`, code: r.code });
        u++;
        return;
      }
      seenCodes.add(r.code);
      const acc = accountByCode.get(r.code) ?? matchAccount(r.code);
      if (!acc) {
        newIssues.push({ row: i + 1, message: `Account "${r.code}" not found in COA`, code: r.code });
        u++;
        return;
      }
      if (r.amount < 0) {
        newIssues.push({ row: i + 1, message: `Negative amount for ${r.code}`, code: r.code });
      }
      m++;
      valid.push(r);
    });

    setParsedRows(valid);
    setIssues(newIssues);
    setMatched(m);
    setUnmatched(u);
  }, [accountByCode, matchAccount]);

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      const rows = parseRawRows(raw);
      validateAndSet(rows);
    } catch {
      toast.error('Failed to read Excel file');
    }
  };

  const parseRawRows = (raw: unknown[][]): ParsedRow[] => {
    const rows: ParsedRow[] = [];
    const skipKeywords = ['particular', 'ledger', 'code', 'account', 'total', 'grand', 'surplus', 'deficit', 'taka', 'palashipara', 'samaj', 'kallayan', 'samity', 'gangni', 'meherpur', 'general fund', 'income', 'expenditure', 'expense', 'property', 'asset', 'liabilit', 'fund and', 'current', 'investment', 'for the', 'balance sheet', 'budget', 'version', 'fiscal year', 'md.', 'deputy', 'director', 'executive', 'date', 'print'];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (!r || r.length === 0) continue;
      const col0 = String(r[0] ?? '').trim();
      if (!col0) continue;
      const lower0 = col0.toLowerCase();
      // Skip header/section/total rows
      if (skipKeywords.some((kw) => lower0.includes(kw))) continue;
      // Skip rows where col0 is purely a date or number (not a name/code)
      if (/^[\d\/\-]+$/.test(col0)) continue;

      // Find the amount: try columns 1, 2, 3, 4... first one that parses to a number
      let amount = 0;
      let amountCol = -1;
      for (let c = 1; c < (r.length || 0); c++) {
        const val = String(r[c] ?? '').replace(/[,\s]/g, '');
        if (val && !isNaN(parseFloat(val))) {
          amount = parseFloat(val) || 0;
          amountCol = c;
          break;
        }
      }
      // Skip rows with no numeric amount in any column
      const hasAnyNumber = r.slice(1).some((v) => {
        const val = String(v ?? '').replace(/[,\s]/g, '');
        return val && !isNaN(parseFloat(val));
      });
      if (amount === 0 && !hasAnyNumber) continue;

      // Previous year actual: try the column after amount
      let prevYearActual = 0;
      if (amountCol >= 0 && amountCol + 1 < r.length) {
        const pva = String(r[amountCol + 1] ?? '').replace(/[,\s]/g, '');
        if (pva && !isNaN(parseFloat(pva))) prevYearActual = parseFloat(pva) || 0;
      }

      // Match to COA: try as code first, then as name
      const acc = matchAccount(col0);
      const code = acc ? acc.code : col0;
      const name = acc ? acc.name : (String(r[1] ?? '').trim() || col0);
      rows.push({ code, name, amount, prevYearActual });
    }
    return rows;
  };

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split(/\n/);
    const raw: unknown[][] = lines.map((l) => l.split(/\t|,/).map((c) => c.trim()));
    const rows = parseRawRows(raw);
    validateAndSet(rows);
    setShowPaste(false);
  };

  const save = async () => {
    if (!fyId) { toast.error('Select a Fiscal Year'); return; }
    if (!projectId) { toast.error('Select a Fund/Project'); return; }
    if (parsedRows.length === 0) { toast.error('No valid budget rows to save'); return; }
    setSaving(true);
    try {
      const versionLabel = VERSION_OPTIONS.find((v) => v.value === versionType)?.label ?? 'Original';
      const { data: versionData, error: vError } = await supabase
        .from('budget_versions')
        .insert({
          fiscal_year_id: fyId,
          project_id: projectId,
          version_label: versionLabel,
          version_type: versionType,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (vError) throw vError;
      const versionId = versionData.id;

      if (mode === 'replace') {
        await supabase.from('budgets')
          .delete()
          .eq('financial_year_id', fyId)
          .eq('project_id', projectId)
          .eq('budget_version_id', versionId);
      }

      const inserts = parsedRows.map((r) => {
        const acc = accountByCode.get(r.code) ?? matchAccount(r.code)!;
        return {
          budget_version_id: versionId,
          financial_year_id: fyId,
          project_id: projectId,
          account_id: acc.id,
          amount: r.amount,
          prev_year_actual: r.prevYearActual,
          period: 'annual',
          status: 'approved',
          version_label: versionLabel,
          ledger_group: acc.account_type === 'income' ? 'Income' : 'Expense',
        };
      });

      const { error: insertError } = await supabase.from('budgets').insert(inserts);
      if (insertError) throw insertError;

      await logAudit({
        action: 'insert',
        table_name: 'budgets',
        new_values: { fyId, projectId, versionLabel, count: inserts.length, mode },
      });

      toast.success(`${inserts.length} budget rows saved (${versionLabel})`);
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Budget</DialogTitle>
          <DialogDescription>
            Import budget data from Excel or paste directly. Rows are matched to the Chart of Accounts by Ledger Code.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Fiscal Year</Label>
            <Select value={fyId || 'none'} onValueChange={(v) => setFyId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select year</SelectItem>
                {fys.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fund / Project</Label>
            <Select value={projectId || 'none'} onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select fund</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Budget Version</Label>
            <Select value={versionType} onValueChange={setVersionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERSION_OPTIONS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Label className="text-sm">Import Mode:</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'replace' ? 'default' : 'outline'}
              onClick={() => setMode('replace')}
            >Replace</Button>
            <Button
              size="sm"
              variant={mode === 'append' ? 'default' : 'outline'}
              onClick={() => setMode('append')}
            >Append</Button>
          </div>
          {mode === 'replace' && (
            <span className="text-xs text-muted-foreground">Existing budget for this Year+Fund+Version will be deleted first</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Import Excel
          </Button>
          <Button variant="outline" onClick={() => setShowPaste(!showPaste)}>
            <ClipboardPaste className="mr-2 h-4 w-4" /> Paste from Excel
          </Button>
        </div>

        {showPaste && (
          <div className="space-y-2">
            <Label>Paste Excel data here (tab-separated: Code, Name, Amount, PrevYearActual)</Label>
            <Textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="4001	Admission Fees	50000	45000&#10;4002	Agriculture	100000	95000"
            />
            <Button size="sm" onClick={handlePaste}><Table className="mr-2 h-4 w-4" /> Parse Pasted Data</Button>
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="bg-success/15 text-success">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {matched} Matched
              </Badge>
              {unmatched > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="mr-1 h-3 w-3" /> {unmatched} Unmatched
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Total Budget: {formatCurrency(parsedRows.reduce((s, r) => s + r.amount, 0))}
              </span>
            </div>

            {issues.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="text-xs">
                    <p className="font-semibold mb-1">Validation Errors ({issues.length}):</p>
                    <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                      {issues.slice(0, 20).map((iss, i) => (
                        <li key={i}>Row {iss.row}: {iss.message}</li>
                      ))}
                      {issues.length > 20 && <li>...and {issues.length - 20} more</li>}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="max-h-60 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Code</th>
                    <th className="px-2 py-1.5 text-left font-medium">Particulars</th>
                    <th className="px-2 py-1.5 text-right font-medium">Budget Amount</th>
                    <th className="px-2 py-1.5 text-right font-medium">Prev Year Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedRows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-2 py-1 font-mono">{r.code}</td>
                      <td className="px-2 py-1">{r.name || (accountByCode.get(r.code) ?? matchAccount(r.code))?.name}</td>
                      <td className="px-2 py-1 text-right font-mono">{formatCurrency(r.amount)}</td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">{r.prevYearActual ? formatCurrency(r.prevYearActual) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={save} disabled={saving || parsedRows.length === 0}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Upload className="mr-2 h-4 w-4" /> Save Budget</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
