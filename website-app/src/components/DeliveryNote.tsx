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
import { loadCustomers, loadPlantProfile } from '../firebase/firestore';
import labHeader from '../assets/lab-header.jpg';
import labFooter from '../assets/lab-footer.jpg';

export interface DNTrip {
  id: number | string;
  code: string;
  driver: string;
  qty: number;
  siteName: string;
  projectName: string;
  date: string;
  orderId?: string;
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
  driver: string;
  notes: string;
  company: string;
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
  driver: { en: 'Driver', ar: 'السائق', ur: 'ڈرائیور', ru: 'Водитель', de: 'Fahrer', it: 'Autista', hi: 'ड्राइवर', ja: '運転手', zh: '司机' },
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

function DNSheet({ p }: { p: DNPayload }) {
  return (
    <div className="bg-white text-slate-900 max-w-[800px] mx-auto border-2 border-slate-900 p-4" dir="ltr">
      <img src={labHeader} alt="ALMOTWR letterhead" className="w-full" />
      <div className="border border-slate-900 text-center font-black text-[13px] mt-2 py-1 tracking-wide">
        DELIVERY NOTE — مذكرة تسليم خرسانة
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-[3px] mt-2 text-[10.5px]">
        <SheetRow label="TICKET NO">{p.ticket}</SheetRow>
        <SheetRow label="DATE / TIME">{p.date} — {p.time}</SheetRow>
        <SheetRow label="CLIENT">{p.client}</SheetRow>
        <SheetRow label="PHONE">{p.phone || '—'}</SheetRow>
        <SheetRow label="PROJECT">{p.project || '—'}</SheetRow>
        <SheetRow label="SITE">{p.site || '—'}</SheetRow>
        <SheetRow label="TRUCK">{p.truck || '—'}</SheetRow>
        <SheetRow label="DRIVER">{p.driver || '—'}</SheetRow>
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
      <div className="flex justify-between text-[10.5px] mt-6" dir="rtl">
        <p>السائق: ....................</p>
        <p>العميل: ....................</p>
        <p>المحطة: ....................</p>
      </div>
      <img src={labFooter} alt="ALMOTWR footer" className="w-full mt-2" />
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
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [vatRate, setVatRate] = useState('15');
  const [truck, setTruck] = useState('');
  const [driver, setDriver] = useState('');
  const [notes, setNotes] = useState('');
  const [company, setCompany] = useState('');
  const [saved, setSaved] = useState<SavedDN[]>([]);
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  useEffect(() => {
    loadPlantProfile(username).then((p: unknown) => {
      const o = (p ?? {}) as Record<string, unknown>;
      setCompany(String(o.name ?? '') || plantName);
    }).catch(() => setCompany(plantName));
    try {
      const raw = localStorage.getItem('deliveryNotes');
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [username, plantName]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      import('../firebase/firestore').then(m => m.loadRecipes(username).catch(() => [] as unknown[])),
      loadCustomers(username).catch(() => [] as unknown[]),
    ]).then(([recs, custs]) => {
      if (!alive) return;
      const codes = (Array.isArray(recs) ? recs : [])
        .map((r: unknown) => String((r as Record<string, unknown>).code ?? '').trim())
        .filter(Boolean);
      if (codes.length) {
        setMixes(codes);
        setMix(prev => (prev ? prev : codes.includes('C30') ? 'C30' : codes[0]));
      }
      void custs;
    }).catch(() => {});
    return () => { alive = false; };
  }, [username]);

  const pickTrip = (id: string) => {
    setTripId(id);
    if (id === 'manual') return;
    const tr = trips.find(x => String(x.id) === id);
    if (!tr) return;
    setTruck(String(tr.code ?? ''));
    setDriver(String(tr.driver ?? ''));
    if (Number(tr.qty) > 0) setQty(String(tr.qty));
    if (tr.siteName) setSite(String(tr.siteName));
    if (tr.projectName) setProject(String(tr.projectName));
    const ord = orders.find(o => String(o.id) === String(tr.orderId ?? '') || (tr.orderId && String(o.orderNo) === String(tr.orderId)));
    if (ord) {
      setClient(String(ord.customerName ?? ''));
      setPhone(String(ord.customerPhone ?? ''));
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

  const q = Number(qty), pr = Number(price), vr = Number(vatRate) || 0;
  const sub = Number.isFinite(q) && Number.isFinite(pr) ? q * pr : 0;
  const vat = (sub * vr) / 100;
  const grand = sub + vat;

  const buildPayload = (): DNPayload | null => {
    if (!client.trim() || !(q > 0) || !(pr > 0)) return null;
    const day = todayISO().split('-').join('');
    const seq = Number(localStorage.getItem('dnSeq') ?? '0') + 1;
    return {
      ticket: `DLV-${day}-${String(seq).padStart(3, '0')}`,
      date: todayISO(),
      time: nowTime(),
      client: client.trim(), phone: phone.trim(),
      project: project.trim(), site: site.trim(), mix,
      qty: q, price: pr, vatRate: vr, sub, vat, grand,
      truck: truck.trim(), driver: driver.trim(), notes: notes.trim(),
      company: company || plantName,
    };
  };

  const persist = (list: SavedDN[]) => {
    setSaved(list);
    try { localStorage.setItem('deliveryNotes', JSON.stringify(list)); } catch {}
  };

  const doSave = () => {
    if (!client.trim()) { onToast(t('needClient')); return; }
    if (!(pr > 0)) { onToast(t('needPrice')); return; }
    const p = buildPayload();
    if (!p) { onToast(t('needClient')); return; }
    try {
      localStorage.setItem('dnSeq', String(Number(localStorage.getItem('dnSeq') ?? '0') + 1));
      const mem = priceMemory();
      if (p.mix) { mem[p.mix] = String(p.price); localStorage.setItem('dnPrices', JSON.stringify(mem)); }
    } catch {}
    persist([{ ...p, createdAt: new Date().toISOString() }, ...saved]);
    setViewIdx(0);
    onToast(t('saved'));
  };

  const doExcel = (p: DNPayload) => {
    const aoa: unknown[][] = [
      ['ALMOTWR COMPANY | READY-MIX CONCRETE'],
      [p.company],
      ['DELIVERY NOTE'],
      ['Ticket No', p.ticket, '', 'Date', `${p.date} ${p.time}`],
      ['Client', p.client, '', 'Phone', p.phone],
      ['Project', p.project, '', 'Site', p.site],
      ['Truck', p.truck, '', 'Driver', p.driver],
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
      <style>{`@page { size: A4 portrait; margin: 9mm; } @media print { #root { display: none !important; } #dn-print-root { zoom: 0.85; } }`}</style>

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
            <input value={client} onChange={e => setClient(e.target.value)} className={inputCls} style={client.trim() ? undefined : RED_IF_EMPTY} />
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
            <input value={truck} onChange={e => setTruck(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('driver')}</label>
            <input value={driver} onChange={e => setDriver(e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>{t('notes')}</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-300">
          <span dir="ltr">{f2(sub)}</span> + {t('vatAmt')} <span dir="ltr">{f2(vat)}</span> = {t('grand')}: <span dir="ltr">{f2(grand)}</span>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={doSave} className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2.5 rounded-lg text-sm">{t('save')}</button>
          <button onClick={() => { const p = buildPayload(); if (p) doExcel(p); else onToast(t('needClient')); }} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-5 py-2.5 rounded-lg font-bold text-sm">{t('excel')}</button>
          <button onClick={() => { const p = buildPayload(); if (p) setTimeout(() => window.print(), 60); else onToast(t('needClient')); }} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white px-5 py-2.5 rounded-lg font-bold text-sm">{t('print')}</button>
        </div>
      </div>

      {viewing && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <div id="dn-report-preview"><DNSheet p={viewing} /></div>
        </div>
      )}
      {viewing && createPortal(
        <div id="dn-print-root" className="hidden print:block"><DNSheet p={viewing} /></div>,
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
    </div>
  );
}
