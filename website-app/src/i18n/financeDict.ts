import { usePageDict, type PageDict } from './pageDict';

export function useFinanceDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  devNotePO: { en: 'Checkbox suggestions are local estimates only — create real POs in the form.', ar: 'اقتراحات استرشادية فقط — أنشئ الطلبات الحقيقية من النموذج.', ru: 'Checkbox suggestions are local estimates only — create real POs in the form.', de: 'Checkbox suggestions are local estimates only — create real POs in the form.', it: 'Checkbox suggestions are local estimates only — create real POs in the form.', hi: 'Checkbox suggestions are local estimates only — create real POs in the form.', ur: 'Checkbox suggestions are local estimates only — create real POs in the form.', ja: 'Checkbox suggestions are local estimates only — create real POs in the form.', zh: 'Checkbox suggestions are local estimates only — create real POs in the form.' },
  devNoteLedger: { en: 'Record client payments to the central ledger.', ar: 'سجل مدفوعات العملاء في الدفتر المركزي.', ru: 'Record client payments to the central ledger.', de: 'Record client payments to the central ledger.', it: 'Record client payments to the central ledger.', hi: 'Record client payments to the central ledger.', ur: 'Record client payments to the central ledger.', ja: 'Record client payments to the central ledger.', zh: 'Record client payments to the central ledger.' },
  devNoteSup: { en: 'Select supplier', ar: 'اختر المورد', ru: 'Select supplier', de: 'Select supplier', it: 'Select supplier', hi: 'Select supplier', ur: 'Select supplier', ja: 'Select supplier', zh: 'Select supplier' },
  devNoteRecv: { en: 'Receive', ar: 'استلام', ru: 'Receive', de: 'Receive', it: 'Receive', hi: 'Receive', ur: 'Receive', ja: 'Receive', zh: 'Receive' },

  qbNote: { en: 'QuickBooks / Sage integration', ar: 'تكامل QuickBooks / Sage', ru: 'QB', de: 'QB', it: 'QB', hi: 'QB', ur: 'QB', ja: 'QB', zh: 'QB' },
  noteLbl: { en: 'Note', ar: 'ملاحظة', ru: 'Note', de: 'Note', it: 'Note', hi: 'Note', ur: 'Note', ja: 'Note', zh: 'Note' },
  ledgerEntriesLbl: { en: 'Ledger entries', ar: 'قيود الدفتر', ru: 'Ledger', de: 'Ledger', it: 'Ledger', hi: 'Ledger', ur: 'Ledger', ja: 'Ledger', zh: 'Ledger' },
  openPOsLbl: { en: 'Open POs', ar: 'طلبات مفتوحة', ru: 'Open POs', de: 'Open POs', it: 'Open POs', hi: 'Open POs', ur: 'Open POs', ja: 'Open POs', zh: 'Open POs' },
  retryBtn: { en: 'Retry', ar: 'إعادة', ru: 'Retry', de: 'Retry', it: 'Retry', hi: 'Retry', ur: 'Retry', ja: 'Retry', zh: 'Retry' },
  thDate: { en: 'Date', ar: 'التاريخ', ru: 'Date', de: 'Date', it: 'Date', hi: 'Date', ur: 'Date', ja: 'Date', zh: 'Date' },
  thCounterparty: { en: 'Counterparty', ar: 'الطرف', ru: 'Counterparty', de: 'Counterparty', it: 'Counterparty', hi: 'Counterparty', ur: 'Counterparty', ja: 'Counterparty', zh: 'Counterparty' },
  thReference: { en: 'Reference', ar: 'المرجع', ru: 'Reference', de: 'Reference', it: 'Reference', hi: 'Reference', ur: 'Reference', ja: 'Reference', zh: 'Reference' },
  thType: { en: 'Type', ar: 'النوع', ru: 'Type', de: 'Type', it: 'Type', hi: 'Type', ur: 'Type', ja: 'Type', zh: 'Type' },
  thAmount: { en: 'Amount', ar: 'المبلغ', ru: 'Amount', de: 'Amount', it: 'Amount', hi: 'Amount', ur: 'Amount', ja: 'Amount', zh: 'Amount' },
  thDesc: { en: 'Description', ar: 'البيان', ru: 'Description', de: 'Description', it: 'Description', hi: 'Description', ur: 'Description', ja: 'Description', zh: 'Description' },
  noIncome: { en: 'No income/sale ledger entries yet.', ar: 'لا قيود دخل بعد.', ru: 'No income', de: 'No income', it: 'No income', hi: 'No income', ur: 'No income', ja: 'No income', zh: 'No income' },
  estVol: { en: 'Est. upcoming volume', ar: 'الحجم المتوقع', ru: 'Est', de: 'Est', it: 'Est', hi: 'Est', ur: 'Est', ja: 'Est', zh: 'Est' },
  receivedLbl: { en: 'Received', ar: 'المستلم', ru: 'Received', de: 'Received', it: 'Received', hi: 'Received', ur: 'Received', ja: 'Received', zh: 'Received' },
  thSupplier: { en: 'Supplier', ar: 'المورد', ru: 'Supplier', de: 'Supplier', it: 'Supplier', hi: 'Supplier', ur: 'Supplier', ja: 'Supplier', zh: 'Supplier' },
  thTotal: { en: 'Total (SAR)', ar: 'الإجمالي (ر.س)', ru: 'Total', de: 'Total', it: 'Total', hi: 'Total', ur: 'Total', ja: 'Total', zh: 'Total' },
  thStatus: { en: 'Status', ar: 'الحالة', ru: 'Status', de: 'Status', it: 'Status', hi: 'Status', ur: 'Status', ja: 'Status', zh: 'Status' },
  noPOs: { en: 'No purchase orders yet.', ar: 'لا طلبات شراء بعد.', ru: 'No POs', de: 'No POs', it: 'No POs', hi: 'No POs', ur: 'No POs', ja: 'No POs', zh: 'No POs' },
  matCement: { en: 'Cement', ar: 'أسمنت', ru: 'Cement', de: 'Cement', it: 'Cement', hi: 'Cement', ur: 'Cement', ja: 'Cement', zh: 'Cement' },
  matSand: { en: 'Sand', ar: 'رمل', ru: 'Sand', de: 'Sand', it: 'Sand', hi: 'Sand', ur: 'Sand', ja: 'Sand', zh: 'Sand' },
  matGravel: { en: 'Gravel', ar: 'بحص', ru: 'Gravel', de: 'Gravel', it: 'Gravel', hi: 'Gravel', ur: 'Gravel', ja: 'Gravel', zh: 'Gravel' },
  matAdmix: { en: 'Admixture', ar: 'إضافات', ru: 'Admix', de: 'Admix', it: 'Admix', hi: 'Admix', ur: 'Admix', ja: 'Admix', zh: 'Admix' },

  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
  accountingLink: { en: '🔗 Accounting integration', ar: '🔗 ربط المحاسبة', ru: '🔗 Интеграция с бухгалтерией', de: '🔗 Buchhaltungsintegration', it: '🔗 Integrazione contabile', hi: '🔗 लेखांकन एकीकरण', ur: '🔗 اکاؤنٹنگ انٹیگریشن', ja: '🔗 会計連携', zh: '🔗 会计集成' },
  accountingSetup: { en: '⚙️ Setup integration', ar: '⚙️ إعداد الربط', ru: '⚙️ Настроить интеграцию', de: '⚙️ Integration einrichten', it: '⚙️ Configura integrazione', hi: '⚙️ एकीकरण सेट करें', ur: '⚙️ انٹیگریشن سیٹ کریں', ja: '⚙️ 連携の設定', zh: '⚙️ 设置集成' },

  // Customer Invoices
  customerInvoices: { en: 'Customer Invoices', ar: 'فواتير العملاء', ru: 'Счета клиентов', de: 'Kundenrechnungen', it: 'Fatture clienti', hi: 'ग्राहक चालान', ur: 'صارفین کے انوآئس', ja: '顧客請求書', zh: '客户发票' },
  thInvoiceNo: { en: 'Invoice No.', ar: 'رقم الفاتورة', ru: '№ счета', de: 'Rechnungsnr.', it: 'N. fattura', hi: 'चालान सं.', ur: 'انوآئس نمبر', ja: '請求書番号', zh: '发票号' },
  thDueDate: { en: 'Due Date', ar: 'تاريخ الاستحقاق', ru: 'Дата оплаты', de: 'Fälligkeitsdatum', it: 'Scadenza', hi: 'देय तिथि', ur: 'देय تاریخ', ja: '支払期日', zh: '到期日' },
  thActions: { en: 'Actions', ar: 'الإجراءات', ru: 'Действия', de: 'Aktionen', it: 'Azioni', hi: 'कार्य', ur: 'اعمال', ja: 'アクション', zh: '操作' },
  recordPayment: { en: 'Record Payment', ar: 'تسجيل سداد', ru: 'Записать оплату', de: 'Zahlung erfassen', it: 'Registra pagamento', hi: 'भुगतान रिकॉर्ड करें', ur: 'اداگی ریکارڈ کریں', ja: '支払い記録', zh: '记录付款' },
  issueZatca: { en: 'Issue ZATCA', ar: 'إصدار ZATCA', ru: 'Выдать ZATCA', de: 'ZATCA ausstellen', it: 'Emetti ZATCA', hi: 'ZATCA जारी करें', ur: 'ZATCA جاری کریں', ja: 'ZATCA発行', zh: '签发 ZATCA' },
  zatcaSettings: { en: 'ZATCA Settings', ar: 'إعدادات ZATCA', ru: 'Настройки ZATCA', de: 'ZATCA Einstellungen', it: 'Impostazioni ZATCA', hi: 'ZATCA सेटिंग्स', ur: 'ZATCA سیٹنگز', ja: 'ZATCA 設定', zh: 'ZATCA 设置' },
  noInvoices: { en: 'No invoices found', ar: 'لا توجد فواتير', ru: 'Счета не найдены', de: 'Keine Rechnungen', it: 'Nessuna fattura', hi: 'कोई चालान नहीं', ur: 'کوئی انوآئس نہیں', ja: '請求書が見つかりません', zh: '未找到发票' },
  noInvoicesHint: { en: 'No invoices for this period', ar: 'لا توجد فواتير لهذه الفترة', ru: 'Нет счетов за этот период', de: 'Keine Rechnungen für diesen Zeitraum', it: 'Nessuna fattura per questo periodo', hi: 'इस अवधि के लिए कोई चालान नहीं', ur: 'اس دور کے لئے کوئی انوآئس نہیں', ja: 'この期間の請求書はありません', zh: '此期间没有发票' },
  refresh: { en: 'Refresh', ar: 'تحديث', ru: 'Обновить', de: 'Aktualisieren', it: 'Aggiorna', hi: 'रीफ्रेश', ur: 'رفریش', ja: '更新', zh: '刷新' },
  close: { en: 'Close', ar: 'إغلاق', ru: 'Закрыть', de: 'Schließen', it: 'Chiudi', hi: 'बंद करें', ur: 'بند کریں', ja: '閉じる', zh: '关闭' },
};