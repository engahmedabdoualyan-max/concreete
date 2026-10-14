import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadWeighbridgeRecords, saveWeighbridgeRecords, loadReturns, saveReturns } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';

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
  const { currentUser } = useAuth();
  const { t } = useLang();
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
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 {t('accessDenied')}</p><Link to="/" className="text-sky-400 underline">{t('backToLogin')}</Link></div>
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
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← {t('backToDashboard')}</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🛡️ {t('governanceTitle')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 gap-2 p-1 mb-5 bg-white/[0.04] rounded-xl border border-white/10 max-w-md backdrop-blur-xl">
          <button onClick={() => setTab('weigh')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'weigh' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>⚖️ {t('weighbridge')}</button>
          <button onClick={() => setTab('returns')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'returns' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>♻️ {t('returnedConcrete')}</button>
        </div>

        {tab === 'weigh' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">⚖️ {t('gateWeighbridgeEntry')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('gateWeighbridgeEntryDesc')}</p>
              <div className="flex items-center gap-3 mb-4 bg-white/[0.02] border border-white/10 rounded-lg p-3">
                <input type="checkbox" checked={autoEntry} onChange={e => setAutoEntry(e.target.checked)} className="accent-sky-500 w-4 h-4" id="autoEntry" />
                <label htmlFor="autoEntry" className="text-xs text-slate-300 flex-1">📡 {t('autoEntryLabel')}</label>
              </div>
              <form onSubmit={addWeigh} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker value={wForm.date} onChange={v => setWForm({ ...wForm, date: v })} label={t('date')} />
                  <div><label className="text-xs text-slate-400 font-semibold">{t('time')}</label><input type="time" value={wForm.time} onChange={e => setWForm({ ...wForm, time: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('vehiclePlate')}</label><input value={wForm.plate} onChange={e => setWForm({ ...wForm, plate: e.target.value })} placeholder="ABC 1234" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('supplier')}</label><input value={wForm.supplier} onChange={e => setWForm({ ...wForm, supplier: e.target.value })} placeholder={t('supplierName')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('material')}</label>
                  <select value={wForm.material} onChange={e => setWForm({ ...wForm, material: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="cement">{t('cement')}</option><option value="sand">{t('sand')}</option><option value="gravel">{t('gravelAggregate')}</option><option value="admixture">{t('admixture')}</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-xs text-slate-400 font-semibold">{t('grossKg')}</label><input type="number" value={wForm.gross} onChange={e => setWForm({ ...wForm, gross: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('tareKg')}</label><input type="number" value={wForm.tare} onChange={e => setWForm({ ...wForm, tare: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('expectedKg')}</label><input type="number" value={wForm.expected} onChange={e => setWForm({ ...wForm, expected: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('notes')}</label><input value={wForm.notes} onChange={e => setWForm({ ...wForm, notes: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">{autoEntry ? '📡 ' + t('receiveAutoWeighing') : '⚖️ ' + t('recordWeighing')}</button>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('entries')}</p><p className="text-xl font-bold text-white">{weigh.length}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('netReceivedT')}</p><p className="text-xl font-bold text-sky-400">{(totalNet / 1000).toFixed(1)}</p></div>
                <div className={`bg-white/[0.04] rounded-xl p-4 border backdrop-blur-xl ${flagged ? 'border-red-500/50' : 'border-white/10'}`}><p className="text-xs text-slate-400">{t('flaggedMismatches')}</p><p className={`text-xl font-bold ${flagged ? 'text-red-400' : 'text-white'}`}>{flagged}</p></div>
                <div className={`bg-white/[0.04] rounded-xl p-4 border backdrop-blur-xl ${chain.intact ? 'border-emerald-500/40' : 'border-red-500/60'}`}><p className="text-xs text-slate-400">{t('auditChain')}</p><p className={`text-sm font-bold ${chain.intact ? 'text-emerald-400' : 'text-red-400'}`}>{chain.intact ? '🔒 ' + t('intact') : `🚨 ${chain.tamperedCount} ${t('broken')}`}</p></div>
              </div>
              {!chain.intact && (
                <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 mb-4 text-xs text-red-300">🚨 {t('tamperDetected')}</div>
              )}
              <div className="flex items-center gap-2 mb-4">
                <button onClick={tamperDemo} className="bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 text-xs px-3 py-2 rounded-lg font-bold">🧪 {t('simulateTampering')}</button>
                <span className="text-[10px] text-slate-500">{t('simulateTamperingDesc')}</span>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('date')}/{t('time')}</th><th className="p-2 uppercase tracking-wider">{t('plate')}</th><th className="p-2 uppercase tracking-wider">{t('supplier')}</th><th className="p-2 uppercase tracking-wider">{t('material')}</th><th className="p-2 uppercase tracking-wider">{t('gross')}</th><th className="p-2 uppercase tracking-wider">{t('tare')}</th><th className="p-2 uppercase tracking-wider">{t('net')}</th><th className="p-2 uppercase tracking-wider">{t('src')}</th><th className="p-2 uppercase tracking-wider">{t('status')}</th></tr></thead>
                    <tbody>
                      {weigh.map(w => {
                        const diff = w.expected > 0 ? ((w.net - w.expected) / w.expected) * 100 : 0;
                        return (
                          <tr key={w.id} className="border-b border-white/10">
                            <td className="p-2">{w.date} {w.time || ''}</td><td className="p-2 font-bold">{w.plate}</td><td className="p-2">{w.supplier}</td><td className="p-2">{w.material}</td>
                            <td className="p-2">{(w.gross / 1000).toFixed(2)}t</td><td className="p-2">{(w.tare / 1000).toFixed(2)}t</td>
                            <td className="p-2 font-bold text-sky-400">{(w.net / 1000).toFixed(2)}t</td>
                            <td className="p-2">{w.source === 'auto' ? <span className="text-[10px] font-bold text-sky-400" title={t('autoSerialFeed')}>📡</span> : <span className="text-[10px] font-bold text-slate-400" title={t('manualEntry')}>👤</span>}</td>
                            <td className="p-2">
                              {w.status === 'ok' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✓ {t('ok')} ({diff.toFixed(1)}%)</span>}
                              {w.status === 'mismatch' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">🚨 {t('diff')} {diff.toFixed(1)}%</span>}
                              {w.status === 'pending' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">⏳ {t('noExpected')}</span>}
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
              <h3 className="text-lg font-black tracking-tight text-white mb-1">♻️ {t('returnedConcreteEntry')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('returnedConcreteEntryDesc')}</p>
              <form onSubmit={addReturn} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker value={rForm.date} onChange={v => setRForm({ ...rForm, date: v })} label={t('date')} />
                  <div><label className="text-xs text-slate-400 font-semibold">{t('truck')}</label><input value={rForm.truck} onChange={e => setRForm({ ...rForm, truck: e.target.value })} placeholder="m05" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('site')}</label><input value={rForm.site} onChange={e => setRForm({ ...rForm, site: e.target.value })} placeholder={t('projectSite')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('quantityReturned')} (m³)</label><input type="number" step="0.5" value={rForm.qty} onChange={e => setRForm({ ...rForm, qty: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('reason')}</label>
                  <select value={rForm.reason} onChange={e => setRForm({ ...rForm, reason: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="excess">{t('excessQuantity')}</option><option value="cancel">{t('orderCancelled')}</option><option value="reject">{t('rejectedAtSite')}</option><option value="other">{t('other')}</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('disposition')}</label>
                  <select value={rForm.disposition} onChange={e => setRForm({ ...rForm, disposition: e.target.value as any })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="recycle">🔄 {t('recycleIntoBatching')}</option>
                    <option value="blocks">🧱 {t('convertToBlocks')}</option>
                    <option value="dispose">🗑️ {t('disposeLoss')}</option>
                  </select>
                </div>
                {rForm.disposition === 'blocks' && (
                  <div><label className="text-xs text-slate-400 font-semibold">{t('blockProduct')} ({t('autoApprox')} {BLOCKS_PER_M3} {t('blocksPerM3')})</label>
                    <select value={rForm.blockCode} onChange={e => setRForm({ ...rForm, blockCode: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                      <option value="BLK-20x20x40">BLK-20x20x40</option><option value="BLK-15x20x40">BLK-15x20x40</option>
                    </select>
                  </div>
                )}
                <div><label className="text-xs text-slate-400 font-semibold">{t('note')}</label><input value={rForm.note} onChange={e => setRForm({ ...rForm, note: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">♻️ {t('recordReturn')}</button>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('returnedM3')}</p><p className="text-xl font-bold text-white">{totalReturned.toFixed(1)}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('recoveredPct')}</p><p className="text-xl font-bold text-emerald-400">{recycledPct.toFixed(0)}%</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('blocksProduced')}</p><p className="text-xl font-bold text-orange-400">{totalBlocks}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('wastedM3')}</p><p className="text-xl font-bold text-red-400">{returns.filter(r => r.disposition === 'dispose').reduce((s, r) => s + r.qty, 0).toFixed(1)}</p></div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('date')}</th><th className="p-2 uppercase tracking-wider">{t('truck')}</th><th className="p-2 uppercase tracking-wider">{t('site')}</th><th className="p-2 uppercase tracking-wider">{t('quantity')}</th><th className="p-2 uppercase tracking-wider">{t('reason')}</th><th className="p-2 uppercase tracking-wider">{t('disposition')}</th><th className="p-2 uppercase tracking-wider">{t('blocks')}</th></tr></thead>
                    <tbody>
                      {returns.map(r => (
                        <tr key={r.id} className="border-b border-white/10">
                          <td className="p-2">{r.date}</td><td className="p-2 font-bold">{r.truck}</td><td className="p-2">{r.site}</td>
                          <td className="p-2 font-bold text-sky-400">{r.qty}</td><td className="p-2">{r.reason}</td>
                          <td className="p-2">
                            {r.disposition === 'recycle' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">🔄 {t('recycle')}</span>}
                            {r.disposition === 'blocks' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">🧱 {t('blocks')}</span>}
                            {r.disposition === 'dispose' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">🗑️ {t('dispose')}</span>}
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
