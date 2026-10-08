import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  Batch-Plant Controllers (Epic 10) — /batch-control
 * ============================================================
 *  Bind plants to Modbus PLCs / HTTP gateways / simulator,
 *  probe connections, read live status and batched weights.
 * ============================================================
 */

interface Controller {
  id: string;
  batchPlantId: string | null;
  plantName: string | null;
  name: string;
  provider: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  lastStatus: Record<string, unknown> | null;
  lastSeenAt: string | null;
}

interface LiveStatus {
  online: boolean;
  state: string;
  progressPct: number | null;
  ticketId: number | null;
  latencyMs: number;
  message: string;
}

interface TicketData {
  ticketId: string;
  batchedAt: string;
  weightsKg: Record<string, number>;
  totalKg: number;
  source: string;
}

const STATE_STYLE: Record<string, string> = {
  IDLE: 'bg-slate-500/20 text-slate-300',
  BATCHING: 'bg-sky-500/20 text-sky-300',
  DONE: 'bg-emerald-500/20 text-emerald-400',
  ALARM: 'bg-red-500/20 text-red-400',
  OFFLINE: 'bg-slate-500/20 text-slate-500',
};

const DEFAULT_REGISTER_MAP = {
  status: { address: 0 },
  progressPct: { address: 1 },
  ticketId: { address: 2 },
  weights: {
    cement: { address: 10 }, sand: { address: 11 },
    gravel20: { address: 12 }, water: { address: 13 },
  },
};

export default function BatchControl() {
  const { currentUser } = useAuth();
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Record<string, LiveStatus>>({});
  const [ticket, setTicket] = useState<TicketData | null>(null);

  const [name, setName] = useState('');
  const [provider, setProvider] = useState('SIMULATOR');
  const [host, setHost] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  const load = async () => {
    try {
      const res = await api.get<{ data: { controllers: Controller[]; providers: { id: string; label: string }[] } }>('/api/plant/controllers');
      setControllers(res.data.controllers);
      setProviders(res.data.providers);
    } catch { setMsg('⚠️ Could not load controllers.'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const register = async () => {
    if (!name.trim()) { setMsg('⚠️ Name is required.'); return; }
    setBusy(true);
    try {
      const settings: Record<string, unknown> =
        provider === 'MODBUS_TCP'
          ? { host: host.trim() || '127.0.0.1', port: 502, unitId: 1, registerMap: DEFAULT_REGISTER_MAP }
          : provider === 'HTTP_GATEWAY'
            ? { baseUrl: baseUrl.trim() }
            : { cycleSeconds: 120 };
      await api.post('/api/plant/controllers', { name: name.trim(), provider, settings });
      setMsg('✅ Controller registered.');
      setName(''); setHost(''); setBaseUrl('');
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Register failed.'}`); }
    setBusy(false);
  };

  const test = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.post<{ data: { ok: boolean; message: string } }>(`/api/plant/controllers/${id}/test`);
      setMsg(res.data.ok ? `✅ ${res.data.message}` : `❌ ${res.data.message}`);
      await load();
    } catch { setMsg('⚠️ Probe failed.'); }
    setBusy(false);
  };

  const readStatus = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.get<{ data: LiveStatus }>(`/api/plant/controllers/${id}/status`);
      setLive(l => ({ ...l, [id]: res.data }));
    } catch { setMsg('⚠️ Status read failed.'); }
    setBusy(false);
  };

  const readTicket = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.get<{ data: TicketData }>(`/api/plant/controllers/${id}/ticket`);
      setTicket(res.data);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Ticket read failed.'}`); }
    setBusy(false);
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🏭 Batch-Plant Controllers</h1>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">➕ Register Controller</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="BP-01 Modbus" className={inputCls} />
            <select value={provider} onChange={e => setProvider(e.target.value)} className={inputCls}>
              {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {provider === 'MODBUS_TCP' && <input value={host} onChange={e => setHost(e.target.value)} placeholder="PLC host (192.168.1.10)" className={inputCls} />}
            {provider === 'HTTP_GATEWAY' && <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://gateway.local" className={inputCls} />}
            <button onClick={register} disabled={busy} className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg">➕ Register</button>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">v1 is READ-ONLY. Modbus register maps are editable via API (see commissioning docs in MASTER_TODO). Start with SIMULATOR — no hardware needed.</p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">🎛️ Controllers ({controllers.length})</h3>
          <div className="space-y-3">
            {controllers.map(c => {
              const st = live[c.id];
              return (
                <div key={c.id} className="border border-white/10 bg-white/[0.02] rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white text-sm">{c.name} <span className="text-slate-500 font-normal">· {c.provider}{c.plantName ? ` · ${c.plantName}` : ''}</span></p>
                    {st && <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${STATE_STYLE[st.state] ?? ''}`}>{st.state}{st.progressPct != null ? ` ${st.progressPct}%` : ''}</span>}
                    <div className="flex gap-2 ml-auto flex-wrap">
                      <button onClick={() => test(c.id)} disabled={busy} className="text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg font-bold">🧪 Test</button>
                      <button onClick={() => readStatus(c.id)} disabled={busy} className="text-[11px] bg-sky-500/15 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg font-bold">📡 Live</button>
                      <button onClick={() => readTicket(c.id)} disabled={busy} className="text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold">🎫 Ticket</button>
                    </div>
                  </div>
                  {st && <p className="text-[11px] text-slate-500 mt-2">{st.message} · {st.latencyMs}ms</p>}
                </div>
              );
            })}
            {controllers.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No controllers yet — register a SIMULATOR to explore.</p>}
          </div>
        </div>

        {ticket && (
          <div className="bg-white/[0.04] border border-emerald-500/30 rounded-2xl p-6 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-1">🎫 Ticket {ticket.ticketId} <span className="text-xs text-slate-400">· {ticket.source}</span></h3>
            <p className="text-xs text-slate-400 mb-4">Batched {new Date(ticket.batchedAt).toLocaleString()} · Total {ticket.totalKg.toLocaleString()} kg</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ticket.weightsKg).map(([k, v]) => (
                <span key={k} className="text-xs bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-lg text-slate-300">{k}: <b className="text-white">{v.toLocaleString()} kg</b></span>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
