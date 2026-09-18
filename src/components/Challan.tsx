import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface ChallanProps {
  trip: any;
  order: any;
  challan: any;
  onClose: () => void;
}

/** Renders normalized signature strokes (JSON) as an SVG path. */
function SignatureSvg({ raw, size }: { raw?: string; size: number }) {
  if (!raw) return <p className="text-[10px] text-gray-400 text-center py-6">لم يتم التوقيع</p>;
  let strokes: Array<Array<[number, number]>> | null = null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) strokes = v;
  } catch {
    strokes = null;
  }
  if (strokes === null) {
    return <img src={raw} alt="توقيع" className="mx-auto" style={{ height: size }} />;
  }
  const paths = strokes.map((stroke) =>
    stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(' ')
  );
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ width: '100%', height: size, display: 'block' }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#000" strokeWidth={0.004} strokeLinecap="round" />
      ))}
    </svg>
  );
}

export default function Challan({ trip, order, challan, onClose }: ChallanProps) {
  const [qr, setQr] = useState('');
  const code = String(trip?.code ?? trip?.id ?? '');
  const qty = Number(trip?.qty ?? 0);
  const orderNo = order?.orderNo || order?.id || trip?.orderId || '—';
  const customerName = order?.customerName || trip?.projectName || '—';
  const siteName = order?.projectName || trip?.siteName || '—';
  const mixDesign = String(trip?.code ?? order?.concreteType ?? '—');
  const challanNo = challan?.number || `CH-${trip?.date?.replace?.(/-/g, '') || ''}-${trip?.id || ''}`;

  useEffect(() => {
    const payload =
      challan?.qrCode ||
      `FIMTO|CHALLAN|${trip?.id || ''}|${orderNo}|${qty}|${code}`;
    QRCode.toDataURL(payload, { margin: 1, width: 200, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, orderNo, qty, code, challan?.qrCode]);

  const stage = (v?: string) => (v && v !== '00:00' ? v : '—');
  const cycle = Number(trip?.cycleTimeMin) || 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div
        className="invoice-sheet bg-white text-black rounded-xl w-full max-w-md my-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex justify-between items-start border-b-2 border-black pb-3">
            <div>
              <h2 className="text-xl font-black">FIMTO CONCRETE</h2>
              <p className="text-xs">جاهزة ومصمتة</p>
              <p className="text-[10px] text-gray-600 mt-1">المملكة العربية السعودية<br/>هاتف: +966 5X XXX XXXX</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black">مستند التوريد الرقمي</p>
              <p className="text-[10px] text-gray-600">Digital Delivery Document</p>
              <p className="text-xs font-bold mt-1"># {challanNo}</p>
              <p className="text-[10px]">{trip?.date || '—'}</p>
            </div>
          </div>

          <div className="py-3 text-xs border-b border-gray-300 space-y-1">
            <p><b>رقم الطلب:</b> {orderNo}</p>
            <p><b>العميل:</b> {customerName}</p>
            <p><b>الموقع:</b> {siteName}</p>
            <p><b>الخلطة:</b> {mixDesign} · <b>الكمية:</b> {qty} م³</p>
            <p><b>خلاطة:</b> {String(trip?.pump || '—')} · <b>السائق:</b> {String(trip?.driver || '—')}</p>
          </div>

          <div className="py-3 text-xs border-b border-gray-300">
            <p className="font-bold mb-1">أوقات الرحلة</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p>الانطلاق: <b>{stage(trip?.stationDep)}</b></p>
              <p>وصول الموقع: <b>{stage(trip?.siteArr)}</b></p>
              <p>بداية الصب: <b>{stage(trip?.pourStartTime)}</b></p>
              <p>نهاية الصب: <b>{stage(trip?.siteDep)}</b></p>
              <p>العودة للمصنع: <b>{stage(trip?.returnTime)}</b></p>
              <p>زمن الدورة: <b>{cycle ? cycle + ' دقيقة' : '—'}</b></p>
            </div>
            {(challan?.slumpMm != null || challan?.temperatureC != null) && (
              <p className="mt-1">
                الهبوط: <b>{challan.slumpMm != null ? challan.slumpMm + ' مم' : '—'}</b> · درجة الحرارة: <b>{challan.temperatureC != null ? challan.temperatureC + ' °C' : '—'}</b>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 py-3 border-b border-gray-300">
            <div>
              <p className="text-[10px] text-gray-500 mb-1">توقيع المستلم</p>
              <div className="border border-gray-300 rounded overflow-hidden" style={{ height: 90 }}>
                <SignatureSvg raw={challan?.customerSignature} size={88} />
              </div>
              <p className="text-xs mt-1 font-bold">المستلم: {challan?.receivedBy || '—'}</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              {qr
                ? <img src={qr} alt="QR" className="w-28 h-28 border border-gray-300 rounded" />
                : <div className="w-28 h-28 bg-gray-200 rounded flex items-center justify-center text-[10px] text-gray-500">QR...</div>}
              <p className="text-[9px] text-gray-500 mt-1">للاستعلام عن المستند</p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => window.print()} className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 rounded-lg">🖨️ طباعة</button>
            <button onClick={onClose} className="flex-1 bg-gray-300 hover:bg-gray-400 font-bold py-2.5 rounded-lg">إغلاق</button>
          </div>
        </div>
      </div>
    </div>
  );
}
