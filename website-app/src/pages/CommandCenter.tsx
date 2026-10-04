import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import SiteMap, { type MapSite, type MapVehicle } from '../components/SiteMap';

/**
 * CommandCenter — 📺 "بث الشاشة".
 * A read-only plant command center meant to run on an office TV like a
 * monitoring camera: production today, silo stock, fleet size, and the map.
 * Read-only on purpose: it never POSTs/PUTs anything, so it is safe to leave
 * polling on a wall screen. Lists refresh every 3 minutes.
 *
 * Each section degrades independently — a role without INVENTORY_READ still
 * sees the map, and a role without FLEET_POSITION_READ (drivers) never sees
 * vehicle positions, same rule as the Sites page.
 */

const POLL_MS = 180000;

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

function StatRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-400 font-bold">{label}</span>
      <span className={`text-lg font-black ${alert ? 'text-red-400' : 'text-white'}`}>{value}</span>
    </div>
  );
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
  const [sites, setSites] = useState<MapSite[]>([]);
  const [vehicles, setVehicles] = useState<MapVehicle[]>([]);
  const [canFleet, setCanFleet] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);

  const load = useCallback(async () => {
    // Production board — independent try/catch so one 403 never blanks the TV.
    try {
      const b = await api.get<{ summary?: BoardSummary; trips?: LiveTrip[]; liveTrips?: LiveTrip[]; alerts?: BoardAlert[] }>('/api/dispatch/board');
      setBoard(b?.summary ?? null);
      setTrips(Array.isArray(b?.trips) ? b.trips : Array.isArray(b?.liveTrips) ? b.liveTrips : []);
      setBoardAlerts(Array.isArray(b?.alerts) ? b.alerts : []);
    } catch { /* section stays empty */ }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ar]);

  useEffect(() => {
    if (!currentUser) return;
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(t);
  }, [currentUser, load]);

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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center" dir={ar ? 'rtl' : 'ltr'}>
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
  const readiness = vehicles.length > 0 ? Math.round((liveCount / vehicles.length) * 100) : 0;
  const R = 54;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-200" dir={ar ? 'rtl' : 'ltr'}>
      {/* ===== header: plant logo, title, language, flashing emergency ===== */}
      <header className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0B111E]/80">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} rounded="rounded-2xl" />
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
              CONCRETE PLANT <span className="text-sky-400">COMMAND CENTER</span>
            </h1>
            <p className="text-[11px] text-slate-500">{L('بث الشاشة — تحديث تلقائي كل ٣ دقائق', 'Screen cast — auto-refresh every 3 min')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <LangSelector />
          <button
            onClick={() => setShowEmergency((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-black rounded-lg px-3 py-2 border transition ${
              emergencies.length > 0
                ? 'text-white bg-red-600 border-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.7)]'
                : 'text-slate-400 bg-white/[0.04] border-white/10'
            }`}
          >
            🚨 {L('مشاكل طارئة', 'Emergency')} · {emergencies.length}
          </button>
          <span className="flex items-center gap-1.5 text-xs font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {L('بث مباشر', 'LIVE')}
          </span>
          <span className="text-sm font-mono text-slate-300">
            {now.toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </header>

      {/* ===== emergency panel ===== */}
      {showEmergency && (
        <div className="px-4 sm:px-6 pt-3 max-w-[1700px] mx-auto">
          <div className="rounded-2xl border border-red-500/40 bg-red-500/[0.06] p-4">
            <h2 className="text-sm font-black text-red-300 mb-2">🚨 {L('مشاكل طارئة — دوس على أي قسم لمتابعته', 'Urgent issues by department')}</h2>
            {emergencies.length === 0 && (
              <p className="text-xs text-emerald-300 font-bold">✅ {L('لا مشاكل طارئة حالياً — كل الأقسام سليمة.', 'No urgent issues — all departments clear.')}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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

      <div className="p-4 sm:p-6 max-w-[1700px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_340px_64px] gap-4">
        {/* ===== map (always mounted — tiles stay alive even before data arrives) ===== */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 min-h-[480px] lg:min-h-[600px] flex flex-col">
          <h2 className="text-sm font-black text-white mb-2 px-1">
            🗺️ {L('الخريطة — المصنع والفروع والأسطول', 'Map — plant, branches & fleet')}
            {canFleet && vehicles.length > 0 && (
              <span className="text-[11px] text-slate-400 font-bold"> · {liveCount}/{vehicles.length} {L('نشطة', 'live')}</span>
            )}
          </h2>
          <SiteMap sites={sites} vehicles={canFleet ? vehicles : []} className="flex-1 min-h-[420px]" />
          <p className="text-[10px] text-slate-600 px-1 pt-1">{L('دوس على أي مركبة لبياناتها ورحلاتها.', 'Click any vehicle for its data and trips.')}</p>
        </div>

        {/* ===== center: readiness ring + production + faults + inventory + trips ===== */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
            <h2 className="text-xs font-black text-slate-400">{L('جاهزية الأسطول', 'FLEET READINESS')}</h2>
            <div className="relative w-[150px] h-[150px] mx-auto mt-2">
              <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
                <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
                <circle
                  cx="65" cy="65" r={R} fill="none"
                  stroke={readiness >= 70 ? '#34d399' : readiness >= 40 ? '#fbbf24' : '#f87171'}
                  strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={`${(readiness / 100) * CIRC} ${CIRC}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white">{canFleet ? `%${readiness}` : '—'}</span>
                <span className="text-[10px] text-slate-500">{L('إشارة حية', 'live signal')}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {canFleet ? `${liveCount} / ${vehicles.length} ${L('مركبة', 'vehicles')}` : L('لا صلاحية مواقع للأسطول', 'No fleet access')}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-black text-white mb-1">🏭 {L('إنتاج اليوم', "Today's production")}</h2>
            <StatRow label={L('تم صبه (م³)', 'Poured (m³)')} value={fmt(board?.deliveredTodayM3, lang)} />
            <StatRow label={L('المطلوب (م³)', 'Ordered (m³)')} value={fmt(board?.totalM3, lang)} />
            <StatRow label={L('المتبقي (م³)', 'Remaining (m³)')} value={fmt(board?.remainingM3, lang)} />
            <StatRow label={L('غير مغطى (م³)', 'Uncovered (m³)')} value={fmt(board?.uncoveredM3, lang)} alert={(board?.uncoveredM3 ?? 0) > 0} />
            <StatRow label={L('رحلات نشطة', 'Active trips')} value={fmt(board?.activeTrips, lang)} />
            <StatRow label={L('رحلات متعثرة', 'Stalled trips')} value={fmt(board?.stalledTrips, lang)} alert={(board?.stalledTrips ?? 0) > 0} />
            <StatRow label={L('عربيات فاضية', 'Idle vehicles')} value={fmt(board?.idleVehicles, lang)} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-black text-white mb-1">🔧 {L('أعطال وبلاغات اليوم', "Today's faults & tickets")}</h2>
            <StatRow label={L('بلاغات ورشة مفتوحة', 'Open workshop tickets')} value={fmt(openWO.length, lang)} alert={openWO.length > 0} />
            <StatRow label={L('شذوذ وقود', 'Fuel anomalies')} value={fmt(fuelAnom.length, lang)} alert={fuelAnom.length > 0} />
            <StatRow label={L('رحلات متعثرة', 'Stalled trips')} value={fmt(trips.filter((t) => t.stalled).length, lang)} alert={trips.some((t) => t.stalled)} />
            {faults === 0 && <p className="text-xs text-emerald-300 font-bold mt-1">✅ {L('يوم نظيف — لا أعطال مسجلة.', 'Clean day — nothing recorded.')}</p>}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-black text-white mb-1">🏗️ {L('المخزون', 'Inventory')}</h2>
            {silos.length === 0 && <p className="text-xs text-slate-500 py-1">{L('لا صوامع مسجلة.', 'No silos registered.')}</p>}
            {silos.slice(0, 6).map((s, i) => (
              <div key={s.siloCode ?? i} className="mb-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-200">{s.siloName ?? s.siloCode}</span>
                  <span className={(s.isCritical || s.isLowStock) ? 'text-red-400 font-black' : 'text-slate-400'}>%{s.stockPct ?? 0}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(s.stockPct ?? 0) < 20 ? 'bg-red-500' : (s.stockPct ?? 0) < 40 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, Math.max(0, s.stockPct ?? 0))}%` }}
                  />
                </div>
              </div>
            ))}
            {lowStock > 0 && <p className="text-xs text-red-300 font-bold mt-2">⚠️ {lowStock} {L('صومعة تحت حد الطلب', 'silos below reorder level')}</p>}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-black text-white mb-2">🚚 {L('الرحلات الآن', 'Trips right now')}</h2>
            {trips.length === 0 && <p className="text-xs text-slate-500">{L('لا رحلات نشطة حالياً.', 'No active trips right now.')}</p>}
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {trips.slice(0, 8).map((t, i) => (
                <div key={i} className={`rounded-xl border px-3 py-2 text-xs ${t.stalled ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex justify-between">
                    <span className="font-black text-white">{t.tripCode ?? t.code ?? `${L('رحلة', 'Trip')} ${i + 1}`}</span>
                    {t.stalled && <span className="text-red-400 font-black">{L('متعثرة', 'Stalled')}{t.stalledMinutes ? ` ${t.stalledMinutes} ${L('د', 'm')}` : ''}</span>}
                  </div>
                  {(t.vehicleCode || t.checkpoint) && (
                    <p className="text-slate-400 mt-0.5">{t.vehicleCode ?? ''} {t.checkpoint ? `· ${t.checkpoint}` : ''}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== right icon rail (like the reference console) ===== */}
        <div className="flex lg:flex-col flex-row gap-2 justify-start">
          {RAIL.filter((r) => !r.fleet || canFleet).map((r) => (
            <Link
              key={r.to}
              to={r.to}
              title={ar ? r.ar : r.en}
              className="w-12 h-12 shrink-0 flex items-center justify-center text-xl rounded-xl border border-white/10 bg-white/[0.03] hover:border-sky-400/60 hover:bg-white/[0.07] transition"
            >
              {r.icon}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
