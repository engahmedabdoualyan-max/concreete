import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useLogisticsDict } from '../i18n/logisticsDict';
import BrandLogo from '../components/BrandLogo';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';

/* ============================================================================
 *  النقليات — Logistics & Transport
 * ============================================================================
 *  One screen for everything that moves concrete out of the gate:
 *
 *    1. لوحة الإرسال  — the dispatch board: what must pour today, what is
 *                       running, what is late, what is not covered by a truck.
 *    2. الأسطول       — the fleet record: every vehicle, its class, its
 *                       driver, its odometer, insurance and inspection dates.
 *    3. السائقون      — driver assignment: who is on which truck, and which
 *                       trucks cannot move because nobody is on them.
 *    4. الوقود       — the fuel trail: litres, km, L/100km against the target,
 *                       cost per m³ delivered, and the anomalies.
 *    5. الميزان      — the weighbridge trail: load-out and return-in weights,
 *                       the chain-of-custody sequence.
 *
 *  Everything is READ-ONLY here on purpose. The plant already has the
 *  pages that mutate this data (dispatch, gate, workshop); this page is the
 *  one the logistics manager opens to SEE the state of the transport arm in
 *  a single glance, so a wrong number is spotted here rather than discovered
 *  at the gate.
 * ========================================================================== */

type Tab = 'board' | 'fleet' | 'drivers' | 'fuel' | 'scale';

/* ── backend shapes (exact fields from the routes, no invention) ── */

interface BoardAlert {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  messageAr: string;
  ref?: string;
}
interface BoardOrder {
  number: string;
  client: string;
  site: string;
  city: string;
  mix: string;
  grade: string;
  date: string;
  time: string;
  totalM3: number;
  remainingM3: number;
  assignedM3: number;
  deliveredM3: number;
  uncoveredM3: number;
  trips: number;
  activeTrips: number;
  overdueMinutes: number;
  readyToDispatch: boolean;
}
interface BoardTrip {
  id: string;
  number: string;
  orderNumber: string | null;
  checkpoint: string;
  checkpointAr: string;
  loadedM3: number;
  deliveredM3: number;
  vehicle: string;
  plate: string;
  vehicleStatus: string;
  driver: string | null;
  ticket: string | null;
  batchTempC: number | null;
  minutesAtCheckpoint: number | null;
  targetMinutes: number;
  stalled: boolean;
  behind: boolean;
}
interface BoardData {
  window: { from: string; to: string };
  summary: {
    orders: number;
    totalM3: number;
    remainingM3: number;
    uncoveredM3: number;
    activeTrips: number;
    stalledTrips: number;
    deliveredTodayM3: number;
    idleVehicles: number;
    criticalAlerts: number;
  };
  alerts: BoardAlert[];
  orders: BoardOrder[];
  trips: BoardTrip[];
  fleet: { status: string; isExternal: boolean; count: number }[];
  generatedAt: string;
}
interface FleetVehicle {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: string;
  vehicleClass: string;
  isExternal: boolean;
  externalVendorName: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  drumCapacityM3: string | number | null;
  tareWeightTonnes: string | number | null;
  currentStatus: string;
  targetFuelLPer100Km: string | number | null;
  odometreKm: string | number | null;
  insuranceExpiresAt: string | null;
  inspectionDueAt: string | null;
  driverName: string | null;
  driverEmployeeCode: string | null;
}
interface FleetData {
  vehicles: FleetVehicle[];
  count: number;
  fleetComposition: Record<string, number>;
}
interface FuelLog {
  id: string;
  logType: string;
  loggedAt: string;
  litresAdded: string | number | null;
  odometreKm: string | number | null;
  distanceTravelledKm: string | number | null;
  actualLPer100Km: string | number | null;
  targetLPer100Km: string | number | null;
  efficiencyVariance: string | number | null;
  totalFuelCostSar: string | number | null;
  isAnomaly: boolean;
  anomalyNotes: string | null;
  vehicleCode: string;
  plateNumber: string;
}
interface ScaleTx {
  id: string;
  sequenceNumber: number;
  transactionType: string;
  grossWeightKg: string | number | null;
  tareWeightKg: string | number | null;
  netWeightKg: string | number | null;
  lockedAt: string | null;
  notes: string | null;
  tripNumber: string | null;
  vehicleCode: string | null;
  plateNumber: string | null;
  operatorName: string | null;
}
interface ScaleData {
  /** The route returns the list under `recentTransactions`, not `transactions`. */
  recentTransactions: ScaleTx[];
  stats?: {
    totalTransactions: number;
    totalNetWeightKg: number;
    loadOutCount: number;
    returnInCount: number;
    chainTipSequence: number;
  };
  integrity?: { ok?: boolean; checked?: number; broken?: number; message?: string };
}

/* ── helpers ── */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v: unknown, digits = 1): string =>
  num(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtInt = (v: unknown): string => Math.round(num(v)).toLocaleString('en-US');
const d = (v: string | null | undefined): string => (v ? String(v).split('T')[0] : '—');

/**
 * The API client has no request timeout, and the free Render instance can
 * take a minute to wake up. Without a cap here ONE slow endpoint would keep
 * the whole page on "Loading…" — so each call gets its own deadline and the
 * page paints whatever arrived in time.
 */
const withTimeout = <T,>(p: Promise<T>, ms = 45000): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), ms)
    ),
  ]);

/** Days until a date; negative means it already expired. */
const daysUntil = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
};

const FLEET_STATUS_AR: Record<string, string> = {
  AVAILABLE: 'متاحة',
  IN_TRANSIT: 'في الطريق',
  LOADING: 'في التحميل',
  AT_SITE: 'في الموقع',
  RETURNING: 'راجعة',
  IN_WORKSHOP: 'في الورشة',
  MAINTENANCE: 'صيانة',
  MAJOR_BREAKDOWN: 'عطل كبير',
  IDLE: 'خاملة',
  OUT_OF_SERVICE: 'خارج الخدمة',
};
const VEHICLE_TYPE_AR: Record<string, string> = {
  MIXER_TRUCK: 'شاحنة خلط',
  CONCRETE_PUMP: 'مضخة خرسانة',
  TRANSIT_MIXER: 'خلاطة نقل',
  TIPPER_TRUCK: 'دبّاب',
  SERVICE_TRUCK: 'شاحنة خدمة',
  WATER_TANKER: 'صهريج مياه',
  VAN: 'فان',
  PICKUP: 'بيك أب',
  GENERATOR: 'مولد',
  OTHER: 'أخرى',
};
const VEHICLE_CLASS_AR: Record<string, string> = {
  REGULAR: 'عادية',
  MIXER: 'خلاطة',
  PUMP: 'مضخة',
  TIPPER: 'دبّاب',
  TANKER: 'صهريج',
};

export default function Logistics() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const { lang } = useLang();
  const t = useLogisticsDict();
  const [tab, setTab] = useState<Tab>('board');

  const [board, setBoard] = useState<BoardData | null>(null);
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [fuel, setFuel] = useState<FuelLog[]>([]);
  const [scale, setScale] = useState<ScaleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* usePageDict returns a NEW function on every render, so putting `t` in a
     dependency array would re-create `load` on every render and turn the
     effect below into an infinite fetch loop (the button would sit on
     "Loading…" forever and hammer the API). Keep the translator in a ref and
     leave `load` stable. */
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // Each panel is independent: a 403 on one must not blank the others.
    const [b, f, fu, sc] = await Promise.allSettled([
      withTimeout(api.get<BoardData>('/api/dispatch/board')),
      withTimeout(api.get<FleetData>('/api/fleet')),
      withTimeout(api.get<{ fuelLogs: FuelLog[] }>('/api/workshop/fuel')),
      withTimeout(api.get<ScaleData>('/api/weighbridge')),
    ]);
    if (b.status === 'fulfilled') setBoard(b.value);
    if (f.status === 'fulfilled') setFleet(f.value);
    if (fu.status === 'fulfilled') setFuel(fu.value?.fuelLogs ?? []);
    if (sc.status === 'fulfilled') setScale(sc.value);
    const rejected = [b, f, fu, sc].filter((r) => r.status === 'rejected');
    if (rejected.length === 4) {
      const first = rejected[0] as PromiseRejectedResult;
      setError(first.reason?.message || tRef.current('loadError'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void load();
  }, [currentUser, load]);

  const vehicles = useMemo(() => fleet?.vehicles ?? [], [fleet]);

  /** Trucks with nobody on them — they cannot be dispatched. */
  const driverless = useMemo(
    () => vehicles.filter((v) => !v.driverName && !v.isExternal),
    [vehicles],
  );

  /** Fuel economics: total spend and the cost per delivered m³. */
  const fuelStats = useMemo(() => {
    const cost = fuel.reduce((s, f) => s + num(f.totalFuelCostSar), 0);
    const litres = fuel.reduce((s, f) => s + num(f.litresAdded), 0);
    const withActual = fuel.filter((f) => num(f.actualLPer100Km) > 0);
    const avg = withActual.length
      ? withActual.reduce((s, f) => s + num(f.actualLPer100Km), 0) / withActual.length
      : 0;
    const deliveredM3 = board?.summary.deliveredTodayM3 ?? 0;
    return {
      cost,
      litres,
      avg,
      anomalies: fuel.filter((f) => f.isAnomaly).length,
      perM3: deliveredM3 > 0 ? cost / deliveredM3 : 0,
    };
  }, [fuel, board]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">🔒 Access Denied</p>
          <Link to="/" className="text-sky-400 underline">Back to Login</Link>
        </div>
      </div>
    );
  }

  const card = 'bg-white/[0.04] border border-white/10 rounded-xl backdrop-blur-xl';
  const thCls = 'bg-white/[0.04] text-slate-400 text-[10px] p-2 text-right';
  const tdCls = 'p-2 text-right';

  const kpi = (label: string, value: string, tone: string, sub?: string) => (
    <div className={`${card} p-3`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-lg font-black ${tone}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );

  const expiryCell = (iso: string | null | undefined) => {
    const dd = daysUntil(iso);
    if (dd === null) return <span className="text-slate-500">—</span>;
    if (dd < 0) return <span className="text-red-400 font-bold">{d(iso)}</span>;
    if (dd <= 30) return <span className="text-amber-300 font-bold">{d(iso)}</span>;
    return <span>{d(iso)}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      {/* Header */}
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-black tracking-tight text-white">{t('title')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">
            {lang === 'ar' ? '🚪 خروج' : 'Logout'}
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6 space-y-4">
        {/* Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {([
            { id: 'board', label: t('tabBoard') },
            { id: 'fleet', label: t('tabFleet') },
            { id: 'drivers', label: t('tabDrivers') },
            { id: 'fuel', label: t('tabFuel') },
            { id: 'scale', label: t('tabScale') },
          ] as { id: Tab; label: string }[]).map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={`py-2 px-3 rounded-lg font-bold text-xs transition ${tab === x.id ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-white/[0.03] text-slate-400 border border-white/10 hover:text-sky-300 hover:bg-white/[0.06]'}`}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{t('subtitle')}</p>
          <button onClick={() => void load()} disabled={loading} className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 disabled:opacity-50">
            {loading ? t('loading') : t('refresh')}
          </button>
        </div>

        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{error}</div>}

        {/* ────────────────────────── DISPATCH BOARD ────────────────────────── */}
        {tab === 'board' && (
          <div className="space-y-4">
            {board && (
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                {kpi(t('kpiOrders'), fmtInt(board.summary.orders), 'text-white', `${d(board.window.from)} → ${d(board.window.to)}`)}
                {kpi(t('kpiTotalM3'), fmt(board.summary.totalM3), 'text-white', t('m3'))}
                {kpi(t('kpiRemaining'), fmt(board.summary.remainingM3), 'text-amber-300', t('m3'))}
                {kpi(t('kpiUncovered'), fmt(board.summary.uncoveredM3), board.summary.uncoveredM3 > 0 ? 'text-red-400' : 'text-emerald-400', t('m3'))}
                {kpi(t('kpiActiveTrips'), fmtInt(board.summary.activeTrips), 'text-sky-300')}
                {kpi(t('kpiStalled'), fmtInt(board.summary.stalledTrips), board.summary.stalledTrips > 0 ? 'text-red-400' : 'text-emerald-400')}
                {kpi(t('kpiIdle'), fmtInt(board.summary.idleVehicles), 'text-emerald-300')}
                {kpi(t('kpiDelivered'), fmt(board.summary.deliveredTodayM3), 'text-emerald-400', t('m3'))}
              </div>
            )}

            {board && (
              <div className={`${card} p-4`}>
                <h3 className="text-sm font-black text-white mb-3">{t('alertsTitle')}</h3>
                {board.alerts.length === 0 ? (
                  <p className="text-xs text-emerald-400">{t('noAlerts')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {board.alerts.map((a, i) => (
                      <div
                        key={i}
                        className={`text-xs rounded-lg px-3 py-2 border ${
                          a.severity === 'critical'
                            ? 'bg-red-500/10 border-red-500/40 text-red-200'
                            : a.severity === 'warning'
                              ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                              : 'bg-sky-500/10 border-sky-500/40 text-sky-200'
                        }`}
                      >
                        {a.severity === 'critical' ? '🚨' : a.severity === 'warning' ? '⚠️' : 'ℹ️'} {a.messageAr}
                        {a.ref && <span className="opacity-70"> · {a.ref}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {board && (
              <div className={`${card} p-4`}>
                <h3 className="text-sm font-black text-white mb-3">{t('tripsTitle')}</h3>
                {board.trips.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('noTrips')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-300">
                      <thead className={thCls}>
                        <tr>
                          <th className="p-2">{t('colOrder')}</th>
                          <th className="p-2">{t('colTruck')}</th>
                          <th className="p-2">{t('colPlate')}</th>
                          <th className="p-2">{t('colDriver')}</th>
                          <th className="p-2">{t('colCheckpoint')}</th>
                          <th className="p-2">{t('colLoaded')}</th>
                          <th className="p-2">{t('colDelivered')}</th>
                          <th className="p-2">{t('colStalledFor')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.trips.map((tr) => (
                          <tr key={tr.id} className="border-b border-white/10">
                            <td className={tdCls}>
                              <span className="font-mono text-cyan-300">{tr.orderNumber || tr.number}</span>
                            </td>
                            <td className={tdCls}>{tr.vehicle}</td>
                            <td className={`${tdCls} font-mono`} dir="ltr">{tr.plate}</td>
                            <td className={tdCls}>{tr.driver || '—'}</td>
                            <td className={tdCls}>
                              {tr.checkpointAr}
                              {tr.stalled && <span className="mr-1.5 text-red-400 font-bold">🚨</span>}
                              {tr.behind && !tr.stalled && <span className="mr-1.5 text-amber-300 font-bold">⏱</span>}
                            </td>
                            <td className={tdCls}>{fmt(tr.loadedM3)}</td>
                            <td className={tdCls}>{fmt(tr.deliveredM3)}</td>
                            <td className={tdCls}>
                              {tr.minutesAtCheckpoint === null ? '—' : `${tr.minutesAtCheckpoint} ${t('minutes')}`}
                              {tr.stalled && <span className="mr-1.5 text-[10px] font-bold text-red-400">{t('stalled')}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {board && (
              <div className={`${card} p-4`}>
                <h3 className="text-sm font-black text-white mb-3">{t('ordersTitle')}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className={thCls}>
                      <tr>
                        <th className="p-2">{t('colOrder')}</th>
                        <th className="p-2">{t('colClient')}</th>
                        <th className="p-2">{t('colSite')}</th>
                        <th className="p-2">{t('colMix')}</th>
                        <th className="p-2">{t('colTotal')}</th>
                        <th className="p-2">{t('colAssigned')}</th>
                        <th className="p-2">{t('colUncovered')}</th>
                        <th className="p-2">{t('colTrips')}</th>
                        <th className="p-2">{t('colReady')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.orders.map((o) => (
                        <tr key={o.number} className="border-b border-white/10">
                          <td className={`${tdCls} font-mono text-cyan-300`}>{o.number}</td>
                          <td className={tdCls}>{o.client}</td>
                          <td className={tdCls}>{o.site || o.city || '—'}</td>
                          <td className={`${tdCls} text-sky-300`}>{o.mix || o.grade || '—'}</td>
                          <td className={tdCls}>{fmt(o.totalM3)}</td>
                          <td className={tdCls}>{fmt(o.assignedM3)}</td>
                          <td className={`${tdCls} font-bold ${o.uncoveredM3 > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {fmt(o.uncoveredM3)}
                          </td>
                          <td className={tdCls}>
                            {o.trips}
                            {o.activeTrips > 0 && <span className="text-sky-300"> ({o.activeTrips})</span>}
                            {o.overdueMinutes > 0 && <span className="text-red-400 font-bold"> · +{o.overdueMinutes}′</span>}
                          </td>
                          <td className={tdCls}>
                            <span className={o.readyToDispatch ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                              {o.readyToDispatch ? t('readyYes') : t('readyNo')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {board && board.fleet.length > 0 && (
              <div className={`${card} p-4`}>
                <h3 className="text-sm font-black text-white mb-3">{t('fleetStatusTitle')}</h3>
                <div className="flex flex-wrap gap-2">
                  {board.fleet.map((f, i) => (
                    <span
                      key={i}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-slate-200"
                    >
                      {FLEET_STATUS_AR[f.status] || f.status} · {f.count}
                      {f.isExternal && <span className="ml-1 opacity-70">({t('externalYes')})</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────────── FLEET ─────────────────────────────── */}
        {tab === 'fleet' && (
          <div className={`${card} p-4`}>
            <h3 className="text-sm font-black text-white mb-3">{t('fleetTitle')} ({fleet?.count ?? 0})</h3>
            {!fleet || vehicles.length === 0 ? (
              <p className="text-xs text-slate-500">{t('noVehicles')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className={thCls}>
                    <tr>
                      <th className="p-2">{t('colCode')}</th>
                      <th className="p-2">{t('colPlate')}</th>
                      <th className="p-2">{t('colType')}</th>
                      <th className="p-2">{t('colClass')}</th>
                      <th className="p-2">{t('colStatus')}</th>
                      <th className="p-2">{t('colDriver')}</th>
                      <th className="p-2">{t('colOdometer')}</th>
                      <th className="p-2">{t('colCapacity')}</th>
                      <th className="p-2">{t('colInsurance')}</th>
                      <th className="p-2">{t('colInspection')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id} className="border-b border-white/10">
                        <td className={`${tdCls} font-bold text-cyan-300`}>{v.vehicleCode}</td>
                        <td className={`${tdCls} font-mono`} dir="ltr">{v.plateNumber}</td>
                        <td className={tdCls}>
                          {VEHICLE_TYPE_AR[v.vehicleType] || v.vehicleType}
                          {v.isExternal && <span className="mr-1 text-[10px] text-amber-300">{t('externalYes')}</span>}
                        </td>
                        <td className={tdCls}>{VEHICLE_CLASS_AR[v.vehicleClass] || v.vehicleClass}</td>
                        <td className={tdCls}>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-200">
                            {FLEET_STATUS_AR[v.currentStatus] || v.currentStatus}
                          </span>
                        </td>
                        <td className={tdCls}>
                          {v.driverName || <span className="text-amber-300">{t('noDriver')}</span>}
                        </td>
                        <td className={`${tdCls} font-mono`}>{v.odometreKm ? fmtInt(v.odometreKm) : '—'}</td>
                        <td className={tdCls}>
                          {v.drumCapacityM3 ? `${fmt(v.drumCapacityM3)} ${t('m3')}` : '—'}
                        </td>
                        <td className={tdCls}>{expiryCell(v.insuranceExpiresAt)}</td>
                        <td className={tdCls}>{expiryCell(v.inspectionDueAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────── DRIVERS ────────────────────────────── */}
        {tab === 'drivers' && (
          <div className="space-y-4">
            <div className={`${card} p-4`}>
              <h3 className="text-sm font-black text-white mb-1">{t('driversTitle')}</h3>
              <p className="text-xs text-slate-400 mb-3">{t('driversHint')}</p>

              {driverless.length === 0 ? (
                <p className="text-xs text-emerald-400">{t('allAssigned')}</p>
              ) : (
                <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                  <p className="text-xs font-black text-red-200 mb-2">{t('driverlessVehicles')} ({driverless.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {driverless.map((v) => (
                      <span key={v.id} className="text-[11px] font-bold px-2.5 py-1 rounded bg-red-500/15 text-red-200 border border-red-500/30">
                        {v.vehicleCode} · <span dir="ltr">{v.plateNumber}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className={thCls}>
                    <tr>
                      <th className="p-2">{t('colCode')}</th>
                      <th className="p-2">{t('colPlate')}</th>
                      <th className="p-2">{t('colType')}</th>
                      <th className="p-2">{t('colStatus')}</th>
                      <th className="p-2">{t('colAssignedTo')}</th>
                      <th className="p-2">{t('colCapacityM3')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id} className="border-b border-white/10">
                        <td className={`${tdCls} font-bold text-cyan-300`}>{v.vehicleCode}</td>
                        <td className={`${tdCls} font-mono`} dir="ltr">{v.plateNumber}</td>
                        <td className={tdCls}>{VEHICLE_TYPE_AR[v.vehicleType] || v.vehicleType}</td>
                        <td className={tdCls}>{FLEET_STATUS_AR[v.currentStatus] || v.currentStatus}</td>
                        <td className={tdCls}>
                          {v.driverName ? (
                            <>
                              {v.driverName}
                              {v.driverEmployeeCode && <span className="text-slate-500"> · {v.driverEmployeeCode}</span>}
                            </>
                          ) : (
                            <span className="text-amber-300 font-bold">{t('noDriver')}</span>
                          )}
                        </td>
                        <td className={tdCls}>{v.drumCapacityM3 ? fmt(v.drumCapacityM3) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────── FUEL ──────────────────────────────── */}
        {tab === 'fuel' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {kpi(t('kpiFuelCost'), fmtInt(fuelStats.cost), 'text-white', t('sar'))}
              {kpi(t('kpiEfficiency'), fmt(fuelStats.avg, 1), 'text-sky-300')}
              {kpi(t('kpiAnomalies'), fmtInt(fuelStats.anomalies), fuelStats.anomalies > 0 ? 'text-red-400' : 'text-emerald-400')}
              {kpi(t('costPerM3'), fmt(fuelStats.perM3, 2), fuelStats.perM3 > 0 ? 'text-amber-300' : 'text-slate-400', t('sar') + '/' + t('m3'))}
            </div>

            <div className={`${card} p-4`}>
              <h3 className="text-sm font-black text-white mb-1">{t('fuelTitle')}</h3>
              <p className="text-xs text-slate-400 mb-3">{t('costPerM3Hint')}</p>
              {fuel.length === 0 ? (
                <p className="text-xs text-slate-500">{t('noFuel')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className={thCls}>
                      <tr>
                        <th className="p-2">{t('colFuelDate')}</th>
                        <th className="p-2">{t('colCode')}</th>
                        <th className="p-2">{t('colPlate')}</th>
                        <th className="p-2">{t('colLitres')}</th>
                        <th className="p-2">{t('colDistance')}</th>
                        <th className="p-2">{t('colActual')}</th>
                        <th className="p-2">{t('colTarget')}</th>
                        <th className="p-2">{t('colCost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuel.map((f) => {
                        const over = num(f.actualLPer100Km) > num(f.targetLPer100Km) && num(f.targetLPer100Km) > 0;
                        return (
                          <tr key={f.id} className="border-b border-white/10">
                            <td className={tdCls}>{d(f.loggedAt)}</td>
                            <td className={`${tdCls} font-bold text-cyan-300`}>{f.vehicleCode}</td>
                            <td className={`${tdCls} font-mono`} dir="ltr">{f.plateNumber}</td>
                            <td className={tdCls}>{fmtInt(f.litresAdded)}</td>
                            <td className={tdCls}>{fmtInt(f.distanceTravelledKm)}</td>
                            <td className={`${tdCls} font-bold ${over ? 'text-red-400' : 'text-emerald-400'}`}>
                              {fmt(f.actualLPer100Km, 1)}
                            </td>
                            <td className={tdCls}>{fmt(f.targetLPer100Km, 1)}</td>
                            <td className={`${tdCls} ${f.isAnomaly ? 'text-red-400 font-bold' : ''}`}>
                              {fmtInt(f.totalFuelCostSar)}
                              {f.isAnomaly && <span className="mr-1"> 🚨</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────── WEIGHBRIDGE ────────────────────────── */}
        {tab === 'scale' && (
          <div className="space-y-4">
            {scale?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpi(t('kpiLoads'), fmtInt(scale.stats.loadOutCount), 'text-sky-300')}
                {kpi(t('kpiReturns'), fmtInt(scale.stats.returnInCount), 'text-amber-300')}
                {kpi(t('kpiNetWeight'), fmt(scale.stats.totalNetWeightKg / 1000, 1), 'text-white', t('tonnes'))}
                {kpi(t('colSeq'), fmtInt(scale.stats.chainTipSequence), 'text-white')}
              </div>
            )}
            <div className={`${card} p-4`}>
              <h3 className="text-sm font-black text-white mb-3">{t('scaleTitle')}</h3>
              {!scale || !scale.recentTransactions || scale.recentTransactions.length === 0 ? (
                <p className="text-xs text-slate-500">{t('noScale')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className={thCls}>
                      <tr>
                        <th className="p-2">{t('colSeq')}</th>
                        <th className="p-2">{t('colTxType')}</th>
                        <th className="p-2">{t('colCode')}</th>
                        <th className="p-2">{t('colPlate')}</th>
                        <th className="p-2">{t('colGross')}</th>
                        <th className="p-2">{t('colTare')}</th>
                        <th className="p-2">{t('colNet')}</th>
                        <th className="p-2">{t('colOperator')}</th>
                        <th className="p-2">{t('colLocked')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scale.recentTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-white/10">
                          <td className={`${tdCls} font-mono`}>{tx.sequenceNumber}</td>
                          <td className={tdCls}>
                            {tx.transactionType === 'RETURN_IN' ? t('returnIn') : t('loadOut')}
                          </td>
                          <td className={`${tdCls} font-bold text-cyan-300`}>{tx.vehicleCode || '—'}</td>
                          <td className={`${tdCls} font-mono`} dir="ltr">{tx.plateNumber || '—'}</td>
                          <td className={tdCls}>{fmtInt(tx.grossWeightKg)}</td>
                          <td className={tdCls}>{fmtInt(tx.tareWeightKg)}</td>
                          <td className={`${tdCls} font-bold text-white`}>{fmtInt(tx.netWeightKg)}</td>
                          <td className={tdCls}>{tx.operatorName || '—'}</td>
                          <td className={tdCls}>{tx.lockedAt ? d(tx.lockedAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
