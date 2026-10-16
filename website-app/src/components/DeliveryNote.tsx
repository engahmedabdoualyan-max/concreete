/**
 * ============================================================
 *  FIMTO SOFT — Priced delivery note (replaces the Access printout)
 * ============================================================
 *  Dispatcher-friendly: pick a trip (auto-fills truck/driver/qty/
 *  site/client from the linked order) or enter manually, set the
 *  price per m³ once per mix (remembered) — ticket number, date/time,
 *  VAT and totals are automatic. One-page print on the company
 *  letterhead + Excel export + saved history.
 * ============================================================
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { usePageDict, type PageDict } from '../i18n/pageDict';
import { api } from '../api/client';
import { loadCustomers, loadPlantProfile, loadInventory, saveInventory, loadDeliveryNotes, saveDeliveryNotes } from '../firebase/firestore';
import { mergeByKey, pullCloud, pullObject, pushCloud } from '../lib/reportSync';
import { shareImageViaLink } from '../lib/sharePdf';
import labEmblem from '../assets/lab-emblem.jpg';
import labFooter from '../assets/lab-footer.jpg';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Standalone printable delivery-note document (inline styles + data URIs only). */
function buildDnDoc(p: DNPayload, emblem: string, footer: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:14px;font-family:Arial,Tahoma,sans-serif;color:#111;background:#fff;">` +
    `<div style="border:2px solid #111;padding:12px;max-width:770px;margin:0 auto;" dir="ltr">` +
    `<table style="width:100%;border-collapse:collapse;"><tr>` +
    `<td style="width:33%;font-size:9px;line-height:1.55;text-align:center;vertical-align:top;color:#064e3b">` +
    `<b style="font-size:11px">ALMOTWR FACTORY</b><br>For Block &amp; Ready Mix<br>` +
    `Mob.: 0509270022 - 0509270011 - 0509270033<br>Tax No.: 30112571300003<br>` +
    `Hafar Al Batin - Industrial</td>` +
    `<td style="width:26%;text-align:center;vertical-align:top"><img src="${emblem}" style="height:78px;"></td>` +
    `<td style="width:33%;font-size:9px;line-height:1.65;text-align:center;vertical-align:top;color:#064e3b" dir="rtl">` +
    `<b style="font-size:13px">المصنع المطور</b><br>للبلك والخرسانة الجاهزة<br>` +
    `<span dir="ltr">0509270022 - 0509270011 - 0509270033 :جوال</span><br>الرقم الضريبي : 30112571300003<br>` +
    `حفرالباطن - المنطقة الصناعية</td>` +
    `</tr></table>` +
    `<div style="border:1px solid #111;text-align:center;font-weight:bold;font-size:13px;margin-top:8px;padding:4px;">مستند استلام خرسانة | Concrete receipt document &nbsp;&nbsp; № ${esc(p.ticket)}</div>` +
    `<table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px;">` +
    `<tr><td style="padding:2px"><b>TICKET NO</b> ............ ${esc(p.ticket)}</td>` +
    `<td style="padding:2px"><b>DATE / TIME</b> ............ ${esc(p.date)} — ${esc(p.time)}</td></tr>` +
    `<tr><td style="padding:2px"><b>CLIENT</b> ............ ${esc(p.client)}</td>` +
    `<td style="padding:2px"><b>REP</b> ............ ${esc(p.rep) || '—'}</td></tr>` +
    `<tr><td style="padding:2px"><b>PHONE</b> ............ ${esc(p.phone) || '—'}</td></tr>` +
    `<tr><td style="padding:2px"><b>PROJECT</b> ............ ${esc(p.project) || '—'}</td>` +
    `<td style="padding:2px"><b>SITE</b> ............ ${esc(p.site) || '—'}</td></tr>` +
    `<tr><td style="padding:2px"><b>TRUCK</b> ............ ${esc(p.truck) || '—'}</td>` +
    `<td style="padding:2px"><b>DRIVER</b> ............ ${esc(p.driver) || '—'}</td></tr>` +
    `<tr><td style="padding:2px"><b>PUMP</b> ............ ${esc(p.pump) || '—'}</td>` +
    `<td style="padding:2px"><b>PLANT</b> ............ ${esc(p.plantNo) || '—'}</td></tr>` +
    `<tr><td style="padding:2px"><b>ORDER</b> ............ ${esc(p.orderId) || '—'}</td>` +
    `<td style="padding:2px"><b>LOAD / ARRIVE</b> ............ ${esc(p.departTime) || '—'} → ${esc(p.arriveTime) || '—'}</td></tr>` +
    `</table>` +
    `<table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px;">` +
    `<tr><th style="border:1px solid #111;padding:4px">MIX</th>` +
    `<th style="border:1px solid #111;padding:4px">QTY m³</th>` +
    `<th style="border:1px solid #111;padding:4px">PRICE</th>` +
    `<th style="border:1px solid #111;padding:4px">TOTAL SAR</th></tr>` +
    `<tr><td style="border:1px solid #111;padding:4px;text-align:center;font-weight:bold">${esc(p.mix)}</td>` +
    `<td style="border:1px solid #111;padding:4px;text-align:center">${p.qty}</td>` +
    `<td style="border:1px solid #111;padding:4px;text-align:center">${p.price.toFixed(2)}</td>` +
    `<td style="border:1px solid #111;padding:4px;text-align:center">${p.sub.toFixed(2)}</td></tr>` +
    `<tr><td style="border:1px solid #111;padding:4px;text-align:center;font-weight:bold" colspan="3">VAT ${p.vatRate}%</td>` +
    `<td style="border:1px solid #111;padding:4px;text-align:center">${p.vat.toFixed(2)}</td></tr>` +
    `<tr><td style="border:1px solid #111;padding:4px;text-align:center;font-weight:bold;font-size:12px" colspan="3">GRAND TOTAL SAR</td>` +
    `<td style="border:1px solid #111;padding:4px;text-align:center;font-weight:bold;font-size:12px">${p.grand.toFixed(2)}</td></tr>` +
    `</table>` +
    (p.notes ? `<p style="font-size:10.5px;" dir="rtl"><b>ملاحظات:</b> ${esc(p.notes)}</p>` : '') +
    `<div style="border:1px solid #7f1d1d;background:#fef2f2;padding:5px;margin-top:6px;font-size:9.5px;" dir="ltr">` +
    `<b style="color:#7f1d1d">It is strictly forbidden to add water to the mixture on site due to its negative effect on quality.</b><br>` +
    `<b style="color:#7f1d1d" dir="rtl">ممنوع منعاً باتاً إضافة الماء للخلطة في الموقع لتأثيره السلبي على الجودة.</b></div>` +
    `<table style="width:100%;font-size:10.5px;margin-top:14px;" dir="rtl"><tr>` +
    `<td>المشغل: ${esc(p.operatorName) || '....................'}</td><td>المندوب: ${esc(p.rep) || '....................'}</td><td>العميل: ${esc(p.client) || '....................'}</td>` +
    `</tr></table>` +
    `<img src="${footer}" style="width:100%;margin-top:8px;">` +
    `</div></body></html>`;
}
export interface DNTrip {
  id: number | string;
  code: string;
  driver: string;
  qty: number;
  siteName: string;
  projectName: string;
  date: string;
  orderId?: string;
  pump?: string;
}
export interface DNOrder {
  id: string;
  orderNo?: string;
  customerName: string;
  customerPhone: string;
  projectName: string;
  projectLocation: string;
  quantity: number;
  concreteType: string;
  status?: string;
  salesRep?: string;
  plantNo?: string;
  operatorName?: string;
  accountStatus?: string;
  debtStatus?: string;
}

interface DNPayload {
  ticket: string;
  date: string;
  time: string;
  client: string;
  phone: string;
  project: string;
  site: string;
  mix: string;
  qty: number;
  price: number;
  vatRate: number;
  sub: number;
  vat: number;
  grand: number;
  truck: string;
  pump: string;
  driver: string;
  rep: string;
  notes: string;
  company: string;
  orderId: string;
  plantNo: string;
  operatorName: string;
  departTime: string;
  arriveTime: string;
  posted: boolean;
}
interface SavedDN extends DNPayload {
  createdAt: string;
}

export function useDNDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  title: { en: '🧾 Delivery note', ar: '🧾 مذكرة تسليم', ur: '🧾 ڈیلیوری نوٹ', ru: '🧾 Накладная', de: '🧾 Lieferschein', it: '🧾 Bolla', hi: '🧾 डिलीवरी नोट', ja: '🧾 納品書', zh: '🧾 送货单' },
  subtitle: { en: 'Pick a trip — client, site, mix and qty fill in. Set the price once per mix.', ar: 'اختر الرحلة — العميل والموقع والخلطة والكمية تُملأ تلقائياً. حدد السعر مرة لكل خلطة.', ur: 'ٹرپ منتخب کریں — کلائنٹ، سائٹ، مکس اور مقدار خودکار۔ فی مکس قیمت ایک بار مقرر کریں۔', ru: 'Выберите рейс — остальное подставится. Цена задаётся один раз на смесь.', de: 'Tour wählen — Rest wird ergänzt. Preis einmal je Mischung.', it: 'Scegli il viaggio — il resto si compila. Prezzo una volta per miscela.', hi: 'ट्रिप चुनें — बाकी स्वतः भर जाएगा। प्रति मिक्स एक बार मूल्य तय करें।', ja: '配送を選択 — 残りは自動入力。単価は配合ごとに一度だけ。', zh: '选择车次 — 其余自动填写。每个配合比定价一次。' },
  trip: { en: 'Trip (or manual)', ar: 'الرحلة (أو يدوي)', ur: 'ٹرپ (یا دستی)', ru: 'Рейс (или вручную)', de: 'Tour (oder manuell)', it: 'Viaggio (o manuale)', hi: 'ट्रिप (या मैनुअल)', ja: '配送（または手入力）', zh: '车次（或手动）' },
  manual: { en: '✍️ Manual entry', ar: '✍️ إدخال يدوي', ur: '✍️ دستی اندراج', ru: '✍️ Вручную', de: '✍️ Manuell', it: '✍️ Manuale', hi: '✍️ मैनुअल', ja: '✍️ 手入力', zh: '✍️ 手动' },
  client: { en: 'Client', ar: 'العميل', ur: 'کلائنٹ', ru: 'Клиент', de: 'Kunde', it: 'Cliente', hi: 'ग्राहक', ja: '顧客', zh: '客户' },
  phone: { en: 'Phone', ar: 'الهاتف', ur: 'فون', ru: 'Телефон', de: 'Telefon', it: 'Telefono', hi: 'फोन', ja: '電話', zh: '电话' },
  project: { en: 'Project', ar: 'المشروع', ur: 'پروجیکٹ', ru: 'Проект', de: 'Projekt', it: 'Progetto', hi: 'परियोजना', ja: 'プロジェクト', zh: '项目' },
  site: { en: 'Site', ar: 'الموقع', ur: 'سائٹ', ru: 'Объект', de: 'Baustelle', it: 'Cantiere', hi: 'साइट', ja: '現場', zh: '工地' },
  mix: { en: 'Mix', ar: 'الخلطة', ur: 'مکس', ru: 'Смесь', de: 'Mischung', it: 'Miscela', hi: 'मिक्स', ja: '配合', zh: '配合比' },
  qty: { en: 'Qty (m³)', ar: 'الكمية (م³)', ur: 'مقدار (م³)', ru: 'Объём (м³)', de: 'Menge (m³)', it: 'Qtà (m³)', hi: 'मात्रा (m³)', ja: '数量 (m³)', zh: '数量 (m³)' },
  price: { en: 'Price / m³ (SAR)', ar: 'سعر المتر (ر.س)', ur: 'فی میٹر قیمت (ریال)', ru: 'Цена / м³ (SAR)', de: 'Preis / m³ (SAR)', it: 'Prezzo / m³ (SAR)', hi: 'प्रति m³ मूल्य (SAR)', ja: '単価 /m³ (SAR)', zh: '单价 /m³ (SAR)' },
  vat: { en: 'VAT %', ar: 'الضريبة %', ur: 'ٹیکس %', ru: 'НДС %', de: 'MwSt %', it: 'IVA %', hi: 'वैट %', ja: '税 %', zh: '税 %' },
  truck: { en: 'Truck', ar: 'الشاحنة', ur: 'ٹرک', ru: 'Миксер', de: 'Fahrzeug', it: 'Betoniera', hi: 'ट्रक', ja: 'トラック', zh: '搅拌车' },
  pump: { en: 'Pump', ar: 'المضخة (البمب)', ur: 'پمپ', ru: 'Насос', de: 'Pumpe', it: 'Pompa', hi: 'पंप', ja: 'ポンプ', zh: '泵车' },
  driver: { en: 'Driver', ar: 'السائق', ur: 'ڈرائیور', ru: 'Водитель', de: 'Fahrer', it: 'Autista', hi: 'ड्राइवर', ja: '運転手', zh: '司机' },
  rep: { en: 'Sales rep', ar: 'المندوب', ur: 'سیلز نمائندہ', ru: 'Менеджер', de: 'Vertreter', it: 'Venditore', hi: 'सेल्स प्रतिनिधि', ja: '営業担当', zh: '销售员' },
  notes: { en: 'Notes', ar: 'ملاحظات', ur: 'نوٹس', ru: 'Примечания', de: 'Bemerkungen', it: 'Note', hi: 'टिप्पणियां', ja: '備考', zh: '备注' },
  subtotal: { en: 'Subtotal', ar: 'الإجمالي الفرعي', ur: 'ذیلی میزان', ru: 'Подытог', de: 'Zwischensumme', it: 'Subtotale', hi: 'उप-योग', ja: '小計', zh: '小计' },
  vatAmt: { en: 'VAT', ar: 'الضريبة', ur: 'ٹیکس', ru: 'НДС', de: 'MwSt', it: 'IVA', hi: 'वैट', ja: '税額', zh: '税额' },
  grand: { en: 'Grand total (SAR)', ar: 'الإجمالي (ر.س)', ur: 'کل میزان (ریال)', ru: 'Итого (SAR)', de: 'Gesamt (SAR)', it: 'Totale (SAR)', hi: 'कुल (SAR)', ja: '合計 (SAR)', zh: '总计 (SAR)' },
  save: { en: '💾 Save + print no.', ar: '💾 حفظ برقم', ur: '💾 نمبر کے ساتھ محفوظ کریں', ru: '💾 Сохранить', de: '💾 Speichern', it: '💾 Salva', hi: '💾 सहेजें', ja: '💾 保存', zh: '💾 保存' },
  saved: { en: 'Delivery note saved', ar: 'تم حفظ مذكرة التسليم', ur: 'ڈیلیوری نوٹ محفوظ', ru: 'Накладная сохранена', de: 'Lieferschein gespeichert', it: 'Bolla salvata', hi: 'डिलीवरी नोट सहेजा गया', ja: '納品書を保存', zh: '已保存送货单' },
  needClient: { en: 'Enter the client first.', ar: 'أدخل العميل أولاً.', ur: 'پہلے کلائنٹ درج کریں۔', ru: 'Сначала укажите клиента.', de: 'Zuerst Kunden eingeben.', it: 'Inserire prima il cliente.', hi: 'पहले ग्राहक दर्ज करें।', ja: 'まず顧客を入力。', zh: '请先输入客户。' },
  needPrice: { en: 'Enter the price per m³ first.', ar: 'أدخل سعر المتر أولاً.', ur: 'پہلے فی میٹر قیمت درج کریں۔', ru: 'Сначала укажите цену.', de: 'Zuerst Preis eingeben.', it: 'Inserire prima il prezzo.', hi: 'पहले मूल्य दर्ज करें।', ja: 'まず単価を入力。', zh: '请先输入单价。' },
  print: { en: '🖨️ Print / PDF', ar: '🖨️ طباعة / PDF', ur: '🖨️ پرنٹ / PDF', ru: '🖨️ Печать / PDF', de: '🖨️ Drucken / PDF', it: '🖨️ Stampa / PDF', hi: '🖨️ प्रिंट / PDF', ja: '🖨️ 印刷 / PDF', zh: '🖨️ 打印 / PDF' },
  excel: { en: '📊 Excel', ar: '📊 إكسل', ur: '📊 ایکسل', ru: '📊 Excel', de: '📊 Excel', it: '📊 Excel', hi: '📊 एक्सेल', ja: '📊 Excel', zh: '📊 表格' },
  history: { en: 'Saved notes', ar: 'المذكرات المحفوظة', ur: 'محفوظ نوٹس', ru: 'Сохранённые', de: 'Gespeichert', it: 'Salvate', hi: 'सहेजे गए', ja: '保存済み', zh: '已保存' },
  none: { en: 'No saved notes yet.', ar: 'لا توجد مذكرات بعد.', ur: 'ابھی کچھ نہیں۔', ru: 'Пока пусто.', de: 'Noch keine.', it: 'Ancora nessuno.', hi: 'अभी कुछ नहीं।', ja: 'まだありません。', zh: '暂无。' },
  reprint: { en: 'View', ar: 'عرض', ur: 'دیکھیں', ru: 'Открыть', de: 'Ansehen', it: 'Vedi', hi: 'देखें', ja: '表示', zh: '查看' },
  sar: { en: 'SAR', ar: 'ر.س', ur: 'ریال', ru: 'SAR', de: 'SAR', it: 'SAR', hi: 'SAR', ja: 'SAR', zh: 'SAR' },
  whatsapp: { en: '📤 Share on WhatsApp', ar: '📤 مشاركة واتساب', ur: '📤 واٹس ایپ پر شیئر کریں', ru: '📤 Поделиться в WhatsApp', de: '📤 Per WhatsApp teilen', it: '📤 Condividi su WhatsApp', hi: '📤 WhatsApp पर साझा करें', ja: '📤 WhatsAppで共有', zh: '📤 分享到WhatsApp' },
  sharing: { en: '⏳ Preparing PDF…', ar: '⏳ جاري تجهيز PDF…', ur: '⏳ PDF تیار ہو رہا ہے…', ru: '⏳ Готовим PDF…', de: '⏳ PDF wird erstellt…', it: '⏳ Preparo PDF…', hi: '⏳ PDF तैयार हो रहा है…', ja: '⏳ PDF作成中…', zh: '⏳ 正在生成PDF…' },
  sharedOk: { en: 'Shared successfully', ar: 'تمت المشاركة بنجاح', ur: 'کامیابی سے شیئر ہوا', ru: 'Отправлено', de: 'Geteilt', it: 'Condiviso', hi: 'साझा किया गया', ja: '共有しました', zh: '已分享' },
  downloadedNote: { en: 'PDF downloaded — attach it in WhatsApp.', ar: 'نُزّل الملف — أرفقه في واتساب.', ur: 'PDF ڈاؤن لوڈ ہو گئی — واٹس ایپ میں منسلک کریں۔', ru: 'PDF загружен — прикрепите его в WhatsApp.', de: 'PDF geladen — in WhatsApp anhängen.', it: 'PDF scaricato — allegalo su WhatsApp.', hi: 'PDF डाउनलोड हो गई — WhatsApp में संलग्न करें।', ja: 'PDFを保存しました — WhatsAppに添付してください。', zh: 'PDF已下载 — 请在WhatsApp中添加附件。' },
  waNumber: { en: 'WhatsApp no.', ar: 'رقم الواتساب', ur: 'واٹس ایپ نمبر', ru: 'Номер WhatsApp', de: 'WhatsApp-Nr.', it: 'N. WhatsApp', hi: 'व्हाट्सऐप नंबर', ja: 'WhatsApp番号', zh: 'WhatsApp号码' },
  needWaNumber: { en: 'PDF downloaded — enter a WhatsApp number to open the chat.', ar: 'نُزّل الملف — أدخل رقم الواتساب لفتح المحادثة.', ur: 'PDF ڈاؤن لوڈ ہو گئی — چیٹ کے لیے نمبر درج کریں۔', ru: 'PDF загружен — введите номер для чата.', de: 'PDF geladen — Nummer für Chat eingeben.', it: 'PDF scaricato — inserisci il numero per la chat.', hi: 'PDF डाउनलोड — चैट के लिए नंबर दर्ज करें।', ja: 'PDF保存済 — チャット用番号を入力。', zh: 'PDF已下载 — 输入号码以打开聊天。' },
  pdfFail: { en: 'Could not prepare the PDF — try again.', ar: 'تعذر تجهيز PDF — حاول مجدداً.', ur: 'PDF تیار نہیں ہو سکی — دوبارہ کوشش کریں۔', ru: 'Не удалось создать PDF — повторите.', de: 'PDF konnte nicht erstellt werden.', it: 'Impossibile creare il PDF — riprova.', hi: 'PDF तैयार नहीं हो सका — पुनः प्रयास करें।', ja: 'PDFを作成できませんでした。', zh: '无法生成PDF，请重试。' },
  paperCompany: { en: 'Company paper', ar: 'ورق الشركة', ur: 'کمپنی پیپر', ru: 'Фирменный бланк', de: 'Firmenpapier', it: 'Carta intestata', hi: 'कंपनी पेपर', ja: '会社用紙', zh: '公司抬头纸' },
  paperPlain: { en: 'Plain paper', ar: 'ورق عادي', ur: 'سادہ کاغذ', ru: 'Обычная бумага', de: 'Normales Papier', it: 'Carta semplice', hi: 'सादा कागज', ja: '普通紙', zh: '普通纸' },
  order: { en: 'Sales order', ar: 'طلب المبيعات', ur: 'سیلز آرڈر', ru: 'Заказ', de: 'Auftrag', it: 'Ordine', hi: 'सेल्स ऑर्डर', ja: '受注', zh: '销售订单' },
  noOrder: { en: '— no link —', ar: '— بدون ربط —', ur: '— کوئی ربط نہیں —', ru: '— без связи —', de: '— keine —', it: '— nessuno —', hi: '— कोई नहीं —', ja: '— なし —', zh: '— 不关联 —' },
  remaining: { en: 'Remaining', ar: 'المتبقي', ur: 'باقی', ru: 'Остаток', de: 'Rest', it: 'Rimanente', hi: 'शेष', ja: '残量', zh: '剩余' },
  balanceTitle: { en: 'Client balances (orders − delivered)', ar: 'أرصدة العملاء (الطلبات − المسلم)', ur: 'کلائنٹ بیلنس', ru: 'Балансы клиентов', de: 'Kundensalden', it: 'Saldi clienti', hi: 'ग्राहक शेष', ja: '顧客残量', zh: '客户余额' },
  driversTitle: { en: 'Driver, mixer & pump trips (for payroll)', ar: 'تربات السائقين والخلاطات والمضخات (للرواتب)', ur: 'ڈرائیور ٹرپس (تنخواہ کے لیے)', ru: 'Рейсы водителей', de: 'Fahrer-Touren', it: 'Viaggi autisti', hi: 'ड्राइवर ट्रिप', ja: '運転手配送回数', zh: '司机车次' },
  exportDrivers: { en: '📊 Drivers sheet', ar: '📊 كشف التربات', ur: '📊 ڈرائیور شیٹ', ru: '📊 Ведомость', de: '📊 Übersicht', it: '📊 Prospetto', hi: '📊 शीट', ja: '📊 集計表', zh: '📊 明细表' },
  tripsCol: { en: 'trips', ar: 'تربة', ur: 'ٹرپ', ru: 'рейсы', de: 'Touren', it: 'viaggi', hi: 'ट्रिप', ja: '回', zh: '车次' },
  autoPost: { en: 'Post to accounts automatically', ar: 'ترحيل تلقائي للحسابات', ur: 'خودکار اکاؤنٹس اندراج', ru: 'Проводить в учёт', de: 'Auto in Buchhaltung', it: 'Registra in contabilità', hi: 'खातों में स्वतः दर्ज करें', ja: '会計へ自動転記', zh: '自动过账' },
  postedOk: { en: 'posted', ar: 'مُرحّلة', ur: 'درج شدہ', ru: 'проведено', de: 'gebucht', it: 'registrato', hi: 'दर्ज', ja: '転記済', zh: '已过账' },
  postedWait: { en: 'not posted', ar: 'غير مُرحّلة', ur: 'درج نہیں', ru: 'не проведено', de: 'offen', it: 'da registrare', hi: 'लंबित', ja: '未転記', zh: '未过账' },
  departTime: { en: 'Loading time', ar: 'وقت التحميل', ur: 'لوڈنگ وقت', ru: 'Погрузка', de: 'Beladung', it: 'Carico', hi: 'लोडिंग समय', ja: '積込時刻', zh: '装车时间' },
  arriveTime: { en: 'Arrival time', ar: 'وقت الوصول', ur: 'پہنچنے کا وقت', ru: 'Прибытие', de: 'Ankunft', it: 'Arrivo', hi: 'पहुंच समय', ja: '到着時刻', zh: '到达时间' },
  durMin: { en: 'road', ar: 'الطريق', ur: 'راستہ', ru: 'в пути', de: 'Fahrt', it: 'viaggio', hi: 'रास्ता', ja: '走行', zh: '路途' },
};

// Demo clients collected from the operations/lab archives (booking sheets +
// lab report filenames) — offered only until the real customer file arrives,
// and only when no sales customers exist yet.
const DEMO_CLIENTS = [
  'ابو راكان فيصل الشمري', 'احمد مفرح غريب الحربي', 'البيوت الفاخرة جاسر زيد جاسر المطيري',
  'البيوت الفاخرة', 'العماره', 'النيرة', 'بتيل ق102 حي الروضة جدوع عاصي عواد الجميلي',
  'تقرير شباب', 'جدوع عاصي الجميلي', 'حمد عواد', 'خيرات العماره',
  'سعود بن صالح بن زلفان المطيري', 'محمد حسن عبدالله دغريري', 'محمد خلوي بن خالد الشمري',
  'ا / مدني ابراهيم', 'بدر مشعف المطرقة 3', 'برحة حنيفا', 'تركي خلف / فداع صياح طرجم',
  'جمال غالي المطيري', 'حمد عواد الحريجي / عيد ربيع', 'حمدان سالم الشمري',
  'خلف سعود خلف الزقعاني السهلي', 'راضي ابو عبدالله', 'رجب محمد عبدالقادر',
  'سلطان ساير العنزي', 'شركة بناء التعليمية', 'طلال الداني / ساير عواد الحريجي',
  'طلال الداني / كواكب', 'عبدالله محمد المنيعي النادر / الشروق', 'علي حسن الشمري',
  'عوض عطا لله غضيبان الرخيمي المطيري', 'فهد فرحان العتيبي', 'فيصل محمد البزالي',
  'مؤسسة سعود حمدان / ابو علي', 'مؤسسه شروق', 'محمد / ابو زياد', 'محمد الثواب',
  'محمد عبدالله المنيع / الشروق', 'محمد علي هلال / المستودع', 'محمد مشعان',
  'مسجد ابو تركي الخالدية', 'مشعل مضحي الحربي', 'مشعل نغيمش الشمري',
  'مصنع مجال // الفاء', 'نايف محمد الثواب', 'نايل مسير نايل', 'نيو تاون اسبورت',
];

// Fallback mix codes when no recipes are stored yet for this user.
const DEFAULT_MIXES = ['C25', 'C30', 'C35', 'C40'];
// Fallback batch weights (kg per m³) matching the defaults above.
const DEFAULT_WEIGHTS: Record<string, { cement: number; sand: number; gravel: number; admixture: number }> = {
  C25: { cement: 320, sand: 780, gravel: 1080, admixture: 4.8 },
  C30: { cement: 350, sand: 750, gravel: 1100, admixture: 5.5 },
  C35: { cement: 380, sand: 720, gravel: 1120, admixture: 6.2 },
  C40: { cement: 420, sand: 680, gravel: 1140, admixture: 7.5 },
};

const RED_IF_EMPTY: CSSProperties = { borderColor: 'rgba(239,68,68,.75)', background: 'rgba(239,68,68,.07)' };
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const todayISO = () => new Date().toISOString().split('T')[0];
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-end gap-1 text-[10.5px] leading-5">
      <span className="font-bold whitespace-nowrap" dir="ltr">{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-500 text-center px-1">{children}</span>
    </div>
  );
}

function DNSheet({ p, paper }: { p: DNPayload; paper: 'company' | 'plain' }) {
  return (
    <div className="bg-white text-slate-900 max-w-[800px] mx-auto border-2 border-slate-900 p-4" dir="ltr">
      {paper === 'company' ? (
        <div className="flex justify-between items-start text-center gap-2 border-b-4 border-emerald-700 pb-2">
          <div className="text-[8.5px] leading-[1.55] w-[33%] text-emerald-900" dir="ltr">
            <p className="font-black text-[11.5px] tracking-wide">ALMOTWR FACTORY</p>
            <p className="font-bold">For Block &amp; Ready Mix</p>
            <p className="mt-[3px]">Mob.: 0509270022 - 0509270011 - 0509270033</p>
            <p>Tax No.: 30112571300003</p>
            <p>Hafar Al Batin - Industrial</p>
          </div>
          <div className="w-[26%] flex justify-center pt-[2px]">
            <img src={labEmblem} alt="AlMotwr" style={{ height: 82, width: 'auto', objectFit: 'contain' }} />
          </div>
          <div className="text-[8.5px] leading-[1.7] w-[33%] text-emerald-900" dir="rtl">
            <p className="font-black text-[15px]">المصنع المطور</p>
            <p className="font-bold">للبلك والخرسانة الجاهزة</p>
            <p className="mt-[3px]" dir="ltr">0509270022 - 0509270011 - 0509270033 :جوال</p>
            <p>الرقم الضريبي : 30112571300003</p>
            <p>حفرالباطن - المنطقة الصناعية</p>
          </div>
        </div>
      ) : (
        <p className="font-black text-lg" dir="rtl">{p.company}</p>
      )}
      <div className="border border-slate-900 mt-2 py-1 px-2 flex items-center justify-between" dir="rtl">
        <span className="font-black text-[13px]">مستند استلام خرسانة | Concrete receipt document</span>
        <span className="font-black text-[13px]" dir="ltr">№ {p.ticket}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-[3px] mt-2 text-[10.5px]">
        <SheetRow label="TICKET NO">{p.ticket}</SheetRow>
        <SheetRow label="DATE / TIME">{p.date} — {p.time}</SheetRow>
        <SheetRow label="CLIENT">{p.client}</SheetRow>
        <SheetRow label="REP">{p.rep || '—'}</SheetRow>
        <SheetRow label="PHONE">{p.phone || '—'}</SheetRow>
        <SheetRow label="PROJECT">{p.project || '—'}</SheetRow>
        <SheetRow label="SITE">{p.site || '—'}</SheetRow>
        <SheetRow label="TRUCK">{p.truck || '—'}</SheetRow>
        <SheetRow label="PUMP">{p.pump || '—'}</SheetRow>
        <SheetRow label="DRIVER">{p.driver || '—'}</SheetRow>
        <SheetRow label="ORDER">{p.orderId || '—'}</SheetRow>
        <SheetRow label="LOAD / ARRIVE">{p.departTime || '—'} → {p.arriveTime || '—'}</SheetRow>
      </div>
      <table className="w-full text-[10.5px] mt-2 border-collapse" dir="ltr">
        <thead>
          <tr className="font-bold">
            <th className="border border-slate-900 p-1">MIX</th>
            <th className="border border-slate-900 p-1">QTY m³</th>
            <th className="border border-slate-900 p-1">PRICE</th>
            <th className="border border-slate-900 p-1">TOTAL SAR</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-center">
            <td className="border border-slate-900 p-1 font-bold">{p.mix}</td>
            <td className="border border-slate-900 p-1">{p.qty}</td>
            <td className="border border-slate-900 p-1">{f2(p.price)}</td>
            <td className="border border-slate-900 p-1">{f2(p.sub)}</td>
          </tr>
          <tr className="text-center">
            <td className="border border-slate-900 p-1 font-bold" colSpan={3}>VAT {p.vatRate}%</td>
            <td className="border border-slate-900 p-1">{f2(p.vat)}</td>
          </tr>
          <tr className="text-center font-black text-[12px]">
            <td className="border border-slate-900 p-1" colSpan={3}>GRAND TOTAL SAR</td>
            <td className="border border-slate-900 p-1">{f2(p.grand)}</td>
          </tr>
        </tbody>
      </table>
      {p.notes && <p className="text-[10.5px] mt-2" dir="rtl"><b>ملاحظات:</b> {p.notes}</p>}
      <div className="border border-red-800 bg-red-50 mt-2 px-2 py-1.5 text-[9.5px] leading-relaxed" dir="ltr">
        <p className="font-bold text-red-900">It is strictly forbidden to add water to the mixture on site due to its negative effect on quality.</p>
        <p className="font-bold text-red-900" dir="rtl">ممنوع منعاً باتاً إضافة الماء للخلطة في الموقع لتأثيره السلبي على الجودة.</p>
      </div>
      <div className="flex justify-between text-[10.5px] mt-4" dir="rtl">
        <p>المشغل: {p.operatorName || '....................'}</p>
        <p>المندوب: {p.rep || '....................'}</p>
        <p>العميل: {p.client || '....................'}</p>
      </div>
      <img src={labFooter} alt="ALMOTWR footer" className="w-full mt-2" style={paper === 'company' ? undefined : { display: 'none' }} />
    </div>
  );
}

export default function DeliveryNote({ trips, orders, username, plantName, onToast }: {
  trips: DNTrip[];
  orders: DNOrder[];
  username: string;
  plantName: string;
  onToast: (m: string) => void;
}) {
  const t = useDNDict();
  const [tripId, setTripId] = useState<string>('manual');
  const [client, setClient] = useState('');
  const [phone, setPhone] = useState('');
  const [project, setProject] = useState('');
  const [site, setSite] = useState('');
  const [mix, setMix] = useState('');
  const [mixes, setMixes] = useState<string[]>([]);
  const [recipeWeights, setRecipeWeights] = useState<Record<string, { cement: number; sand: number; gravel: number; admixture: number }>>({});
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [vatRate, setVatRate] = useState('15');
  const [truck, setTruck] = useState('');
  const [pump, setPump] = useState('');
  const [driver, setDriver] = useState('');
  const [rep, setRep] = useState('');
  const [notes, setNotes] = useState('');
  const [orderId, setOrderId] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [arriveTime, setArriveTime] = useState('');
  const [autoPost, setAutoPost] = useState(true);
  const [company, setCompany] = useState('');
  const [saved, setSaved] = useState<SavedDN[]>([]);
  const [sharing, setSharing] = useState(false);

  const doWhatsApp = async () => {
    const p = buildPayload();
    if (!p) { onToast(t('needClient')); return; }
    setSharing(true);
    try {
      const text = `مذكرة ${p.ticket} — ${p.client} — ${p.mix} ${p.qty}m³ — ${p.grand.toFixed(2)} ر.س`;
      await shareImageViaLink({
        docHtml: buildDnDoc(p, labEmblem, labFooter),
        kind: 'delivery',
        ref: p.ticket,
        fileName: `${p.ticket}.jpg`,
        text,
      });
      onToast(t('sharedOk'));
    } catch (e) {
      onToast(`${t('pdfFail')}${e instanceof Error && e.message ? ` (${e.message})` : ''}`);
    } finally {
      setSharing(false);
    }
  };
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [paper, setPaper] = useState<'company' | 'plain'>('company');
  const [fleet, setFleet] = useState<Array<{ id: string; plate: string; driver: string }>>([]);
  const [customerRecs, setCustomerRecs] = useState<Array<{ name: string; address: string; phone: string }>>([]);

  useEffect(() => {
    loadPlantProfile(username).then((p: unknown) => {
      const o = (p ?? {}) as Record<string, unknown>;
      setCompany(String(o.name ?? '') || plantName);
    }).catch(() => setCompany(plantName));
    // 3-level load: instant local → Firebase (same account, any device) → tenant cloud.
    const boot = async () => {
      let list: SavedDN[] = [];
      try {
        const raw = localStorage.getItem('deliveryNotes');
        if (raw) list = JSON.parse(raw);
      } catch {}
      if (list.length) setSaved(list);
      try {
        const fb = await loadDeliveryNotes(username);
        if (Array.isArray(fb) && fb.length) {
          list = mergeByKey(list, fb as SavedDN[], r => r.ticket);
          setSaved(list);
          try { localStorage.setItem('deliveryNotes', JSON.stringify(list)); } catch {}
        }
      } catch {}
      try {
        const merged = await pullCloud('deliveryNotes', list, r => (r as SavedDN).ticket);
        if (merged.length !== list.length) {
          setSaved(merged as SavedDN[]);
          try { localStorage.setItem('deliveryNotes', JSON.stringify(merged)); } catch {}
          saveDeliveryNotes(username, merged).catch(() => {});
          void pushCloud('deliveryNotes', merged);
        }
      } catch {}
    };
    void boot();
  }, [username, plantName]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      import('../firebase/firestore').then(m => Promise.all([
        m.loadRecipes(username).catch(() => [] as unknown[]),
        m.loadAssets(username).catch(() => [] as unknown[]),
      ])),
      loadCustomers(username).catch(() => [] as unknown[]),
    ]).then(async ([[recs, assets], custs]) => {
      if (!alive) return;
      const applyRecs = (recList: Array<Record<string, unknown>>) => {
        const codes = recList.map(r => String(r.code ?? '').trim()).filter(Boolean);
        const weights: Record<string, { cement: number; sand: number; gravel: number; admixture: number }> = {};
        for (const r of recList) {
          const code = String(r.code ?? '').trim();
          if (!code) continue;
          weights[code] = {
            cement: Number(r.cement) || 0,
            sand: Number(r.sand) || 0,
            gravel: Number(r.gravel) || 0,
            admixture: Number(r.admixture) || 0,
          };
        }
        setRecipeWeights(weights);
        if (codes.length) {
          setMixes(codes);
          setMix(prev => (prev ? prev : codes.includes('C30') ? 'C30' : codes[0]));
          return true;
        }
        return false;
      };
      const recList = (Array.isArray(recs) ? recs : []) as Array<Record<string, unknown>>;
      if (!applyRecs(recList)) {
        // Own account has no recipes — use the plant-shared ACTUAL weights.
        try {
          const shared = await pullCloud('recipes', [], (x: Record<string, unknown>) => String(x.code ?? ''));
          if (!alive) return;
          if (shared.length && !applyRecs(shared as Array<Record<string, unknown>>)) {
            setMixes(DEFAULT_MIXES);
            setRecipeWeights(DEFAULT_WEIGHTS);
            setMix(prev => (prev ? prev : 'C30'));
          } else if (!shared.length) {
            setMixes(DEFAULT_MIXES);
            setRecipeWeights(DEFAULT_WEIGHTS);
            setMix(prev => (prev ? prev : 'C30'));
          }
        } catch {
          if (!alive) return;
          setMixes(DEFAULT_MIXES);
          setRecipeWeights(DEFAULT_WEIGHTS);
          setMix(prev => (prev ? prev : 'C30'));
        }
      }
      const fleet = (Array.isArray(assets) ? assets : [])
        .map((a: unknown) => {
          const o = a as Record<string, unknown>;
          return {
            id: String(o.id ?? o.code ?? '').trim(),
            plate: String(o.plate ?? '').trim(),
            driver: String(o.driver ?? '').trim(),
          };
        })
        .filter(a => a.id || a.plate);
      setFleet(fleet);
      if (Array.isArray(custs)) {
        setCustomerRecs(custs
          .map((u: unknown) => {
            const o = u as Record<string, unknown>;
            return {
              name: String(o.name ?? o.customerName ?? o.clientName ?? o.username ?? '').trim(),
              address: String(o.address ?? o.site ?? o.location ?? '').trim(),
              phone: String(o.phone ?? o.phoneNumber ?? '').trim(),
            };
          })
          .filter(r => r.name));
      }
    }).catch(() => {
      setMixes(prev => (prev.length ? prev : DEFAULT_MIXES));
    });
    return () => { alive = false; };
  }, [username]);

  // ---- Schedule linkage: delivered vs remaining per order & client ----
  const norm = (s: unknown) => String(s ?? '').trim();
  const deliveredByOrder: Record<string, number> = {};
  const deliveredByClient: Record<string, number> = {};
  for (const n of saved) {
    if (n.orderId) deliveredByOrder[n.orderId] = (deliveredByOrder[n.orderId] ?? 0) + (Number(n.qty) || 0);
    const cn = norm(n.client);
    if (cn) deliveredByClient[cn] = (deliveredByClient[cn] ?? 0) + (Number(n.qty) || 0);
  }
  const liveOrders = orders.filter(o => String(o.status ?? '') !== 'cancelled');
  const orderRemaining = (o: DNOrder): number => {
    const key = String(o.id);
    const ordered = Number(o.quantity) || 0;
    return Math.max(0, ordered - (deliveredByOrder[key] ?? 0));
  };
  const clientBalances = (() => {
    const ordered = new Map<string, number>();
    for (const o of liveOrders) {
      const cn = norm(o.customerName);
      if (!cn) continue;
      ordered.set(cn, (ordered.get(cn) ?? 0) + (Number(o.quantity) || 0));
    }
    return [...ordered.entries()]
      .map(([client, ord]) => ({ client, ordered: ord, delivered: deliveredByClient[client] ?? 0, remaining: Math.max(0, ord - (deliveredByClient[client] ?? 0)) }))
      .sort((a, b) => b.remaining - a.remaining);
  })();

  const pickOrder = (id: string) => {
    setOrderId(id);
    if (!id) return;
    const o = orders.find(x => String(x.id) === id);
    if (!o) return;
    setClient(norm(o.customerName));
    setPhone(norm(o.customerPhone));
    if ((o as DNOrder).salesRep) setRep(String((o as DNOrder).salesRep));
    if (o.projectName) setProject(String(o.projectName));
    if (o.projectLocation) setSite(String(o.projectLocation));
    const rem = orderRemaining(o);
    if (rem > 0) setQty(String(rem));
    else if (Number(o.quantity) > 0) setQty(String(o.quantity));
    const mc = /C\s*(\d+)/i.exec(String(o.concreteType ?? ''));
    if (mc) setMix(prev => (prev ? prev : `C${mc[1]}`));
  };

  const pickClient = (name: string) => {
    setClient(name);
    const o = orders.find(x => norm(x.customerName) === norm(name));
    if (o) {
      if (o.customerPhone) setPhone(String(o.customerPhone));
      if (o.projectLocation) setSite(prev => (prev.trim() ? prev : String(o.projectLocation)));
      return;
    }
    const rec = customerRecs.find(r => r.name === name);
    if (rec) {
      if (rec.phone) setPhone(prev => (prev.trim() ? prev : rec.phone));
      if (rec.address) setSite(prev => (prev.trim() ? prev : rec.address));
    }
  };

  // ---- Driver & truck trips (HR payroll statement) ----
  const toMins = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const durBetween = (a: string, b: string): number | null => {
    const x = toMins(a), y = toMins(b);
    if (x === null || y === null) return null;
    let d = y - x;
    if (d < 0) d += 24 * 60;
    return d;
  };
  const noteKey = (n: SavedDN) => `${n.date} ${n.departTime || n.time || '00:00'}`;
  const driverStats = (() => {
    const map = new Map<string, { trips: number; m3: number; trucks: Set<string> }>();
    for (const n of saved) {
      const d = norm(n.driver) || '—';
      const e = map.get(d) ?? { trips: 0, m3: 0, trucks: new Set<string>() };
      e.trips += 1;
      e.m3 += Number(n.qty) || 0;
      if (norm(n.truck)) e.trucks.add(norm(n.truck));
      map.set(d, e);
    }
    return [...map.entries()].map(([driver, v]) => ({ driver, ...v, trucks: [...v.trucks].join('، ') }));
  })();
  const truckStats = (() => {
    const map = new Map<string, SavedDN[]>();
    for (const n of saved) {
      const k = norm(n.truck) || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return [...map.entries()].map(([truck, list]) => {
      const sorted = [...list].sort((a, b) => (noteKey(a) < noteKey(b) ? -1 : 1));
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const g = durBetween(sorted[i - 1].departTime || sorted[i - 1].time, sorted[i].departTime || sorted[i].time);
        if (g !== null && sorted[i - 1].date === sorted[i].date) gaps.push(g);
      }
      const m3 = list.reduce((a, n) => a + (Number(n.qty) || 0), 0);
      return { truck, trips: list.length, m3, avgGap: gaps.length ? Math.round(gaps.reduce((a, g) => a + g, 0) / gaps.length) : null };
    });
  })();

  const pumpStats = (() => {
    const map = new Map<string, { trips: number; m3: number; trucks: Set<string> }>();
    for (const n of saved) {
      const k = norm((n as SavedDN).pump);
      if (!k) continue;
      const e = map.get(k) ?? { trips: 0, m3: 0, trucks: new Set<string>() };
      e.trips += 1;
      e.m3 += Number(n.qty) || 0;
      if (norm(n.truck)) e.trucks.add(norm(n.truck));
      map.set(k, e);
    }
    return [...map.entries()].map(([pump, v]) => ({ pump, ...v, trucks: [...v.trucks].join('، ') }));
  })();

  const pickTrip = (id: string) => {
    setTripId(id);
    if (id === 'manual') return;
    const tr = trips.find(x => String(x.id) === id);
    if (!tr) return;
    setTruck(String(tr.code ?? ''));
    setDriver(String(tr.driver ?? ''));
    if (tr.pump) setPump(String(tr.pump));
    if (Number(tr.qty) > 0) setQty(String(tr.qty));
    if (tr.siteName) setSite(String(tr.siteName));
    if (tr.projectName) setProject(String(tr.projectName));
    const ord = orders.find(o => String(o.id) === String(tr.orderId ?? '') || (tr.orderId && String(o.orderNo) === String(tr.orderId)));
    if (ord) {
      setOrderId(String(ord.id));
      setClient(String(ord.customerName ?? ''));
      setPhone(String(ord.customerPhone ?? ''));
      if ((ord as DNOrder).salesRep) setRep(String((ord as DNOrder).salesRep));
      if (!site) setSite(String(ord.projectLocation ?? ''));
      if (!project) setProject(String(ord.projectName ?? ''));
      const mc = /C\s*(\d+)/i.exec(String(ord.concreteType ?? ''));
      if (mc) {
        const code = `C${mc[1]}`;
        setMix(prev => (prev ? prev : code));
      }
    }
  };

  const priceMemory = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem('dnPrices') ?? '{}'); } catch { return {}; }
  };
  const pickMix = (code: string) => {
    setMix(code);
    if (!price.trim()) {
      const mem = priceMemory();
      if (mem[code]) setPrice(mem[code]);
    }
  };

  // Client options: sales orders first, archive filenames as demo fallback.
  const dnClientNames = (() => {
    const fromOrders = liveOrders.map(o => norm(o.customerName)).filter(Boolean);
    return [...new Set(fromOrders)].length ? [...new Set(fromOrders)] : DEMO_CLIENTS;
  })();

  // Fleet + trip + history dropdowns: vehicles, drivers, mixes always offered.
  const truckOpts = [...new Set([
    ...fleet.map(f => f.id).filter(Boolean),
    ...fleet.map(f => f.plate).filter(Boolean),
    ...trips.map(x => String(x.code ?? '')).filter(Boolean),
    ...saved.map(n => norm(n.truck)).filter(Boolean),
  ])];
  const driverOpts = [...new Set([
    ...fleet.map(f => f.driver).filter(Boolean),
    ...trips.map(x => String(x.driver ?? '')).filter(Boolean),
    ...saved.map(n => norm(n.driver)).filter(Boolean),
  ])];
  const pumpOpts = [...new Set([
    ...trips.map(x => String(x.pump ?? '')).filter(Boolean),
    ...saved.map(n => norm((n as SavedDN).pump)).filter(Boolean),
  ])];
  const pickTruck = (v: string) => {
    setTruck(v);
    const f = fleet.find(x => x.id === v || x.plate === v);
    if (f && f.driver) setDriver(prev => (prev.trim() ? prev : f.driver));
    if (!f) {
      const tr = trips.find(x => String(x.code ?? '') === v);
      if (tr && tr.driver) setDriver(prev => (prev.trim() ? prev : String(tr.driver)));
    }
  };

  const durOf = (n: SavedDN): number | null => durBetween(n.departTime, n.arriveTime);
  const gapByTicket = (() => {
    const byTruck = new Map<string, SavedDN[]>();
    for (const n of saved) {
      const k = norm(n.truck);
      if (!k) continue;
      if (!byTruck.has(k)) byTruck.set(k, []);
      byTruck.get(k)!.push(n);
    }
    const out = new Map<string, number>();
    for (const list of byTruck.values()) {
      const sorted = [...list].sort((a, b) => (noteKey(a) < noteKey(b) ? -1 : 1));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].date !== sorted[i - 1].date) continue;
        const g = durBetween(sorted[i - 1].departTime || sorted[i - 1].time, sorted[i].departTime || sorted[i].time);
        if (g !== null) out.set(sorted[i].ticket, g);
      }
    }
    return out;
  })();

  const doDriversExcel = () => {
    const aoa: unknown[][] = [
      ['Driver & truck trips (HR payroll statement)', '', '', ''],
      ['Driver', 'Trips', 'm³', 'Trucks'],
      ...driverStats.map(d => [d.driver, d.trips, d.m3, d.trucks]),
      [],
      ['Truck', 'Trips', 'm³', 'Avg gap min'],
      ...truckStats.map(s => [s.truck, s.trips, s.m3, s.avgGap ?? '—']),
      [],
      ['Pump trips (mixer+pump payroll)', '', '', ''],
      ['Pump', 'Trips', 'm³', 'Mixers'],
      ...pumpStats.map(s => [s.pump, s.trips, s.m3, s.trucks]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 26 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trips');
    XLSX.writeFile(wb, `driver-trips-${todayISO()}.xlsx`);
  };
  const q = Number(qty), pr = Number(price), vr = Number(vatRate) || 0;
  const sub = Number.isFinite(q) && Number.isFinite(pr) ? q * pr : 0;
  const vat = (sub * vr) / 100;
  const grand = sub + vat;
  const deductPreview = (() => {
    const w = recipeWeights[mix];
    if (!w || !(q > 0)) return '';
    return `خصم المخزون تلقائياً: أسمنت ${((w.cement * q) / 1000).toFixed(2)}t · رمل ${((w.sand * q) / 1000).toFixed(2)}t · بحص ${((w.gravel * q) / 1000).toFixed(2)}t · إضافات ${(w.admixture * q).toFixed(1)}kg`;
  })();

  const buildPayload = (): DNPayload | null => {
    if (!client.trim() || !(q > 0) || !(pr > 0)) return null;
    const day = todayISO().split('-').join('');
    const seq = Number(localStorage.getItem('dnSeq') ?? '0') + 1;
    const ord = orders.find(o => String(o.id) === String(orderId)) as DNOrder | undefined;
    return {
      ticket: `DLV-${day}-${String(seq).padStart(3, '0')}`,
      date: todayISO(),
      time: nowTime(),
      client: client.trim(), phone: phone.trim(),
      project: project.trim(), site: site.trim(), mix,
      qty: q, price: pr, vatRate: vr, sub, vat, grand,
      truck: truck.trim(), driver: driver.trim(), rep: rep.trim(), notes: notes.trim(),
      pump: pump.trim(),
      company: company || plantName,
      orderId, departTime: departTime.trim(), arriveTime: arriveTime.trim(),
      plantNo: String(ord?.plantNo ?? ''),
      operatorName: String(ord?.operatorName ?? ''),
      posted: false,
    };
  };

  const persist = (list: SavedDN[]) => {
    setSaved(list);
    try { localStorage.setItem('deliveryNotes', JSON.stringify(list)); } catch {}
    saveDeliveryNotes(username, list).catch(() => {});
    void pushCloud('deliveryNotes', list);
  };

  // Automatic raw-material deduction: recipe batch weights (kg/m³) × poured
  // qty. Stock units: cement/sand/gravel in tons (÷1000), admixture in kg.
  // Reads own stock first, plant-shared stock second; writes back to both so
  // every role sees the same numbers. Only keys already present are touched.
  const deductInventory = async (p: DNPayload): Promise<string | null> => {
    try {
      const w = recipeWeights[p.mix];
      if (!w) return null;
      let inv = (await loadInventory(username).catch(() => null)) as Record<string, unknown> | null;
      const hasNums = inv && typeof inv === 'object' && ['cement', 'sand', 'gravel'].some(k => typeof inv![k] === 'number');
      if (!hasNums) {
        const shared = await pullObject('inventory').catch(() => null);
        if (shared && typeof shared === 'object') inv = shared as Record<string, unknown>;
      }
      if (!inv || typeof inv !== 'object') return null;
      const used: Array<[string, number, string]> = [
        ['cement', (w.cement * p.qty) / 1000, 't'],
        ['sand', (w.sand * p.qty) / 1000, 't'],
        ['gravel', (w.gravel * p.qty) / 1000, 't'],
        ['admixture', w.admixture * p.qty, 'kg'],
      ];
      const next: Record<string, unknown> = { ...inv };
      const parts: string[] = [];
      let touched = false;
      for (const [k, v, u] of used) {
        if (typeof next[k] !== 'number' || !(v > 0)) continue;
        next[k] = Math.max(0, (next[k] as number) - v);
        parts.push(`${k} ${v.toFixed(2)}${u}`);
        touched = true;
      }
      if (!touched) return null;
      await saveInventory(username, next).catch(() => {});
      void pushCloud('inventory', next);
      const lows: string[] = [];
      if (typeof next.cement === 'number' && next.cement < 20) lows.push('cement');
      if (typeof next.sand === 'number' && next.sand < 40) lows.push('sand');
      if (typeof next.gravel === 'number' && next.gravel < 60) lows.push('gravel');
      return `خصم المخزون: ${parts.join('، ')}` + (lows.length ? ` — ⚠️ منخفض: ${lows.join('، ')}` : '');
    } catch {
      return null;
    }
  };

  const doSave = async () => {
    if (!client.trim()) { onToast(t('needClient')); return; }
    if (!(pr > 0)) { onToast(t('needPrice')); return; }
    const p = buildPayload();
    if (!p) { onToast(t('needClient')); return; }
    // Auto-post to accounts (single entry — never double-posts: one ticket = one entry).
    if (autoPost) {
      try {
        await api.post('/api/finance/ledger/entries', {
          date: new Date().toISOString(),
          description: `Delivery ${p.ticket} — ${p.client} (${p.mix} ${p.qty}m³)`,
          amountSar: Math.round(p.grand * 100),
          transactionType: 'sale',
          referenceNumber: p.ticket,
          counterpartyType: 'client',
          counterpartyName: p.client,
        });
        p.posted = true;
      } catch {
        p.posted = false;
      }
    }
    try {
      localStorage.setItem('dnSeq', String(Number(localStorage.getItem('dnSeq') ?? '0') + 1));
      const mem = priceMemory();
      if (p.mix) { mem[p.mix] = String(p.price); localStorage.setItem('dnPrices', JSON.stringify(mem)); }
    } catch {}
    persist([{ ...p, createdAt: new Date().toISOString() }, ...saved]);
    setViewIdx(0);
    onToast(t('saved'));
    void deductInventory(p).then(msg => { if (msg) onToast(msg); });
  };

  const doExcel = (p: DNPayload) => {
    const aoa: unknown[][] = [
      ['ALMOTWR COMPANY | READY-MIX CONCRETE'],
      [p.company],
      ['DELIVERY NOTE'],
      ['Ticket No', p.ticket, '', 'Date', `${p.date} ${p.time}`],
      ['Order', p.orderId || '—', '', 'Posted', p.posted ? 'yes' : 'no'],
      ['Client', p.client, '', 'Rep', p.rep],
      ['Phone', p.phone, '', 'Ticket', p.ticket],
      ['Project', p.project, '', 'Site', p.site],
      ['Truck', p.truck, '', 'Driver', p.driver],
      ['Pump', p.pump || '—', '', 'Plant', p.plantNo || '—'],
      ['Loading', p.departTime || '—', 'Arrival', p.arriveTime || '—'],
      [],
      ['MIX', 'QTY m³', 'PRICE SAR', 'TOTAL SAR'],
      [p.mix, p.qty, p.price, Number(p.sub.toFixed(2))],
      [`VAT ${p.vatRate}%`, '', '', Number(p.vat.toFixed(2))],
      ['GRAND TOTAL SAR', '', '', Number(p.grand.toFixed(2))],
      [],
      ...(p.notes ? ([['Notes', p.notes]] as unknown[][]) : []),
      ['Driver signature: ............', 'Client signature: ............', '', 'Plant: ............'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 10 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Note');
    XLSX.writeFile(wb, `${p.ticket}.xlsx`);
  };

  const viewing: DNPayload | null =
    viewIdx !== null && saved[viewIdx] ? saved[viewIdx] : buildPayload();

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70';
  const labelCls = 'block text-xs text-slate-400 font-semibold mb-1';

  return (
    <div className="space-y-6">
      <style>{`@page { size: A4 portrait; margin: 9mm; } @media print { #root { display: none !important; } #dn-print-root { display: block !important; visibility: visible !important; zoom: 0.85; } #dn-print-root * { visibility: visible !important; } }`}</style>

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-1">{t('title')}</h3>
        <p className="text-xs text-slate-400 mb-5">{t('subtitle')}</p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t('trip')}</label>
            <select value={tripId} onChange={e => pickTrip(e.target.value)} className={inputCls}>
              <option value="manual" className="bg-slate-900">{t('manual')}</option>
              {trips.map(tr => (
                <option key={String(tr.id)} value={String(tr.id)} className="bg-slate-900">
                  {String(tr.code ?? '')} · {String(tr.driver ?? '')} · {Number(tr.qty) || 0}m³ · {String(tr.siteName ?? '')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('client')}</label>
            <input value={client} onChange={e => pickClient(e.target.value)} list="dn-clients" className={inputCls} style={client.trim() ? undefined : RED_IF_EMPTY} />
            <datalist id="dn-clients">{dnClientNames.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>{t('order')}</label>
            <select value={orderId} onChange={e => pickOrder(e.target.value)} className={inputCls}>
              <option value="" className="bg-slate-900">{t('noOrder')}</option>
              {liveOrders.map(o => (
                <option key={String(o.id)} value={String(o.id)} className="bg-slate-900">
                  {String(o.orderNo ?? o.id)} · {String(o.customerName ?? '')} · {t('remaining')} {orderRemaining(o)}m³
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('phone')}</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('project')}</label>
            <input value={project} onChange={e => setProject(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('site')}</label>
            <input value={site} onChange={e => setSite(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('mix')}</label>
            {mixes.length ? (
              <select value={mix} onChange={e => pickMix(e.target.value)} className={inputCls}>
                <option value="" className="bg-slate-900">—</option>
                {mixes.map(m => <option key={m} value={m} className="bg-slate-900">{m}</option>)}
              </select>
            ) : (
              <input value={mix} onChange={e => setMix(e.target.value)} placeholder="C30" className={inputCls} />
            )}
          </div>
          <div>
            <label className={labelCls}>{t('qty')}</label>
            <input type="number" step="0.5" value={qty} onChange={e => setQty(e.target.value)} className={inputCls} style={Number(qty) > 0 ? undefined : RED_IF_EMPTY} />
          </div>
          <div>
            <label className={labelCls}>{t('price')}</label>
            <input type="number" step="1" value={price} onChange={e => setPrice(e.target.value)} className={inputCls} style={pr > 0 ? undefined : RED_IF_EMPTY} />
          </div>
          <div>
            <label className={labelCls}>{t('vat')}</label>
            <input type="number" step="1" value={vatRate} onChange={e => setVatRate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('truck')}</label>
            <input value={truck} onChange={e => pickTruck(e.target.value)} list="dn-trucks" className={inputCls} />
            <datalist id="dn-trucks">{truckOpts.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>{t('driver')}</label>
            <input value={driver} onChange={e => setDriver(e.target.value)} list="dn-drivers" className={inputCls} />
            <datalist id="dn-drivers">{driverOpts.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>{t('pump')}</label>
            <input value={pump} onChange={e => setPump(e.target.value)} list="dn-pumps" className={inputCls} placeholder="P01" />
            <datalist id="dn-pumps">{pumpOpts.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>{t('rep')}</label>
            <input value={rep} onChange={e => setRep(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('departTime')}</label>
            <input type="time" value={departTime} onChange={e => setDepartTime(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('arriveTime')}</label>
            <input type="time" value={arriveTime} onChange={e => setArriveTime(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 font-bold cursor-pointer">
              <input type="checkbox" checked={autoPost} onChange={e => setAutoPost(e.target.checked)} className="w-4 h-4 accent-sky-500" />
              {t('autoPost')}
            </label>
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>{t('notes')}</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300">
          <span dir="ltr">{f2(sub)}</span> + {t('vatAmt')} <span dir="ltr">{f2(vat)}</span> = {t('grand')}: <span dir="ltr">{f2(grand)}</span>
          {deductPreview && <p className="text-[11px] font-bold text-slate-400 mt-1">{deductPreview}</p>}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={doSave} className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2.5 rounded-lg text-sm">{t('save')}</button>
          <button onClick={() => { const p = buildPayload(); if (p) doExcel(p); else onToast(t('needClient')); }} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-5 py-2.5 rounded-lg font-bold text-sm">{t('excel')}</button>
          <button onClick={() => { const p = buildPayload(); if (p) setTimeout(() => window.print(), 60); else onToast(t('needClient')); }} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white px-5 py-2.5 rounded-lg font-bold text-sm">{t('print')}</button>
          <button onClick={() => void doWhatsApp()} disabled={sharing} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 px-5 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50">{sharing ? t('sharing') : t('whatsapp')}</button>
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-bold">
            <button onClick={() => setPaper('company')} className={`px-3 py-2.5 ${paper === 'company' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}>{t('paperCompany')}</button>
            <button onClick={() => setPaper('plain')} className={`px-3 py-2.5 ${paper === 'plain' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}>{t('paperPlain')}</button>
          </div>
        </div>
      </div>

      {clientBalances.length > 0 && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <h3 className="text-sm font-black tracking-tight text-white mb-3">{t('balanceTitle')}</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {clientBalances.slice(0, 9).map(b => (
              <div key={b.client} className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/10 text-xs">
                <span className="text-slate-300 truncate">{b.client}</span>
                <span className={`font-black shrink-0 ${b.remaining > 0 ? 'text-amber-300' : 'text-emerald-400'}`} dir="ltr">
                  {b.remaining}m³ / {b.ordered}m³
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewing && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <div id="dn-report-preview"><DNSheet p={viewing} paper={paper} /></div>
        </div>
      )}
      {viewing && createPortal(
        <div id="dn-print-root" style={{ display: 'none' }}><DNSheet p={viewing} paper={paper} /></div>,
        document.body
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-4">{t('history')} ({saved.length})</h3>
        {!saved.length ? (
          <p className="text-slate-500 text-sm">{t('none')}</p>
        ) : (
          <div className="space-y-2">
            {saved.map((r, i) => (
              <div key={r.ticket + i} className="flex items-center justify-between gap-3 bg-white/[0.02] rounded-lg px-4 py-3 border border-white/10">
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm" dir="ltr">🧾 {r.ticket}</p>
                  <p className="text-[11px] text-slate-500">{r.client} · {r.mix} · <span dir="ltr">{r.qty}m³ · {f2(r.grand)} {t('sar')}</span></p>
                  <p className="text-[11px] text-slate-500">
                    <span className={r.posted ? 'text-emerald-400' : 'text-amber-300'}>● {r.posted ? t('postedOk') : t('postedWait')}</span>
                    {(r.departTime || r.arriveTime) && (
                      <> · <span dir="ltr">{r.departTime || '—'}→{r.arriveTime || '—'}</span> ({durOf(r) ?? '—'} {t('durMin')})</>
                    )}
                    {gapByTicket.get(r.ticket) != null && <> · ⏱️ +{gapByTicket.get(r.ticket)}m</>}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setViewIdx(i)} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:text-sky-300">{t('reprint')}</button>
                  <button onClick={() => doExcel(r)} className="bg-yellow-500/10 text-yellow-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-yellow-500/40">{t('excel')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(driverStats.length > 0 || truckStats.length > 0 || pumpStats.length > 0) && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black tracking-tight text-white">{t('driversTitle')}</h3>
            <button onClick={doDriversExcel} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-4 py-2 rounded-lg font-bold text-xs">{t('exportDrivers')}</button>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-black text-slate-400 mb-2">السائقون</p>
              {driverStats.map(d => (
                <div key={d.driver} className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/10 text-xs mb-1.5">
                  <span className="text-slate-200 font-bold truncate">{d.driver}</span>
                  <span className="text-slate-400 shrink-0" dir="ltr">{d.trips} {t('tripsCol')} · {d.m3}m³</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-400 mb-2">الخلاطات (ميكسر)</p>
              {truckStats.map(s => (
                <div key={s.truck} className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/10 text-xs mb-1.5">
                  <span className="text-slate-200 font-bold truncate" dir="ltr">{s.truck}</span>
                  <span className="text-slate-400 shrink-0" dir="ltr">{s.trips} {t('tripsCol')} · {s.m3}m³{s.avgGap !== null ? ` · ⏱️${s.avgGap}m` : ''}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-400 mb-2">المضخات (بمب)</p>
              {pumpStats.length === 0 && <p className="text-[11px] text-slate-500">—</p>}
              {pumpStats.map(s => (
                <div key={s.pump} className="flex items-center justify-between gap-2 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/10 text-xs mb-1.5">
                  <span className="text-slate-200 font-bold truncate" dir="ltr">{s.pump}</span>
                  <span className="text-slate-400 shrink-0" dir="ltr">{s.trips} {t('tripsCol')} · {s.m3}m³</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
