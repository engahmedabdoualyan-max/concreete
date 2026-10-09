import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';
import BrandLogo from '../components/BrandLogo';
import SiteMap, { type MapSite, type MapVehicle } from '../components/SiteMap';

/**
 * CommandCenter — 📺 "بث الشاشة".
 * A read-only plant command center meant to run on an office TV like a
 * monitoring camera. The whole screen fits ONE viewport — no mouse, no
 * scrolling: header, KPI strip, map + goal column + icon rail, bottom strip.
 *
 * The big number is the DAILY GOAL achievement % (concrete m³ + block units
 * blended), set by the plant owner with the 🎯 editor. Read-only otherwise:
 * it never POSTs/PUTs anything except the owner's own goal. Lists refresh
 * every 30 seconds.
 *
 * Each section degrades independently — a role without INVENTORY_READ still
 * sees the map, and a role without FLEET_POSITION_READ (drivers) never sees
 * vehicle positions, same rule as the Sites page.
 */

const POLL_MS = 30000;
const SLOW_MS = 180000;

interface BoardSummary {
  orders?: number;
  totalM3?: number;
  remainingM3?: number;
  uncoveredM3?: number;
  activeTrips?: number;
  stalledTrips?: number;
  deliveredTodayM3?: number;
  idleVehicles?: number;
  criticalAlerts?: number;
}

interface BoardAlert {
  severity?: string;
  code?: string;
  messageAr?: string;
  message?: string;
}

interface LiveTrip {
  tripCode?: string;
  code?: string;
  checkpoint?: string;
  stalled?: boolean;
  stalledMinutes?: number;
  vehicleCode?: string;
  remainingM3?: number;
}

interface Silo {
  siloCode?: string;
  siloName?: string;
  materialCategory?: string;
  stockPct?: number;
  daysRemaining?: number;
  isLowStock?: boolean;
  isCritical?: boolean;
}

interface Emergency {
  dept: string;
  text: string;
  critical: boolean;
}

function fmt(n: number | undefined | null, lang: string): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 1 });
}

function MiniTile({ label, value, alert, to }: { label: string; value: string; alert?: boolean; to?: string }) {
  const body = (
    <div className={`rounded-xl border px-2 py-1.5 text-center ${alert ? 'border-red-500/60 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'} ${to ? 'hover:border-sky-400/60 cursor-pointer' : ''}`}>
      <p className="text-[10px] text-slate-400 font-bold truncate">{label}</p>
      <p className={`text-xl font-black leading-tight ${alert ? 'text-red-400' : 'text-white'}`}>{value}</p>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{body}</Link> : body;
}

const RAIL: Array<{ to: string; icon: string; ar: string; en: string; fleet?: boolean }> = [
  { to: '/', icon: '🏠', ar: 'الرئيسية', en: 'Home' },
  { to: '/sites', icon: '🛰️', ar: 'المواقع والأسطول', en: 'Sites & Fleet', fleet: true },
  { to: '/operations', icon: '🚚', ar: 'التشغيل', en: 'Operations' },
  { to: '/production', icon: '🏭', ar: 'الإنتاج', en: 'Production' },
  { to: '/finance', icon: '💰', ar: 'المالية', en: 'Finance' },
  { to: '/command', icon: '📺', ar: 'بث الشاشة', en: 'Command' },
];

export default function CommandCenter() {
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);

  const [now, setNow] = useState(() => new Date());
  const [board, setBoard] = useState<BoardSummary | null>(null);
  const [boardAlerts, setBoardAlerts] = useState<BoardAlert[]>([]);
  const [trips, setTrips] = useState<LiveTrip[]>([]);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [lowStock, setLowStock] = useState(0);
  const [openWO, setOpenWO] = useState<any[]>([]);
  const [fuelAnom, setFuelAnom] = useState<any[]>([]);
  const [manpower, setManpower] = useState<{ present: number; total: number } | null>(null);
  const [collections, setCollections] = useState<{ totalSar: number; count: number } | null>(null);
  const [readiness, setReadiness] = useState<Record<string, { total: number; working: number; idle: number; workshop: number; stored: number; unmarked: number }> | null>(null);
  const [readinessBr, setReadinessBr] = useState<Record<string, { siteCode: string; siteName: string; total: number; working: number; idle: number; workshop: number; stored: number }> | null>(null);
  const [histDate, setHistDate] = useState('');
  const [histTime, setHistTime] = useState('');
  const [hist, setHist] = useState<any | null>(null);
  const [histAt, setHistAt] = useState('');
  const [histMsg, setHistMsg] = useState('');
  const TYPE_AR: Record<string, string> = { MIXER_TRUCK: 'خلاطات', CONCRETE_PUMP: 'بامب', TIPPER_TRUCK: 'قلاب', TRANSIT_MIXER: 'ترانزيت', WATER_TANKER: 'تانكر', SERVICE_TRUCK: 'خدمة' };
  const [sites, setSites] = useState<MapSite[]>([]);
  const [vehicles, setVehicles] = useState<MapVehicle[]>([]);
  const [canFleet, setCanFleet] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [targets, setTargets] = useState({ concreteM3: 0, blocks: 0 });
  const [canEditTargets, setCanEditTargets] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [editConcrete, setEditConcrete] = useState('');
  const [editBlocks, setEditBlocks] = useState('');
  const [blocks, setBlocks] = useState({ producedUnits: 0, producedM3: 0, salesOrders: 0, salesM3: 0 });

  const loadSlow = useCallback(async () => {
    // Production board — independent try/catch so one 403 never blanks the TV.
    try {
      const b = await api.get<{ summary?: BoardSummary; trips?: LiveTrip[]; liveTrips?: LiveTrip[]; alerts?: BoardAlert[] }>('/api/dispatch/board');
      setBoard(b?.summary ?? null);
      setTrips(Array.isArray(b?.trips) ? b.trips : Array.isArray(b?.liveTrips) ? b.liveTrips : []);
      setBoardAlerts(Array.isArray(b?.alerts) ? b.alerts : []);
    } catch { /* section stays empty */ }
    // Daily goal (plant owner sets it; everyone permitted reads it).
    try {
      const g = await api.get<{ targets?: { concreteM3?: number; blocks?: number }; canEdit?: boolean }>('/api/command/targets');
      setTargets({ concreteM3: g?.targets?.concreteM3 ?? 0, blocks: g?.targets?.blocks ?? 0 });
      setCanEditTargets(!!g?.canEdit);
    } catch { /* ring shows no-goal state */ }
    // Blocks today: produced + sold.
    try {
      const bl = await api.get<{ produced?: { units?: number; volumeM3?: number }; sales?: { orders?: number; volumeM3?: number } }>('/api/blocks/today');
      setBlocks({
        producedUnits: bl?.produced?.units ?? 0,
        producedM3: bl?.produced?.volumeM3 ?? 0,
        salesOrders: bl?.sales?.orders ?? 0,
        salesM3: bl?.sales?.volumeM3 ?? 0,
      });
    } catch { /* tiles stay empty */ }
    // Silos.
    try {
      const inv = await api.get<{ silos?: Silo[]; alerts?: { lowStockCount?: number } }>('/api/inventory');
      setSilos(Array.isArray(inv?.silos) ? inv.silos : []);
      setLowStock(inv?.alerts?.lowStockCount ?? 0);
    } catch { /* section stays empty */ }
    // Workshop: open work orders + fuel anomalies (daily faults).
    try {
      const w = await api.get<{ openWorkOrders?: any[]; fuelAnomalies?: any[] }>('/api/workshop');
      setOpenWO(Array.isArray(w?.openWorkOrders) ? w.openWorkOrders : []);
      setFuelAnom(Array.isArray(w?.fuelAnomalies) ? w.fuelAnomalies : []);
    } catch { /* section stays empty */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ar]);

  // Fast lane (30s): live numbers only — this is what makes the TV feel live.
  const loadFast = useCallback(async () => {
    // Manpower today (HR absence register: present/total).
    try {
      const mp = await api.get<{ present?: number; total?: number }>('/api/hr/absences');
      setManpower(
        typeof mp?.present === 'number' && typeof mp?.total === 'number'
          ? { present: mp.present, total: mp.total }
          : null
      );
    } catch { setManpower(null); }
    // Collections today (accountant records them from Finance).
    try {
      const c = await api.get<{ totalSar?: number; count?: number }>('/api/finance/collections');
      setCollections(
        typeof c?.totalSar === 'number' ? { totalSar: c.totalSar, count: c.count ?? 0 } : null
      );
    } catch { setCollections(null); }
    // Readiness roll-call (dispatcher marks in Operations).
    try {
      const rd = await api.get<{ byType?: Record<string, { total: number; working: number; idle: number; workshop: number; stored: number; unmarked: number }>; byBranch?: Record<string, { siteCode: string; siteName: string; total: number; working: number; idle: number; workshop: number; stored: number }> }>('/api/fleet/readiness');
      setReadiness(rd?.byType ?? null);
      setReadinessBr((rd as any)?.byBranch ?? null);
    } catch { setReadiness(null); setReadinessBr(null); }
    // Record today's snapshot (throttled server-side; never blocks the TV).
    try {
      await api.post('/api/command/snapshot');
    } catch { /* history stays as-is */ }
    // Sites (plant + branches).
    try {
      const s = await api.get<{ sites?: Array<MapSite & { latitude: number; longitude: number }> }>('/api/sites');
      setSites(Array.isArray(s?.sites) ? s.sites : []);
    } catch { /* section stays empty */ }
    // Fleet positions — hidden entirely without FLEET_POSITION_READ.
    try {
      const f = await api.get<{ positions?: Array<any> }>('/api/fleet/positions');
      const pos = Array.isArray(f?.positions) ? f.positions : [];
      setCanFleet(true);
      setVehicles(
        pos
          .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
          .map((p) => {
            const statusBits = [
              p.currentStatus ? String(p.currentStatus) : '',
              typeof p.speedKmh === 'number' ? `${p.speedKmh} ${ar ? 'كم/س' : 'km/h'}` : '',
            ].filter(Boolean).join(' · ');
            return {
              vehicleId: String(p.vehicleId ?? p.vehicleCode),
              vehicleCode: String(p.vehicleCode ?? ''),
              plateNumber: String(p.plateNumber ?? ''),
              latitude: p.latitude,
              longitude: p.longitude,
              isStale: !!p.isStale,
              isInsidePrimaryGeofence: !!p.isInsidePrimaryGeofence,
              nearestLine: p?.nearestSite
                ? `${ar ? 'أقرب موقع' : 'Nearest'}: ${p.nearestSite.siteName ?? p.nearestSite.siteCode} · ${p.nearestSite.distanceMetres} ${ar ? 'م' : 'm'}`
                : '',
              statusLine: statusBits,
              detailHref: '#/operations',
              detailLabel: ar ? 'رحلاتها ←' : 'Trips →',
              capturedAt: typeof p.capturedAt === 'string' ? p.capturedAt : undefined,
              headingDeg: typeof p.headingDeg === 'number' ? p.headingDeg : null,
              moving: !p.isStale && typeof p.speedKmh === 'number' && p.speedKmh > 5,
              distanceLine: '',
              ageLine: typeof p.ageMinutes === 'number'
                ? (p.isStale
                  ? `${ar ? 'آخر ظهور منذ' : 'last seen'} ${p.ageMinutes} ${ar ? 'د' : 'min'}`
                  : `${ar ? 'منذ' : ''} ${p.ageMinutes} ${ar ? 'د' : 'min ago'}`)
                : '',
            };
          })
      );
    } catch {
      setCanFleet(false);
      setVehicles([]);
    }
  }, [ar]);

  const loadHistory = async (date: string, time?: string) => {
    const t = time ?? histTime;
    setHistDate(date);
    if (!date) {
      setHist(null);
      setHistAt('');
      setHistMsg('');
      return;
    }
    try {
      const d = await api.get<{ snapshot?: any; updatedAt?: string }>(
        `/api/command/history?date=${date}${t ? `&time=${t}` : ''}`
      );
      setHist(d?.snapshot ?? null);
      setHistAt(d?.updatedAt ? new Date(d.updatedAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '');
      setHistMsg('');
    } catch (e: any) {
      setHist(null);
      setHistAt('');
      setHistMsg(`❌ ${e?.message ?? ''}`);
    }
  };

  const printReport = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    const snap = hist && histDate ? hist : null;
    const title = snap ? `تقرير البث — ${histDate}${histTime ? ` ${histTime}` : ''}` : 'تقرير البث اليومي — مباشر';
    const esc = (s: unknown) => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const row = (k: string, v: string) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`;
    const fleet = snap?.fleet;
    const mp = snap ? snap.manpower : manpower;
    const gt = snap?.gate;
    const rd = snap ? null : readiness;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma;padding:28px;color:#111}h1{font-size:22px;margin-bottom:4px}.sub{font-size:12px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th{background:#0f172a;color:#fff;padding:6px 8px;text-align:right;width:40%}td{padding:5px 8px;border-bottom:1px solid #ddd}h2{font-size:15px;margin:14px 0 4px}.foot{margin-top:18px;font-size:11px;color:#555;display:flex;gap:40px}.sig{border-top:1px solid #999;padding-top:4px;min-width:140px;text-align:center}@media print{body{padding:10mm}}</style></head><body>
    <h1>📺 ${title}</h1>
    <div class="sub">المصنع الرئيسي - حفر الباطن · ${new Date().toISOString().slice(0, 10)}</div>
    <h2>الأسطول</h2>
    <table>${snap && fleet ? row('مركبات متموضعة', fleet.positioned) + row('داخل السور', fleet.insideGeofence) + row('بلا إشارة', fleet.stale) : row('متموضعة/حية', canFleet ? `${liveCount}/${vehicles.length}` : '—')}</table>
    <h2>القوة البشرية</h2>
    <table>${row('حاضر/إجمالي', mp ? `${mp.present}/${mp.total}` : '—')}</table>
    ${rd ? `<h2>الجاهزية</h2><table>${Object.entries(rd).map(([t, b]: any) => row(t, `شغال ${b.working}/${b.total} · ورشة ${b.workshop} · عاطل ${b.idle}`)).join('')}</table>` : ''}
    ${snap && gt ? `<h2>البوابة</h2><table>${row('دخول/خروج', `${gt.inTickets}/${gt.outTickets}`)}${row('صافي الداخل (طن)', (gt.inKg / 1000).toFixed(1))}${row('خرسانة م³', gt.concreteM3)}${row('بلك', gt.blockUnits)}</table>` : ''}
    ${snap ? `<h2>الطلبات والرحلات والتحصيل</h2><table>${row('طلبات', `${snap.orders?.count ?? 0} (${snap.orders?.volumeM3 ?? 0} م³)`)}</table><table>${row('رحلات', snap.trips?.total ?? 0)}${row('تحصيل اليوم (ر.س)', snap.collectionsSar ?? 0)}</table>` : ''}
    ${!snap && emergencies.length ? `<h2>الطوارئ (${emergencies.length})</h2><table>${emergencies.map((e) => row(e.dept, e.text)).join('')}</table>` : ''}
    <div class="foot"><div class="sig">توقيع مدير المصنع</div><div class="sig">توقيع المشرف</div></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
  };

  const saveTargets = async () => {
    const c = Math.max(0, Number(editConcrete) || 0);
    const b = Math.max(0, Math.round(Number(editBlocks) || 0));
    try {
      const res = await api.put<{ targets?: { concreteM3?: number; blocks?: number } }>('/api/command/targets', { concreteM3: c, blocks: b });
      setTargets({ concreteM3: res?.targets?.concreteM3 ?? c, blocks: res?.targets?.blocks ?? b });
      setShowTargetEditor(false);
    } catch { /* keep editor open on failure */ }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadSlow();
    loadFast();
    const tFast = window.setInterval(loadFast, POLL_MS);
    const tSlow = window.setInterval(loadSlow, SLOW_MS);
    return () => {
      window.clearInterval(tFast);
      window.clearInterval(tSlow);
    };
  }, [currentUser, loadSlow, loadFast]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ===== emergency aggregation — every item below is live API data =====
  const emergencies: Emergency[] = [];
  for (const a of boardAlerts.filter((a) => a.severity === 'critical')) {
    emergencies.push({ dept: ar ? 'التشغيل' : 'Ops', text: a.messageAr ?? a.message ?? a.code ?? 'تنبيه حرج', critical: true });
  }
  for (const t of trips.filter((t) => t.stalled)) {
    emergencies.push({
      dept: ar ? 'التشغيل' : 'Ops',
      text: `${ar ? 'رحلة متعثرة' : 'Stalled trip'} ${t.tripCode ?? t.code ?? ''}${t.stalledMinutes ? ` — ${t.stalledMinutes} ${ar ? 'د' : 'min'}` : ''}`,
      critical: true,
    });
  }
  if ((board?.uncoveredM3 ?? 0) > 0) {
    emergencies.push({ dept: ar ? 'الإنتاج' : 'Production', text: `${ar ? 'كميات غير مغطاة' : 'Uncovered'}: ${fmt(board?.uncoveredM3, lang)} ${ar ? 'م³' : 'm³'}`, critical: true });
  }
  for (const s of silos.filter((s) => s.isCritical || s.isLowStock)) {
    emergencies.push({ dept: ar ? 'المخزون' : 'Inventory', text: `${ar ? 'خامة أوشكت' : 'Low stock'}: ${s.siloName ?? s.siloCode} (%${s.stockPct ?? 0})`, critical: !!s.isCritical });
  }
  for (const w of openWO.slice(0, 10)) {
    emergencies.push({ dept: ar ? 'الورشة' : 'Workshop', text: `${ar ? 'بلاغ مفتوح' : 'Open ticket'}: ${w.title ?? w.code ?? w.id ?? ''}`, critical: false });
  }
  for (const f of fuelAnom.slice(0, 10)) {
    emergencies.push({ dept: ar ? 'التموين' : 'Fuel', text: `${ar ? 'شذوذ وقود' : 'Fuel anomaly'}: ${f.vehicleCode ?? f.description ?? ''}`, critical: false });
  }
  const offline = vehicles.filter((v) => v.isStale).length;
  if (canFleet && offline > 0) {
    emergencies.push({ dept: ar ? 'الأسطول' : 'Fleet', text: `${offline} ${ar ? 'مركبة بلا إشارة' : 'vehicles offline'}`, critical: false });
  }
  const faults = openWO.length + fuelAnom.length + trips.filter((t) => t.stalled).length;

  // ===== daily goal achievement: the ONE big number =====
  const concretePct = targets.concreteM3 > 0 ? Math.min(999, Math.round(((board?.deliveredTodayM3 ?? 0) / targets.concreteM3) * 100)) : -1;
  const blocksPct = targets.blocks > 0 ? Math.min(999, Math.round((blocks.producedUnits / targets.blocks) * 100)) : -1;
  const parts = [concretePct, blocksPct].filter((p) => p >= 0);
  const achievement = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : -1;

  if (!currentUser) {
    return (
      <div className="h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center" dir={ar ? 'rtl' : 'ltr'}>
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <p className="text-4xl mb-3">📺</p>
          <h1 className="text-xl font-black text-white">{L('بث الشاشة', 'Command Center')}</h1>
          <p className="text-sm text-slate-400 mt-2">
            {L('سجل الدخول أولاً من نفس الشاشة — البث يعمل بحساب مدير المصنع ويبقى شغالاً.', 'Log in first on this screen — the cast runs on the plant manager account.')}
          </p>
        </div>
      </div>
    );
  }

  const liveCount = vehicles.filter((v) => !v.isStale).length;
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const ringPct = achievement >= 0 ? Math.min(100, achievement) : 0;
  const concreteBar = targets.concreteM3 > 0 ? Math.min(100, ((board?.deliveredTodayM3 ?? 0) / targets.concreteM3) * 100) : 0;
  const blocksBar = targets.blocks > 0 ? Math.min(100, (blocks.producedUnits / targets.blocks) * 100) : 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#080C14] text-slate-200" dir={ar ? 'rtl' : 'ltr'}>
      {/* ===== header ===== */}
      <header className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0B111E]/80 shrink-0">
        <div className="flex items-center gap-3">
          <BrandLogo width={48} rounded="rounded-xl" />
          <div>
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight leading-tight">
              CONCRETE PLANT <span className="text-sky-400">COMMAND CENTER</span>
            </h1>
            <p className="text-[10px] text-slate-500">{L('بث الشاشة — تحديث تلقائي كل ٣٠ ثانية', 'Screen cast — auto-refresh every 30 sec')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">🏠</Link> <QuickJump /> <LangSelector />
          <button
            onClick={() => setShowEmergency((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-black rounded-lg px-3 py-2 border transition ${
              emergencies.length > 0
                ? 'text-white bg-red-600 border-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.7)]'
                : 'text-slate-400 bg-white/[0.04] border-white/10'
            }`}
          >
            🚨 {L('طوارئ', 'Emergency')} · {emergencies.length}
          </button>
          <button onClick={printReport} title={L('طباعة / PDF', 'Print / PDF')}
            className="flex items-center gap-1.5 text-xs font-black rounded-lg px-3 py-2 border border-white/10 text-slate-300 hover:text-white hover:border-sky-400/60">
            🖨️ {L('طباعة', 'Print')}
          </button>
          <span className="flex items-center gap-1.5 text-xs font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {L('مباشر', 'LIVE')}
          </span>
          <span className="text-sm font-mono text-slate-300">
            {now.toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      {/* ===== emergency overlay (never pushes layout — TV has no mouse to scroll back) ===== */}
      {showEmergency && (
        <div className="fixed inset-0 z-[2000] bg-black/70 flex items-center justify-center p-6" onClick={() => setShowEmergency(false)}>
          <div className="max-w-3xl w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-red-500/40 bg-[#120B0B] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-black text-red-300">🚨 {L('مشاكل طارئة حسب القسم', 'Urgent issues by department')}</h2>
              <button onClick={() => setShowEmergency(false)} className="text-slate-400 hover:text-white text-lg px-2">✕</button>
            </div>
            {emergencies.length === 0 && (
              <p className="text-sm text-emerald-300 font-bold">✅ {L('لا مشاكل طارئة حالياً — كل الأقسام سليمة.', 'No urgent issues — all departments clear.')}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {emergencies.map((e, i) => (
                <div key={i} className={`rounded-xl border px-3 py-2 text-xs ${e.critical ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <span className={`inline-block font-black rounded px-2 py-0.5 mb-1 ${e.critical ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-slate-300'}`}>
                    {e.dept}
                  </span>
                  <p className="text-slate-200 font-bold">{e.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== KPI strip: concrete + blocks + fleet + manpower, one row ===== */}
      <div className="px-4 pt-2 grid grid-cols-4 lg:grid-cols-10 gap-2 shrink-0">
        <MiniTile label={L('القوة البشرية 👷', 'Manpower')} value={manpower ? `${fmt(manpower.present, lang)}/${fmt(manpower.total, lang)}` : '—'} to="/hr" />
        <MiniTile label={L('تحصيل اليوم 💵', 'Collected')} value={collections ? `${fmt(collections.totalSar, lang)}` : '—'} to="/finance" />
        <MiniTile label={L('خرسانة اليوم م³', 'Concrete m³')} value={fmt(board?.deliveredTodayM3, lang)} to="/operations" />
        <MiniTile label={L('إنتاج البلك 🧱', 'Blocks made')} value={fmt(blocks.producedUnits, lang)} to="/production" />
        <MiniTile label={L('مبيعات البلك 🧾', 'Blocks sold')} value={fmt(blocks.salesOrders, lang)} to="/production" />
        <MiniTile label={L('رحلات نشطة', 'Active trips')} value={fmt(board?.activeTrips, lang)} to="/operations" />
        <MiniTile label={L('متعثرة', 'Stalled')} value={fmt(board?.stalledTrips, lang)} alert={(board?.stalledTrips ?? 0) > 0} to="/operations" />
        <MiniTile label={L('أسطول نشط', 'Fleet live')} value={canFleet ? `${fmt(liveCount, lang)}/${fmt(vehicles.length, lang)}` : '—'} to="/sites" />
        <MiniTile label={L('أعطال اليوم', "Today's faults")} value={fmt(faults, lang)} alert={faults > 0} to="/workshop" />
        <MiniTile label={L('مخزون حرج', 'Low stock')} value={fmt(lowStock, lang)} alert={lowStock > 0} to="/materials" />
      </div>

      {/* ===== readiness strip: working power + workshop per type ===== */}
      {readiness && (
        <div className="px-4 pt-2">
          <Link to="/operations" style={{ textDecoration: 'none' }}>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 hover:border-amber-400/50">
              <span className="text-[11px] font-black text-amber-300">📋 {L('جاهزية اليوم', 'Readiness')}</span>
              {Object.entries(readiness).map(([t, b]) => (
                <span key={t} className="text-[11px] text-slate-200">
                  <b>{TYPE_AR[t] ?? t}</b>{' '}
                  <span className="text-emerald-300 font-black">{fmt(b.working, lang)}</span>
                  <span className="text-slate-500">/{fmt(b.total, lang)}</span>{' '}
                  <span className="text-slate-400">{L('شغال', 'up')}</span>
                  {b.workshop > 0 && <span className="text-amber-300"> · 🔧 {fmt(b.workshop, lang)} {L('ورشة', 'shop')}</span>}
                  {b.stored > 0 && <span className="text-sky-300"> · 📦 {fmt(b.stored, lang)} {L('مخزن', 'stored')}</span>}
                  {b.idle > 0 && <span className="text-slate-500"> · {fmt(b.idle, lang)} {L('عاطل', 'idle')}</span>}
                </span>
              ))}
              {readinessBr && Object.values(readinessBr).map((b: any) => (
                <span key={b.siteCode} className="text-[11px] text-slate-200 border-r border-white/10 pr-3">
                  <b className="text-sky-300">{b.siteCode === 'HQ' ? L('المصنع', 'Plant') : b.siteName ?? b.siteCode}</b>{' '}
                  <span className="text-emerald-300 font-black">{fmt(b.working, lang)}</span>
                  <span className="text-slate-500">/{fmt(b.total, lang)}</span>
                  {b.workshop > 0 && <span className="text-amber-300"> · 🔧{fmt(b.workshop, lang)}</span>}
                  {b.stored > 0 && <span className="text-sky-300"> · 📦{fmt(b.stored, lang)}</span>}
                </span>
              ))}
              <span className="text-[10px] text-slate-500">← {L('التفاصيل من التشغيل', 'Details in Operations')}</span>
            </div>
          </Link>
        </div>
      )}

      {/* ===== day archive: recorded snapshots, searchable by date ===== */}
      <div className="px-4 pt-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black text-slate-300">🗓️ {L('أرشيف الأيام', 'Day archive')}</span>
          <input type="date" value={histDate} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setHistTime(''); void loadHistory(e.target.value, ''); }}
            className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none" />
          <input type="time" value={histTime} disabled={!histDate}
            onChange={(e) => { setHistTime(e.target.value); void loadHistory(histDate, e.target.value); }}
            className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none disabled:opacity-40" />
          {histDate && (
            <button onClick={() => { setHistTime(''); void loadHistory(''); }} className="text-[11px] text-slate-400 border border-white/10 rounded-lg px-2 py-1">
              {L('رجوع للمباشر', 'Back to live')}
            </button>
          )}
          {histAt && <span className="text-[11px] text-sky-300 font-bold">📸 {histAt}</span>}
          {histMsg && <span className="text-[11px] font-bold">{histMsg}</span>}
        </div>
        {hist && (
          <div className="mt-2 rounded-xl border border-sky-500/30 bg-sky-500/[0.05] px-3 py-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
            {[
              { l: L('الأسطول المتموضع', 'Positioned'), v: `${hist.fleet?.positioned ?? 0}` },
              { l: L('داخل السور', 'Inside'), v: `${hist.fleet?.insideGeofence ?? 0}` },
              { l: `👷 ${L('حاضر', 'Present')}`, v: `${hist.manpower?.present ?? 0}/${hist.manpower?.total ?? 0}` },
              { l: `📥 ${L('دخول (طن)', 'In t')}`, v: `${((hist.gate?.inKg ?? 0) / 1000).toFixed(1)}` },
              { l: `📤 ${L('خرسانة م³', 'Conc m³')}`, v: `${hist.gate?.concreteM3 ?? 0}` },
              { l: `🧾 ${L('طلبات', 'Orders')}`, v: `${hist.orders?.count ?? 0}` },
              { l: `🚚 ${L('رحلات', 'Trips')}`, v: `${hist.trips?.total ?? 0}` },
              { l: `💵 ${L('تحصيل', 'Collected')}`, v: `${hist.collectionsSar ?? 0}` },
              { l: `🎯 ${L('مستهدف', 'Goal')}`, v: `${hist.targets?.concreteM3 ?? 0}` },
            ].map((x) => (
              <div key={x.l}>
                <p className="text-[10px] text-slate-400 font-bold">{x.l}</p>
                <p className="text-base font-black text-white">{x.v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== main row: map + goal column + rail (fills the rest, never scrolls) ===== */}
      <div className="flex-1 min-h-0 px-4 py-2 grid grid-cols-1 lg:grid-cols-[1fr_300px_52px] gap-3 max-w-[1700px] w-full mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 min-h-0 flex flex-col">
          <h2 className="text-xs font-black text-white px-1 pb-1">
            🗺️ {L('الخريطة — المصنع والفروع والأسطول', 'Map — plant, branches & fleet')}
          </h2>
          <SiteMap sites={sites} vehicles={canFleet ? vehicles : []} className="flex-1 min-h-0" />
        </div>

        <div className="hidden lg:flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* goal ring */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-center shrink-0">
            <h2 className="text-[11px] font-black text-slate-400">{L('تحقيق هدف اليوم', 'DAILY GOAL')}</h2>
            <div className="relative w-[128px] h-[128px] mx-auto mt-1">
              <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
                <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
                <circle
                  cx="65" cy="65" r={R} fill="none"
                  stroke={achievement >= 100 ? '#34d399' : achievement >= 50 ? '#38bdf8' : '#fbbf24'}
                  strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={`${ringPct / 100 * CIRC} ${CIRC}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white">{achievement >= 0 ? `%${achievement}` : '—'}</span>
              </div>
            </div>
            <div className="text-left mt-1">
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="font-bold text-slate-300">{L('خرسانة', 'Concrete')}</span>
                <span className="font-mono text-slate-400">{fmt(board?.deliveredTodayM3, lang)}/{fmt(targets.concreteM3, lang)} {L('م³', 'm³')}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
                <div className="h-full bg-sky-400 rounded-full" style={{ width: `${concreteBar}%` }} />
              </div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="font-bold text-slate-300">{L('بلك', 'Blocks')}</span>
                <span className="font-mono text-slate-400">{fmt(blocks.producedUnits, lang)}/{fmt(targets.blocks, lang)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${blocksBar}%` }} />
              </div>
            </div>
            {canEditTargets && (
              <button onClick={() => { setEditConcrete(String(targets.concreteM3)); setEditBlocks(String(targets.blocks)); setShowTargetEditor((v) => !v); }}
                className="mt-1 text-[11px] font-black text-sky-300 border border-sky-500/40 rounded-lg px-3 py-1 hover:bg-sky-500/10">
                🎯 {L('هدف اليوم', 'Set goal')}
              </button>
            )}
            {showTargetEditor && canEditTargets && (
              <div className="mt-1 flex gap-1">
                <input value={editConcrete} onChange={(e) => setEditConcrete(e.target.value)} inputMode="decimal" placeholder={L('م³ خرسانة', 'm³')} className="w-full bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none" />
                <input value={editBlocks} onChange={(e) => setEditBlocks(e.target.value)} inputMode="numeric" placeholder={L('بلك', 'blocks')} className="w-full bg-white/[0.06] border border-white/15 rounded-lg px-2 py-1 text-xs text-white outline-none" />
                <button onClick={saveTargets} className="shrink-0 bg-sky-500 text-white text-xs font-black rounded-lg px-3">✓</button>
              </div>
            )}
          </div>
          {/* compact lists */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 min-h-0 overflow-hidden">
            <h2 className="text-[11px] font-black text-white px-1">🏗️ {L('المخزون', 'Stock')}</h2>
            {silos.length === 0 && <p className="text-[10px] text-slate-500 px-1">{L('لا صوامع مسجلة.', 'No silos.')}</p>}
            {silos.slice(0, 3).map((s, i) => (
              <div key={s.siloCode ?? i} className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-slate-300 truncate flex-1">{s.siloName ?? s.siloCode}</span>
                <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${(s.stockPct ?? 0) < 20 ? 'bg-red-500' : (s.stockPct ?? 0) < 40 ? 'bg-yellow-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, s.stockPct ?? 0)}%` }} />
                </div>
                <span className="text-[10px] font-mono text-slate-400">%{s.stockPct ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 min-h-0 overflow-hidden">
            <h2 className="text-[11px] font-black text-white px-1">🚚 {L('الرحلات', 'Trips')}</h2>
            {trips.length === 0 && <p className="text-[10px] text-slate-500 px-1">{L('لا رحلات نشطة.', 'None active.')}</p>}
            {trips.slice(0, 3).map((t, i) => (
              <p key={i} className={`text-[10px] px-1 py-0.5 truncate ${t.stalled ? 'text-red-300 font-black' : 'text-slate-300'}`}>
                {t.stalled ? '🔴 ' : '🟢 '}{t.tripCode ?? t.code ?? ''} {t.vehicleCode ?? ''}
              </p>
            ))}
          </div>
        </div>

        {/* icon rail */}
        <div className="hidden lg:flex flex-col gap-2 justify-start">
          {RAIL.filter((r) => !r.fleet || canFleet).map((r) => (
            <Link key={r.to} to={r.to} title={ar ? r.ar : r.en}
              className="w-11 h-11 shrink-0 flex items-center justify-center text-lg rounded-xl border border-white/10 bg-white/[0.03] hover:border-sky-400/60 hover:bg-white/[0.07] transition">
              {r.icon}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
