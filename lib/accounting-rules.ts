export interface AccountingLine { debit: number; credit: number; }

export const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function isBalanced(lines: AccountingLine[], tolerance = 0.001): boolean {
  const debit = roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.debit), 0));
  const credit = roundMoney(lines.reduce((sum, line) => sum + roundMoney(line.credit), 0));
  return Math.abs(debit - credit) <= tolerance;
}

export function nextVoucherNumber(numbers: string[], prefix: string, year: string): string {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const latest = numbers.reduce((max, value) => {
    const match = value.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${year}-${String(latest + 1).padStart(4, '0')}`;
}

export function hasExactDuplicate(currentAmount: number, currentDate: string, currentAccountId: string, rows: Array<{ amount: number; date: string; accountId: string; id?: string }>, currentId?: string): boolean {
  return rows.some((row) => (!currentId || row.id !== currentId) && row.amount === currentAmount && row.date === currentDate && row.accountId === currentAccountId);
}

export function exceedsVariance(currentAmount: number, historicalAmounts: number[], multiplier = 2): boolean {
  if (!historicalAmounts.length) return false;
  const average = historicalAmounts.reduce((sum, amount) => sum + amount, 0) / historicalAmounts.length;
  return average > 0 && currentAmount > average * multiplier;
}

export function postedEditStatus(status: string, submit: boolean): 'posted' | 'submitted' | 'draft' {
  return status === 'posted' ? 'posted' : (submit ? 'submitted' : 'draft');
}
