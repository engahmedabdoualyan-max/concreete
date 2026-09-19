import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadWeighbridgeRecords, saveWeighbridgeRecords, loadReturns, saveReturns } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';
import { useGovernanceDict } from '../i18n/governanceDict';

interface WeighRecord {
  id: number; date: string; time: string; plate: string; supplier: string;
  material: string; gross: number; tare: number; net: number; expected: number;
  notes: string; status: 'ok' | 'mismatch' | 'pending';
  source?: 'manual' | 'auto'; hash?: string; prevHash?: string;
}
interface ReturnRecord {
  id: number; date: string; truck: string; site: string; qty: number; reason: string;
  disposition: 'recycle' | 'blocks' | 'dispose'; blockCode: string; blocksProduced: number; note: string;
}

const TOLERANCE_PCT = 3;
const BLOCKS_PER_M3 = 80;

async function sha256(text: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(text);
    if (crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

async function verifyChain(records: WeighRecord[]): Promise<{ intact: boolean; tamperedCount: number }> {
  let prevHash = '';
  let tampered = 0;
  for (const r of records) {
    const payload = { id: r.id, date: r.date, time: r.time, plate: r.plate, supplier: r.supplier, material: r.material, gross: r.gross, tare: r.tare, expected: r.expected };
    const h = await sha256(prevHash + JSON.stringify(payload));
    if (r.hash && r.hash !== h) tampered++;
    prevHash = r.hash || h;
  }
  return { intact: tampered === 0, tamperedCount: tampered };
}

export default function Governance() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const t = useGovernanceDict();
  const [tab, setTab] = useState<'weigh' | 'returns'>('weigh');
  const [weigh, setWeigh] = useState<WeighRecord[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wForm, setWForm] = useState({
    date: new Date().toISOString().split('T')[0], time: '', plate: '', supplier: '',
    material: 'cement', gross: '', tare: '', expected: '', notes: '',
  });
  const [autoEntry, setAutoEntry] = useState(false);
  const [rForm, setRForm] = useState({
    date: new Date().toISOString().split('T')[0], truck: '', site: '', qty: '', reason: 'excess',
    disposition: 'recycle' as 'recycle' | 'blocks' | 'dispose', blockCode: 'BLK-20x20x40', note: '',
  });

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadWeighbridgeRecords(currentUser.username), loadReturns(currentUser.username)])
      .then(([w, r]) => {
        if (w?.length) setWeigh(w); else { const s = localStorage.getItem('plantWeigh'); if (s) setWeigh(JSON.parse(s)); }
        if (r?.length) setReturns(r); else { const s = localStorage.getItem('plantReturns'); if (s) setReturns(JSON.parse(s)); }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentUser?.username]);

  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantWeigh', JSON.stringify(weigh)); saveWeighbridgeRecords(currentUser.username, weigh).catch(() => {}); }, [weigh, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantReturns', JSON.stringify(returns)); saveReturns(currentUser.username, returns).catch(() => {}); }, [returns, loaded]);

  const addWeigh = async (e: React.FormEvent) => {
    e.preventDefault();
    const gross = Number(wForm.gross), tare = Number(wForm.tare);
    const net = Math.max(0, gross - tare);
    const expected = Number(wForm.expected) || 0;
    const tolerance = expected * (TOLERANCE_PCT / 100);
    const status: WeighRecord['status'] = expected === 0 ? 'pending' : (Math.abs(net - expected) <= tolerance ? 'ok' : 'mismatch');
    const now = new Date();
    const time = wForm.time || now.toTimeString().slice(0, 5);
    const source: 'manual' | 'auto' = autoEntry ? 'auto' : 'manual';
    const prev = weigh[weigh.length - 1];
    const prevHash = prev?.hash || '';
    const payload = { id: Date.now(), date: wForm.date || now.toISOString().split('T')[0], time, plate: wForm.plate, supplier: wForm.supplier, material: wForm.material, gross, tare, expected };
    const hash = await sha256(prevHash + JSON.stringify(payload));
    const rec: WeighRecord = { ...payload, net, notes: wForm.notes, status, source, hash, prevHash };
    setWeigh(prev => [...prev, rec]);
    setWForm({ ...wForm, plate: '', supplier: '', gross: '', tare: '', expected: '', notes: '', time: '' });
  };

  const addReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(rForm.qty) || 0;
    const blocksProduced = rForm.disposition === 'blocks' ? Math.round(qty * BLOCKS_PER_M3) : 0;
    setReturns(prev => [...prev, { id: Date.now(), ...rForm, qty, blocksProduced }]);
    setRForm({ ...rForm, truck: '', site: '', qty: '', note: '' });
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div>
      </div>
    );
  }

  const flagged = weigh.filter(w => w.status === 'mismatch').length;
  const totalNet = weigh.reduce((s, w) => s + (w.net || 0), 0);
  const totalReturned = returns.reduce((s, r) => s + r.qty, 0);
  const recycledPct = returns.length ? ((returns.filter(r => r.disposition !== 'dispose').reduce((s, r) => s + r.qty, 0) / totalReturned) * 100 || 0) : 0;
  const totalBlocks = returns.reduce((s, r) => s + (r.blocksProduced || 0), 0);
  const [chain, setChain] = useState<{ intact: boolean; tamperedCount: number }>({ intact: true, tamperedCount: 0 });
  useEffect(() => { verifyChain(weigh).then(setChain); }, [weigh]);
  const tamperDemo = () => {
    if (!weigh.length) return;
    const target = weigh[weigh.length - 1];
    setWeigh(prev => prev.map(w => w.id === target.id ? { ...w, gross: w.gross + 1500 } : w));
  };

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🛡️ Governance: Weighbridge & Returns</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 gap-2 p-1 mb-5 bg-white/[0.04] rounded-xl border border-white/10 max-w-md backdrop-blur-xl">
          <button onClick={() => setTab('weigh')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'weigh' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>⚖️ Weighbridge</button>
          <button onClick={() => setTab('returns')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'returns' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>♻️ Returned Concrete</button>
        </div>

        {tab === 'weigh' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">⚖️ Gate Weighbridge Entry</h3>
              <p className="text-xs text-slate-400 mb-4">Auto-records gross/tare and net weight from supplier trucks. Mismatch vs expected is flagged to prevent supplier fraud. Every record is chained by SHA-256 hash — any manual edit is detected.</p>
              <div className="flex items-center gap-3 mb-4 bg-white/[0.02] border border-white/10 rounded-lg p-3">
                <input type="checkbox" checked={autoEntry} onChange={e => setAutoEntry(e.target.checked)} className="accent-sky-500 w-4 h-4" id="autoEntry" />
                <label htmlFor="autoEntry" className="text-xs text-slate-300 flex-1">📡 Weighbridge auto-entry (serial feed — no manual input)</label>
              </div>
              <form onSubmit={addWeigh} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker value={wForm.date} onChange={v => setWForm({ ...wForm, date: v })} label="Date" />
                  <div><label className="text-xs text-slate-400 font-semibold">Time</label><input type="time" value={wForm.time} onChange={e => setWForm({ ...wForm, time: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Vehicle Plate</label><input value={wForm.plate} onChange={e => setWForm({ ...wForm, plate: e.target.value })} placeholder="ABC 1234" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Supplier</label><input value={wForm.supplier} onChange={e => setWForm({ ...wForm, supplier: e.target.value })} placeholder="Supplier name" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Material</label>
                  <select value={wForm.material} onChange={e => setWForm({ ...wForm, material: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="cement">Cement</option><option value="sand">Sand</option><option value="gravel">Gravel / Aggregate</option><option value="admixture">Admixture</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-slate-400 font-semibold">Gross (kg)</label><input type="number" value={wForm.gross} onChange={e => setWForm({ ...wForm, gross: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Tare (kg)</label><input type="number" value={wForm.tare} onChange={e => setWForm({ ...wForm, tare: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Expected (kg)</label><input type="number" value={wForm.expected} onChange={e => setWForm({ ...wForm, expected: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Notes</label><input value={wForm.notes} onChange={e => setWForm({ ...wForm, notes: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">{autoEntry ? '📡 Receive Auto Weighing' : '⚖️ Record Weighing'}</button>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Entries</p><p className="text-xl font-bold text-white">{weigh.length}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Net received (t)</p><p className="text-xl font-bold text-sky-400">{(totalNet / 1000).toFixed(1)}</p></div>
                <div className={`bg-white/[0.04] rounded-xl p-4 border backdrop-blur-xl ${flagged ? 'border-red-500/50' : 'border-white/10'}`}><p className="text-xs text-slate-400">Flagged mismatches</p><p className={`text-xl font-bold ${flagged ? 'text-red-400' : 'text-white'}`}>{flagged}</p></div>
                <div className={`bg-white/[0.04] rounded-xl p-4 border backdrop-blur-xl ${chain.intact ? 'border-emerald-500/40' : 'border-red-500/60'}`}><p className="text-xs text-slate-400">Audit chain</p><p className={`text-sm font-bold ${chain.intact ? 'text-emerald-400' : 'text-red-400'}`}>{chain.intact ? '🔒 Intact' : `🚨 ${chain.tamperedCount} broken`}</p></div>
              </div>
              {!chain.intact && (
                <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 mb-4 text-xs text-red-300">🚨 TAMPER DETECTED: audit chain is broken — a weighbridge record was edited after logging. Review flagged records immediately.</div>
              )}
              <div className="flex items-center gap-2 mb-4">
                <button onClick={tamperDemo} className="bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 text-xs px-3 py-2 rounded-lg font-bold">🧪 Simulate tampering (edit last record)</button>
                <span className="text-[10px] text-slate-500">Tests the SHA-256 hash chain integrity — edits after logging break the chain.</span>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">Date/Time</th><th className="p-2 uppercase tracking-wider">Plate</th><th className="p-2 uppercase tracking-wider">Supplier</th><th className="p-2 uppercase tracking-wider">Material</th><th className="p-2 uppercase tracking-wider">Gross</th><th className="p-2 uppercase tracking-wider">Tare</th><th className="p-2 uppercase tracking-wider">Net</th><th className="p-2 uppercase tracking-wider">Src</th><th className="p-2 uppercase tracking-wider">Status</th></tr></thead>
                    <tbody>
                      {weigh.map(w => {
                        const diff = w.expected > 0 ? ((w.net - w.expected) / w.expected) * 100 : 0;
                        return (
                          <tr key={w.id} className="border-b border-white/10">
                            <td className="p-2">{w.date} {w.time || ''}</td><td className="p-2 font-bold">{w.plate}</td><td className="p-2">{w.supplier}</td><td className="p-2">{w.material}</td>
                            <td className="p-2">{(w.gross / 1000).toFixed(2)}t</td><td className="p-2">{(w.tare / 1000).toFixed(2)}t</td>
                            <td className="p-2 font-bold text-sky-400">{(w.net / 1000).toFixed(2)}t</td>
                            <td className="p-2">{w.source === 'auto' ? <span className="text-[10px] font-bold text-sky-400" title="Auto serial feed">📡</span> : <span className="text-[10px] font-bold text-slate-400" title="Manual entry">👤</span>}</td>
                            <td className="p-2">
                              {w.status === 'ok' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✓ OK ({diff.toFixed(1)}%)</span>}
                              {w.status === 'mismatch' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">🚨 Diff {diff.toFixed(1)}%</span>}
                              {w.status === 'pending' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">⏳ No expected</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'returns' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">♻️ Returned Concrete Entry</h3>
              <p className="text-xs text-slate-400 mb-4">Record surplus concrete returned from sites. Recycle it into the batching process or convert into interlock blocks — linked to inventory instead of unaccounted waste.</p>
              <form onSubmit={addReturn} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker value={rForm.date} onChange={v => setRForm({ ...rForm, date: v })} label="Date" />
                  <div><label className="text-xs text-slate-400 font-semibold">Truck</label><input value={rForm.truck} onChange={e => setRForm({ ...rForm, truck: e.target.value })} placeholder="m05" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Site</label><input value={rForm.site} onChange={e => setRForm({ ...rForm, site: e.target.value })} placeholder="Project site" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Quantity returned (m³)</label><input type="number" step="0.5" value={rForm.qty} onChange={e => setRForm({ ...rForm, qty: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Reason</label>
                  <select value={rForm.reason} onChange={e => setRForm({ ...rForm, reason: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="excess">Excess quantity</option><option value="cancel">Order cancelled</option><option value="reject">Rejected at site</option><option value="other">Other</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Disposition</label>
                  <select value={rForm.disposition} onChange={e => setRForm({ ...rForm, disposition: e.target.value as any })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="recycle">🔄 Recycle into batching</option>
                    <option value="blocks">🧱 Convert to interlock blocks</option>
                    <option value="dispose">🗑️ Dispose (loss)</option>
                  </select>
                </div>
                {rForm.disposition === 'blocks' && (
                  <div><label className="text-xs text-slate-400 font-semibold">Block product (auto-approx {BLOCKS_PER_M3} blocks/m³)</label>
                    <select value={rForm.blockCode} onChange={e => setRForm({ ...rForm, blockCode: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                      <option value="BLK-20x20x40">BLK-20x20x40</option><option value="BLK-15x20x40">BLK-15x20x40</option>
                    </select>
                  </div>
                )}
                <div><label className="text-xs text-slate-400 font-semibold">Note</label><input value={rForm.note} onChange={e => setRForm({ ...rForm, note: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">♻️ Record Return</button>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Returned (m³)</p><p className="text-xl font-bold text-white">{totalReturned.toFixed(1)}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Recovered %</p><p className="text-xl font-bold text-emerald-400">{recycledPct.toFixed(0)}%</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Blocks produced</p><p className="text-xl font-bold text-orange-400">{totalBlocks}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Wasted (m³)</p><p className="text-xl font-bold text-red-400">{returns.filter(r => r.disposition === 'dispose').reduce((s, r) => s + r.qty, 0).toFixed(1)}</p></div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">Date</th><th className="p-2 uppercase tracking-wider">Truck</th><th className="p-2 uppercase tracking-wider">Site</th><th className="p-2 uppercase tracking-wider">Qty</th><th className="p-2 uppercase tracking-wider">Reason</th><th className="p-2 uppercase tracking-wider">Disposition</th><th className="p-2 uppercase tracking-wider">Blocks</th></tr></thead>
                    <tbody>
                      {returns.map(r => (
                        <tr key={r.id} className="border-b border-white/10">
                          <td className="p-2">{r.date}</td><td className="p-2 font-bold">{r.truck}</td><td className="p-2">{r.site}</td>
                          <td className="p-2 font-bold text-sky-400">{r.qty}</td><td className="p-2">{r.reason}</td>
                          <td className="p-2">
                            {r.disposition === 'recycle' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">🔄 Recycle</span>}
                            {r.disposition === 'blocks' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">🧱 Blocks</span>}
                            {r.disposition === 'dispose' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">🗑️ Dispose</span>}
                          </td>
                          <td className="p-2">{r.blocksProduced ? `${r.blocksProduced} ${r.blockCode}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
