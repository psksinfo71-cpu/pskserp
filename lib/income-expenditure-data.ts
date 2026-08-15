import { supabase } from '@/lib/supabase/client';
import { fetchMovementsYearAndMonth, fetchMovements, type MovementPair } from '@/lib/report-data';

export interface IERow {
  particulars: string;
  this_month: number;
  this_year: number;
  is_subtotal: boolean;
  is_group_header: boolean;
  level: number;
}

export interface IESection {
  title: string;
  rows: IERow[];
  totalMonth: number;
  totalYear: number;
}

interface AccountNode {
  id: string;
  code: string;
  name: string;
}

interface GroupConfig {
  header: string;
  subtotalLabel: string;
  accountCodes: string[];
}

const INCOME_GROUPS: GroupConfig[] = [
  {
    header: 'General Income',
    subtotalLabel: 'Total General Income',
    accountCodes: ['4011', '4012', '4005', '4003', '4013', '4014', '4022', '4020', '4019', '4015', '4001', '4002', '4004', '4006', '4008', '4010', '4016', '4018', '4021'],
  },
  {
    header: 'Service Charge Collection',
    subtotalLabel: 'Total Service Charge',
    accountCodes: ['4017'],
  },
];

const EXPENSE_GROUPS: GroupConfig[] = [
  {
    header: 'Salary & Benefit',
    subtotalLabel: 'Total Salary & Benefit',
    accountCodes: ['5051', '5052', '5053', '5054', '5055', '5056', '5040', '5020', '5038', '5031'],
  },
  {
    header: 'Administrative Cost',
    subtotalLabel: 'Total Administrative Cost',
    accountCodes: ['5033', '5017', '5021', '5047', '5001', '5006', '5007', '5036', '5034', '5011', '5018', '5003', '5032', '5028', '5050', '5039', '5035', '5025', '5026', '5027', '5029', '5030', '5044', '5045', '5010', '5004', '5005', '5008', '5009', '5012', '5013', '5014', '5015', '5016', '5019', '5022', '5023', '5024', '5037', '5041', '5042', '5043', '5046', '5048', '5049', '5002'],
  },
];

function computeAmount(acc: AccountNode, yearMov: Map<string, { debit: number; credit: number }>, monthMov: Map<string, { debit: number; credit: number }>, isIncome: boolean): { year: number; month: number } {
  const y = yearMov.get(acc.id) ?? { debit: 0, credit: 0 };
  const m = monthMov.get(acc.id) ?? { debit: 0, credit: 0 };
  return isIncome
    ? { year: y.credit - y.debit, month: m.credit - m.debit }
    : { year: y.debit - y.credit, month: m.debit - m.credit };
}

export async function fetchIncomeExpenditureData(
  toDate: string,
  fromDate?: string,
  projectId?: string
): Promise<{ income: IESection; expense: IESection; surplusMonth: number; surplusYear: number }> {
  let accQ = supabase
    .from('chart_of_accounts')
    .select('id, code, name, account_type, cloned_from_id, project_id')
    .in('account_type', ['income', 'expense'])
    .eq('is_active', true);
  if (projectId) accQ = accQ.or(`project_id.is.null,project_id.eq.${projectId}`);
  const { data: accountsRaw } = await accQ;
  const accounts = (accountsRaw ?? []) as (AccountNode & { cloned_from_id: string | null; project_id: string | null })[];

  // Deduplicate: prefer project clones over globals
  const filteredAccounts = projectId
    ? accounts.filter((a) => !(a.project_id === null && accounts.some((c) => c.cloned_from_id === a.id && c.project_id === projectId)))
    : accounts.filter((a) => !a.project_id);
  const byCode = new Map(filteredAccounts.map((a) => [a.code, a]));

  const { year, month }: MovementPair = fromDate
    ? { year: await fetchMovements(fromDate, toDate, projectId), month: await fetchMovements(fromDate, toDate, projectId) }
    : await fetchMovementsYearAndMonth(toDate, projectId);

  // Merge movements from original global accounts into their project clones
  for (const a of filteredAccounts) {
    if (a.cloned_from_id && a.project_id === projectId) {
      const origYear = year.get(a.cloned_from_id);
      if (origYear) {
        const cloneYear = year.get(a.id) ?? { debit: 0, credit: 0 };
        cloneYear.debit += origYear.debit;
        cloneYear.credit += origYear.credit;
        year.set(a.id, cloneYear);
      }
      const origMonth = month.get(a.cloned_from_id);
      if (origMonth) {
        const cloneMonth = month.get(a.id) ?? { debit: 0, credit: 0 };
        cloneMonth.debit += origMonth.debit;
        cloneMonth.credit += origMonth.credit;
        month.set(a.id, cloneMonth);
      }
    }
  }

  const buildSection = (title: string, groups: GroupConfig[], isIncome: boolean): IESection => {
    const rows: IERow[] = [];
    let totalMonth = 0;
    let totalYear = 0;

    for (const g of groups) {
      let groupMonth = 0;
      let groupYear = 0;
      const childRows: IERow[] = [];

      for (const code of g.accountCodes) {
        const acc = byCode.get(code);
        if (!acc) continue;
        const { year: y, month: m } = computeAmount(acc, year, month, isIncome);
        if (y === 0 && m === 0) continue;
        childRows.push({
          particulars: acc.name,
          this_month: m,
          this_year: y,
          is_subtotal: false,
          is_group_header: false,
          level: 2,
        });
        groupMonth += m;
        groupYear += y;
      }

      if (childRows.length === 0) continue;

      rows.push({ particulars: g.header, this_month: 0, this_year: 0, is_subtotal: false, is_group_header: true, level: 1 });
      rows.push(...childRows);
      rows.push({ particulars: g.subtotalLabel, this_month: groupMonth, this_year: groupYear, is_subtotal: true, is_group_header: false, level: 1 });
      totalMonth += groupMonth;
      totalYear += groupYear;
    }

    return { title, rows, totalMonth, totalYear };
  };

  const income = buildSection('Income', INCOME_GROUPS, true);
  const expense = buildSection('Expenditure', EXPENSE_GROUPS, false);

  return {
    income,
    expense,
    surplusMonth: income.totalMonth - expense.totalMonth,
    surplusYear: income.totalYear - expense.totalYear,
  };
}
