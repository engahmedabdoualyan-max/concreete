/**
 * ============================================================
 *  FIMTO SOFT — Export toolbar (Excel / CSV / PDF) for report tables
 * ============================================================
 */

import { downloadExcel, downloadCSV, openPrintPDF } from '../lib/exportReports';
import type { ExportColumn, ExportRow } from '../lib/exportReports';
import { useExportButtonsDict } from '../i18n/exportButtonsDict';

interface Props {
  filename: string;
  title: string;
  subtitle?: string;
  sheets?: { name: string; columns: ExportColumn[]; rows: ExportRow[] }[];
  columns: ExportColumn[];
  rows: ExportRow[];
  landscape?: boolean;
}

export default function ExportButtons({ filename, title, subtitle, sheets, columns, rows, landscape }: Props) {
  const t = useExportButtonsDict();
  const hasData = rows.length > 0;
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        disabled={!hasData}
        onClick={() => downloadExcel(filename, sheets ?? [{ name: title.slice(0, 31), columns, rows }])}
        className="text-[10px] bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-600/50 disabled:opacity-30"
        title={t('exportExcel')}
      >
        📊 Excel
      </button>
      <button
        disabled={!hasData}
        onClick={() => downloadCSV(filename, columns, rows)}
        className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded px-2 py-1 hover:bg-sky-500/30 disabled:opacity-30"
        title={t('exportCsv')}
      >
        📄 CSV
      </button>
      <button
        disabled={!hasData}
        onClick={() => openPrintPDF({ title, subtitle, columns, rows, landscape })}
        className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 rounded px-2 py-1 hover:bg-red-500/30 disabled:opacity-30"
        title={t('exportPdf')}
      >
        🖨️ PDF
      </button>
    </div>
  );
}
