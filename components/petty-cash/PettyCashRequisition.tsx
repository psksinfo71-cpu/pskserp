'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';

const PETTY_CASH_LIMIT = 15000;
const THRESHOLD_PERCENT = 80;

export interface PettyCashExpense {
  id: string;
  voucher_no: string;
  voucher_date: string;
  head_of_account: string;
  description: string;
  amount: number;
}

interface PettyCashRequisitionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: PettyCashExpense[];
  totalExpenses: number;
}

export function PettyCashRequisition({ open, onOpenChange, expenses, totalExpenses }: PettyCashRequisitionProps) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const currentMonth = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const balance = PETTY_CASH_LIMIT - totalExpenses;
  const burnRate = ((totalExpenses / PETTY_CASH_LIMIT) * 100).toFixed(1);

  const handlePrint = () => {
    const printContent = document.getElementById('petty-cash-print-area');
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Petty Cash Requisition</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
          .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .header h1 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .header h2 { font-size: 12px; font-weight: 600; margin-top: 2px; }
          .header p { font-size: 11px; margin-top: 4px; font-style: italic; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th, td { border: 1px solid #333; padding: 5px 8px; text-align: left; font-size: 10.5px; }
          th { background: #f0f0f0; font-weight: 600; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: 700; }
          .summary-row td { background: #f9f9f9; font-weight: 600; }
          .total-row td { background: #e8e8e8; font-weight: 700; border-top: 2px solid #000; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px; }
          .sig-block { text-align: center; width: 30%; }
          .sig-line { border-top: 1px solid #000; margin-top: 50px; padding-top: 5px; }
          .sig-name { font-weight: 600; font-size: 10.5px; }
          .sig-designation { font-size: 9.5px; color: #555; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:shadow-none print:border-none">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle>Petty Cash Requisition / Adjustment Form</DialogTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div id="petty-cash-print-area" className="text-xs">
          {/* Header */}
          <div className="mb-4 border-b-2 border-foreground pb-3 text-center">
            <h1 className="text-base font-bold uppercase tracking-wide">Palashipara Samaj Kallyan Samity</h1>
            <h2 className="mt-0.5 text-sm font-semibold">Gangni, Meherpur</h2>
            <p className="mt-1 italic text-muted-foreground">Petty Cash Requisition / Adjustment Form - {currentMonth}</p>
          </div>

          {/* Upper Summary Table */}
          <table className="mb-4 w-full border-collapse text-xs">
            <tbody>
              <tr className="border border-foreground">
                <td className="border-r border-foreground px-3 py-1.5 font-medium">Remaining Balance (Date: {today})</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(balance > 0 ? balance : 0)}</td>
              </tr>
              <tr className="border border-foreground">
                <td className="border-r border-foreground px-3 py-1.5 font-medium">Re-received / To Be Received (Date: {today})</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(PETTY_CASH_LIMIT)}</td>
              </tr>
              <tr className="border border-foreground bg-muted/50">
                <td className="border-r border-foreground px-3 py-1.5 font-bold">Total Petty Cash Requisition</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{formatCurrency(PETTY_CASH_LIMIT)}</td>
              </tr>
            </tbody>
          </table>

          {/* Main Expense Breakdown Table */}
          <table className="mb-4 w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="border border-foreground px-2 py-1.5 text-center" style={{ width: '8%' }}>Date</th>
                <th className="border border-foreground px-2 py-1.5 text-center" style={{ width: '5%' }}>Sl No</th>
                <th className="border border-foreground px-2 py-1.5 text-center" style={{ width: '14%' }}>Voucher No</th>
                <th className="border border-foreground px-2 py-1.5 text-center" style={{ width: '22%' }}>Head of Account</th>
                <th className="border border-foreground px-2 py-1.5 text-center" style={{ width: '31%' }}>Description</th>
                <th className="border border-foreground px-2 py-1.5 text-center" style={{ width: '20%' }}>Amount (Tk.)</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-foreground px-2 py-4 text-center italic text-muted-foreground">
                    No petty cash expenses recorded
                  </td>
                </tr>
              ) : (
                expenses.map((exp, i) => (
                  <tr key={exp.id}>
                    <td className="border border-foreground px-2 py-1.5 text-center">
                      {formatDate(exp.voucher_date)}
                    </td>
                    <td className="border border-foreground px-2 py-1.5 text-center">{i + 1}</td>
                    <td className="border border-foreground px-2 py-1.5 text-center font-mono text-[10px]">{exp.voucher_no}</td>
                    <td className="border border-foreground px-2 py-1.5">{exp.head_of_account}</td>
                    <td className="border border-foreground px-2 py-1.5">{exp.description || '-'}</td>
                    <td className="border border-foreground px-2 py-1.5 text-right font-mono">{formatCurrency(exp.amount)}</td>
                  </tr>
                ))
              )}
              {/* Total Expenditure */}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={5} className="border border-foreground px-2 py-1.5 text-right">Total Expenditure</td>
                <td className="border border-foreground px-2 py-1.5 text-right font-mono">{formatCurrency(totalExpenses)}</td>
              </tr>
              {/* Balance / Remaining */}
              <tr>
                <td colSpan={5} className="border border-foreground px-2 py-1.5 text-right font-semibold">Balance / Remaining</td>
                <td className="border border-foreground px-2 py-1.5 text-right font-mono font-semibold">{formatCurrency(balance > 0 ? balance : 0)}</td>
              </tr>
              {/* Current Petty Cash Requisition */}
              <tr className="bg-muted/50 font-bold">
                <td colSpan={5} className="border border-foreground px-2 py-1.5 text-right">Current Petty Cash Requisition</td>
                <td className="border border-foreground px-2 py-1.5 text-right font-mono">{formatCurrency(PETTY_CASH_LIMIT)}</td>
              </tr>
              {/* Burn Rate */}
              <tr className="bg-muted/30">
                <td colSpan={5} className="border border-foreground px-2 py-1.5 text-right font-semibold">Petty Cash Requisition Burn Rate %</td>
                <td className="border border-foreground px-2 py-1.5 text-right font-mono font-bold">{burnRate}%</td>
              </tr>
            </tbody>
          </table>

          {/* Signature Footer */}
          <div className="mt-8 flex justify-between px-4">
            <div className="w-1/3 text-center">
              <div className="mt-12 border-t border-foreground pt-2">
                <p className="mt-1 text-[9px] font-medium text-primary">Prepared By</p>
                <p className="text-[10px] font-bold">Md. Osman Goni</p>
                <p className="text-[9px] text-muted-foreground">Manager - Finance</p>
              </div>
            </div>
            <div className="w-1/3 text-center">
              <div className="mt-12 border-t border-foreground pt-2">
                <p className="mt-1 text-[9px] font-medium text-primary">Checked By</p>
                <p className="text-[10px] font-bold">Md. Mizanur Rahman</p>
                <p className="text-[9px] text-muted-foreground">Deputy Director - Finance &amp; Admin</p>
              </div>
            </div>
            <div className="w-1/3 text-center">
              <div className="mt-12 border-t border-foreground pt-2">
                <p className="mt-1 text-[9px] font-medium text-primary">Approved By</p>
                <p className="text-[10px] font-bold">Md. Kamruzzaman</p>
                <p className="text-[9px] text-muted-foreground">Deputy Executive Director</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const PETTY_CASH_MAX_LIMIT = PETTY_CASH_LIMIT;
export const PETTY_CASH_THRESHOLD = PETTY_CASH_LIMIT * (THRESHOLD_PERCENT / 100);
