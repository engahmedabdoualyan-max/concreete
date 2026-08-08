import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadAssets, saveAssets, loadGpsConfig, saveGpsConfig, savePlantGPS, loadPlantGPS } from '../firebase/firestore';
import { saveGpsLocationToSupabase } from '../supabase/supabase';

interface GpsConfig { server: string; username: string; password: string; liveEnabled?: boolean; refreshSec?: number; }
interface GpsDevice { id: number; uniqueId: string; name: string; status?: string; }
interface GpsPosition { id: number; deviceId: number; fixTime: string; lat: number; lon: number; speed?: number; address?: string; }

const inputCls = 'w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function basicAuth(u: string, p: string) {
  try { return 'Basic ' + btoa(u + ':' + p); } catch { return ''; }
}

async function apiFetch(url: string, user: string, pass: string) {
  const res = await fetch(url, { headers: { Authorization: basicAuth(user, pass) } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('Server did not return JSON (check URL/port).');
  return res.json();
}

export default function GpsPanel({ onToast }: { onToast: (msg: string) => void }) {
  const { currentUser } = useAuth();
  const [cfg, setCfg] = useState<GpsConfig>({ server: '', username: '', password: '', liveEnabled: false, refreshSec: 15 });
  const [assets, setAssets] = useState<any[]>([]);
  const [devices, setDevices] = useState<GpsDevice[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [liveMsg, setLiveMsg] = useState('');
  const [plantGps, setPlantGps] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadGpsConfig(currentUser.username), loadAssets(currentUser.username), loadPlantGPS(currentUser.username)])
      .then(([c, a, g]) => {
        if (c) setCfg({ server: '', username: '', password: '', liveEnabled: false, refreshSec: 15, ...c });
        if (Array.isArray(a) && a.length > 0) setAssets(a);
        if (g) setPlantGps(g);
      })
      .catch(() => {});
  }, [currentUser?.username]);

  const saveCfg = async () => {
    if (!currentUser) return;
    try { await saveGpsConfig(currentUser.username, cfg); onToast('✅ GPS feed configuration saved.'); } catch { onToast('⚠️ Could not save configuration.'); }
  };

  const testConnection = async () => {
    if (!cfg.server) { setLiveMsg('⚠️ Enter your GPS server URL first.'); return; }
    setLiveMsg('⏳ Testing connection...');
    try {
      const base = cfg.server.replace(/\/+$/, '');
      const devs = await apiFetch(base + '/api/devices', cfg.username, cfg.password);
      setLiveMsg(`✅ Connection OK — server returned ${Array.isArray(devs) ? devs.length : 0} device(s).`);
    } catch (e: any) {
      setLiveMsg(`⚠️ ${e.message || 'Connection failed.'} — verify URL/port, credentials and CORS on the server.`);
    }
  };

  const discover = async () => {
    if (!cfg.server) { setMsg('⚠️ Enter your GPS server URL first.'); return; }
    setBusy('discover');
    setMsg('');
    try {
      const base = cfg.server.replace(/\/+$/, '');
      const data = await apiFetch(base + '/api/devices', cfg.username, cfg.password);
      setDevices(Array.isArray(data) ? data : []);
      const total = Array.isArray(data) ? data.length : 0;
      const linked = Array.isArray(data) ? data.filter((d: GpsDevice) => assets.some(a => a.gpsId === d.uniqueId)).length : 0;
      setMsg(`✅ Found ${total} device(s) on server — ${linked} already linked to assets (by Tracker ID / IMEI).`);
    } catch (e: any) {
      setMsg(`⚠️ ${e.message || 'Could not reach the GPS server.'} — make sure CORS is enabled on the server and the URL/port is correct.`);
    }
    setBusy('');
  };

  const syncAll = async () => {
    if (!cfg.server) { setMsg('⚠️ Enter your GPS server URL first.'); return; }
    setBusy('sync');
    setMsg('');
    try {
      const base = cfg.server.replace(/\/+$/, '');
      const [devData, posData] = await Promise.all([
        apiFetch(base + '/api/devices', cfg.username, cfg.password),
        apiFetch(base + '/api/positions', cfg.username, cfg.password),
      ]);
      const devs: GpsDevice[] = Array.isArray(devData) ? devData : [];
      const pos: GpsPosition[] = Array.isArray(posData) ? posData : [];
      const uniqueOf = new Map(devs.map(d => [d.id, d.uniqueId]));
      const posByUnique = new Map<string, GpsPosition>();
      pos.forEach(p => { const u = uniqueOf.get(p.deviceId); if (u && !posByUnique.has(u)) posByUnique.set(u, p); });

      let updated = 0;
      let next = assets;
      if (Array.isArray(assets)) {
        next = assets.map(a => {
          if (!a.gpsId) return a;
          const p = posByUnique.get(a.gpsId);
          if (!p) return a;
          updated++;
          return { ...a, gpsLat: p.lat, gpsLng: p.lon, gpsUpdatedAt: p.fixTime || new Date().toISOString() };
        });
      }
      setAssets(next);
      if (currentUser) await saveAssets(currentUser.username, next);
      for (const a of next) {
        if (a.gpsId && a.gpsLat && a.gpsLng) {
          saveGpsLocationToSupabase({ username: currentUser!.username, label: `asset:${a.id}`, lat: a.gpsLat, lng: a.gpsLng }).catch(() => {});
        }
      }
      setMsg(`✅ Synced positions: ${updated} asset(s) updated from ${pos.length} device(s). Map & all sections updated.`);
    } catch (e: any) {
      setMsg(`⚠️ ${e.message || 'Sync failed.'} — verify server URL, credentials and CORS.`);
    }
    setBusy('');
  };

  const detectPlantGps = () => {
    setBusy('detect');
    setMsg('');
    if (!navigator.geolocation) { setMsg('⚠️ Geolocation not supported by this browser.'); setBusy(''); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        setPlantGps({ lat: latitude, lng: longitude });
        if (currentUser) {
          try { await savePlantGPS(currentUser.username, latitude, longitude); } catch {}
          saveGpsLocationToSupabase({ username: currentUser.username, label: 'plant', lat: latitude, lng: longitude }).catch(() => {});
        }
        setMsg(`✅ Plant GPS updated (${latitude.toFixed(5)}, ${longitude.toFixed(5)}) — shared with all sections.`);
        setBusy('');
      },
      err => { setMsg(`⚠️ ${err.message} — allow location access or enter coordinates manually in Assets & Fleet.`); setBusy(''); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const linked = Array.isArray(assets) ? assets.filter(a => a.gpsId) : [];
  const methods = [
    { icon: '📱', title: 'Browser Geolocation', desc: 'Press "Detect My Location" to auto-fill the plant position from the device browser (works on mobile & PC).', action: 'detect' },
    { icon: '✍️', title: 'Manual Coordinates', desc: 'Type Latitude/Longitude directly for each asset (Assets & Fleet sub-tab) and for the plant (Plant Profile sub-tab).', action: '' },
    { icon: '📡', title: 'Live Tracker Feed (API)', desc: 'Register your tracker IMEI in "Tracker ID" per asset, then configure the server below and Sync All to pull live positions.', action: 'discover' },
    { icon: '🔗', title: 'Shared Markers', desc: 'Every saved position is written to the shared database (Firestore + Supabase) so the map and all sections see the same data.', action: '' },
  ];

  return (
    <div className="space-y-6">
      {msg && <p className={`text-xs font-bold ${msg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'} bg-[#0f172a] border border-[#334155] rounded-lg px-4 py-3`}>{msg}</p>}

      <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
        <h2 className="text-lg font-bold text-white mb-4">🔗 GPS Linking Methods</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {methods.map(m => (
            <div key={m.title} className="bg-[#0f172a] border border-[#334155] rounded-xl p-4 flex flex-col">
              <div className="text-2xl mb-2">{m.icon}</div>
              <p className="font-bold text-white text-sm mb-1">{m.title}</p>
              <p className="text-[11px] text-slate-400 flex-1">{m.desc}</p>
              {m.action === 'detect' && (
                <button onClick={detectPlantGps} disabled={busy === 'detect'} className="mt-3 bg-sky-600/20 text-sky-400 border border-sky-500/30 hover:bg-sky-600/30 text-xs px-3 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">
                  {busy === 'detect' ? '⏳ Detecting...' : '📍 Detect My Location'}
                </button>
              )}
              {m.action === 'discover' && (
                <button onClick={discover} disabled={busy === 'discover'} className="mt-3 bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-600/30 text-xs px-3 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">
                  {busy === 'discover' ? '⏳ Scanning...' : '🔍 Discover Trackers'}
                </button>
              )}
            </div>
          ))}
        </div>
        {plantGps && <p className="text-xs text-slate-400 mt-4">📍 Plant position: <b className="text-white">{plantGps.lat.toFixed(5)}, {plantGps.lng.toFixed(5)}</b></p>}
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">📡 GPS Server Feed (Traccar / GpsGate / Teltonika)</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-sky-500/20 text-sky-400">Live linking</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Connect your tracking platform. This panel calls its REST API (basic auth) to pull device positions and link them to your assets by Tracker ID (IMEI). Requires the server to allow browser access (CORS).</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="text-[10px] text-slate-400 font-semibold">Server URL (e.g. https://gps.example.com)</label>
            <input value={cfg.server} onChange={e => setCfg({ ...cfg, server: e.target.value })} placeholder="https://gps.example.com" className={inputCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">API Username</label>
            <input value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} placeholder="admin" className={inputCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">API Password</label>
            <input type="password" value={cfg.password} onChange={e => setCfg({ ...cfg, password: e.target.value })} placeholder="••••••" className={inputCls} /></div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={saveCfg} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors">💾 Save Config</button>
          <button onClick={discover} disabled={busy === 'discover'} className="bg-blue-600/20 text-blue-400 border border-blue-500/50 hover:bg-blue-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">{busy === 'discover' ? '⏳' : '🔍 Discover Trackers'}</button>
          <button onClick={syncAll} disabled={busy === 'sync'} className="bg-violet-600/20 text-violet-400 border border-violet-500/50 hover:bg-violet-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">{busy === 'sync' ? '⏳ Syncing...' : '⚡ Sync All Positions'}</button>
        </div>

        <div className="mt-5 border-t border-[#334155] pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-white">🔴 Live Tracking (real-time map polling)</h3>
            <div className="flex items-center gap-3">
              <select value={cfg.refreshSec || 15} onChange={e => setCfg({ ...cfg, refreshSec: Number(e.target.value) })} className={inputCls}>
                {[5, 10, 15, 30, 60].map(s => <option key={s} value={s}>Every {s} sec</option>)}
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!cfg.liveEnabled} onChange={e => setCfg({ ...cfg, liveEnabled: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                <span className="text-xs font-bold text-emerald-400">Enable Live Feed</span>
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">When enabled, the GPS Fleet Map polls the server API every interval and moves the mixers/pumps live. Positions are also written back to the shared database (throttled every 60s).</p>
          {liveMsg && <p className={`text-xs font-bold mb-3 ${liveMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{liveMsg}</p>}
          <div className="flex gap-2">
            <button onClick={testConnection} className="bg-sky-600/20 text-sky-400 border border-sky-500/50 hover:bg-sky-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors">🧪 Test Connection</button>
            <button onClick={saveCfg} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors">💾 Save Config</button>
          </div>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🧭 Discovered Trackers</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-blue-500/20 text-blue-400">{devices.length} on server</span>
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-slate-400">Press "Discover Trackers" to list devices from your GPS server. Link each device by entering its IMEI in the asset's <b className="text-slate-200">Tracker ID / IMEI</b> field (Assets & Fleet sub-tab).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-[#334155]"><tr>{['Device ID', 'IMEI / Unique ID', 'Name', 'Status', 'Linked Asset'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>
                {devices.map(d => {
                  const linkedAsset = (Array.isArray(assets) ? assets : []).find(a => a.gpsId === d.uniqueId);
                  return (
                    <tr key={d.id} className="border-b border-[#334155]/30">
                      <td className="p-2">{d.id}</td>
                      <td className="p-2 font-bold text-white">{d.uniqueId}</td>
                      <td className="p-2">{d.name || '—'}</td>
                      <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>{d.status || 'unknown'}</span></td>
                      <td className="p-2">{linkedAsset ? <span className="text-emerald-400 font-bold">✅ {linkedAsset.id} ({linkedAsset.plate})</span> : <span className="text-slate-500">— not linked —</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🔑 Linked Trackers on Assets</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-emerald-500/20 text-emerald-400">{linked.length} linked</span>
        </div>
        {linked.length === 0 ? (
          <p className="text-xs text-slate-400">No asset has a Tracker ID yet. Go to <b className="text-slate-200">Assets & Fleet</b> and set "Tracker ID / IMEI" on each vehicle, then Sync All.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-[#334155]"><tr>{['Asset', 'Plate', 'Tracker ID', 'Last Position', 'Updated'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>
                {linked.map(a => (
                  <tr key={a.id} className="border-b border-[#334155]/30">
                    <td className="p-2 font-bold text-white">{a.id}</td>
                    <td className="p-2">{a.plate || '—'}</td>
                    <td className="p-2">{a.gpsId}</td>
                    <td className="p-2">{a.gpsLat && a.gpsLng ? `${a.gpsLat.toFixed(4)}, ${a.gpsLng.toFixed(4)}` : <span className="text-slate-500">No fix yet</span>}</td>
                    <td className="p-2 text-slate-400">{a.gpsUpdatedAt ? new Date(a.gpsUpdatedAt).toLocaleString() : '—'}</td>
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
