import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useEInvoiceDict } from '../i18n/eInvoiceDict';

interface InvoiceProps {
  invoiceNo: string;
  date: string;
  time: string;
  customerName: string;
  customerCode: string;
  customerPhone: string;
  projectName: string;
  orderType: 'concrete' | 'blocks';
  quantity: number;
  concreteType?: string;
  /** Override the auto unit price when real pricing is known */
  unitPrice?: number;
  /** Delivery ticket / trip reference */
  ticketNo?: string;
  vehiclePlate?: string;
  mixDesign?: string;
  elementType?: string;
  onClose: () => void;
}

const UNIT_PRICES: Record<string, number> = {
  '2000': 2100, '2500': 2400, '3000': 2700,
  '3500': 3000, '4000': 3300, '5000': 4000,
};

function encodeTLV(parts: { tag: number; value: string }[]): string {
  const bytes: number[] = [];
  const enc = new TextEncoder();
  for (const p of parts) {
    const v = enc.encode(p.value);
    bytes.push(p.tag, v.length, ...v);
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export default function EInvoice(props: InvoiceProps) {
  const t = useEInvoiceDict();
  const [vatRate, setVatRate] = useState(15);
  const [currency, setCurrency] = useState<'SAR' | 'EGP'>('SAR');
  const [qr, setQr] = useState('');

  const sellerName = 'Fimto Concrete Plant';
  const sellerVatNo = '3-123-456-7890';

  const unitPrice = props.unitPrice ?? (props.orderType === 'concrete' ? (UNIT_PRICES[props.concreteType || '3000'] || 2700) : 5);
  const unitLabel = props.orderType === 'concrete' ? t('unitM3') : t('unitBlock');
  const totalExVat = unitPrice * props.quantity;
  const vatAmount = totalExVat * (vatRate / 100);
  const total = totalExVat + vatAmount;

  useEffect(() => {
    if (import.meta.env.PROD) {
      setQr('');
      return;
    }
    const payload = encodeTLV([
      { tag: 1, value: sellerName },
      { tag: 2, value: sellerVatNo },
      { tag: 3, value: new Date().toISOString() },
      { tag: 4, value: totalExVat.toFixed(2) },
      { tag: 5, value: vatAmount.toFixed(2) },
    ]);
    QRCode.toDataURL(payload, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [totalExVat, vatAmount]);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (import.meta.env.PROD) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={props.onClose}>
        <div className="bg-white text-black rounded-xl max-w-md p-6 text-center" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-black">ZATCA clearance required</h2>
          <p className="text-sm mt-2">This local preview is disabled in production. Share only a CLEARED or REPORTED ZATCA document.</p>
          <button onClick={props.onClose} className="mt-4 bg-gray-300 rounded-lg px-4 py-2 font-bold">{t('close')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={props.onClose}>
      <div
        className="invoice-sheet bg-white text-black rounded-xl w-full max-w-md my-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex justify-between items-start border-b-2 border-black pb-3">
            <div>
              <h2 className="text-xl font-black">FIMTO CONCRETE</h2>
              <p className="text-xs">{t('madeLine')}</p>
              <p className="text-[10px] text-gray-600 mt-1">{t('cityLine')}<br />Tel: +966 5X XXX XXXX</p>
              <p className="text-[10px] mt-1">VAT No: {sellerVatNo}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black">{t('invoice')}</p>
              <p className="text-[10px] text-gray-600">Electronic Invoice (QR)</p>
              <p className="text-xs font-bold mt-1"># {props.invoiceNo}</p>
              <p className="text-[10px]">{props.date} — {props.time}</p>
            </div>
          </div>

          <div className="py-3 text-xs border-b border-gray-300">
            <p><b>{t('customerL')}</b> {props.customerName}</p>
            <p><b>{t('customerCodeL')}</b> {props.customerCode || '—'}</p>
            <p><b>{t('phoneL')}</b> {props.customerPhone || '—'}</p>
            <p><b>{t('projectL')}</b> {props.projectName || '—'}</p>
            {props.elementType && <p><b>{t('elementL')}</b> {props.elementType}</p>}
            {props.mixDesign && <p><b>{t('mixL')}</b> {props.mixDesign}</p>}
          </div>

          {(props.ticketNo || props.vehiclePlate) && (
            <div className="flex flex-wrap justify-between gap-2 py-2 px-2 my-2 border border-gray-400 rounded text-[10px]">
              <span><b>{t('deliveryTicket')}</b> {props.ticketNo || '—'}</span>
              {props.vehiclePlate && <span><b>{t('truckNo')}</b> <span dir="ltr">{props.vehiclePlate}</span></span>}
            </div>
          )}

          <table className="w-full text-xs my-3">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">{t('descHead')}</th>
                <th className="py-1">{t('qtyHead')}</th>
                <th className="py-1">{t('priceHead')}</th>
                <th className="py-1 text-right">{t('totalHead')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-300">
                <td className="py-1">{props.orderType === 'concrete' ? t('concreteItem').replace('{type}', props.concreteType || '') : t('blockItem')}</td>
                <td className="py-1">{props.quantity} {unitLabel}</td>
                <td className="py-1">{fmt(unitPrice)}</td>
                <td className="py-1 text-right">{fmt(totalExVat)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-600">{t('taxLabel')}</label>
              <select
                value={vatRate}
                onChange={e => setVatRate(Number(e.target.value))}
                className="border border-gray-400 rounded text-[11px] px-1 py-0.5"
              >
                <option value={15}>{t('vat15')}</option>
                <option value={14}>{t('vat14')}</option>
                <option value={0}>{t('vat0')}</option>
              </select>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as 'SAR' | 'EGP')}
                className="border border-gray-400 rounded text-[11px] px-1 py-0.5"
              >
                <option value="SAR">SAR</option>
                <option value="EGP">EGP</option>
              </select>
            </div>
            <div className="text-right text-sm font-bold space-y-0.5">
              <div className="flex justify-between gap-6"><span className="text-gray-600 text-[11px] font-normal">{t('subTotal')}</span><span>{fmt(totalExVat)} {currency}</span></div>
              <div className="flex justify-between gap-6"><span className="text-gray-600 text-[11px] font-normal">{t('vatAmount').replace('{rate}', String(vatRate))}</span><span>{fmt(vatAmount)} {currency}</span></div>
              <div className="flex justify-between gap-6 border-t-2 border-black pt-0.5 text-base"><span>{t('grandTotal')}</span><span>{fmt(total)} {currency}</span></div>
            </div>
          </div>

          <div className="flex justify-center mt-4">
            {qr
              ? <img src={qr} alt="QR" className="w-32 h-32 border border-gray-300 rounded" />
              : <div className="w-32 h-32 bg-gray-200 rounded flex items-center justify-center text-[10px] text-gray-500">QR...</div>}
          </div>
          <p className="text-center text-[9px] text-gray-500 mt-1">{t('verifyHint')}</p>

          <div className="flex gap-2 mt-4">
            <button onClick={() => window.print()} className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 rounded-lg">{t('print')}</button>
            <button onClick={props.onClose} className="flex-1 bg-gray-300 hover:bg-gray-400 font-bold py-2.5 rounded-lg">{t('close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
