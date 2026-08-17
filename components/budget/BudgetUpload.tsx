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
import { AccountCombobox } from '@/components/vouchers/AccountCombobox';
import { Upload, ClipboardPaste, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Table, Download, Printer, Search } from 'lucide-react';
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

interface UnmappedRow extends ParsedRow {
  rowNumber: number;
  sourceHead: string;
  mappedAccountId?: string;
}

interface ImportColumnMapping {
  headerIndex: number;
  nameColumn: number;
  previousColumn: number;
  budgetColumn: number;
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
  const [unmappedRows, setUnmappedRows] = useState<UnmappedRow[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rawImportRows, setRawImportRows] = useState<unknown[][]>([]);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ImportColumnMapping | null>(null);
  const [showColumnMapping, setShowColumnMapping] = useState(false);

  const accountByCode = useMemo(() => new Map(accounts.filter((a) => !a.is_group).map((a) => [a.code, a])), [accounts]);
  const leafAccounts = useMemo(() => accounts.filter((a) => !a.is_group), [accounts]);
  const normalize = (s: string): string =>
    s.toLowerCase().trim()
      .replace(/[/&\-_,.()]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(s)\b/g, '') // simple de-pluralize
      .trim();

  const inactiveImportHeads = useMemo(() => {
    const names = ['local donation', 'members subscription fees', 'training center', 'relief rehabilitation', 'advertisement and newspaper bill', 'bank charge on fdr', 'depreciation', 'education training workshop', 'fuel and lubricants', 'interest on staff security money', 'others expenses'];
    return leafAccounts.filter((account) => !account.is_active && names.includes(normalize(account.name)));
  }, [leafAccounts]);

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
    setUnmappedRows([]);
    setShowMapping(false);
    setShowPreview(false);
    setPasteText('');
    setShowPaste(false);
    setFileName('');
    setRawImportRows([]);
    setImportColumns([]);
    setColumnMapping(null);
    setShowColumnMapping(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const validateAndSet = useCallback((rows: ParsedRow[]) => {
    const valid: ParsedRow[] = [];
    const newIssues: ValidationIssue[] = [];
    let m = 0, u = 0;
    const unresolved: UnmappedRow[] = [];
    const seenCodes = new Set<string>();

    rows.forEach((r, i) => {
      if (!r.code) {
        newIssues.push({ row: i + 1, message: 'Missing Budget Head' });
        u++;
        unresolved.push({ ...r, rowNumber: i + 1, sourceHead: r.name || r.code });
        return;
      }
      // The prescribed report can contain the same head in both Income and
      // Expenditure sections. Keep both rows so import matches the source.
      // The database budget rows are line-based and variance totals aggregate them.
      seenCodes.add(r.code);
      const acc = accountByCode.get(r.code) ?? matchAccount(r.code);
      if (!acc) {
        newIssues.push({ row: i + 1, message: `Budget Head "${r.code}" not found in COA`, code: r.code });
        u++;
        unresolved.push({ ...r, rowNumber: i + 1, sourceHead: r.name || r.code });
        return;
      }
      if (r.amount < 0) {
        newIssues.push({ row: i + 1, message: `Negative amount for ${r.code}`, code: r.code });
      }
      m++;
      valid.push(r);
    });

    // A prescribed statement may repeat a head in separate sections. The
    // budgets table stores one line per account/version, so consolidate those
    // rows while preserving both source columns before saving.
    const consolidated = Array.from(valid.reduce((map, row) => {
      const existing = map.get(row.code);
      if (existing) {
        existing.amount += row.amount;
        existing.prevYearActual += row.prevYearActual;
      } else {
        map.set(row.code, { ...row });
      }
      return map;
    }, new Map<string, ParsedRow>()).values());
    setParsedRows(consolidated);
    setIssues(newIssues);
    setMatched(consolidated.length);
    setUnmatched(u);
    setUnmappedRows(unresolved);
    // Always show the parsed preview first. Unmapped rows are reviewed only
    // when the user explicitly clicks "Review & Map".
    setShowMapping(false);
    setShowPreview(valid.length > 0 || unresolved.length > 0);
  }, [accountByCode, matchAccount]);

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      const headerIndex = raw.findIndex((row) => row.some((cell) => normalize(String(cell ?? '')).includes('particular')));
      const header = headerIndex >= 0 ? raw[headerIndex].map((cell) => String(cell ?? '').trim()) : (raw[0] ?? []).map((cell) => String(cell ?? '').trim());
      const normalizedHeader = header.map(normalize);
      const autoName = Math.max(0, normalizedHeader.findIndex((cell) => cell.includes('particular') || cell.includes('name')));
      const autoPrevious = Math.max(0, normalizedHeader.findIndex((cell) => cell.includes('previous') || cell.includes('actual')));
      const autoBudget = Math.max(0, normalizedHeader.findIndex((cell) => cell.includes('budget') || cell.includes('target')));
      setFileName(file.name);
      setRawImportRows(raw);
      setImportColumns(header);
      setColumnMapping({ headerIndex: headerIndex >= 0 ? headerIndex : 0, nameColumn: autoName, previousColumn: autoPrevious, budgetColumn: autoBudget });
      setShowColumnMapping(true);
    } catch {
      toast.error('Failed to read Excel file');
    }
  };

  const confirmColumnMapping = () => {
    if (!columnMapping || !rawImportRows.length) return;
    const mappedRaw = rawImportRows.map((row, index) => {
      if (index <= columnMapping.headerIndex) return index === columnMapping.headerIndex ? ['PARTICULARS', 'PREVIOUS ACTUAL', 'BUDGET'] : [];
      return [row[columnMapping.nameColumn], row[columnMapping.previousColumn], row[columnMapping.budgetColumn]];
    });
    validateAndSet(parseRawRows(mappedRaw, { headerIndex: columnMapping.headerIndex, previousCol: 1, budgetCol: 2 }));
    setShowColumnMapping(false);
  };

  const parseRawRows = (raw: unknown[][], columns: { headerIndex?: number; previousCol?: number; budgetCol?: number } = {}): ParsedRow[] => {
    const rows: ParsedRow[] = [];
    const skipKeywords = ['particular', 'ledger', 'code', 'account', 'total', 'grand', 'surplus', 'deficit', 'taka', 'palashipara', 'samaj', 'kallayan', 'samity', 'gangni', 'meherpur', 'general fund', 'property', 'asset', 'liabilit', 'fund and', 'current', 'investment', 'for the', 'balance sheet', 'budget', 'version', 'fiscal year', 'md.', 'deputy', 'director', 'executive', 'date', 'print'];
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (!r || r.length === 0) continue;
      if (columns.headerIndex !== undefined && i <= columns.headerIndex) continue;
      const col0 = String(r[0] ?? '').trim();
      if (!col0) continue;
      const lower0 = col0.toLowerCase();
      // Skip report metadata and structural rows, but do not reject legitimate
      // account names such as "Agriculture/Income Generation" or "Others Expenses".
      const structuralRow = /^(income|expenditure|expense|total|grand total|surplus|deficit|total taka|total expenditure|total income)\s*[:.-]?$/i.test(col0);
      if (structuralRow || skipKeywords.some((kw) => lower0.includes(kw))) continue;
      // Skip rows where col0 is purely a date or number (not a name/code)
      if (/^[\d\/\-]+$/.test(col0)) continue;

      const readNumber = (value: unknown): number | null => {
        const text = String(value ?? '').replace(/[,\s]/g, '');
        if (!text || isNaN(parseFloat(text))) return null;
        return parseFloat(text) || 0;
      };
      // Prescribed format is: Particulars | Previous FS Year Actual | Current Budget.
      // Use the detected headers so previous actual is never mistaken for budget.
      let amount = columns.budgetCol !== undefined && columns.budgetCol >= 0
        ? (readNumber(r[columns.budgetCol]) ?? 0)
        : (readNumber(r[1]) ?? 0);
      let amountCol = columns.budgetCol !== undefined && columns.budgetCol >= 0 ? columns.budgetCol : 1;
      // Skip rows with no numeric amount in any column
      const hasAnyNumber = r.slice(1).some((v) => {
        const val = String(v ?? '').replace(/[,\s]/g, '');
        return val && !isNaN(parseFloat(val));
      });
      if (amount === 0 && !hasAnyNumber) continue;

      const previousCol = columns.previousCol !== undefined && columns.previousCol >= 0 ? columns.previousCol : amountCol + 1;
      const prevYearActual = readNumber(r[previousCol]) ?? 0;

      // Match to COA: try as code first, then as name
      const acc = matchAccount(col0);
      const code = acc ? acc.code : col0;
      const name = acc ? acc.name : (String(r[1] ?? '').trim() || col0);
      rows.push({ code, name, amount, prevYearActual });
    }
    return rows;
  };

  const downloadTemplate = () => {
    const income = leafAccounts.filter((account) => account.account_type === 'income');
    const expenditure = leafAccounts.filter((account) => account.account_type !== 'income');
    const rows: (string | number)[][] = [
      ['PARTICULARS', `Previous FS Year Actual Income & Expenditure`, `${fys.find((f) => f.id === fyId)?.name ?? 'Current'} Budget`],
      ['INCOME:', '', ''],
      ...income.map((account) => [account.name, '', '']),
      ['Total Income Taka:', '', ''],
      ['EXPENDITURE:', '', ''],
      ...expenditure.map((account) => [account.name, '', '']),
      ['Total Expenditure:', '', ''],
      ['Surplus/(Deficit) of Income over Expenditure', '', ''],
      ['Total Taka:', '', ''],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 52 }, { wch: 34 }, { wch: 22 }];
    worksheet['!merges'] = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
      { s: { r: income.length + 2, c: 0 }, e: { r: income.length + 2, c: 2 } },
      { s: { r: income.length + expenditure.length + 3, c: 0 }, e: { r: income.length + expenditure.length + 3, c: 2 } },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Budget Format');
    XLSX.writeFile(workbook, 'prescribed-project-budget-template.xlsx');
  };

  const updateMapping = (rowNumber: number, accountId: string) => {
    setUnmappedRows((rows) => rows.map((row) => row.rowNumber === rowNumber ? { ...row, mappedAccountId: accountId } : row));
  };

  const mappedRows = useMemo<ParsedRow[]>(() => unmappedRows.flatMap((row) => {
    const account = leafAccounts.find((item) => item.id === row.mappedAccountId);
    return account ? [{ code: account.code, name: account.name, amount: row.amount, prevYearActual: row.prevYearActual }] : [];
  }), [leafAccounts, unmappedRows]);

  const printPreview = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;
    const rows = [...parsedRows, ...mappedRows];
    const income = rows.filter((row) => (accountByCode.get(row.code)?.account_type ?? '') === 'income');
    const expenditure = rows.filter((row) => (accountByCode.get(row.code)?.account_type ?? '') !== 'income');
    const tableRows = (items: ParsedRow[]) => items.map((row) => `<tr><td>${row.name}</td><td>${row.amount ? row.amount.toLocaleString() : ''}</td><td></td><td></td><td></td><td></td></tr>`).join('');
    printWindow.document.write(`<html><head><title>Project Budget Preview</title><style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #555;padding:5px}th{text-align:center;font-size:14px}td:not(:first-child){text-align:right}.section{text-align:center!important;font-weight:bold;background:#eee}.total{text-align:right!important;font-weight:bold}</style></head><body><table><thead><tr><th>PARTICULARS</th><th>Target ${fys.find((f) => f.id === fyId)?.name ?? ''}</th><th>This Month</th><th>This Year</th><th>%</th><th>Balance</th></tr></thead><tbody><tr><td class="section" colspan="6">INCOME:</td></tr>${tableRows(income)}<tr><td class="total" colspan="6">Total Income Taka:</td></tr><tr><td class="section" colspan="6">EXPENDITURE:</td></tr>${tableRows(expenditure)}<tr><td class="total" colspan="6">Total Expenditure:</td></tr><tr><td class="total" colspan="6">Surplus/(Deficit) of Income over Expenditure</td></tr><tr><td class="total" colspan="6">Total Taka:</td></tr></tbody></table></body></html>`);
    printWindow.document.close(); printWindow.focus(); printWindow.print();
  };

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split(/\n/);
    const raw: unknown[][] = lines.map((l) => l.split(/\t|,/).map((c) => c.trim()));
    const headerIndex = raw.findIndex((row) => row.some((cell) => normalize(String(cell ?? '')).includes('particular')));
    const header = headerIndex >= 0 ? raw[headerIndex].map((cell) => normalize(String(cell ?? ''))) : [];
    const previousCol = header.findIndex((cell) => cell.includes('previous') || cell.includes('actual'));
    const budgetCol = header.findIndex((cell) => cell.includes('budget') || cell.includes('target'));
    const rows = parseRawRows(raw, { headerIndex, previousCol: previousCol >= 0 ? previousCol : 1, budgetCol: budgetCol >= 0 ? budgetCol : 2 });
    validateAndSet(rows);
    setShowPaste(false);
  };

  const save = async () => {
    if (!fyId) { toast.error('Select a Fiscal Year'); return; }
    if (!projectId) { toast.error('Select a Fund/Project'); return; }
    if (unmappedRows.length > 0 && mappedRows.length !== unmappedRows.length) { toast.error('Map all unmatched Budget Heads before saving'); setShowMapping(true); return; }
    if (!showPreview) { setShowPreview(true); return; }
    if (parsedRows.length === 0 && mappedRows.length === 0) { toast.error('No valid budget rows to save'); return; }
    setSaving(true);
    try {
      const versionLabel = VERSION_OPTIONS.find((v) => v.value === versionType)?.label ?? 'Original';
      // A version is unique per financial year + project + label. Reuse the
      // existing version instead of inserting a duplicate on every import.
      const { data: existingVersion, error: findVersionError } = await supabase
        .from('budget_versions')
        .select('id')
        .eq('fiscal_year_id', fyId)
        .eq('project_id', projectId)
        .eq('version_label', versionLabel)
        .maybeSingle();
      if (findVersionError) throw findVersionError;

      let versionId = existingVersion?.id as string | undefined;
      if (!versionId) {
        const { data: versionData, error: vError } = await supabase
          .from('budget_versions')
          .insert({
            fiscal_year_id: fyId,
            project_id: projectId,
            version_label: versionLabel,
            version_type: versionType,
            created_by: profile?.id ?? null,
          })
          .select('id')
          .single();
        if (vError) throw vError;
        versionId = versionData.id;
      }

      if (mode === 'replace') {
        const { error: deleteError } = await supabase.from('budgets')
          .delete()
          .eq('financial_year_id', fyId)
          .eq('project_id', projectId)
          .eq('budget_version_id', versionId);
        if (deleteError) throw deleteError;
      }

      const rowsToSave = [...parsedRows, ...mappedRows];
      const inserts = rowsToSave.map((r) => {
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

      const importAccountIds = Array.from(new Set(inserts.map((row) => row.account_id)));
      if (importAccountIds.length > 0) {
        const { error: activateError } = await supabase.from('chart_of_accounts').update({ is_active: true }).in('id', importAccountIds).eq('is_active', false);
        if (activateError) throw activateError;
      }
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
          {fileName && <span className="self-center text-xs text-muted-foreground">{fileName}</span>}
          {inactiveImportHeads.length > 0 && <span className="self-center text-xs text-amber-700">Inactive matching heads will be activated on upload</span>}
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Download Prescribed Excel Template
          </Button>
        </div>

        {showPaste && (
          <div className="space-y-2">
            <Label>Paste the prescribed Excel table here (Particulars, Previous Actual, Budget)</Label>
            <Textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="4001	Admission Fees	50000	45000&#10;4002	Agriculture	100000	95000"
            />
            <Button size="sm" onClick={handlePaste}><Table className="mr-2 h-4 w-4" /> Parse Pasted Data</Button>
          </div>
        )}

        {unmappedRows.length > 0 && (
          <Alert variant="destructive" className="border-amber-400 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span><strong>{unmappedRows.length} Budget Head(s)</strong> need manual mapping before upload.</span>
              <Button size="sm" variant="outline" onClick={() => setShowMapping(true)}>Review & Map</Button>
            </AlertDescription>
          </Alert>
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
          {showPreview && <Button variant="outline" onClick={printPreview}><Printer className="mr-2 h-4 w-4" /> Print Preview</Button>}
          <Button onClick={save} disabled={saving || (parsedRows.length === 0 && mappedRows.length === 0) || (unmappedRows.length > 0 && mappedRows.length !== unmappedRows.length)}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Upload className="mr-2 h-4 w-4" /> {showPreview ? 'Confirm & Upload Budget' : 'Preview Budget'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={showColumnMapping} onOpenChange={setShowColumnMapping}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Import Excel File — Select Column Mapping</DialogTitle><DialogDescription>Confirm which Excel columns contain the Budget Head, Previous Actual and Budget Target. Preview will be generated after mapping.</DialogDescription></DialogHeader>
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">{rawImportRows.length} rows found. The selected columns will be used exactly for import; no amount column will be guessed.</div>
          <div className="grid gap-4 sm:grid-cols-3">
            {([['nameColumn', 'Budget Head / Particulars'], ['previousColumn', 'Previous FS Year Actual'], ['budgetColumn', 'Budget Target']] as const).map(([key, label]) => <div key={key} className="space-y-1.5"><Label>{label}</Label><Select value={String(columnMapping?.[key] ?? 0)} onValueChange={(value) => setColumnMapping((current) => current ? { ...current, [key]: Number(value) } : current)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{importColumns.map((column, index) => <SelectItem key={index} value={String(index)}>Col {index + 1}: {column || `Column ${index + 1}`}</SelectItem>)}</SelectContent></Select></div>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setShowColumnMapping(false); setFileName(''); }}>Cancel</Button><Button onClick={confirmColumnMapping}><CheckCircle2 className="mr-2 h-4 w-4" /> Preview Imported Data</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showMapping} onOpenChange={setShowMapping}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Map Unmatched Budget Heads</DialogTitle><DialogDescription>Review every Excel Budget Head that could not be matched automatically.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto">
            {unmappedRows.map((row) => (
              <div key={row.rowNumber} className="grid gap-2 rounded-md border-amber-200 bg-amber-50 p-3 sm:grid-cols-[1fr_1fr] sm:items-center">
                <div><p className="text-xs text-muted-foreground">Excel row {row.rowNumber}</p><p className="font-medium">{row.sourceHead}</p><p className="font-mono text-xs">{formatCurrency(row.amount)}</p></div>
                <AccountCombobox accounts={leafAccounts} value={row.mappedAccountId ?? ''} onChange={(value) => updateMapping(row.rowNumber, value)} placeholder="Search code or account head..." />
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowMapping(false)}>Continue Editing</Button><Button onClick={() => { if (mappedRows.length !== unmappedRows.length) { toast.error('Map every unmatched Budget Head first'); return; } setShowMapping(false); setUnmappedRows([]); setUnmatched(0); setShowPreview(true); }}>Confirm Mappings & Preview</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
