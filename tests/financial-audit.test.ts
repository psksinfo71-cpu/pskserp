import { describe, expect, it } from 'vitest';
import { exceedsVariance, hasExactDuplicate, isBalanced, nextVoucherNumber, postedEditStatus } from '@/lib/accounting-rules';

describe('financial audit rules', () => {
  it('flags an exact duplicate', () => expect(hasExactDuplicate(250, '2025-01-01', 'cash', [{ amount: 250, date: '2025-01-01', accountId: 'cash' }])).toBe(true));
  it('flags a variance above 200 percent', () => expect(exceedsVariance(250, [100, 100, 100])).toBe(true));
  it('validates double entry', () => expect(isBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }])).toBe(true));
  it('increments voucher number by type and year', () => expect(nextVoucherNumber(['JV-2025-0002', 'JV-2024-0099'], 'JV', '2025')).toBe('JV-2025-0003'));
  it('keeps posted edits posted', () => expect(postedEditStatus('posted', true)).toBe('posted'));
});
