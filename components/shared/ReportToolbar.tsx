'use client';

import { Button } from '@/components/ui/button';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { exportToCSV, exportToExcel } from '@/lib/export';

interface ReportToolbarProps {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  onPrint?: () => void;
}

export function ReportToolbar({ title, headers, rows, onPrint }: ReportToolbarProps) {
  const safeName = title.replace(/\s+/g, '_').toLowerCase();
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => exportToCSV(safeName, headers, rows)}>
        <FileText className="mr-1.5 h-4 w-4" /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportToExcel(safeName, headers, rows)}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
      </Button>
      {onPrint && (
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="mr-1.5 h-4 w-4" /> Print
        </Button>
      )}
    </div>
  );
}
