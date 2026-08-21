'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Image from 'next/image';
import type { Voucher, Profile } from '@/lib/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatCurrency, formatDate, numberToWords } from '@/lib/format';
import { getVoucherTypeLabelWithLegacy } from '@/lib/voucher-types';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { ReportHeader } from '@/components/shared/ReportHeader';

interface SignerInfo {
  profile: Profile | null;
  label: string;
  status: string;
  date: string | null;
  hideDetails?: boolean;
}



export default function VoucherPrintPage({ params }: { params: { id: string } }) {
  const { profile } = useAuth();
  const [voucher, setVoucher] = useState<(Voucher & { branch_name?: string; project_name?: string }) | null>(null);
  const [lines, setLines] = useState<{ code: string; name: string; debit: number; credit: number }[]>([]);
  const [signers, setSigners] = useState<SignerInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: v, error } = await supabase
        .from('vouchers')
        .select('*, branch: branches!vouchers_branch_id_fkey ( name ), project: projects!vouchers_project_id_fkey ( name )')
        .eq('id', params.id)
        .maybeSingle();
      if (error || !v) {
        toast.error('Voucher not found');
        setLoading(false);
        return;
      }
      const branchName = (v as { branch?: { name?: string } }).branch?.name;
      const projectName = (v as { project?: { name?: string } }).project?.name;
      setVoucher({ ...(v as Voucher), branch_name: branchName, project_name: projectName });

      const { data: dl } = await supabase
        .from('voucher_details')
        .select('debit, credit, narration, account: chart_of_accounts ( code, name )')
        .eq('voucher_id', params.id)
        .order('line_order');
      if (dl) {
        setLines(dl.map((d) => {
          const acc = (d as { account?: { code?: string; name?: string } }).account;
          return { code: acc?.code ?? '', name: acc?.name ?? '', debit: Number(d.debit) || 0, credit: Number(d.credit) || 0 };
        }));
      }

      // Fetch all signer profiles: prepared_by, reviewed_by, verified_by, approved_by
      const ids = [v.prepared_by, v.reviewed_by, v.verified_by, v.approved_by].filter(Boolean) as string[];
      let profileMap: Record<string, Profile> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('*')
          .in('id', ids);
        if (profs) profileMap = Object.fromEntries(profs.map((p) => [p.id, p as Profile]));
      }

      setSigners([
        { profile: v.verified_by ? profileMap[v.verified_by] ?? null : null, label: 'Received By', status: '', date: v.updated_at, hideDetails: true },
        { profile: v.prepared_by ? profileMap[v.prepared_by] ?? null : null, label: 'Prepared By', status: v.prepared_by ? (profileMap[v.prepared_by]?.designation ?? 'Accounts Manager') : 'Accounts Manager', date: v.created_at },
        { profile: v.reviewed_by ? profileMap[v.reviewed_by] ?? null : null, label: 'Checked By', status: v.reviewed_by ? (profileMap[v.reviewed_by]?.designation ?? 'Finance Manager') : 'Finance Manager', date: v.updated_at },
        { profile: v.approved_by ? profileMap[v.approved_by] ?? null : null, label: 'Approved By', status: v.approved_by ? (profileMap[v.approved_by]?.designation ?? 'Deputy Executive Director') : 'Deputy Executive Director', date: v.updated_at },
      ]);

      setLoading(false);
    })();
  }, [params.id]);

  const handlePrint = () => window.print();

  if (loading) {
    return <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">Loading voucher...</div>;
  }

  if (!voucher) {
    return <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">Voucher not found</div>;
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar - hidden when printing */}
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <Button size="sm" onClick={handlePrint}>
          <Printer className="mr-1 h-4 w-4" /> Print
        </Button>
      </div>

      {/* Printable voucher */}
      <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0 print:shadow-none" id="print-area">
        <ReportHeader title={getVoucherTypeLabelWithLegacy(voucher.voucher_type)} />

        {/* Voucher meta */}
        <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-semibold">Voucher No:</span> {voucher.voucher_no}</p>
            <p><span className="font-semibold">Date:</span> {formatDate(voucher.voucher_date)}</p>
          </div>
          <div className="text-right">
            <p><span className="font-semibold">Project:</span> {voucher.project_name ?? 'N/A'}</p>
            <p><span className="font-semibold">Branch:</span> {voucher.branch_name ?? 'N/A'}</p>
          </div>
        </div>

        {/* Narration */}
        {voucher.narration && (
          <div className="mb-4 text-sm">
            <p className="font-semibold">Description:</p>
            <p className="mt-1 border border-gray-300 bg-gray-50 p-2">{voucher.narration}</p>
          </div>
        )}

        {/* Accounting entries */}
        <table className="mb-4 w-full border border-black text-sm">
          <thead className="border-b border-black bg-gray-100">
            <tr>
              <th className="border-r border-black px-2 py-1.5 text-left font-semibold">Code</th>
              <th className="border-r border-black px-2 py-1.5 text-left font-semibold">Account Name</th>
              <th className="border-r border-black px-2 py-1.5 text-right font-semibold">Debit (৳)</th>
              <th className="px-2 py-1.5 text-right font-semibold">Credit (৳)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="border-r border-gray-300 px-2 py-1.5 font-mono">{l.code}</td>
                <td className="border-r border-gray-300 px-2 py-1.5">{l.name}</td>
                <td className="border-r border-gray-300 px-2 py-1.5 text-right font-mono">{l.debit ? formatCurrency(l.debit) : '-'}</td>
                <td className="px-2 py-1.5 text-right font-mono">{l.credit ? formatCurrency(l.credit) : '-'}</td>
              </tr>
            ))}
            {/* Fill empty rows for visual consistency */}
            {lines.length < 5 && Array.from({ length: 5 - lines.length }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-b border-gray-300 h-8">
                <td className="border-r border-gray-300 px-2">&nbsp;</td>
                <td className="border-r border-gray-300 px-2">&nbsp;</td>
                <td className="border-r border-gray-300 px-2">&nbsp;</td>
                <td className="px-2">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-black font-bold">
            <tr>
              <td colSpan={2} className="border-r border-black px-2 py-1.5 text-right">Total</td>
              <td className="border-r border-black px-2 py-1.5 text-right font-mono">{formatCurrency(totalDebit)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Amount in words placeholder */}
        <div className="mb-8 text-sm">
          <p className="font-semibold">Amount in Words: <span className="font-normal">{numberToWords(voucher.amount)} Only</span></p>
        </div>

        {/* Signature & Seal blocks */}
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {signers.map((s, i) => (
            <div key={i} className="text-center">
              {s.profile?.signature_url ? (
                <div className="flex h-12 items-end justify-center pb-1">
                  <Image src={s.profile.signature_url} alt="Signature" width={224} height={48} className="max-h-12 max-w-full object-contain" />
                </div>
              ) : (
                <div className="h-12" />
              )}
              <div className="border-b border-gray-400 w-full" />
              <p className="text-xs font-semibold">{s.label}</p>
              {!s.hideDetails && (
                <>
                  <p className="text-xs text-gray-600">{s.profile?.full_name ?? '_______________'}</p>
                  <p className="text-xs text-gray-500">{s.status}</p>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-gray-300 pt-2 text-center text-xs text-gray-500">
          <p>This is a system-generated voucher. Voucher No: {voucher.voucher_no}</p>
        </div>
      </div>
    </div>
  );
}
