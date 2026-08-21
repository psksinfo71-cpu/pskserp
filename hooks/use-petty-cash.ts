'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { PettyCashExpense } from '@/components/petty-cash/PettyCashRequisition';

const PETTY_CASH_LIMIT = 15000;

export interface PettyCashData {
  expenses: PettyCashExpense[];
  totalExpenses: number;
  balance: number;
  burnRate: number;
  alert: boolean;
  loading: boolean;
}

export function usePettyCash(): PettyCashData {
  const [expenses, setExpenses] = useState<PettyCashExpense[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Find all posted vouchers that have a credit from Cash in Hand (1001)
      // This represents cash payments = petty cash expenses
      const { data: cashOutDetails } = await supabase
        .from('voucher_details')
        .select(`
          id, voucher_id, debit, credit, narration,
          account: chart_of_accounts!inner ( name, code, account_type )
        `)
        .gt('credit', 0)
        .eq('account.code', '1001');

      if (!cashOutDetails || cashOutDetails.length === 0) {
        setExpenses([]);
        setTotalExpenses(0);
        setLoading(false);
        return;
      }

      // Get unique voucher IDs
      const voucherIds = [...new Set(cashOutDetails.map((d) => d.voucher_id))];

      // Fetch those vouchers
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, voucher_no, voucher_date, narration')
        .eq('status', 'posted')
        .in('id', voucherIds);

      if (!vouchers || vouchers.length === 0) {
        setExpenses([]);
        setTotalExpenses(0);
        setLoading(false);
        return;
      }

      const voucherMap = new Map(vouchers.map((v) => [v.id, v]));

      // Fetch ALL details for these vouchers to find expense debit lines
      const { data: allDetails } = await supabase
        .from('voucher_details')
        .select(`
          id, voucher_id, debit, credit, narration,
          account: chart_of_accounts!inner ( name, code, account_type )
        `)
        .in('voucher_id', voucherIds);

      const expenseList: PettyCashExpense[] = [];
      let total = 0;

      for (const v of vouchers) {
        const vDetails = (allDetails ?? []).filter((d) => d.voucher_id === v.id);
        for (const d of vDetails) {
          const acc = d.account as unknown as { name: string; code: string; account_type: string };
          // Expense lines: debit from expense accounts
          if (acc.account_type === 'expense' && Number(d.debit) > 0) {
            const amt = Number(d.debit);
            total += amt;
            expenseList.push({
              id: d.id,
              voucher_no: v.voucher_no,
              voucher_date: v.voucher_date,
              head_of_account: acc.name,
              description: d.narration || v.narration || '',
              amount: amt,
            });
          }
        }
      }

      // Sort by date descending
      expenseList.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date));

      setExpenses(expenseList);
      setTotalExpenses(total);
    } catch {
      setExpenses([]);
      setTotalExpenses(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const balance = PETTY_CASH_LIMIT - totalExpenses;
  const burnRate = PETTY_CASH_LIMIT > 0 ? (totalExpenses / PETTY_CASH_LIMIT) * 100 : 0;
  const alert = totalExpenses >= PETTY_CASH_LIMIT * 0.8;

  return { expenses, totalExpenses, balance, burnRate, alert, loading };
}

export const PETTY_CASH_MAX = PETTY_CASH_LIMIT;
