import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  Sales Quoting RFQ + Commissions (Epic 8) — /quoting
 * ============================================================
 *  Quotes: DRAFT → SUBMITTED → COSTED → APPROVED → CONVERTED
 *  (approval blocked below floor price). Commissions: schemes +
 *  preview + approve + pay.
 * ============================================================
 */

interface RfqItem {
  id: string;
  mixDesignId: string;
  designCode: string;
  volumeM3: string;
  materialCostPerM3: string;
  haulCostPerM3: string;
  pumpCostPerM3: string;
  overheadCostPerM3: string;
  totalCostPerM3: string;
  marginPct: string;
  floorPricePerM3: string;
  quotedPricePerM3: string;
}

interface Rfq {
  id: string;
  rfqNumber: string;
  clientId: string;
  companyName: string;
  status: string;
  validUntil: string | null;
  items?: RfqItem[];
}

interface Scheme {
  id: string;
  name: string;
  ratePct: string;
  minDeliveredM3: string;
  isActive: boolean;
}

interface ClientOpt {
  id: string;
  companyName: string;
  clientCode: string;
}

interface MixOpt {
  id: string;
  designCode: string;
  gradeDescription?: string | null;
}

interface RepOpt {
  id: string;
  userId?: string | null;
  fullName: string;
  employeeCode: string;
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  SUBMITTED: 'bg-amber-500/20 text-amber-300',
  COSTED: 'bg-sky-500/20 text-sky-300',
  APPROVED: 'bg-emerald-500/20 text-emerald-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  CONVERTED: 'bg-violet-500/20 text-violet-300',
  EXPIRED: 'bg-slate-500/20 text-slate-500',
};

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export default function Quotations() {
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);
  const [tab, setTab] = useState<'quotes' | 'commissions'>('quotes');
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [selected, setSelected] = useState<Rfq | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [cClientId, setCClientId] = useState('');
  const [cMixId, setCMixId] = useState('');
  const [cVolume, setCVolume] = useState('');

  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [sName, setSName] = useState('');
  const [sRate, setSRate] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [pRep, setPRep] = useState('');
  const [pFrom, setPFrom] = useState('');
  const [pTo, setPTo] = useState('');

  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [mixes, setMixes] = useState<MixOpt[]>([]);
  const [reps, setReps] = useState<RepOpt[]>([]);
  const [cClientSearch, setCClientSearch] = useState('');
  const [cMixSearch, setCMixSearch] = useState('');
  const [pRepSearch, setPRepSearch] = useState('');

  const filteredClients = clients.filter(c =>
    `${c.companyName} ${c.clientCode}`.toLowerCase().includes(cClientSearch.trim().toLowerCase()));
  const filteredMixes = mixes.filter(m =>
    `${m.designCode} ${m.gradeDescription ?? ''}`.toLowerCase().includes(cMixSearch.trim().toLowerCase()));
  const filteredReps = reps.filter(r =>
    `${r.fullName} ${r.employeeCode}`.toLowerCase().includes(pRepSearch.trim().toLowerCase()));

  const load = async () => {
    try {
      const [r, s] = await Promise.all([
        api.get<{ data: { rfqs: Rfq[] } }>('/api/sales/rfq'),
        api.get<{ data: { schemes: Scheme[] } }>('/api/sales/commissions/schemes'),
      ]);
      setRfqs(r.data.rfqs);
      setSchemes(s.data.schemes);
    } catch { setMsg('⚠️ Could not load data.'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get<ClientOpt[]>('/api/clients').then(setClients).catch(() => {});
    api.get<MixOpt[]>('/api/mix-designs').then(setMixes).catch(() => {});
    // SalesRepId expected by /api/sales/commissions is the login user id
    // (auth.user.sub); the employee directory links it via userId.
    api.get<{ employees: RepOpt[] }>('/api/hr/employees')
      .then(r => setReps(Array.isArray(r.employees) ? r.employees : []))
      .catch(() => {});
  }, []);

  const openRfq = async (id: string) => {
    try {
      const res = await api.get<{ data: Rfq }>(`/api/sales/rfq/${id}`);
      setSelected(res.data);
    } catch { setMsg('⚠️ Could not open quotation.'); }
  };

  const createRfq = async () => {
    if (!cClientId.trim() || !cMixId.trim() || !cVolume) { setMsg('⚠️ Client + mix + volume are required.'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ data: Rfq }>('/api/sales/rfq', {
        clientId: cClientId.trim(),
        items: [{ mixDesignId: cMixId.trim(), volumeM3: parseFloat(cVolume) }],
      });
      setMsg(`✅ ${res.data.rfqNumber} drafted.`);
      setCClientId(''); setCMixId(''); setCVolume('');
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Create failed.'}`); }
    setBusy(false);
  };

  const transition = async (action: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.put<{ data: Rfq }>(`/api/sales/rfq/${selected.id}`, { action });
      setSelected({ ...(await api.get<{ data: Rfq }>(`/api/sales/rfq/${selected.id}`)).data });
      setMsg(`✅ Quotation ${res.data.status}.`);
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Transition failed.'}`); }
    setBusy(false);
  };

  const saveItem = async (item: RfqItem, patch: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await api.put(`/api/sales/rfq/items/${item.id}`, patch);
      await openRfq(selected.id);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Save failed.'}`); }
  };

  const convert = async () => {
    if (!selected) return;
    const date = prompt('Scheduled pour date (YYYY-MM-DD)?', new Date().toISOString().slice(0, 10));
    if (!date) return;
    setBusy(true);
    try {
      const res = await api.post<{ data: { orders: { orderNumber: string }[] } }>(
        `/api/sales/rfq/${selected.id}/convert`, { scheduledDate: date });
      setMsg(`✅ ${res.data.orders.map(o => o.orderNumber).join(', ')} sent to finance.`);
      setSelected(null);
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Convert failed.'}`); }
    setBusy(false);
  };

  const createScheme = async () => {
    if (!sName.trim() || !sRate) { setMsg('⚠️ Scheme name + rate required.'); return; }
    setBusy(true);
    try {
      await api.post('/api/sales/commissions/schemes', { name: sName.trim(), ratePct: parseFloat(sRate) });
      setMsg('✅ Scheme created.');
      setSName(''); setSRate('');
      await load();
    } catch { setMsg('⚠️ Create failed (manager approval right needed).'); }
    setBusy(false);
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams({ preview: '1', from: pFrom || '2026-01-01', to: pTo || new Date().toISOString().slice(0, 10) });
      if (pRep.trim()) q.set('salesRepId', pRep.trim());
      const res = await api.get<{ data: any }>(`/api/sales/commissions?${q.toString()}`);
      setPreview(res.data);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Preview failed.'}`); }
    setBusy(false);
  };

  const approvePreview = async () => {
    if (!preview?.ok) return;
    if (!pRep.trim()) { setMsg('⚠️ Select the rep to store commission rows.'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ data: { created: number } }>('/api/sales/commissions', {
        salesRepId: pRep.trim(),
        schemeId: preview.scheme.id,
        ratePct: preview.scheme.ratePct,
        period: (pFrom || new Date().toISOString()).slice(0, 7),
        lines: preview.lines.map((l: any) => ({ orderId: l.orderId, revenueSar: l.revenueSar, commissionSar: l.commissionSar })),
      });
      setMsg(`✅ ${res.data.created} commission row(s) approved.`);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Approve failed.'}`); }
    setBusy(false);
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">{L('عودة للدخول', 'Back to Login')}</Link></div></div>;

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💰 Sales Quoting & Commissions</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('quotes')} className={`px-4 py-2 rounded-lg font-bold text-sm ${tab === 'quotes' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>📝 Quotes</button>
          <button onClick={() => setTab('commissions')} className={`px-4 py-2 rounded-lg font-bold text-sm ${tab === 'commissions' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>⭐ Commissions</button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        {tab === 'quotes' && (
          <>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">➕ New Quotation (العميل / الخلطة)</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <input value={cClientSearch} onChange={e => setCClientSearch(e.target.value)} placeholder="🔍 بحث عن عميل..." className={inputCls} />
                  <select value={cClientId} onChange={e => setCClientId(e.target.value)} className={`${inputCls} mt-2`}>
                    <option value="">— العميل —</option>
                    {filteredClients.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName} ({c.clientCode})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input value={cMixSearch} onChange={e => setCMixSearch(e.target.value)} placeholder="🔍 بحث عن خلطة..." className={inputCls} />
                  <select value={cMixId} onChange={e => setCMixId(e.target.value)} className={`${inputCls} mt-2`}>
                    <option value="">— الخلطة —</option>
                    {filteredMixes.map(m => (
                      <option key={m.id} value={m.id}>{m.designCode}{m.gradeDescription ? ` — ${m.gradeDescription}` : ''}</option>
                    ))}
                  </select>
                </div>
                <input value={cVolume} onChange={e => setCVolume(e.target.value)} placeholder="Volume m³" type="number" className={inputCls} />
                <button onClick={createRfq} disabled={busy} className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg">➕ Draft</button>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">📝 Quotations ({rfqs.length})</h3>
              <div className="space-y-2">
                {rfqs.map(r => (
                  <button key={r.id} onClick={() => openRfq(r.id)} className="w-full text-left bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 hover:border-sky-500/40">
                    <span className="font-bold text-white text-sm">{r.rfqNumber}</span>
                    <span className="text-xs text-slate-400">{r.companyName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ml-auto ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                  </button>
                ))}
                {rfqs.length === 0 && <p className="text-slate-500 text-sm text-center py-4">{L('لا عروض بعد.', 'No quotations yet.')}</p>}
              </div>
            </div>

            {selected && (
              <div className="bg-white/[0.04] border border-sky-500/30 rounded-2xl p-6 backdrop-blur-xl">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <h3 className="text-lg font-bold text-white">{selected.rfqNumber}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${STATUS_STYLE[selected.status] ?? ''}`}>{selected.status}</span>
                  <div className="flex gap-2 ml-auto flex-wrap">
                    {selected.status === 'DRAFT' && <button onClick={() => transition('SUBMIT')} disabled={busy} className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg font-bold">📤 Submit</button>}
                    {selected.status === 'SUBMITTED' && <button onClick={() => transition('MARK_COSTED')} disabled={busy} className="text-xs bg-sky-500/20 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg font-bold">🧮 Mark Costed</button>}
                    {selected.status === 'COSTED' && <button onClick={() => transition('APPROVE')} disabled={busy} className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold">✅ Approve</button>}
                    {selected.status === 'APPROVED' && <button onClick={convert} disabled={busy} className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/30 px-3 py-1.5 rounded-lg font-bold">🏭 Convert to Orders</button>}
                    <button onClick={() => setSelected(null)} className="text-xs bg-white/[0.05] px-3 py-1.5 rounded-lg">✖</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {(selected.items || []).map(it => (
                    <ItemEditor key={it.id} item={it} onSave={(p) => saveItem(it, p)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'commissions' && (
          <>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">📊 Schemes ({schemes.length})</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {schemes.map(s => (
                  <span key={s.id} className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${s.isActive ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-white/[0.03] text-slate-500 border-white/10'}`}>
                    {s.name} — {s.ratePct}%
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input value={sName} onChange={e => setSName(e.target.value)} placeholder="Scheme name" className={inputCls} />
                <input value={sRate} onChange={e => setSRate(e.target.value)} placeholder="Rate %" type="number" className={inputCls} />
                <button onClick={createScheme} disabled={busy} className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg">➕ Scheme</button>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-white mb-4">⭐ Earnings Preview → Approve</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <input value={pRepSearch} onChange={e => setPRepSearch(e.target.value)} placeholder="🔍 بحث عن مندوب..." className={inputCls} />
                  <select value={pRep} onChange={e => setPRep(e.target.value)} className={`${inputCls} mt-2`}>
                    <option value="">— المندوب (فارغ = أنا) —</option>
                    {filteredReps.map(r => (
                      <option key={r.id} value={r.userId ?? r.id}>{r.fullName} ({r.employeeCode})</option>
                    ))}
                  </select>
                </div>
                <input value={pFrom} onChange={e => setPFrom(e.target.value)} type="date" className={`${inputCls} [color-scheme:dark]`} />
                <input value={pTo} onChange={e => setPTo(e.target.value)} type="date" className={`${inputCls} [color-scheme:dark]`} />
                <button onClick={runPreview} disabled={busy} className="bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg">🔍 Preview</button>
              </div>
              {preview?.ok && (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-center">
                    <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">{L('المُسلّم', 'Delivered')}</p><p className="text-white font-bold">{preview.totals.deliveredM3} m³</p></div>
                    <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">{L('الإيراد', 'Revenue')}</p><p className="text-white font-bold">{preview.totals.revenueSar} SAR</p></div>
                    <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">{L('النظام', 'Scheme')}</p><p className="text-white font-bold">{preview.scheme.name} {preview.scheme.ratePct}%</p></div>
                    <div className="bg-white/[0.03] rounded-xl p-3"><p className="text-[11px] text-slate-400">{L('العمولة', 'Commission')}</p><p className="text-emerald-400 font-bold text-xl">{preview.totals.commissionSar} SAR</p></div>
                  </div>
                  <button onClick={approvePreview} disabled={busy} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg">✅ Approve → PENDING rows</button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ItemEditor({ item, onSave }: { item: RfqItem; onSave: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    haul: item.haulCostPerM3, pump: item.pumpCostPerM3, overhead: item.overheadCostPerM3,
    margin: item.marginPct, quoted: item.quotedPricePerM3,
  });
  const belowFloor = num(f.quoted) < num(item.floorPricePerM3) - 0.005 && num(item.floorPricePerM3) > 0;
  const cls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs';
  return (
    <div className={`border rounded-xl p-4 ${belowFloor ? 'border-red-500/50 bg-red-500/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="font-bold text-white text-sm">🧪 {item.designCode} <span className="text-slate-400 font-normal">• {item.volumeM3} m³</span></p>
        <span className="text-[10px] text-slate-400 ml-auto">Material {item.materialCostPerM3} → Total {item.totalCostPerM3} → Floor <b className="text-amber-300">{item.floorPricePerM3}</b></span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <label className="text-[11px] text-slate-400">Haul/m³<input value={f.haul} onChange={e => setF({ ...f, haul: e.target.value })} type="number" className={cls} /></label>
        <label className="text-[11px] text-slate-400">Pump/m³<input value={f.pump} onChange={e => setF({ ...f, pump: e.target.value })} type="number" className={cls} /></label>
        <label className="text-[11px] text-slate-400">Overhead/m³<input value={f.overhead} onChange={e => setF({ ...f, overhead: e.target.value })} type="number" className={cls} /></label>
        <label className="text-[11px] text-slate-400">Margin %<input value={f.margin} onChange={e => setF({ ...f, margin: e.target.value })} type="number" className={cls} /></label>
        <label className="text-[11px] text-slate-400">Quoted/m³<input value={f.quoted} onChange={e => setF({ ...f, quoted: e.target.value })} type="number" className={cls} /></label>
      </div>
      {belowFloor && <p className="text-[11px] text-red-400 font-bold mt-2">🔴 Below floor — approval will be blocked.</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={() => onSave({ autoMaterial: true })} className="text-[11px] bg-sky-500/15 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg font-bold">🤖 Auto material cost</button>
        <button onClick={() => onSave({ haulCostPerM3: parseFloat(f.haul) || 0, pumpCostPerM3: parseFloat(f.pump) || 0, overheadCostPerM3: parseFloat(f.overhead) || 0, marginPct: parseFloat(f.margin) || 0, quotedPricePerM3: parseFloat(f.quoted) || 0 })} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold">💾 Save costing</button>
      </div>
    </div>
  );
}
