/**
 * FIMTO SOFT — Thermal delivery ticket (بون الخرسانة/البلك).
 * 80mm thermal-printer layout, 3 copies per truck
 * (accounts / customer / gate), with prices + VAT.
 */

export interface ThermalTicketData {
  companyName?: string;
  ticketNo: string;
  date: string;
  time?: string;
  customer: string;
  site: string;
  product: string;
  qty: number;
  unit: string;
  truck: string;
  plate?: string;
  driver: string;
  pricePerUnit: number;
  qrDataUrl?: string;
}

export const THERMAL_COPIES = [
  { key: 'ACC', ar: 'حسابات — الأصل', en: 'Accounts — Original' },
  { key: 'CUS', ar: 'العميل — صورة', en: 'Customer — Copy' },
  { key: 'GATE', ar: 'البوابة — صورة', en: 'Gate — Copy' },
];

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function printThermalTicket(d: ThermalTicketData): void {
  const subtotal = (d.qty || 0) * (d.pricePerUnit || 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;
  const copyHtml = (c: (typeof THERMAL_COPIES)[number], i: number) => `
    <div class="copy">
      <div class="center b">${d.companyName || 'FIMTO CONCRETE'}</div>
      <div class="center">بون ${d.unit === 'م³' ? 'خرسانة' : 'توريد'} — ${c.ar}</div>
      <div class="center">تذكرة رقم: <b dir="ltr">${d.ticketNo}</b> (نسخة ${i + 1}/3)</div>
      <div class="line">--------------------------------</div>
      <div>التاريخ: ${d.date} ${d.time ?? ''}</div>
      <div>العميل: ${d.customer}</div>
      <div>الموقع: ${d.site}</div>
      <div>الصنف: ${d.product}</div>
      <div>الكمية: <b>${fmt(d.qty)} ${d.unit}</b></div>
      <div>السيارة: ${d.truck}${d.plate ? ` — ${d.plate}` : ''}</div>
      <div>السائق: ${d.driver}</div>
      <div class="line">--------------------------------</div>
      <div>سعر ${d.unit}: <b>${fmt(d.pricePerUnit)}</b> ر.س</div>
      <div>الإجمالي: <b>${fmt(subtotal)}</b> ر.س</div>
      <div>ضريبة 15%: <b>${fmt(vat)}</b> ر.س</div>
      <div class="b">الإجمالي شامل: <b>${fmt(total)}</b> ر.س</div>
      <div class="line">--------------------------------</div>
      ${d.qrDataUrl ? `<div class="center"><img src="${d.qrDataUrl}" style="width:110px;height:110px;" /></div>` : ''}
      <div class="sig">توقيع المستلم: ....................</div>
      <div class="sig">توقيع السائق: ....................</div>
      <div class="center">البوابة: ختم الدخول / الخروج .....</div>
    </div>`;
  const w = window.open('', '_blank', 'width=420,height=800');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>بون ${d.ticketNo}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Tahoma, monospace; font-size: 12px; color: #000; width: 76mm; margin: 0 auto; }
    .copy { page-break-after: always; padding: 2mm 0 6mm; }
    .copy:last-child { page-break-after: avoid; }
    .center { text-align: center; }
    .b { font-weight: 900; }
    .line { text-align: center; margin: 2mm 0; }
    .sig { margin-top: 4mm; }
    @media print { body { width: auto; } }
  </style></head><body>
  ${THERMAL_COPIES.map(copyHtml).join('')}
  <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
  w.document.close();
}
