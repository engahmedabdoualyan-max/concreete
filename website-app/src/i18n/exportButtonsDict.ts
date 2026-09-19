import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  exportExcel: { en: 'Export Excel', ar: 'تصدير Excel', ru: 'Экспорт Excel', de: 'Excel exportieren', it: 'Esporta Excel', hi: 'Excel निर्यात करें', ur: 'Excel ایکسپورٹ کریں', ja: 'Excelにエクスポート', zh: '导出 Excel' },
  exportCsv: { en: 'Export CSV', ar: 'تصدير CSV', ru: 'Экспорт CSV', de: 'CSV exportieren', it: 'Esporta CSV', hi: 'CSV निर्यात करें', ur: 'CSV ایکسپورٹ کریں', ja: 'CSVにエクスポート', zh: '导出 CSV' },
  exportPdf: { en: 'Print / PDF', ar: 'طباعة / PDF', ru: 'Печать / PDF', de: 'Drucken / PDF', it: 'Stampa / PDF', hi: 'प्रिंट / PDF', ur: 'پرنٹ / PDF', ja: '印刷 / PDF', zh: '打印 / PDF' },
};

export function useExportButtonsDict() {
  return usePageDict(DICT);
}