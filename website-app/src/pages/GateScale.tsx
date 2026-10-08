import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';

type Dir = 'IN' | 'OUT';

const IN_CATS = [
  { v: 'RAW_CEMENT', ar: 'أسمنت' },
  { v: 'RAW_SAND', ar: 'رمل' },
  { v: 'RAW_GRAVEL_10', ar: 'بحص 10مم' },
  { v: 'RAW_GRAVEL_20', ar: 'بحص 20مم' },
  { v: 'RAW_GRAVEL_40', ar: 'بحص 40مم' },
  { v: 'RAW_WATER', ar: 'ماء' },
  { v: 'RAW_ADMIXTURE', ar: 'إضافات' },
  { v: 'SPARE_PART', ar: 'قطع غيار' },
  { v: 'SUPPLY_OTHER', ar: 'توريد آخر' },
];
const OUT_CATS = [
  { v: 'CONCRETE', ar: 'خرسانة (م³)' },
  { v: 'BLOCK', ar: 'بلك (وحدة)' },
];
const CAT_AR: Record<string, string> = {};
for (const c of [...IN_CATS, ...OUT_CATS]) CAT_AR[c.v] = c.ar;

/**
 * Loose bulk densities (t/m³) — industry standards for weight↔volume
 * conversion at the gate. Concrete 2.4, aggregates ~1.55, sand 1.6,
 * bulk cement ~1.44, water 1.0, liquid admixture ~1.1.
 */
const DENSITY: Record<string, number> = {
  RAW_CEMENT: 1.44,
  RAW_SAND: 1.6,
  RAW_GRAVEL_10: 1.55,
  RAW_GRAVEL_20: 1.55,
  RAW_GRAVEL_40: 1.55,
  RAW_WATER: 1.0,
  RAW_ADMIXTURE: 1.1,
  CONCRETE: 2.4,
};
const kgToM3 = (kg: number, cat: string) =>
  DENSITY[cat] ? kg / 1000 / DENSITY[cat] : null;
const m3ToTon = (m3: number, cat: string) =>
  DENSITY[cat] ? (m3 * DENSITY[cat]) : null;

export default function GateScale() {
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);

  const [dir, setDir] = useState<Dir>('IN');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tickets, setTickets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [fleet, setFleet] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [f, setF] = useState({
    category: 'RAW_CEMENT', vehicleId: '', externalPlate: '', partyName: '',
    driverName: '', entryWeightKg: '', exitWeightKg: '', quantity: '', notes: '',
  });
  const [closeW, setCloseW] = useState<Record<string, string>>({});

  const cats = dir === 'IN' ? IN_CATS : OUT_CATS;

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ tickets?: any[]; summary?: any }>(
        `/api/gate?date=${date}&direction=${dir}`
      );
      setTickets(Array.isArray(d?.tickets) ? d.tickets : []);
      setSummary(d?.summary ?? null);
    } catch {
      setTickets([]);
    }
  }, [date, dir]);

  useEffect(() => {
    if (!currentUser) return;
    load();
    api.get<any[]>('/api/fleet').then((v) => setFleet(Array.isArray(v) ? v : [])).catch(() => {});
  }, [currentUser, load]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const convPreview = () => {
    const parts: string[] = [];
    const e = parseFloat(f.entryWeightKg);
    const x = parseFloat(f.exitWeightKg);
    if (!Number.isNaN(e) && !Number.isNaN(x)) {
      const net = Math.abs(e - x);
      const m3 = kgToM3(net, f.category);
      if (m3 !== null) parts.push(`${L('الصافي', 'Net')} ${(net / 1000).toFixed(2)} ${L('طن', 't')} ≈ ${m3.toFixed(2)} ${L('م³', 'm³')}`);
    } else if (!Number.isNaN(e)) {
      const m3 = kgToM3(e, f.category);
      if (m3 !== null) parts.push(`${(e / 1000).toFixed(2)} ${L('طن', 't')} ≈ ${m3.toFixed(2)} ${L('م³', 'm³')}`);
    }
    const q = parseFloat(f.quantity);
    if (!Number.isNaN(q) && dir === 'OUT' && f.category === 'CONCRETE') {
      const t = m3ToTon(q, 'CONCRETE');
      if (t !== null) parts.push(`${q} ${L('م³', 'm³')} ≈ ${t.toFixed(2)} ${L('طن', 't')}`);
    }
    return parts.join(' · ') || '—';
  };

  const open = async () => {
    if (!f.vehicleId && !f.externalPlate.trim()) {
      setMsg(`❌ ${L('اختر مركبة الأسطول أو اكتب لوحة خارجية', 'Pick a fleet vehicle or an external plate')}`);
      return;
    }
    if (!f.entryWeightKg.trim()) {
      setMsg(`❌ ${L('اكتب وزنة الدخول', 'Enter the entry weight')}`);
      return;
    }
    setBusy('open');
    try {
      const r = await api.post<{ ticketNo?: string }>('/api/gate', {
        direction: dir,
        category: f.category,
        ...(f.vehicleId ? { vehicleId: f.vehicleId } : {}),
        ...(f.externalPlate.trim() ? { externalPlate: f.externalPlate.trim() } : {}),
        ...(f.partyName.trim() ? { partyName: f.partyName.trim() } : {}),
        ...(f.driverName.trim() ? { driverName: f.driverName.trim() } : {}),
        entryWeightKg: Number(f.entryWeightKg),
        ...(f.exitWeightKg.trim() ? { exitWeightKg: Number(f.exitWeightKg) } : {}),
        ...(f.quantity.trim() ? { quantity: Number(f.quantity), quantityUnit: dir === 'IN' ? 'KG' : f.category === 'CONCRETE' ? 'M3' : 'UNIT' } : {}),
        ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
      });
      setMsg(`✅ ${L('تم فتح التذكرة', 'Ticket opened')} ${r?.ticketNo ?? ''}`);
      setF({
        category: dir === 'IN' ? 'RAW_CEMENT' : 'CONCRETE', vehicleId: '', externalPlate: '',
        partyName: '', driverName: '', entryWeightKg: '', exitWeightKg: '', quantity: '', notes: '',
      });
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? L('فشل الفتح', 'Failed')}`);
    } finally {
      setBusy('');
    }
  };

  const close = async (id: string) => {
    const w = (closeW[id] ?? '').trim();
    if (!w) {
      setMsg(`❌ ${L('اكتب وزنة الخروج', 'Enter the exit weight')}`);
      return;
    }
    setBusy('close' + id);
    try {
      const r = await api.put<{ netWeightKg?: number }>(`/api/gate/${id}/close`, { weightKg: Number(w) });
      setMsg(`✅ ${L('أغلقت — الصافي', 'Closed — net')} ${r?.netWeightKg ?? ''} ${L('كجم', 'kg')}`);
      setCloseW((p) => ({ ...p, [id]: '' }));
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? L('فشل الإغلاق', 'Failed')}`);
    } finally {
      setBusy('');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center">
        <p>{ar ? 'سجل الدخول أولاً.' : 'Log in first.'}</p>
      </div>
    );
  }

  const inputCls =
    'mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none';

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-200" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-3">
            <BrandLogo width={48} />
            <div>
              <h1 className="text-base font-black text-white">⚖️ {L('البوابة والميزان', 'Gate & Scale')}</h1>
              <p className="text-[11px] text-slate-400">
                {L('إثبات دخول الخامات والتوريدات وخروج الخرسانة والبلك', 'Proof of material entries and concrete/block exits')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">🏠</Link>
            <LangSelector />
          </div>
        </div>

        {msg && <p className="text-xs mb-2 font-bold">{msg}</p>}

        <div className="flex gap-2 mb-3">
          {(['IN', 'OUT'] as Dir[]).map((d) => (
            <button key={d} onClick={() => { setDir(d); setF((p) => ({ ...p, category: d === 'IN' ? 'RAW_CEMENT' : 'CONCRETE' })); }}
              className={`text-xs font-black rounded-xl px-6 py-2 border ${
                dir === d
                  ? d === 'IN'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                  : 'border-white/10 text-slate-400'
              }`}>
              {d === 'IN' ? `📥 ${L('دخول خامات وتوريدات', 'Entries')}` : `📤 ${L('خروج خرسانة وبلك', 'Exits')}`}
            </button>
          ))}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
              <p className="text-[10px] text-slate-400 font-bold">{L('تذاكر الدخول', 'Entries')}</p>
              <p className="text-lg font-black text-emerald-300">{summary.inTickets}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
              <p className="text-[10px] text-slate-400 font-bold">{L('تذاكر الخروج', 'Exits')}</p>
              <p className="text-lg font-black text-sky-300">{summary.outTickets}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
              <p className="text-[10px] text-slate-400 font-bold">{L('صافي الداخل (طن)', 'In (t)')}</p>
              <p className="text-lg font-black text-white">{(summary.inKg / 1000).toFixed(1)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
              <p className="text-[10px] text-slate-400 font-bold">{L('خرسانة (م³)', 'Concrete m³')}</p>
              <p className="text-lg font-black text-white">{summary.concreteM3}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-center">
              <p className="text-[10px] text-slate-400 font-bold">{L('بلك (وحدة)', 'Blocks')}</p>
              <p className="text-lg font-black text-white">{summary.blockUnits}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-3">
          <h3 className="text-xs font-black text-white mb-2">
            ➕ {dir === 'IN' ? L('تذكرة دخول (وزنة الشاحنة محملة)', 'Entry ticket (truck weighed loaded)') : L('تذكرة خروج (وزنة الحمولة)', 'Exit ticket')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <label className="text-[11px] text-slate-400 font-bold">{L('الصنف', 'Material')}
              <select value={f.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
                {cats.map((c) => <option key={c.v} value={c.v}>{c.ar}</option>)}
              </select></label>
            <label className="text-[11px] text-slate-400 font-bold">{L('مركبة الأسطول', 'Fleet vehicle')}
              <select value={f.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} className={inputCls}>
                <option value="">—</option>
                {(Array.isArray(fleet) ? fleet : []).map((v: any) => (
                  <option key={v.id ?? v.vehicleId} value={v.id ?? v.vehicleId}>
                    {v.vehicleCode ?? v.code} · {v.plateNumber ?? v.plate}
                  </option>
                ))}
              </select></label>
            <label className="text-[11px] text-slate-400 font-bold">{L('لوحة خارجية', 'External plate')}
              <input value={f.externalPlate} onChange={(e) => set('externalPlate', e.target.value)} className={inputCls} /></label>
            <label className="text-[11px] text-slate-400 font-bold">{dir === 'IN' ? L('المورّد', 'Supplier') : L('العميل / الموقع', 'Customer')}
              <input value={f.partyName} onChange={(e) => set('partyName', e.target.value)} className={inputCls} /></label>
            <label className="text-[11px] text-slate-400 font-bold">{L('السائق', 'Driver')}
              <input value={f.driverName} onChange={(e) => set('driverName', e.target.value)} className={inputCls} /></label>
            <label className="text-[11px] text-slate-400 font-bold">{L('وزنة الدخول (كجم) *', 'Entry kg *')}
              <input value={f.entryWeightKg} inputMode="decimal" onChange={(e) => set('entryWeightKg', e.target.value)} className={inputCls} /></label>
            <label className="text-[11px] text-slate-400 font-bold">{L('وزنة الخروج (كجم)', 'Exit kg')}
              <input value={f.exitWeightKg} inputMode="decimal" onChange={(e) => set('exitWeightKg', e.target.value)} className={inputCls} /></label>
            {dir === 'OUT' && (
              <label className="text-[11px] text-slate-400 font-bold">{f.category === 'CONCRETE' ? L('الكمية (م³)', 'Qty m³') : L('الكمية (وحدة)', 'Qty units')}
                <input value={f.quantity} inputMode="decimal" onChange={(e) => set('quantity', e.target.value)} className={inputCls} /></label>
            )}
            <label className="text-[11px] text-slate-400 font-bold">{L('ملاحظات', 'Notes')}
              <input value={f.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} /></label>
          </div>
          {(DENSITY[f.category] && (f.entryWeightKg.trim() || f.quantity.trim())) && (
            <p className="text-[11px] text-sky-300 font-bold mt-2">
              ⚖️ {L('تحويل', 'Convert')}: {convPreview()}
            </p>
          )}
          <button disabled={busy === 'open'} onClick={open}
            className="mt-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
            {busy === 'open' ? '…' : `✅ ${L('فتح التذكرة', 'Open ticket')}`}
          </button>
        </div>

        <div className="space-y-2">
          {tickets.length === 0 && <p className="text-xs text-slate-500">{L('لا تذاكر في هذا اليوم.', 'No tickets this day.')}</p>}
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-black text-white">
                  {t.direction === 'IN' ? '📥' : '📤'} <span dir="ltr">{t.ticketNo}</span> · {CAT_AR[t.category] ?? t.category} · {t.vehicleCode ?? t.externalPlate ?? '—'}
                </span>
                <span className={`font-black ${t.status === 'OPEN' ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {t.status === 'OPEN' ? L('مفتوحة', 'OPEN') : L('مغلقة', 'CLOSED')}
                </span>
              </div>
              <p className="text-slate-400 mt-1">
                {[t.partyName, t.driverName, t.orderRef].filter(Boolean).join(' · ')}
                {` · ${L('دخول', 'in')} ${t.entryWeightKg ?? '—'} ${L('خروج', 'out')} ${t.exitWeightKg ?? '—'}${t.netWeightKg != null ? ` · ${L('الصافي', 'net')} ${Number(t.netWeightKg).toLocaleString()} ${L('كجم', 'kg')}` : ''}`}
                {t.quantity != null && ` · ${t.quantity} ${t.quantityUnit ?? ''}`}
                {t.netWeightKg != null && DENSITY[t.category] != null && ` · ≈ ${(Number(t.netWeightKg) / 1000 / DENSITY[t.category]).toFixed(2)} ${L('م³', 'm³')}`}
                {t.category === 'CONCRETE' && t.quantity != null && ` · ≈ ${(Number(t.quantity) * DENSITY.CONCRETE).toFixed(2)} ${L('طن', 't')}`}
              </p>
              {t.status === 'OPEN' && (
                <div className="flex gap-2 mt-2">
                  <input value={closeW[t.id] ?? ''} inputMode="decimal"
                    onChange={(e) => setCloseW((p) => ({ ...p, [t.id]: e.target.value }))}
                    placeholder={L('وزنة الإغلاق (كجم)', 'Closing kg')}
                    className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                  <button disabled={busy === 'close' + t.id} onClick={() => close(t.id)}
                    className="text-[11px] font-black rounded-lg px-4 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                    {busy === 'close' + t.id ? '…' : `⚖️ ${L('إغلاق بالوزن', 'Close')}`}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
