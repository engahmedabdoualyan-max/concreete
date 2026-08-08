import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadAssets, saveAssets, loadGpsConfig, loadPlantGPS, savePlantGPS, getAllPlantsSummary, loadGpsHistory, saveGpsHistory, getAllLivePositions, type PlantSummary } from '../firebase/firestore';
import { loadGpsLocationsFromSupabase, saveGpsLocationToSupabase } from '../supabase/supabase';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const inputCls = 'px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const chipCls = (active: boolean) => `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${active ? 'bg-blue-600/30 text-blue-300 border-blue-500/50' : 'bg-[#0f172a] text-slate-300 border-[#334155] hover:border-blue-500/40'}`;

function basicAuth(u: string, p: string) {
  try { return 'Basic ' + btoa(u + ':' + p); } catch { return ''; }
}
async function apiFetch(url: string, user: string, pass: string) {
  const res = await fetch(url, { headers: { Authorization: basicAuth(user, pass) } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('Server did not return JSON (check URL/port).');
  return res.json();
}
function today() { return new Date().toISOString().slice(0, 10); }

const TYPE_ICON: Record<string, string> = { Mixer: '🚛', 'Mobile Pump': '🎯', 'Light Vehicle': '🚗', Loader: '🚜', Generator: '⚡', Station: '🏗️' };

export default function GpsFleetMap({ onToast }: { onToast: (msg: string) => void }) {
  const { currentUser } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const assetsRef = useRef<any[]>([]);
  const [plantGps, setPlantGps] = useState<{ lat: number; lng: number } | null>(null);
  const [summary, setSummary] = useState<PlantSummary[]>([]);
  const [supaGps, setSupaGps] = useState<Array<{ username: string; label: string; lat: number; lng: number }>>([]);
  const [cfg, setCfg] = useState<any>({ server: '', username: '', password: '', liveEnabled: false, refreshSec: 15 });
  const [live, setLive] = useState<Record<string, { lat: number; lng: number; fixTime: string; speed?: number }>>({});
  const [driverLive, setDriverLive] = useState<Array<{ username: string; plantName: string; assetId: string; lat: number; lng: number; ts: number; speed?: number }>>([]);
  const [liveState, setLiveState] = useState<'off' | 'connecting' | 'on' | 'error'>('off');
  const [liveMsg, setLiveMsg] = useState('');
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [histDate, setHistDate] = useState(today());
  const [histVehicle, setHistVehicle] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [route, setRoute] = useState<[number, number][]>([]);
  const [routeTrips, setRouteTrips] = useState<any[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histMsg, setHistMsg] = useState('');
  const [gpsMsg, setGpsMsg] = useState('');

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<L.Map | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const pollTimer = useRef<any>(null);
  const persistRef = useRef(0);

  const setBoth = (next: any[]) => { assetsRef.current = next; setAssets(next); };

  useEffect(() => {
    if (!currentUser) return;
    loadPlantGPS(currentUser.username).then(g => g && setPlantGps(g)).catch(() => {});
    loadGpsConfig(currentUser.username).then(c => c && setCfg({ server: '', username: '', password: '', liveEnabled: false, refreshSec: 15, ...c })).catch(() => {});
    loadAssets(currentUser.username).then(a => { if (Array.isArray(a)) { assetsRef.current = a; setAssets(a); } }).catch(() => {});
    loadGpsLocationsFromSupabase().then(rows => setSupaGps(rows.map(r => ({ username: r.username, label: r.label, lat: r.lat, lng: r.lng })))).catch(() => {});
    getAllPlantsSummary().then(s => setSummary(s)).catch(() => {});
    getAllLivePositions().then(d => setDriverLive(d)).catch(() => {});
  }, [currentUser?.username]);

  useEffect(() => {
    const t = setInterval(() => { getAllLivePositions().then(d => setDriverLive(d)).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!currentUser || !cfg.liveEnabled || !cfg.server) return;
    const base = cfg.server.replace(/\/+$/, '');
    const poll = async () => {
      setLiveState('connecting');
      try {
        const [devs, pos] = await Promise.all([
          apiFetch(base + '/api/devices', cfg.username, cfg.password),
          apiFetch(base + '/api/positions', cfg.username, cfg.password),
        ]);
        const devById = new Map((Array.isArray(devs) ? devs : []).map(d => [d.id, d.uniqueId]));
        const m: Record<string, { lat: number; lng: number; fixTime: string; speed?: number }> = {};
        (Array.isArray(pos) ? pos : []).forEach((p: any) => {
          const u = devById.get(p.deviceId);
          if (u && p.lat != null && p.lon != null) m[u] = { lat: p.lat, lng: p.lon, fixTime: p.fixTime || '', speed: p.speed };
        });
        setLive(m);
        setLiveState('on');
        setLiveMsg('');
        setLastPoll(Date.now());
        const next = (assetsRef.current || []).map(a => {
          const lp = m[a.gpsId];
          return lp ? { ...a, gpsLat: lp.lat, gpsLng: lp.lng, gpsUpdatedAt: lp.fixTime || a.gpsUpdatedAt } : a;
        });
        setBoth(next);
        if (Date.now() - persistRef.current > 60000) {
          persistRef.current = Date.now();
          saveAssets(currentUser.username, next).catch(() => {});
          next.forEach(a => { if (a.gpsId && a.gpsLat != null && a.gpsLng != null) saveGpsLocationToSupabase({ username: currentUser.username, label: `asset:${a.id}`, lat: a.gpsLat, lng: a.gpsLng }).catch(() => {}); });
        }
      } catch (e: any) {
        setLiveState('error');
        setLiveMsg(e.message || 'Connection failed');
      }
    };
    poll();
    pollTimer.current = setInterval(poll, Math.max(5, Number(cfg.refreshSec) || 15) * 1000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [cfg.liveEnabled, cfg.server, cfg.username, cfg.password, cfg.refreshSec, currentUser?.username]);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const center: [number, number] = plantGps ? [plantGps.lat, plantGps.lng] : [24.7136, 46.6753];
    const map = L.map(mapRef.current).setView(center, 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);
    routeLayer.current = L.layerGroup().addTo(map);
    mapObj.current = map;
    return () => { if (mapObj.current) { mapObj.current.remove(); mapObj.current = null; } };
  }, [plantGps]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !markerLayer.current || !routeLayer.current) return;
    markerLayer.current.clearLayers();
    routeLayer.current.clearLayers();

    const plantIcon = L.divIcon({ html: '🏭', className: '', iconSize: [26, 26] });
    if (plantGps) markerLayer.current.addLayer(L.marker([plantGps.lat, plantGps.lng], { icon: plantIcon }).bindPopup('<b>🏭 Plant HQ</b>'));

    const allAssets = Array.isArray(assets) ? assets : [];
    const freshDriver = (Array.isArray(driverLive) ? driverLive : []).filter(d => Date.now() - (d.ts || 0) < 180000);
    const posFor = (a: any) => {
      const s = a.gpsId && live[a.gpsId];
      if (s) return { lat: s.lat, lng: s.lng, src: 'tracker' as const };
      const d = freshDriver.find(x => x.assetId === a.id);
      if (d) return { lat: d.lat, lng: d.lng, src: 'driver' as const, who: `${d.username}${d.plantName ? ' · ' + d.plantName : ''}` };
      if (typeof a.gpsLat === 'number' && typeof a.gpsLng === 'number') return { lat: a.gpsLat, lng: a.gpsLng, src: 'stored' as const };
      return null;
    };
    const positioned = allAssets.map(a => ({ a, pos: posFor(a) }));
    const filtered = positioned.filter(({ a, pos }) => {
      if (!pos) return false;
      if (filter === 'mixer') return a.type === 'Mixer';
      if (filter === 'pump') return a.type === 'Mobile Pump';
      if (filter === 'mixer+pump') return a.type === 'Mixer' || a.type === 'Mobile Pump';
      if (filter === 'asset') return a.id === selectedAsset;
      return true;
    });

    const iconFor = (a: any, src: string) => {
      const emoji = TYPE_ICON[a.type] || '🚚';
      const dot = src === 'tracker' ? '<span class="gps-live"></span>' : src === 'driver' ? '<span class="gps-live gps-driver"></span>' : '';
      return L.divIcon({ className: '', html: `<div class="gps-pin">${emoji}${dot}</div>`, iconSize: [26, 26] });
    };
    filtered.forEach(({ a, pos }) => {
      const liveSpeed = live[a.gpsId] && live[a.gpsId].speed != null ? '· ' + Math.round(live[a.gpsId].speed) + ' km/h' : '';
      const srcLine = pos!.src === 'tracker' ? `<br/>📡 Tracker Live ${liveSpeed}` : pos!.src === 'driver' ? `<br/>📱 Driver GPS ${pos!.speed != null ? '· ' + Math.round(pos!.speed) + ' km/h' : ''}${pos!.who ? '<br/>' + pos!.who : ''}` : '<br/>💾 Stored';
      const pop = `<b>${a.id} (${a.plate || '—'})</b><br/>${a.type || ''}${a.gpsId ? '<br/>Tracker: ' + a.gpsId : ''}${srcLine}<br/>Updated: ${a.gpsUpdatedAt ? new Date(a.gpsUpdatedAt).toLocaleString() : '—'}`;
      markerLayer.current!.addLayer(L.marker([pos!.lat, pos!.lng], { icon: iconFor(a, pos!.src) }).bindPopup(pop));
    });

    supaGps.forEach(s => {
      markerLayer.current!.addLayer(L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: '<span style="font-size:12px">📡</span>', iconSize: [14, 14] }) }).bindPopup(`<b>📡 ${s.username}/${s.label}</b>`));
    });

    if (route.length >= 2) {
      const line = L.polyline(route, { color: '#38bdf8', weight: 4, opacity: 0.9 }).addTo(routeLayer.current!);
      const start = route[0], end = route[route.length - 1];
      routeLayer.current.addLayer(L.marker(start, { icon: L.divIcon({ className: '', html: '<span style="font-size:16px">🟢</span>', iconSize: [18, 18] }) }).bindPopup('<b>Start</b>'));
      routeLayer.current.addLayer(L.marker(end, { icon: L.divIcon({ className: '', html: '<span style="font-size:16px">🔴</span>', iconSize: [18, 18] }) }).bindPopup('<b>End</b>'));
      routeTrips.forEach(t => {
        const g = typeof t.siteGeo === 'string' && t.siteGeo.includes(',') ? t.siteGeo.split(',').map(Number) : null;
        if (g && !isNaN(g[0]) && !isNaN(g[1])) {
          routeLayer.current!.addLayer(L.marker([g[0], g[1]], { icon: L.divIcon({ className: '', html: '<span style="font-size:13px">⏹️</span>', iconSize: [16, 16] }) }).bindPopup(`<b>${t.siteName || 'Site'}</b><br/>${t.projectName || ''}<br/>${t.stationDep || t.siteArr || ''} · ${t.qty || ''} m³ · ${t.status || ''}`));
        }
      });
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
    } else if (filtered.length > 0) {
      const pts = filtered.map(({ pos }) => [pos!.lat, pos!.lng] as [number, number]);
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    }
  }, [assets, live, driverLive, filter, selectedAsset, plantGps, supaGps, route, routeTrips]);

  const detectGps = () => {
    setGpsMsg('');
    if (!navigator.geolocation) { setGpsMsg('⚠️ Geolocation not supported.'); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        setPlantGps({ lat: latitude, lng: longitude });
        if (currentUser) {
          try { await savePlantGPS(currentUser.username, latitude, longitude); } catch {}
          saveGpsLocationToSupabase({ username: currentUser.username, label: 'plant', lat: latitude, lng: longitude }).catch(() => {});
        }
        setGpsMsg(`✅ Plant GPS saved (${latitude.toFixed(5)}, ${longitude.toFixed(5)}).`);
      },
      err => setGpsMsg(`⚠️ ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const reload = () => {
    if (!currentUser) return;
    loadAssets(currentUser.username).then(a => { if (Array.isArray(a)) setBoth(a); }).catch(() => {});
    loadGpsLocationsFromSupabase().then(rows => setSupaGps(rows.map(r => ({ username: r.username, label: r.label, lat: r.lat, lng: r.lng })))).catch(() => {});
    getAllPlantsSummary().then(s => setSummary(s)).catch(() => {});
    loadGpsConfig(currentUser.username).then(c => c && setCfg({ server: '', username: '', password: '', liveEnabled: false, refreshSec: 15, ...c })).catch(() => {});
    setGpsMsg('✅ Data reloaded.');
  };

  const showRoute = async () => {
    if (!histVehicle) { setHistMsg('⚠️ Select a vehicle first.'); return; }
    setHistBusy(true);
    setHistMsg('');
    const asset = (Array.isArray(assets) ? assets : []).find(a => a.id === histVehicle);
    const pts: [number, number][] = [];
    let viaServer = false;
    try {
      if (cfg.server && asset?.gpsId) {
        const base = cfg.server.replace(/\/+$/, '');
        const devs = await apiFetch(base + '/api/devices', cfg.username, cfg.password);
        const dev = (Array.isArray(devs) ? devs : []).find(d => d.uniqueId === asset.gpsId);
        if (dev) {
          const from = new Date(histDate + 'T' + (histFrom || '00:00')).toISOString();
          const to = new Date(histDate + 'T' + (histTo || '23:59')).toISOString();
          const rp = await apiFetch(`${base}/api/reports/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&deviceId=${dev.id}`, cfg.username, cfg.password);
          if (Array.isArray(rp)) rp.forEach(r => { if (r.lat != null && r.lon != null) pts.push([r.lat, r.lon]); });
          if (pts.length) viaServer = true;
        }
      }
    } catch (e: any) {
      setHistMsg('⚠️ Tracker route API unavailable (' + (e.message || 'error') + ') — showing operation trips instead.');
    }

    const trips = (summary || []).flatMap(s => (Array.isArray(s.tripList) ? s.tripList : []));
    const matched = trips.filter(t => t.date === histDate && (t.code === histVehicle || t.pump === histVehicle));
    matched.sort((a, b) => String(a.stationDep || a.siteArr || a.code).localeCompare(String(b.stationDep || b.siteArr || b.code)));

    if (!pts.length) {
      const legs: [number, number][] = [];
      matched.forEach(t => {
        const g = typeof t.siteGeo === 'string' && t.siteGeo.includes(',') ? t.siteGeo.split(',').map(Number) : null;
        if (plantGps && g && !isNaN(g[0]) && !isNaN(g[1])) legs.push([plantGps.lat, plantGps.lng], [g[0], g[1]]);
      });
      if (legs.length) pts.push(...legs);
    }

    setRoute(pts);
    setRouteTrips(matched);

    if (currentUser && (pts.length || matched.length) && viaServer) {
      saveGpsHistory(currentUser.username, { vehicle: histVehicle, date: histDate, points: pts }).catch(() => {});
    }
    if (!pts.length && currentUser && !viaServer) {
      const stored = await loadGpsHistory(currentUser.username).catch(() => []);
      const found = (stored || []).find(e => e.vehicle === histVehicle && e.date === histDate);
      if (found && Array.isArray(found.points)) { setRoute(found.points); pts.push(...found.points); }
    }
    setHistMsg(pts.length
      ? `✅ Route built: ${pts.length} point(s) — ${matched.length} operation trip(s) for ${histVehicle} on ${histDate}.`
      : '⚠️ No route data for this vehicle/date. Enable the tracker server (GPS & Trackers) or add operation trips.');
    setHistBusy(false);
  };

  const online = Object.keys(live).length;
  const freshDrivers = (Array.isArray(driverLive) ? driverLive : []).filter(d => Date.now() - (d.ts || 0) < 180000);
  const driverOnline = freshDrivers.length;
  const withPos = (Array.isArray(assets) ? assets : []).filter(a =>
    (a.gpsId && live[a.gpsId]) ||
    freshDrivers.some(d => d.assetId === a.id) ||
    (typeof a.gpsLat === 'number' && typeof a.gpsLng === 'number')
  ).length;
  const filters = [
    { k: 'all', l: '🚚 All Equipment' },
    { k: 'mixer', l: '🚛 All Mixers' },
    { k: 'pump', l: '🎯 All Pumps' },
    { k: 'mixer+pump', l: '🚛🎯 Mixers + Pumps' },
  ];

  return (
    <div className="space-y-6">
      <style>{`.gps-pin{position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:16px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}.gps-live{position:absolute;top:-1px;right:-1px;width:8px;height:8px;border-radius:50%;background:#22c55e;border:1px solid #fff;animation:gpsblink 1.2s infinite}.gps-live.gps-driver{background:#38bdf8}@keyframes gpsblink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">🗺️ GPS Fleet Map</h2>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${liveState === 'on' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : liveState === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-slate-500/20 text-slate-400 border-slate-600/40'}`}>
            {liveState === 'on' ? `🟢 Live · ${online} tracker + ${driverOnline} driver` : liveState === 'connecting' ? '⏳ Connecting...' : liveState === 'error' ? `🔴 Tracker offline · ${driverOnline} driver` : `⚪ ${driverOnline > 0 ? driverOnline + ' driver live' : 'No live feed'}`}
          </span>
          {lastPoll && <span className="text-[11px] text-slate-500">updated {Math.round((Date.now() - lastPoll) / 1000)}s ago</span>}
          <button onClick={detectGps} className="bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white px-4 py-1.5 rounded-lg font-bold text-xs transition-all duration-300">📍 Detect My Location</button>
          <button onClick={reload} className="bg-[#334155] hover:bg-[#3f4863] text-white px-4 py-1.5 rounded-lg font-bold text-xs transition-all duration-300">🔄 Reload</button>
        </div>
      </div>

      {liveState === 'error' && <p className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">⚠️ Live feed failed: {liveMsg} — check the server in GPS &amp; Trackers (server URL, credentials, CORS).</p>}
      {gpsMsg && <p className={`text-xs font-bold ${gpsMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{gpsMsg}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {filters.map(f => <button key={f.k} onClick={() => setFilter(f.k)} className={chipCls(filter === f.k)}>{f.l}</button>)}
        <button onClick={() => setFilter('asset')} className={chipCls(filter === 'asset')}>🔎 Specific Asset</button>
        {filter === 'asset' && (
          <select value={selectedAsset} onChange={e => setSelectedAsset(e.target.value)} className={inputCls}>
            <option value="">— Select asset —</option>
            {(Array.isArray(assets) ? assets : []).map(a => <option key={a.id} value={a.id}>{a.id} ({a.plate || a.type || '—'})</option>)}
          </select>
        )}
        <span className="text-[11px] text-slate-500 ml-auto">{withPos} with position · {online} tracker live · {driverOnline} driver live</span>
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-3">
        <div ref={mapRef} className="w-full h-[540px] rounded-xl overflow-hidden z-0" />
        <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-slate-400">
          <span>Legend:</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" style={{ boxShadow: '0 0 0 2px rgba(34,197,94,.25)' }} /> Tracker live</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" style={{ boxShadow: '0 0 0 2px rgba(56,189,248,.25)' }} /> Driver phone GPS</span>
          <span>💾 = stored location</span>
          <span>🏭 = plant HQ</span>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-bold text-white">🛰️ Trip History & Route</h3>
          <span className="text-xs text-slate-500">Select a date + vehicle to draw its route (from tracker server route API or operation trips).</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><label className="text-[10px] text-slate-400 font-semibold">Date</label>
            <input type="date" value={histDate} onChange={e => setHistDate(e.target.value)} className={`${inputCls} w-full`} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">Vehicle</label>
            <select value={histVehicle} onChange={e => setHistVehicle(e.target.value)} className={`${inputCls} w-full`}>
              <option value="">— Select vehicle —</option>
              {(Array.isArray(assets) ? assets : []).map(a => <option key={a.id} value={a.id}>{a.id} ({a.plate || a.type || '—'}){a.gpsId ? ' · 📡' : ''}</option>)}
            </select></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">From (HH:MM)</label>
            <input type="time" value={histFrom} onChange={e => setHistFrom(e.target.value)} className={`${inputCls} w-full`} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">To (HH:MM)</label>
            <input type="time" value={histTo} onChange={e => setHistTo(e.target.value)} className={`${inputCls} w-full`} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={showRoute} disabled={histBusy} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all duration-300">
            {histBusy ? '⏳ Building route...' : '🛰️ Show Route'}
          </button>
          {route.length > 0 && <button onClick={() => { setRoute([]); setRouteTrips([]); setHistMsg(''); }} className="bg-[#334155] hover:bg-[#3f4863] text-white px-4 py-2 rounded-lg font-bold text-xs transition-all duration-300">🗑️ Clear Route</button>}
        </div>
        {histMsg && <p className={`text-xs font-bold mt-3 ${histMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{histMsg}</p>}
        {routeTrips.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-[#334155]"><tr>{['Time', 'Vehicle', 'Site / Project', 'Qty (m³)', 'Status'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {routeTrips.map((t, i) => (
                  <tr key={i} className="border-b border-[#334155]/30">
                    <td className="p-2">{t.stationDep || t.siteArr || '—'}</td>
                    <td className="p-2 font-bold text-white">{t.code}</td>
                    <td className="p-2">{t.siteName || t.projectName || '—'}</td>
                    <td className="p-2">{t.qty || '—'}</td>
                    <td className="p-2">{t.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
