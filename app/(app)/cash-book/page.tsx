'use client';

import { BookReport } from '@/components/shared/BookReport';

export default function CashBookPage() {
  return <BookReport title="Cash Book" description="All cash receipts and payments with running balance" accountType="cash" />;
}
