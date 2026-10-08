import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  Sustainability — Carbon Footprint (Epic 11) — /sustainability
 * ============================================================
 *  Editable emission factors + per-order footprint + tenant totals.
 * ============================================================
 */

interface Factor {
  factorKey: string;
  unit: string;
  kgco2ePerUnit: string;
  source: string | null;
}

interface Summary {
  ordersCount: number;
  totalVolumeM3: number;
  totalKgco2e: number;
  totalTco2e: number;
  intensityKgco2ePerM3: number;
  byProduct: Record<string, { orders: number; volumeM3: number; kgco2e: number }>;
}

interface Footprint {
  orderNumber: string;
  volumeM3: number;
  materialsKgco2e: number;
  haulKgco2e: number;
  totalKgco2e: number;
  intensityKgco2ePerM3: number;
  breakdown: Record<string, number>;
}

export default function Sustainability() {
  const { currentUser } = useAuth();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [footprint, setFootprint] = useState<Footprint | null>(null);
  const [orderId, setOrderId] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [f, s] = await Promise.all([
        api.get<{ data: { factors: Factor[] } }>('/api/sustainability/factors'),
        api.get<{ data: Summary }>('/api/sustainability/summary'),
      ]);
      setFactors(f.data.factors);
      setSummary(s.data);
    } catch { setMsg('⚠️ Could not load carbon data.'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveFactor = async (factorKey: string, value: string) => {
    const v = parseFloat(value);
    if (!Number.isFinite(v) || v < 0) { setMsg('⚠️ Factor must be ≥ 0.'); return; }
    try {
      await api.put('/api/sustainability/factors', { factorKey, kgco2ePerUnit: v });
      setMsg(`✅ ${factorKey} updated.`);
      await load();
    } catch { setMsg('⚠️ Save failed.'); }
  };

  const compute = async () => {
    if (!orderId.trim()) { setMsg('⚠️ Order ID required.'); return; }
    setBusy(true);
    try {
      const res = await api.get<{ data: Footprint }>(`/api/sustainability/order/${orderId.trim()}`);
      setFootprint(res.data);
      setMsg('');
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Compute failed.'}`); }
    setBusy(false);
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🌱 Carbon Footprint</h1>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/[0.04] border-l-4 border-emerald-500 rounded-lg p-4"><p className="text-xs text-slate-400">Total CO₂e</p><p className="text-2xl font-bold text-white">{summary.totalTco2e} t</p></div>
            <div className="bg-white/[0.04] border-l-4 border-sky-500 rounded-lg p-4"><p className="text-xs text-slate-400">Intensity</p><p className="text-2xl font-bold text-white">{summary.intensityKgco2ePerM3} kg/m³</p></div>
            <div className="bg-white/[0.04] border-l-4 border-amber-500 rounded-lg p-4"><p className="text-xs text-slate-400">Orders measured</p><p className="text-2xl font-bold text-white">{summary.ordersCount}</p></div>
            <div className="bg-white/[0.04] border-l-4 border-violet-500 rounded-lg p-4"><p className="text-xs text-slate-400">Volume</p><p className="text-2xl font-bold text-white">{summary.totalVolumeM3.toLocaleString()} m³</p></div>
          </div>
        )}

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">🧮 Order Footprint</h3>
          <div className="flex gap-4">
            <input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order UUID" className={`${inputCls} max-w-[320px]`} />
            <button onClick={compute} disabled={busy} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg text-sm">⚡ Compute</button>
          </div>
          {footprint && (
            <div className="mt-4 bg-white/[0.02] border border-white/10 rounded-xl p-4">
              <p className="font-bold text-white text-sm">{footprint.orderNumber} — {footprint.volumeM3} m³ → <b className="text-emerald-400">{footprint.totalKgco2e} kgCO₂e</b> ({footprint.intensityKgco2ePerM3}/m³)</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(footprint.breakdown).map(([k, v]) => (
                  <span key={k} className="text-xs bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-lg text-slate-300">{k}: <b className="text-white">{v}</b></span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-1">⚗️ Emission Factors (editable)</h3>
          <p className="text-xs text-slate-500 mb-4">IPCC-style defaults — adjust to your verified LCA figures.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {factors.map(f => (
              <div key={f.factorKey} className="bg-white/[0.02] border border-white/10 rounded-xl p-3">
                <p className="text-xs font-bold text-white">{f.factorKey} <span className="text-slate-500 font-normal">/{f.unit}</span></p>
                <div className="flex gap-2 mt-2">
                  <input defaultValue={f.kgco2ePerUnit} id={`f-${f.factorKey}`} type="number" step="any" className={inputCls} />
                  <button
                    onClick={() => {
                      const el = document.getElementById(`f-${f.factorKey}`) as HTMLInputElement | null;
                      if (el) saveFactor(f.factorKey, el.value);
                    }}
                    className="text-xs bg-sky-500/15 text-sky-300 border border-sky-500/30 px-3 rounded-lg font-bold"
                  >💾</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
