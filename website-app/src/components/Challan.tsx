import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { useChallanDict } from '../i18n/challanDict';

interface ChallanProps {
  trip: any;
  order: any;
  challan: any;
  onClose: () => void;
  onSignatureSave?: (signature: string) => void;
}

/** Interactive signature pad for capturing customer signature */
function SignaturePad({ onSave }: { onSave: (data: string) => void }) {
  const t = useChallanDict();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const strokesRef = useRef<Array<Array<[number, number]>>>([]);
  const currentStrokeRef = useRef<Array<[number, number]>>([]);

  const getPos = (e: React.TouchEvent | React.MouseEvent): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    currentStrokeRef.current = [getPos(e)];
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    currentStrokeRef.current.push(getPos(e));
    // Draw on canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pts = currentStrokeRef.current;
    if (pts.length < 2) return;
    const [x1, y1] = pts[pts.length - 2];
    const [x2, y2] = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(x1 * canvas.width, y1 * canvas.height);
    ctx.lineTo(x2 * canvas.width, y2 * canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push(currentStrokeRef.current);
      currentStrokeRef.current = [];
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    strokesRef.current = [];
    setHasSignature(false);
  };

  const save = () => {
    if (strokesRef.current.length === 0) return;
    onSave(JSON.stringify(strokesRef.current));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <p className="text-[10px] text-gray-500 mt-1 text-center">{t('signatureHint')}</p>
      <div className="flex gap-2 mt-2">
        <button onClick={clear} className="flex-1 bg-gray-200 hover:bg-gray-300 text-black text-xs font-bold py-2 rounded-lg">{t('clearSig')}</button>
        <button onClick={save} disabled={!hasSignature} className={`flex-1 text-white text-xs font-bold py-2 rounded-lg ${hasSignature ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-gray-400 cursor-not-allowed'}`}>{t('saveSig')}</button>
      </div>
    </div>
  );
}

/** Renders normalized signature strokes (JSON) as an SVG path. */
function SignatureSvg({ raw, size, notSigned, altLabel }: { raw?: string; size: number; notSigned: string; altLabel: string }) {
  if (!raw) return <p className="text-[10px] text-gray-400 text-center py-6">{notSigned}</p>;
  let strokes: Array<Array<[number, number]>> | null = null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) strokes = v;
  } catch {
    strokes = null;
  }
  if (strokes === null) {
    return <img src={raw} alt={altLabel} className="mx-auto" style={{ height: size }} />;
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

export default function Challan({ trip, order, challan, onClose, onSignatureSave }: ChallanProps) {
  const t = useChallanDict();
  const [qr, setQr] = useState('');
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [savedSignature, setSavedSignature] = useState(challan?.customerSignature || '');
  const [waterLogs, setWaterLogs] = useState<Array<{ time: string; liters: number; reason: string }>>(challan?.waterAdditions || []);
  const [waterForm, setWaterForm] = useState({ liters: '', reason: 'تعديل الهبوط' });
  const [showWaterForm, setShowWaterForm] = useState(false);
  const code = String(trip?.code ?? trip?.id ?? '');
  const qty = Number(trip?.qty ?? 0);
  const orderNo = order?.orderNo || order?.id || trip?.orderId || '—';
  const customerName = order?.customerName || trip?.projectName || '—';
  const siteName = order?.projectName || trip?.siteName || '—';
  const mixDesign = String(trip?.code ?? order?.concreteType ?? '—');
  const challanNo = challan?.number || `CH-${trip?.date?.replace?.(/-/g, '') || ''}-${trip?.id || ''}`;

  const handleSignatureSave = (sig: string) => {
    setSavedSignature(sig);
    setShowSignaturePad(false);
    if (onSignatureSave) onSignatureSave(sig);
  };

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
              <p className="text-xs">{t('readySolid')}</p>
              <p className="text-[10px] text-gray-600 mt-1">{t('saCountry')}<br/>{t('saPhone')}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black">{t('deliveryDoc')}</p>
              <p className="text-[10px] text-gray-600">Digital Delivery Document</p>
              <p className="text-xs font-bold mt-1"># {challanNo}</p>
              <p className="text-[10px]">{trip?.date || '—'}</p>
            </div>
          </div>

          <div className="py-3 text-xs border-b border-gray-300 space-y-1">
            <p><b>{t('orderNo')}</b> {orderNo}</p>
            <p><b>{t('customer')}</b> {customerName}</p>
            <p><b>{t('site')}</b> {siteName}</p>
            <p><b>{t('mix')}</b> {mixDesign} · <b>{t('qty')}</b> {qty} {t('unitM3')}</p>
            <p><b>{t('mixer')}</b> {String(trip?.pump || '—')} · <b>{t('driver')}</b> {String(trip?.driver || '—')}</p>
          </div>

          <div className="py-3 text-xs border-b border-gray-300">
            <p className="font-bold mb-1">{t('tripTimes')}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p>{t('depart')} <b>{stage(trip?.stationDep)}</b></p>
              <p>{t('siteArr')} <b>{stage(trip?.siteArr)}</b></p>
              <p>{t('pourStart')} <b>{stage(trip?.pourStartTime)}</b></p>
              <p>{t('pourEnd')} <b>{stage(trip?.siteDep)}</b></p>
              <p>{t('returnTrip')} <b>{stage(trip?.returnTime)}</b></p>
              <p>{t('cycleTime')} <b>{cycle ? cycle + ' ' + t('minute') : '—'}</b></p>
            </div>
            {(challan?.slumpMm != null || challan?.temperatureC != null) && (
              <p className="mt-1">
                {t('slump')} <b>{challan.slumpMm != null ? challan.slumpMm + ' ' + t('unitMm') : '—'}</b> · {t('temperature')} <b>{challan.temperatureC != null ? challan.temperatureC + ' °C' : '—'}</b>
              </p>
            )}
          </div>

          {/* سجل إضافة المياه أثناء النقل */}
          <div className="py-3 text-xs border-b border-gray-300">
            <div className="flex justify-between items-center mb-1">
              <p className="font-bold">{t('waterLogTitle')}</p>
              <button
                onClick={() => setShowWaterForm(!showWaterForm)}
                className="bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold px-2.5 py-1 rounded print:hidden"
              >
                {showWaterForm ? t('closeBtn') : t('addBtn')}
              </button>
            </div>
            {waterLogs.length === 0 && !showWaterForm && (
              <p className="text-[10px] text-gray-500">{t('noWater')}</p>
            )}
            {waterLogs.length > 0 && (
              <table className="w-full mt-1 border border-gray-200">
                <thead className="bg-gray-100">
                  <tr><th className="p-1 text-[10px] border-r border-gray-200">{t('wTime')}</th><th className="p-1 text-[10px] border-r border-gray-200">{t('wQty')}</th><th className="p-1 text-[10px]">{t('wReason')}</th></tr>
                </thead>
                <tbody>
                  {waterLogs.map((w, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="p-1 text-center border-r border-gray-200">{w.time}</td>
                      <td className="p-1 text-center font-bold border-r border-gray-200">{w.liters}</td>
                      <td className="p-1 text-center">{w.reason}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-400 bg-gray-50">
                    <td className="p-1 text-center font-bold">{t('wTotal')}</td>
                    <td className="p-1 text-center font-bold">{waterLogs.reduce((s, w) => s + w.liters, 0)} {t('unitLiter')}</td>
                    <td className="p-1"></td>
                  </tr>
                </tbody>
              </table>
            )}
            {showWaterForm && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-3 gap-2 items-end print:hidden">
                <div>
                  <label className="text-[9px] text-gray-600 block">{t('wQty')}</label>
                  <input type="number" min="1" value={waterForm.liters} onChange={e => setWaterForm({ ...waterForm, liters: e.target.value })} placeholder="10" className="w-full border border-gray-300 rounded p-1 text-xs" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-600 block">{t('wReason')}</label>
                  <select value={waterForm.reason} onChange={e => setWaterForm({ ...waterForm, reason: e.target.value })} className="w-full border border-gray-300 rounded p-1 text-xs">
                    <option value="تعديل الهبوط">{t('waterReason1')}</option>
                    <option value="طلب العميل">{t('waterReason2')}</option>
                    <option value="ظروف الطريق">{t('waterReason3')}</option>
                    <option value="أخرى">{t('waterReason4')}</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    const l = parseInt(waterForm.liters);
                    if (!l || l <= 0) return;
                    setWaterLogs([...waterLogs, { time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), liters: l, reason: waterForm.reason }]);
                    setWaterForm({ liters: '', reason: 'تعديل الهبوط' });
                    setShowWaterForm(false);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-1.5 rounded"
                >
                  {t('recordBtn')}
                </button>
              </div>
            )}
          </div>

          <div className="py-3 border-b border-gray-300">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">{t('recipientSig')}</p>
                <div className="border border-gray-300 rounded overflow-hidden" style={{ height: 90 }}>
                  <SignatureSvg raw={savedSignature} size={88} notSigned={t('noSignature')} altLabel={t('signatureAlt')} />
                </div>
                <p className="text-xs mt-1 font-bold">{t('recipient')} {challan?.receivedBy || '—'}</p>
                <button
                  onClick={() => setShowSignaturePad(!showSignaturePad)}
                  className="mt-2 w-full bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold py-1.5 rounded-lg"
                >
                  {showSignaturePad ? t('closeSigPad') : t('sigOnTablet')}
                </button>
              </div>
              <div className="flex flex-col items-center justify-center">
                {qr
                  ? <img src={qr} alt="QR" className="w-28 h-28 border border-gray-300 rounded" />
                  : <div className="w-28 h-28 bg-gray-200 rounded flex items-center justify-center text-[10px] text-gray-500">QR...</div>}
                <p className="text-[9px] text-gray-500 mt-1">{t('docInquiry')}</p>
              </div>
            </div>
            {showSignaturePad && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs font-bold text-gray-700 mb-2">{t('sigPadTitle')}</p>
                <SignaturePad onSave={handleSignatureSave} />
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => window.print()} className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-bold py-2.5 rounded-lg">{t('print')}</button>
            <button onClick={onClose} className="flex-1 bg-gray-300 hover:bg-gray-400 font-bold py-2.5 rounded-lg">{t('close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
