import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAllLivePositions, loadPlantProfile, type LivePosEntry } from '../firebase/firestore';

interface LiveTrackingProps {
  activeOrders: { id: string; orderNo?: string; projectName: string; projectLocation?: string; quantity: number }[];
}

interface TrackedTruck extends LivePosEntry {
  username: string;
  plantName: string;
  distanceKm: number;
  etaMin: number;
  ageMin: number;
}

const AVG_SPEED_KMH = 45;
const DEFAULT_PLANT: [number, number] = [26.4207, 50.0888]; // Dammam fallback

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function LiveTracking({ activeOrders }: LiveTrackingProps) {
  if (!activeOrders.length) return null;
  return <LiveTrackingInner activeOrders={activeOrders} />;
}

function LiveTrackingInner({ activeOrders }: LiveTrackingProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [trucks, setTrucks] = useState<TrackedTruck[]>([]);
  const [plantPos, setPlantPos] = useState<[number, number]>(DEFAULT_PLANT);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [stale, setStale] = useState(true);

  // Load plant origin once
  useEffect(() => {
    let mounted = true;
    getAllPlantsOrigin().then(p => { if (mounted && p) setPlantPos(p); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Poll live positions every 15s
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const raw = await getAllLivePositions();
        if (!mounted) return;
        const now = Date.now();
        const enriched: TrackedTruck[] = raw.map(e => {
          const dist = haversineKm(plantPos[0], plantPos[1], e.lat, e.lng);
          const speed = e.speed && e.speed > 5 ? e.speed : AVG_SPEED_KMH;
          const etaMin = Math.max(1, Math.round((dist / speed) * 60));
          const ageMin = Math.round((now - (e.ts || now)) / 60000);
          return { ...e, distanceKm: dist, etaMin, ageMin };
        })
          .filter(t => t.ageMin <= 120) // only fresh positions (<2h)
          .sort((a, b) => a.etaMin - b.etaMin)
          .slice(0, 8);
        setTrucks(enriched);
        setStale(enriched.length === 0);
        setLastUpdate(new Date().toLocaleTimeString('en-GB'));
      } catch { /* ignore */ }
    };
    tick();
    const iv = window.setInterval(tick, 15000);
    return () => { mounted = false; window.clearInterval(iv); };
  }, [plantPos[0], plantPos[1]]);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { attributionControl: false, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    map.setView(plantPos, 10);
    mapInstance.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapInstance.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapInstance.current;
    const group = markersRef.current;
    if (!map || !group) return;
    group.clearLayers();

    // Plant marker (origin)
    L.marker(plantPos, {
      icon: L.divIcon({ html: '<div style="font-size:22px">🏭</div>', className: '', iconSize: [24, 24] }),
    }).bindTooltip('المصنع').addTo(group);

    // Truck markers
    trucks.forEach((t, i) => {
      const color = t.ageMin > 15 ? '#f59e0b' : '#38bdf8';
      L.marker([t.lat, t.lng], {
        icon: L.divIcon({
          html: `<div style="background:${color};color:#fff;font-weight:900;font-size:11px;padding:3px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)">🚚 ${t.etaMin} د</div>`,
          className: '', iconSize: [70, 22], iconAnchor: [35, 11],
        }),
      }).addTo(group);
      // Line from plant to truck (route approximation)
      L.polyline([plantPos, [t.lat, t.lng]], { color, weight: 2, dashArray: '6 8', opacity: 0.5 }).addTo(group);
    });

    // Fit bounds
    const pts: [number, number][] = [plantPos, ...trucks.map(t => [t.lat, t.lng] as [number, number])];
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.25));
  }, [trucks, plantPos[0], plantPos[1]]);

  const nearest = trucks[0];

  return (
    <div className="bg-gradient-to-br from-sky-500/10 to-transparent border border-sky-500/30 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
        <div>
          <h2 className="text-sm font-black text-white flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            تتبع مباشر للشاحنات
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5">
            طلبك قيد التنفيذ — الشاحنة في الطريق إليك · Live Truck Tracking
          </p>
        </div>
        <div className="text-left">
          {nearest && !stale ? (
            <>
              <p className="text-xl font-black text-emerald-400 leading-none">{nearest.etaMin} دقيقة</p>
              <p className="text-[9px] text-slate-500 mt-1" dir="ltr">⟳ {lastUpdate}</p>
            </>
          ) : (
            <p className="text-xs text-yellow-400 font-bold">{stale ? '📡 في انتظار إشارة GPS...' : '—'}</p>
          )}
        </div>
      </div>

      {/* Map */}
      <div ref={mapRef} className="w-full h-[260px]" style={{ background: '#0d1420' }} />

      {/* Trucks list */}
      {trucks.length > 0 && (
        <div className="px-4 py-3 space-y-1.5 border-t border-white/10">
          {trucks.slice(0, 3).map((t, i) => (
            <div key={`${t.username}-${t.assetId}`} className="flex items-center justify-between text-[11px] bg-white/[0.03] rounded-lg px-3 py-2">
              <span className="font-bold text-slate-200">
                🚚 شاحنة {i + 1} <span className={`ml-1 ${t.ageMin > 15 ? 'text-yellow-400' : 'text-emerald-400'}`}>{t.ageMin > 15 ? '(إشارة قديمة)' : '(مباشر)'}</span>
              </span>
              <span className="text-slate-400">{t.distanceKm.toFixed(1)} كم ← <strong className="text-emerald-400">{t.etaMin} دقيقة</strong></span>
            </div>
          ))}
          <p className="text-[9px] text-slate-600 pt-1">للطلب: {activeOrders.map(o => o.orderNo || o.id).join('، ')}</p>
        </div>
      )}
    </div>
  );
}

/* Load first available plant profile geo */
async function getAllPlantsOrigin(): Promise<[number, number] | null> {
  try {
    const { getAllLivePositions } = await import('../firebase/firestore');
    const live = await getAllLivePositions();
    // Try to find any plant profile via usernames in live positions
    const fs = await import('../firebase/firestore');
    for (const p of live.slice(0, 5)) {
      try {
        const prof = await (fs as any).loadPlantProfile(p.username);
        if (prof?.geoLat && prof?.geoLng) return [prof.geoLat, prof.geoLng];
      } catch { /* next */ }
    }
  } catch { /* ignore */ }
  return null;
}
