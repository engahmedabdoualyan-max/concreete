import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  madeLine: { en: 'Ready-mix concrete and blocks manufacturing', ar: 'صناعة خرسانة جاهزة وبلوكات', ru: 'Производство товарного бетона и блоков', de: 'Transportbeton- und Blockherstellung', it: 'Produzione di calcestruzzo preconfezionato e blocchi', hi: 'रेडी-मिक्स कंक्रीट और ब्लॉक निर्माण', ur: 'ریڈی مکس کنکریٹ اور بلاکس کی تیاری', ja: '生コン・ブロックの製造', zh: '预拌混凝土和砌块生产' },
  cityLine: { en: 'Riyadh - Second Industrial City', ar: 'الرياض - المنطقة الصناعية الثانية', ru: 'Эр-Рияд - Второй промышленный город', de: 'Riad - Zweite Industriestadt', it: 'Riyadh - Seconda città industriale', hi: 'रियाद - दूसरा औद्योगिक शहर', ur: 'ریاض - دوسرا صنعتی شہر', ja: 'リヤド - 第2工業団地', zh: '利雅得 - 第二工业城' },
  invoice: { en: 'Invoice', ar: 'فاتورة', ru: 'Счёт', de: 'Rechnung', it: 'Fattura', hi: 'चालान', ur: 'انوائس', ja: '請求書', zh: '发票' },
  customerL: { en: 'Customer:', ar: 'العميل:', ru: 'Клиент:', de: 'Kunde:', it: 'Cliente:', hi: 'ग्राहक:', ur: 'صارف:', ja: '顧客:', zh: '客户：' },
  customerCodeL: { en: 'Customer code:', ar: 'كود العميل:', ru: 'Код клиента:', de: 'Kundencode:', it: 'Codice cliente:', hi: 'ग्राहक कोड:', ur: 'صارف کوڈ:', ja: '顧客コード:', zh: '客户代码：' },
  phoneL: { en: 'Phone:', ar: 'الهاتف:', ru: 'Телефон:', de: 'Telefon:', it: 'Telefono:', hi: 'फ़ोन:', ur: 'فون:', ja: '電話:', zh: '电话：' },
  projectL: { en: 'Project:', ar: 'المشروع:', ru: 'Проект:', de: 'Projekt:', it: 'Progetto:', hi: 'प्रोजेक्ट:', ur: 'پروجیکٹ:', ja: 'プロジェクト:', zh: '项目：' },
  elementL: { en: 'Element:', ar: 'العنصر:', ru: 'Элемент:', de: 'Element:', it: 'Elemento:', hi: 'तत्व:', ur: 'عنصر:', ja: '部材:', zh: '构件：' },
  mixL: { en: 'Mix:', ar: 'الخلطة:', ru: 'Смесь:', de: 'Mischung:', it: 'Miscela:', hi: 'मिक्स:', ur: 'مکس:', ja: '調合:', zh: '配合比：' },
  deliveryTicket: { en: 'Delivery ticket:', ar: 'تذكرة التسليم:', ru: 'Транспортная накладная:', de: 'Lieferschein:', it: 'Ticket di consegna:', hi: 'डिलीवरी टिकट:', ur: 'ڈیلیوری ٹکٹ:', ja: '納品伝票:', zh: '交货单：' },
  truckNo: { en: 'Truck number:', ar: 'رقم الشاحنة:', ru: '№ грузовика:', de: 'LKW-Nummer:', it: 'Numero camion:', hi: 'ट्रक नंबर:', ur: 'ٹرک نمبر:', ja: 'トラック番号:', zh: '卡车号：' },
  descHead: { en: 'Description', ar: 'البيان', ru: 'Описание', de: 'Beschreibung', it: 'Descrizione', hi: 'विवरण', ur: 'تفصیل', ja: '品目', zh: '说明' },
  qtyHead: { en: 'Qty', ar: 'الكمية', ru: 'Кол-во', de: 'Menge', it: 'Qtà', hi: 'मात्रा', ur: 'مقدار', ja: '数量', zh: '数量' },
  priceHead: { en: 'Price', ar: 'السعر', ru: 'Цена', de: 'Preis', it: 'Prezzo', hi: 'मूल्य', ur: 'قیمت', ja: '単価', zh: '单价' },
  totalHead: { en: 'Total', ar: 'الإجمالي', ru: 'Итого', de: 'Gesamt', it: 'Totale', hi: 'कुल', ur: 'کل', ja: '合計', zh: '合计' },
  concreteItem: { en: 'Concrete {type} psi', ar: 'خرسانة {type} psi', ru: 'Бетон {type} psi', de: 'Beton {type} psi', it: 'Calcestruzzo {type} psi', hi: 'कंक्रीट {type} psi', ur: 'کنکریٹ {type} psi', ja: 'コンクリート {type} psi', zh: '混凝土 {type} psi' },
  blockItem: { en: 'Cement block', ar: 'بلوك اسمنتي', ru: 'Цементный блок', de: 'Zementblock', it: 'Blocco di cemento', hi: 'सीमेंट ब्लॉक', ur: 'سیمنٹ بلاک', ja: 'セメントブロック', zh: '水泥砌块' },
  unitM3: { en: 'm³', ar: 'م³', ru: 'м³', de: 'm³', it: 'm³', hi: 'm³', ur: 'm³', ja: 'm³', zh: 'm³' },
  unitBlock: { en: 'block', ar: 'بلوك', ru: 'блок', de: 'Block', it: 'blocco', hi: 'ब्लॉक', ur: 'بلاک', ja: 'ブロック', zh: '块' },
  taxLabel: { en: 'VAT:', ar: 'ضريبة:', ru: 'НДС:', de: 'MwSt.:', it: 'IVA:', hi: 'वैट:', ur: 'ٹیکس:', ja: '税:', zh: '税率：' },
  vat15: { en: '15% (Saudi Arabia)', ar: '15% (السعودية)', ru: '15% (Саудовская Аравия)', de: '15% (Saudi-Arabien)', it: '15% (Arabia Saudita)', hi: '15% (सऊदी अरब)', ur: '15% (سعودی عرب)', ja: '15%（サウジアラビア）', zh: '15%（沙特阿拉伯）' },
  vat14: { en: '14% (Egypt)', ar: '14% (مصر)', ru: '14% (Египет)', de: '14% (Ägypten)', it: '14% (Egitto)', hi: '14% (मिस्र)', ur: '14% (مصر)', ja: '14%（エジプト）', zh: '14%（埃及）' },
  vat0: { en: '0%', ar: '0%', ru: '0%', de: '0%', it: '0%', hi: '0%', ur: '0%', ja: '0%', zh: '0%' },
  subTotal: { en: 'Subtotal:', ar: 'المجموع:', ru: 'Подытог:', de: 'Zwischensumme:', it: 'Subtotale:', hi: 'उप-योग:', ur: 'ذیلی کل:', ja: '小計:', zh: '小计：' },
  vatAmount: { en: 'VAT ({rate}%):', ar: 'الضريبة ({rate}%):', ru: 'НДС ({rate}%):', de: 'MwSt. ({rate}%):', it: 'IVA ({rate}%):', hi: 'वैट ({rate}%):', ur: 'ٹیکس ({rate}%):', ja: '税（{rate}%）：', zh: '增值税（{rate}%）：' },
  grandTotal: { en: 'Total:', ar: 'الإجمالي:', ru: 'Итого:', de: 'Gesamt:', it: 'Totale:', hi: 'कुल:', ur: 'کل:', ja: '合計:', zh: '合计：' },
  verifyHint: { en: 'Verify the invoice electronically via the QR code', ar: 'تحقق من صحة الفاتورة إلكترونياً عبر رمز QR', ru: 'Проверьте счёт электронно через QR-код', de: 'Rechnung elektronisch über den QR-Code prüfen', it: 'Verifica la fattura elettronicamente tramite il codice QR', hi: 'QR कोड के ज़रिए चालान की इलेक्ट्रॉनिक रूप से पुष्टि करें', ur: 'QR کوڈ کے ذریعے انوائس کی الیکٹرانک تصدیق کریں', ja: 'QRコードで請求書を電子的に検証', zh: '通过二维码电子验证发票' },
  print: { en: '🖨️ Print', ar: '🖨️ طباعة', ru: '🖨️ Печать', de: '🖨️ Drucken', it: '🖨️ Stampa', hi: '🖨️ प्रिंट', ur: '🖨️ پرنٹ', ja: '🖨️ 印刷', zh: '🖨️ 打印' },
  close: { en: 'Close', ar: 'إغلاق', ru: 'Закрыть', de: 'Schließen', it: 'Chiudi', hi: 'बंद करें', ur: 'بند کریں', ja: '閉じる', zh: '关闭' },
};

export function useEInvoiceDict() {
  return usePageDict(DICT);
}