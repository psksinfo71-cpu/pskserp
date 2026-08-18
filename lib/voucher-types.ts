import type { VoucherTypeCode } from '@/lib/types';

export interface VoucherTypeDef {
  code: VoucherTypeCode;
  label: string;
  /** Short label for filter dropdowns and badges */
  short: string;
  /** Whether this is a payment-type voucher (money going out) */
  isPayment?: boolean;
  /** Whether this is a receipt-type voucher (money coming in) */
  isReceipt?: boolean;
  /** 'bank' = bank accounts only, 'cash' = cash accounts only */
  cashOrBank?: 'bank' | 'cash';
  /** For payment vouchers: the control line is a Credit (money leaves the bank/cash account).
   *  For receipt vouchers: the control line is a Debit (money enters the bank/cash account). */
  controlSide?: 'debit' | 'credit';
}

export const VOUCHER_TYPES: VoucherTypeDef[] = [
  { code: 'BPV', label: 'Bank Payment Voucher', short: 'BPV', isPayment: true, cashOrBank: 'bank', controlSide: 'credit' },
  { code: 'CPV', label: 'Cash Payment Voucher', short: 'CPV', isPayment: true, cashOrBank: 'cash', controlSide: 'credit' },
  { code: 'BRV', label: 'Bank Receipt Voucher', short: 'BRV', isReceipt: true, cashOrBank: 'bank', controlSide: 'debit' },
  { code: 'CRV', label: 'Cash Receipt Voucher', short: 'CRV', isReceipt: true, cashOrBank: 'cash', controlSide: 'debit' },
  { code: 'JV', label: 'Journal Voucher', short: 'JV' },
  { code: 'CV', label: 'Contra Voucher', short: 'CV' },
  { code: 'AV', label: 'Adjustment Voucher', short: 'AV' },
  { code: 'OV', label: 'Opening Voucher', short: 'OV' },
  { code: 'CLV', label: 'Closing Voucher', short: 'CLV' },
];

export const VOUCHER_TYPE_MAP: Record<string, VoucherTypeDef> = Object.fromEntries(
  VOUCHER_TYPES.map((t) => [t.code, t])
);

export function getVoucherTypeLabel(code: string): string {
  return VOUCHER_TYPE_MAP[code]?.label ?? code;
}

/** Legacy code mapping for backward compatibility with existing PV/RV vouchers in the database. */
export const LEGACY_VOUCHER_TYPES: Record<string, string> = {
  PV: 'Payment Voucher',
  RV: 'Receipt Voucher',
};

export function getVoucherTypeLabelWithLegacy(code: string): string {
  if (VOUCHER_TYPE_MAP[code]) return VOUCHER_TYPE_MAP[code].label;
  return LEGACY_VOUCHER_TYPES[code] ?? code;
}

/** Cash account codes — leaf accounts under "Cash in Hand" (1001). */
export const CASH_ACCOUNT_CODES = ['1001'];

/** Bank account codes — leaf accounts under "Cash at Bank" (10021, 10022, etc.). */
export const BANK_ACCOUNT_CODES = ['10021', '10022'];

/** Check if an account code is a cash account. */
export function isCashAccount(code: string): boolean {
  return CASH_ACCOUNT_CODES.includes(code) || code === '1001' || code.startsWith('1001');
}

/** Check if an account code is a bank account. */
export function isBankAccount(code: string): boolean {
  return BANK_ACCOUNT_CODES.includes(code) || (code !== '1002' && code.startsWith('1002'));
}

/** Check if a voucher type is one of the new payment/receipt types that need a control account. */
export function hasControlAccount(code: string): boolean {
  const def = VOUCHER_TYPE_MAP[code];
  return !!(def && (def.isPayment || def.isReceipt));
}
