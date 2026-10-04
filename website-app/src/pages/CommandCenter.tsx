import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SiteMap, { type MapSite, type MapVehicle } from '../components/SiteMap';

/**
 * CommandCenter — 📺 "بث الشاشة".
 * A read-only plant command center meant to run on an office TV like a
 * monitoring camera: production today, silo stock, fleet size, and the map.
 * Read-only on purpose: it never POSTs/PUTs anything, so it is safe to leave
 * polling on a wall screen. Refreshes every 30 seconds.
 *
 * Each section degrades independently — a role without INVENTORY_READ still
 * sees the map, and a role without FLEET_POSITION_READ (drivers) never sees
 * vehicle positions, same rule as the Sites page.
 */

const POLL_MS = 30000;

interface BoardSummary {
  orders?: number;
  totalM3?: number;
  remainingM3?: number;
  uncoveredM3?: number;
  activeTrips?: number;
  stalledTrips?: number;
  deliveredTodayM3?: number;
  idleVehicles?: number;
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

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('ar-EG', { maximumFractionDigits: 1 });
}

function Tile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 text-center backdrop-blur-xl ${alert ? 'border-red-500/60 bg-red-500/10 animate-pulse' : 'border-white/10 bg-white/[0.03]'}`}>
      <p className="text-[11px] text-slate-400 font-bold">{label}</p>
      <p className={`text-3xl lg:text-4xl font-black mt-1 ${alert ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function CommandCenter() {
  const { currentUser } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [board, setBoard] = useState<BoardSummary | null>(null);
  const [trips, setTrips] = useState<LiveTrip[]>([]);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [lowStock, setLowStock] = useState(0);
  const [sites, setSites] = useState<MapSite[]>([]);
  const [vehicles, setVehicles] = useState<MapVehicle[]>([]);
  const [canFleet, setCanFleet] = useState(false);

  const load = useCallback(async () => {
    // Production board — independent try/catch so one 403 never blanks the TV.
    try {
      const b = await api.get<{ summary?: BoardSummary; trips?: LiveTrip[]; liveTrips?: LiveTrip[] }>('/api/dispatch/board');
      setBoard(b?.summary ?? null);
      setTrips(Array.isArray(b?.trips) ? b.trips : Array.isArray(b?.liveTrips) ? b.liveTrips : []);
    } catch { /* section stays empty */ }
    // Silos.
    try {
      const inv = await api.get<{ silos?: Silo[]; alerts?: { lowStockCount?: number } }>('/api/inventory');
      setSilos(Array.isArray(inv?.silos) ? inv.silos : []);
      setLowStock(inv?.alerts?.lowStockCount ?? 0);
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
          .map((p) => ({
            vehicleId: String(p.vehicleId ?? p.vehicleCode),
            vehicleCode: String(p.vehicleCode ?? ''),
            plateNumber: String(p.plateNumber ?? ''),
            latitude: p.latitude,
            longitude: p.longitude,
            isStale: !!p.isStale,
            isInsidePrimaryGeofence: !!p.isInsidePrimaryGeofence,
            nearestLine: p?.nearestSite ? `${p.nearestSite.siteCode} · ${p.nearestSite.distanceMetres} م` : '',
            distanceLine: '',
            ageLine: typeof p.ageMinutes === 'number' ? `${p.ageMinutes} د` : '',
          }))
      );
    } catch {
      setCanFleet(false);
      setVehicles([]);
    }
  }, []);

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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center" dir="rtl">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <p className="text-4xl mb-3">📺</p>
          <h1 className="text-xl font-black text-white">بث الشاشة</h1>
          <p className="text-sm text-slate-400 mt-2">سجل الدخول أولاً من نفس الشاشة — البث يعمل بحساب مدير المصنع ويبقى شغالاً.</p>
        </div>
      </div>
    );
  }

  const liveCount = vehicles.filter((v) => !v.isStale).length;
  const critSilos = silos.filter((s) => s.isCritical || s.isLowStock);

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-200" dir="rtl">
      {/* ===== header ===== */}
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-white/10 bg-[#0B111E]/80">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
            CONCRETE PLANT <span className="text-sky-400">COMMAND CENTER</span>
          </h1>
          <p className="text-[11px] text-slate-500">بث الشاشة — تحديث تلقائي كل ٣٠ ثانية</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> بث مباشر
          </span>
          <span className="text-sm font-mono text-slate-300">
            {now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
        {/* ===== KPI strip ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile label="إنتاج اليوم (م³)" value={fmt(board?.deliveredTodayM3)} sub={`المطلوب ${fmt(board?.totalM3)}`} />
          <Tile label="المتبقي (م³)" value={fmt(board?.remainingM3)} sub={`غير مغطى ${fmt(board?.uncoveredM3)}`} alert={(board?.uncoveredM3 ?? 0) > 0} />
          <Tile label="رحلات نشطة" value={fmt(board?.activeTrips)} sub={`${fmt(board?.orders)} طلبات اليوم`} />
          <Tile label="رحلات متعثرة" value={fmt(board?.stalledTrips)} alert={(board?.stalledTrips ?? 0) > 0} />
          <Tile label="أسطول نشط" value={canFleet ? `${fmt(liveCount)} / ${fmt(vehicles.length)}` : '—'} sub="مركبة بإشارة حية" />
          <Tile label="مخزون حرج" value={fmt(lowStock)} sub={`${fmt(silos.length)} صومعة`} alert={lowStock > 0} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 mt-4">
          {/* ===== map ===== */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <h2 className="text-sm font-black text-white mb-2 px-1">🗺️ الخريطة — المصنع والفروع والأسطول</h2>
            {sites.length > 0 || vehicles.length > 0 ? (
              <SiteMap sites={sites} vehicles={canFleet ? vehicles : []} className="min-h-[420px] lg:min-h-[520px]" />
            ) : (
              <div className="min-h-[420px] flex items-center justify-center text-slate-500 text-sm">بانتظار بيانات المواقع…</div>
            )}
          </div>

          {/* ===== side column ===== */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="text-sm font-black text-white mb-3">🏗️ المخزون — الصوامع</h2>
              {silos.length === 0 && <p className="text-xs text-slate-500">لا بيانات مخزون.</p>}
              <div className="space-y-3">
                {silos.slice(0, 8).map((s, i) => (
                  <div key={s.siloCode ?? i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-slate-200">{s.siloName ?? s.siloCode}</span>
                      <span className={(s.isCritical || s.isLowStock) ? 'text-red-400 font-black' : 'text-slate-400'}>
                        %{s.stockPct ?? 0}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(s.stockPct ?? 0) < 20 ? 'bg-red-500' : (s.stockPct ?? 0) < 40 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, s.stockPct ?? 0))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {critSilos.length > 0 && (
                <p className="text-xs text-red-300 font-bold mt-3">⚠️ {critSilos.length} صومعة تحت حد الطلب</p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="text-sm font-black text-white mb-3">🚚 الرحلات الآن</h2>
              {trips.length === 0 && <p className="text-xs text-slate-500">لا رحلات نشطة حالياً.</p>}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {trips.slice(0, 10).map((t, i) => (
                  <div key={i} className={`rounded-xl border px-3 py-2 text-xs ${t.stalled ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="flex justify-between">
                      <span className="font-black text-white">{t.tripCode ?? t.code ?? `رحلة ${i + 1}`}</span>
                      {t.stalled && <span className="text-red-400 font-black">متعثرة{t.stalledMinutes ? ` ${t.stalledMinutes} د` : ''}</span>}
                    </div>
                    {(t.vehicleCode || t.checkpoint) && (
                      <p className="text-slate-400 mt-0.5">{t.vehicleCode ?? ''} {t.checkpoint ? `· ${t.checkpoint}` : ''}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
