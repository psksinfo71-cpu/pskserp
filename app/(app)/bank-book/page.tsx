'use client';

import { BookReport } from '@/components/shared/BookReport';

export default function BankBookPage() {
  return <BookReport title="Bank Book" description="All bank receipts and payments with running balance" accountType="bank" />;
}
