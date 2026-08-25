/**
 * ============================================================
 *  FIMTO SOFT — Report export helpers (Excel / CSV / PDF)
 * ============================================================
 */

import * as XLSX from 'xlsx';

export type ExportColumn = { header: string; key: string };
export type ExportRow = Record<string, string | number | null | undefined>;

function toRows(columns: ExportColumn[], rows: ExportRow[]): Record<string, string | number>[] {
  return rows.map((r) => {
    const out: Record<string, string | number> = {};
    for (const c of columns) {
      const v = r[c.key];
      out[c.header] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  });
}

/** Excel via SheetJS (.xlsx) — full fidelity, multi-sheet optional */
export function downloadExcel(filename: string, sheets: { name: string; columns: ExportColumn[]; rows: ExportRow[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(toRows(sheet.columns, sheet.rows));
    ws['!cols'] = sheet.columns.map((c) => ({ wch: Math.max(10, c.header.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** CSV with UTF-8 BOM — opens directly in Excel */
export function downloadCSV(filename: string, columns: ExportColumn[], rows: ExportRow[]) {
  const esc = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    columns.map((c) => esc(c.header)).join(','),
    ...rows.map((r) => columns.map((c) => esc(String(r[c.key] ?? ''))).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** PDF via a print-friendly report window (browser "Save as PDF") */
export function openPrintPDF(opts: {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  landscape?: boolean;
}) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) return;
  const rtl = true;
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${opts.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .sub { font-size: 12px; color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #0d9488; color: #fff; padding: 6px 8px; text-align: ${rtl ? 'right' : 'left'}; }
    td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) td { background: #f6f6f6; }
    .total td { font-weight: 700; background: #eef2f7 !important; }
    @media print { body { padding: 10mm; } }
  </style></head><body>
  <h1>${opts.title}</h1>
  ${opts.subtitle ? `<div class="sub">${opts.subtitle}</div>` : ''}
  <table><thead><tr>${opts.columns.map((c) => `<th>${c.header}</th>`).join('')}</tr></thead>
  <tbody>${opts.rows.map((r) => `<tr>${opts.columns.map((c) => `<td>${String(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`);
  w.document.close();
}
