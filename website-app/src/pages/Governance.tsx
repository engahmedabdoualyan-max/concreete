import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';
import { useGovernanceDict } from '../i18n/governanceDict';

// ─── Server shapes ───────────────────────────────────────────────────────────
// GET /api/dispatch/board → { trips: [{ id (uuid), number, vehicle, plate, orderNumber, checkpoint, ... }] }
interface BoardTrip {
  id: string; number: string;
  vehicle?: string | null; plate?: string | null;
  orderNumber?: string | null; checkpoint?: string;
}
// GET /api/weighbridge (no tripId) → { recentTransactions, stats }
interface WeighTx {
  id: string; sequenceNumber: number; transactionType: string;
  grossWeightKg: number | string; tareWeightKg: number | string; netWeightKg: number | string;
  recordHash: string; lockedAt: string; notes?: string | null;
  tripNumber?: string; vehicleCode?: string; plateNumber?: string; operatorName?: string;
  // Optional mismatch flag — only rendered when the server actually returns it.
  status?: string; mismatch?: boolean; flagged?: boolean;
}
interface WeighList {
  recentTransactions: WeighTx[];
  stats: {
    totalTransactions: number; totalNetWeightKg: number;
    loadOutCount: number; returnInCount: number; chainTipSequence: number;
  };
}
interface ChainCheck { intact: boolean | null; message: string }
// GET /api/returns → recovery & sustainability stats (no row list endpoint)
interface ReturnsStats {
  timeRangeDays: number; totalReturns: number; totalVolumeReturnedM3: number;
  blocksManufactured: number; aggregateRecoveredKg: number; waterRecoveredLitres: number;
  discardedVolumeM3: number; recycledPct: number; castBlocksPct: number;
  washoutPct: number; wastedPct: number; recoveryEfficiencyPct: number; totalDeductionsSar: number;
}
interface SessionReturn {
  key: number; ticketNumber?: string; tripId: string;
  disposition: string; excessVolumeM3?: number; message?: string;
}

type TxType = 'LOAD_OUT' | 'RETURN_IN' | 'TARE_VERIFY';
type Disposition = 'RECYCLED_BATCHING' | 'CAST_BLOCKS' | 'WASHOUT' | 'DISCARDED';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtT = (kg: number | string | null | undefined) => (num(kg) / 1000).toFixed(2) + 't';
const fmtDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  } catch { return iso; }
};
// Server is the authority on tamper flags — only honour a flag the server sent.
function serverFlag(tx: WeighTx): boolean {
  return tx.mismatch === true || tx.flagged === true || tx.status === 'mismatch';
}

const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';
const labelCls = 'text-xs text-slate-400 font-semibold';

export default function Governance() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const t = useGovernanceDict();
  const [tab, setTab] = useState<'weigh' | 'returns'>('weigh');

  // ── shared trip picker (dispatch board) ───────────────────────────────────
  const [trips, setTrips] = useState<BoardTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState('');

  // ── weighbridge (server) ──────────────────────────────────────────────────
  const [entries, setEntries] = useState<WeighTx[]>([]);
  const [wStats, setWStats] = useState<WeighList['stats'] | null>(null);
  const [weighLoading, setWeighLoading] = useState(false);
  const [weighError, setWeighError] = useState('');
  const [weighMsg, setWeighMsg] = useState('');
  const [weighSubmitting, setWeighSubmitting] = useState(false);
  const [chain, setChain] = useState<ChainCheck>({ intact: null, message: '' });
  const [wForm, setWForm] = useState({
    tripId: '', manualTripId: '', transactionType: 'LOAD_OUT' as TxType,
    gross: '', scaleUnitId: '', notes: '',
    // Local-only reference fields (no backend support — kept for the operator, never sent).
    date: new Date().toISOString().split('T')[0], time: '',
    plate: '', supplier: '', material: 'cement', tare: '', expected: '',
  });

  // ── returns (server) ──────────────────────────────────────────────────────
  const [rStats, setRStats] = useState<ReturnsStats | null>(null);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsError, setReturnsError] = useState('');
  const [returnsMsg, setReturnsMsg] = useState('');
  const [returnsSubmitting, setReturnsSubmitting] = useState(false);
  const [sessionReturns, setSessionReturns] = useState<SessionReturn[]>([]);
  const [rForm, setRForm] = useState({
    tripId: '', manualTripId: '', grossKg: '', disposition: 'RECYCLED_BATCHING' as Disposition,
    reason: '', slump: '', blockSize: '20x20x40',
    // Local-only reference fields (no backend support — kept for the operator, never sent).
    date: new Date().toISOString().split('T')[0], truck: '', site: '', qtyM3: '', note: '',
  });

  const errText = (e: unknown, fallback: string) =>
    e instanceof ApiError ? e.message : (e instanceof Error ? e.message : fallback);

  const loadTrips = async () => {
    setTripsLoading(true);
    setTripsError('');
    try {
      const board = await api.get<{ trips?: BoardTrip[] }>('/api/dispatch/board');
      setTrips(Array.isArray(board.trips) ? board.trips : []);
      if (!Array.isArray(board.trips) || board.trips.length === 0) {
        setTripsError('No live trips on the dispatch board — paste a trip UUID manually.');
      }
    } catch (e) {
      setTrips([]);
      setTripsError(`${errText(e, 'Failed to load dispatch board')} — paste a trip UUID manually.`);
    } finally {
      setTripsLoading(false);
    }
  };

  const loadWeigh = async () => {
    setWeighLoading(true);
    setWeighError('');
    try {
      const data = await api.get<WeighList>('/api/weighbridge');
      setEntries(Array.isArray(data.recentTransactions) ? data.recentTransactions : []);
      setWStats(data.stats ?? null);
    } catch (e) {
      setWeighError(errText(e, 'Failed to load weighbridge entries'));
    } finally {
      setWeighLoading(false);
    }
  };

  const loadChain = async () => {
    try {
      // SUPER_ADMIN-only endpoint — non-admins get 403, handled as "not permitted".
      const data = await api.get<{ chainVerification?: { isValid?: boolean; message?: string } }>('/api/weighbridge/verify');
      const v = data.chainVerification;
      setChain({
        intact: v?.isValid === true ? true : v?.isValid === false ? false : null,
        message: v?.message ?? '',
      });
    } catch {
      setChain({ intact: null, message: 'Chain verify requires SUPER_ADMIN — showing server-sealed records.' });
    }
  };

  const loadReturns = async () => {
    setReturnsLoading(true);
    setReturnsError('');
    try {
      const stats = await api.get<ReturnsStats>('/api/returns');
      setRStats(stats);
    } catch (e) {
      setReturnsError(errText(e, 'Failed to load returns statistics'));
    } finally {
      setReturnsLoading(false);
    }
  };

  useEffect(() => {
    void loadTrips();
    void loadWeigh();
    void loadChain();
    void loadReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveTripId = (picked: string, manual: string): string | null => {
    const manualClean = manual.trim();
    if (manualClean) return UUID_RE.test(manualClean) ? manualClean : null;
    return picked || null;
  };

  const addWeigh = async (e: React.FormEvent) => {
    e.preventDefault();
    setWeighError('');
    setWeighMsg('');
    const tripId = resolveTripId(wForm.tripId, wForm.manualTripId);
    if (!tripId) {
      setWeighError(wForm.manualTripId.trim()
        ? 'Manual trip ID is not a valid UUID.'
        : 'Select a trip from the dispatch board or paste a trip UUID manually.');
      return;
    }
    const gross = Number(wForm.gross);
    if (!Number.isFinite(gross) || gross <= 0) {
      setWeighError('Gross weight must be a positive number (kg).');
      return;
    }
    setWeighSubmitting(true);
    try {
      const res = await api.post<{
        transactionId?: string; sequenceNumber?: number; netWeightKg?: number | string;
      }>('/api/weighbridge', {
        tripId,
        transactionType: wForm.transactionType,
        grossWeightKg: gross,
        ...(wForm.scaleUnitId.trim() ? { scaleUnitId: wForm.scaleUnitId.trim() } : {}),
        ...(wForm.notes.trim() ? { notes: wForm.notes.trim() } : {}),
      });
      setWeighMsg(`Recorded seq #${res.sequenceNumber ?? '?'} — net ${res.netWeightKg ?? '?'} kg, sealed with SHA-256.`);
      setWForm(f => ({ ...f, gross: '', scaleUnitId: '', notes: '' }));
      await loadWeigh();
    } catch (err) {
      setWeighError(errText(err, 'Failed to record weighing'));
    } finally {
      setWeighSubmitting(false);
    }
  };

  const addReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setReturnsError('');
    setReturnsMsg('');
    const tripId = resolveTripId(rForm.tripId, rForm.manualTripId);
    if (!tripId) {
      setReturnsError(rForm.manualTripId.trim()
        ? 'Manual trip ID is not a valid UUID.'
        : 'Select a trip from the dispatch board or paste a trip UUID manually.');
      return;
    }
    const grossKg = Number(rForm.grossKg);
    if (!Number.isFinite(grossKg) || grossKg <= 0) {
      setReturnsError('Return gross weight must be a positive number (kg).');
      return;
    }
    if (rForm.reason.trim().length < 5) {
      setReturnsError('Return reason must be at least 5 characters.');
      return;
    }
    setReturnsSubmitting(true);
    try {
      const res = await api.post<{
        returnId?: string; ticketNumber?: string; disposition?: string;
        excessVolumeM3?: number;
      }>('/api/returns', {
        tripId,
        returnGrossWeightKg: grossKg,
        disposition: rForm.disposition,
        returnReason: rForm.reason.trim(),
        ...(rForm.slump !== '' ? { returnedSlumpCm: Number(rForm.slump) } : {}),
        ...(rForm.disposition === 'CAST_BLOCKS' && rForm.blockSize.trim()
          ? { blockSizeCm: rForm.blockSize.trim() } : {}),
      });
      const item: SessionReturn = {
        key: Date.now(), ticketNumber: res.ticketNumber, tripId,
        disposition: res.disposition ?? rForm.disposition,
        excessVolumeM3: typeof res.excessVolumeM3 === 'number' ? res.excessVolumeM3 : undefined,
      };
      setSessionReturns(prev => [item, ...prev]);
      setReturnsMsg(res.ticketNumber
        ? `Return logged — ticket ${res.ticketNumber}.`
        : 'Return logged.');
      setRForm(f => ({ ...f, grossKg: '', reason: '', slump: '' }));
      await loadReturns();
    } catch (err) {
      setReturnsError(errText(err, 'Failed to record return'));
    } finally {
      setReturnsSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">{t('gvBackLogin')}</Link></div>
      </div>
    );
  }

  const flagged = entries.filter(serverFlag).length;
  const tripLabel = (t: BoardTrip) =>
    `${t.number}${t.vehicle ? ` · ${t.vehicle}` : ''}${t.plate ? ` (${t.plate})` : ''}${t.orderNumber ? ` · ${t.orderNumber}` : ''}`;

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
              <p className="text-xs text-slate-400 mb-4">Posts to the central ledger (POST /api/weighbridge). The server seals every record in the SHA-256 hash chain — tamper detection is server-side.</p>
              {weighError && <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 mb-3 text-xs text-red-300">{weighError}</div>}
              {weighMsg && <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-3 mb-3 text-xs text-emerald-300">{weighMsg}</div>}
              <form onSubmit={addWeigh} className="space-y-3">
                <div>
                  <label className={labelCls}>{t('gvTripBoard')}</label>
                  <select value={wForm.tripId} onChange={e => setWForm({ ...wForm, tripId: e.target.value })} className={inputCls}>
                    <option value="">{tripsLoading ? 'Loading trips…' : '— Select trip —'}</option>
                    {trips.map(tr => <option key={tr.id} value={tr.id}>{tripLabel(tr)}</option>)}
                  </select>
                  {tripsError && <p className="text-[11px] text-yellow-400 mt-1">{tripsError}</p>}
                </div>
                <div>
                  <label className={labelCls}>…or paste trip UUID manually</label>
                  <input value={wForm.manualTripId} onChange={e => setWForm({ ...wForm, manualTripId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('gvTxnType')}</label>
                  <select value={wForm.transactionType} onChange={e => setWForm({ ...wForm, transactionType: e.target.value as TxType })} className={inputCls}>
                    <option value="LOAD_OUT">LOAD_OUT — loaded truck leaving</option>
                    <option value="RETURN_IN">RETURN_IN — truck returning</option>
                    <option value="TARE_VERIFY">TARE_VERIFY — tare check</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Gross (kg) *</label><input type="number" min="0" step="any" value={wForm.gross} onChange={e => setWForm({ ...wForm, gross: e.target.value })} className={inputCls} required /></div>
                  <div><label className={labelCls}>{t('gvScaleId')}</label><input value={wForm.scaleUnitId} onChange={e => setWForm({ ...wForm, scaleUnitId: e.target.value })} placeholder="optional" className={inputCls} /></div>
                </div>
                <div><label className={labelCls}>{t('gvNotes')}</label><input value={wForm.notes} onChange={e => setWForm({ ...wForm, notes: e.target.value })} className={inputCls} /></div>
                <button type="submit" disabled={weighSubmitting} className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">{weighSubmitting ? 'Posting…' : '⚖️ Record Weighing'}</button>
                <div className="border-t border-white/10 pt-3 space-y-3">
                  <p className="text-[11px] text-slate-500">Local reference only — kept on this device, <b>not</b> sent to the server (no backend support): plate / supplier / material / tare / expected / date.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <DatePicker value={wForm.date} onChange={v => setWForm({ ...wForm, date: v })} label="Date (local)" />
                    <div><label className={labelCls}>{t('gvTimeLocal')}</label><input type="time" value={wForm.time} onChange={e => setWForm({ ...wForm, time: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm [color-scheme:dark]" /></div>
                  </div>
                  <div><label className={labelCls}>{t('gvPlateLocal')}</label><input value={wForm.plate} onChange={e => setWForm({ ...wForm, plate: e.target.value })} placeholder="ABC 1234" className={inputCls} /></div>
                  <div><label className={labelCls}>{t('gvSupLocal')}</label><input value={wForm.supplier} onChange={e => setWForm({ ...wForm, supplier: e.target.value })} placeholder="Supplier name" className={inputCls} /></div>
                  <div><label className={labelCls}>{t('gvMaterialLocal')}</label>
                    <select value={wForm.material} onChange={e => setWForm({ ...wForm, material: e.target.value })} className={inputCls}>
                      <option value="cement">{t('gvCement')}</option><option value="sand">{t('gvSand')}</option><option value="gravel">{t('gvGravel')}</option><option value="admixture">Admixture</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>{t('gvTareKg')}</label><input type="number" value={wForm.tare} onChange={e => setWForm({ ...wForm, tare: e.target.value })} className={inputCls} /></div>
                    <div><label className={labelCls}>{t('gvExpectedKg')}</label><input type="number" value={wForm.expected} onChange={e => setWForm({ ...wForm, expected: e.target.value })} className={inputCls} /></div>
                  </div>
                </div>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvTxns')}</p><p className="text-xl font-bold text-white">{wStats?.totalTransactions ?? entries.length}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvNetT')}</p><p className="text-xl font-bold text-sky-400">{((wStats?.totalNetWeightKg ?? 0) / 1000).toFixed(1)}</p></div>
                <div className={`bg-white/[0.04] rounded-xl p-4 border backdrop-blur-xl ${flagged ? 'border-red-500/50' : 'border-white/10'}`}><p className="text-xs text-slate-400">{t('gvFlagged')}</p><p className={`text-xl font-bold ${flagged ? 'text-red-400' : 'text-white'}`}>{flagged}</p></div>
                <div className={`bg-white/[0.04] rounded-xl p-4 border backdrop-blur-xl ${chain.intact === false ? 'border-red-500/60' : chain.intact ? 'border-emerald-500/40' : 'border-white/10'}`}><p className="text-xs text-slate-400">{t('gvAuditChain')}</p><p className={`text-sm font-bold ${chain.intact === false ? 'text-red-400' : chain.intact ? 'text-emerald-400' : 'text-slate-400'}`}>{chain.intact === false ? '🚨 Broken' : chain.intact ? '🔒 Intact' : '🔒 Server-sealed'}</p></div>
              </div>
              {chain.intact === false && (
                <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 mb-4 text-xs text-red-300">🚨 Server reports a broken audit chain. {chain.message}</div>
              )}
              {chain.intact === null && chain.message && (
                <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 mb-4 text-[11px] text-slate-500">{chain.message}</div>
              )}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('gvLocked')}</th><th className="p-2 uppercase tracking-wider">{t('gvTrip')}</th><th className="p-2 uppercase tracking-wider">{t('gvVehicle')}</th><th className="p-2 uppercase tracking-wider">{t('gvType')}</th><th className="p-2 uppercase tracking-wider">{t('gvGross')}</th><th className="p-2 uppercase tracking-wider">{t('gvTare')}</th><th className="p-2 uppercase tracking-wider">{t('gvNet')}</th><th className="p-2 uppercase tracking-wider">{t('gvHash')}</th><th className="p-2 uppercase tracking-wider">{t('gvStatus')}</th></tr></thead>
                    <tbody>
                      {weighLoading && <tr><td colSpan={9} className="p-4 text-center text-slate-500">Loading…</td></tr>}
                      {!weighLoading && entries.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-slate-500">{t('gvNoWb')}</td></tr>}
                      {entries.map(w => (
                        <tr key={w.id} className="border-b border-white/10">
                          <td className="p-2">{fmtDateTime(w.lockedAt)}</td>
                          <td className="p-2 font-bold">{w.tripNumber ?? `#${w.sequenceNumber}`}</td>
                          <td className="p-2">{w.plateNumber ?? w.vehicleCode ?? '—'}</td>
                          <td className="p-2">{w.transactionType}</td>
                          <td className="p-2">{fmtT(w.grossWeightKg)}</td>
                          <td className="p-2">{fmtT(w.tareWeightKg)}</td>
                          <td className="p-2 font-bold text-sky-400">{fmtT(w.netWeightKg)}</td>
                          <td className="p-2 font-mono text-[10px] text-slate-500" title={w.recordHash}>{w.recordHash ? w.recordHash.slice(0, 10) + '…' : '—'}</td>
                          <td className="p-2">
                            {serverFlag(w)
                              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">🚨 Mismatch (server)</span>
                              : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">🔒 Sealed</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <button onClick={() => { void loadWeigh(); void loadChain(); }} className="mt-3 text-xs text-sky-400 underline">↻ Refresh from server</button>
            </div>
          </div>
        )}

        {tab === 'returns' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">♻️ Returned Concrete Entry</h3>
              <p className="text-xs text-slate-400 mb-4">Posts to the central ledger (POST /api/returns) — the server weighs the truck, derives excess volume and routes the disposition.</p>
              {returnsError && <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 mb-3 text-xs text-red-300">{returnsError}</div>}
              {returnsMsg && <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-3 mb-3 text-xs text-emerald-300">{returnsMsg}</div>}
              <form onSubmit={addReturn} className="space-y-3">
                <div>
                  <label className={labelCls}>{t('gvTripBoard')}</label>
                  <select value={rForm.tripId} onChange={e => setRForm({ ...rForm, tripId: e.target.value })} className={inputCls}>
                    <option value="">{tripsLoading ? 'Loading trips…' : '— Select trip —'}</option>
                    {trips.map(tr => <option key={tr.id} value={tr.id}>{tripLabel(tr)}</option>)}
                  </select>
                  {tripsError && <p className="text-[11px] text-yellow-400 mt-1">{tripsError}</p>}
                </div>
                <div>
                  <label className={labelCls}>…or paste trip UUID manually</label>
                  <input value={rForm.manualTripId} onChange={e => setRForm({ ...rForm, manualTripId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inputCls} />
                </div>
                <div><label className={labelCls}>Return gross weight (kg) *</label><input type="number" min="0" step="any" value={rForm.grossKg} onChange={e => setRForm({ ...rForm, grossKg: e.target.value })} className={inputCls} required /></div>
                <div><label className={labelCls}>Reason (min 5 chars) *</label><input value={rForm.reason} onChange={e => setRForm({ ...rForm, reason: e.target.value })} placeholder="e.g. Excess quantity from site pour" className={inputCls} required /></div>
                <div><label className={labelCls}>{t('gvDisposition')}</label>
                  <select value={rForm.disposition} onChange={e => setRForm({ ...rForm, disposition: e.target.value as Disposition })} className={inputCls}>
                    <option value="RECYCLED_BATCHING">🔄 Recycle into batching</option>
                    <option value="CAST_BLOCKS">🧱 Cast blocks</option>
                    <option value="WASHOUT">💧 Washout (water recovery)</option>
                    <option value="DISCARDED">🗑️ Discarded (loss)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>{t('gvSlump')}</label><input type="number" min="0" max="30" step="any" value={rForm.slump} onChange={e => setRForm({ ...rForm, slump: e.target.value })} className={inputCls} /></div>
                  {rForm.disposition === 'CAST_BLOCKS' && (
                    <div><label className={labelCls}>Block size (cm)</label><input value={rForm.blockSize} onChange={e => setRForm({ ...rForm, blockSize: e.target.value })} placeholder="20x20x40" className={inputCls} /></div>
                  )}
                </div>
                <button type="submit" disabled={returnsSubmitting} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">{returnsSubmitting ? 'Posting…' : '♻️ Record Return'}</button>
                <div className="border-t border-white/10 pt-3 space-y-3">
                  <p className="text-[11px] text-slate-500">Local reference only — kept on this device, <b>not</b> sent to the server (no backend support): date / truck / site / qty m³ / note.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <DatePicker value={rForm.date} onChange={v => setRForm({ ...rForm, date: v })} label="Date (local)" />
                    <div><label className={labelCls}>{t('gvTruckLocal')}</label><input value={rForm.truck} onChange={e => setRForm({ ...rForm, truck: e.target.value })} placeholder="m05" className={inputCls} /></div>
                  </div>
                  <div><label className={labelCls}>{t('gvSiteLocal')}</label><input value={rForm.site} onChange={e => setRForm({ ...rForm, site: e.target.value })} placeholder="Project site" className={inputCls} /></div>
                  <div><label className={labelCls}>Quantity returned m³ (local)</label><input type="number" step="0.5" value={rForm.qtyM3} onChange={e => setRForm({ ...rForm, qtyM3: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>{t('gvNoteLocal')}</label><input value={rForm.note} onChange={e => setRForm({ ...rForm, note: e.target.value })} className={inputCls} /></div>
                </div>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Returns ({rStats?.timeRangeDays ?? 30}d)</p><p className="text-xl font-bold text-white">{returnsLoading ? '…' : (rStats?.totalReturns ?? 0)}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Volume returned (m³)</p><p className="text-xl font-bold text-white">{returnsLoading ? '…' : (rStats?.totalVolumeReturnedM3 ?? 0).toFixed(1)}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvRecEff')}</p><p className="text-xl font-bold text-emerald-400">{returnsLoading ? '…' : `${rStats?.recoveryEfficiencyPct ?? 0}%`}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvBlocksMfg')}</p><p className="text-xl font-bold text-orange-400">{returnsLoading ? '…' : (rStats?.blocksManufactured ?? 0)}</p></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvRecycled')}</p><p className="text-xl font-bold text-emerald-400">{returnsLoading ? '…' : `${rStats?.recycledPct ?? 0}%`}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvCastBlocks')}</p><p className="text-xl font-bold text-orange-400">{returnsLoading ? '…' : `${rStats?.castBlocksPct ?? 0}%`}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('gvWashout')}</p><p className="text-xl font-bold text-sky-400">{returnsLoading ? '…' : `${rStats?.washoutPct ?? 0}%`}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Wasted (m³)</p><p className="text-xl font-bold text-red-400">{returnsLoading ? '…' : (rStats?.discardedVolumeM3 ?? 0).toFixed(1)}</p></div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="px-4 py-2 text-xs text-slate-400 border-b border-white/10">Submitted this session (server has no row-list endpoint — totals above are from GET /api/returns)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('gvTicket')}</th><th className="p-2 uppercase tracking-wider">{t('gvTripId')}</th><th className="p-2 uppercase tracking-wider">{t('gvDisposition')}</th><th className="p-2 uppercase tracking-wider">Excess m³</th></tr></thead>
                    <tbody>
                      {sessionReturns.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">{t('gvNoRet')}</td></tr>}
                      {sessionReturns.map(r => (
                        <tr key={r.key} className="border-b border-white/10">
                          <td className="p-2 font-bold">{r.ticketNumber ?? '—'}</td>
                          <td className="p-2 font-mono text-[10px]">{r.tripId.slice(0, 8)}…</td>
                          <td className="p-2">
                            {r.disposition === 'RECYCLED_BATCHING' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">🔄 Recycle</span>}
                            {r.disposition === 'CAST_BLOCKS' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">🧱 Blocks</span>}
                            {r.disposition === 'WASHOUT' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400">💧 Washout</span>}
                            {r.disposition === 'DISCARDED' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">🗑️ Discarded</span>}
                            {!['RECYCLED_BATCHING', 'CAST_BLOCKS', 'WASHOUT', 'DISCARDED'].includes(r.disposition) && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-300">{r.disposition}</span>}
                          </td>
                          <td className="p-2 font-bold text-sky-400">{r.excessVolumeM3 ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <button onClick={() => { void loadReturns(); }} className="mt-3 text-xs text-sky-400 underline">↻ Refresh from server</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
