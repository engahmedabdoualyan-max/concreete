import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadAssets, saveAssets, loadGpsConfig, saveGpsConfig, savePlantGPS, loadPlantGPS } from '../firebase/firestore';
import { saveGpsLocationToSupabase } from '../supabase/supabase';

interface GpsConfig { server: string; username: string; password: string; liveEnabled?: boolean; refreshSec?: number; }
interface GpsDevice { id: number; uniqueId: string; name: string; status?: string; }
interface GpsPosition { id: number; deviceId: number; fixTime: string; lat: number; lon: number; speed?: number; address?: string; }

const inputCls = 'w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]';

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
  const { t } = useLang();
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
    try { await saveGpsConfig(currentUser.username, cfg); onToast('✅ ' + t('gpsConfigSaved')); } catch { onToast('⚠️ ' + t('gpsConfigSaveFailed')); }
  };

  const testConnection = async () => {
    if (!cfg.server) { setLiveMsg('⚠️ ' + t('enterGpsServerUrl')); return; }
    setLiveMsg('⏳ ' + t('testingConnection'));
    try {
      const base = cfg.server.replace(/\/+$/, '');
      const devs = await apiFetch(base + '/api/devices', cfg.username, cfg.password);
      setLiveMsg(`✅ ${t('connectionOkDevices')} ${Array.isArray(devs) ? devs.length : 0}.`);
    } catch (e: any) {
      setLiveMsg(`⚠️ ${e.message || t('connectionFailed')} — ${t('verifyServerCors')}.`);
    }
  };

  const discover = async () => {
    if (!cfg.server) { setMsg('⚠️ ' + t('enterGpsServerUrl')); return; }
    setBusy('discover');
    setMsg('');
    try {
      const base = cfg.server.replace(/\/+$/, '');
      const data = await apiFetch(base + '/api/devices', cfg.username, cfg.password);
      setDevices(Array.isArray(data) ? data : []);
      const total = Array.isArray(data) ? data.length : 0;
      const linked = Array.isArray(data) ? data.filter((d: GpsDevice) => assets.some(a => a.gpsId === d.uniqueId)).length : 0;
      setMsg(`✅ ${t('foundDevices')} ${total} — ${linked} ${t('alreadyLinkedAssets')}.`);
    } catch (e: any) {
      setMsg(`⚠️ ${e.message || t('gpsServerUnreachable')} — ${t('corsError')}.`);
    }
    setBusy('');
  };

  const syncAll = async () => {
    if (!cfg.server) { setMsg('⚠️ ' + t('enterGpsServerUrl')); return; }
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
      setMsg(`✅ ${t('syncedPositions')}: ${updated} ${t('assetUpdated')} ${pos.length} ${t('deviceUpdated')}.`);
    } catch (e: any) {
      setMsg(`⚠️ ${e.message || t('syncFailed')} — ${t('verifyServerCors')}.`);
    }
    setBusy('');
  };

  const detectPlantGps = () => {
    setBusy('detect');
    setMsg('');
    if (!navigator.geolocation) { setMsg('⚠️ ' + t('geolocationNotSupported')); setBusy(''); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        setPlantGps({ lat: latitude, lng: longitude });
        if (currentUser) {
          try { await savePlantGPS(currentUser.username, latitude, longitude); } catch {}
          saveGpsLocationToSupabase({ username: currentUser.username, label: 'plant', lat: latitude, lng: longitude }).catch(() => {});
        }
        setMsg(`✅ ${t('plantGpsUpdated')} (${latitude.toFixed(5)}, ${longitude.toFixed(5)}).`);
        setBusy('');
      },
      err => { setMsg(`⚠️ ${err.message} — ${t('locationAccessHint')}.`); setBusy(''); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const linked = Array.isArray(assets) ? assets.filter(a => a.gpsId) : [];
  const methods = [
    { icon: '📱', title: t('browserGeolocation'), desc: t('browserGeolocationDesc'), action: 'detect' },
    { icon: '✍️', title: t('manualCoordinates'), desc: t('manualCoordinatesDesc'), action: '' },
    { icon: '📡', title: t('liveTrackerFeed'), desc: t('liveTrackerFeedDesc'), action: 'discover' },
    { icon: '🔗', title: t('sharedMarkers'), desc: t('sharedMarkersDesc'), action: '' },
  ];

  return (
    <div className="space-y-6">
      {msg && <p className={`text-xs font-bold ${msg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'} bg-white/[0.04] border border-white/10 rounded-lg px-4 py-3`}>{msg}</p>}

      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <h2 className="text-lg font-bold text-white mb-4">🔗 {t('gpsLinkingMethods')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {methods.map(m => (
            <div key={m.title} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 flex flex-col">
              <div className="text-2xl mb-2">{m.icon}</div>
              <p className="font-bold text-white text-sm mb-1">{m.title}</p>
              <p className="text-[11px] text-slate-400 flex-1">{m.desc}</p>
              {m.action === 'detect' && (
                <button onClick={detectPlantGps} disabled={busy === 'detect'} className="mt-3 bg-sky-600/20 text-sky-400 border border-sky-500/30 hover:bg-sky-600/30 text-xs px-3 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">
                  {busy === 'detect' ? '⏳ ' + t('detecting') : '📍 ' + t('detectMyLocation')}
                </button>
              )}
              {m.action === 'discover' && (
                <button onClick={discover} disabled={busy === 'discover'} className="mt-3 bg-sky-500/20 text-sky-400 border border-sky-500/50 hover:bg-sky-500/30 text-xs px-3 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">
                  {busy === 'discover' ? '⏳ ' + t('scanning') : '🔍 ' + t('discoverTrackers')}
                </button>
              )}
            </div>
          ))}
        </div>
        {plantGps && <p className="text-xs text-slate-400 mt-4">📍 {t('plantPosition')}: <b className="text-white">{plantGps.lat.toFixed(5)}, {plantGps.lng.toFixed(5)}</b></p>}
      </div>

      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">📡 {t('gpsServerFeed')}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-sky-500/20 text-sky-400">{t('liveLinking')}</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{t('gpsServerHint')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('serverUrl')}</label>
            <input value={cfg.server} onChange={e => setCfg({ ...cfg, server: e.target.value })} placeholder="https://gps.example.com" className={inputCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('apiUsername')}</label>
            <input value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} placeholder="admin" className={inputCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('apiPassword')}</label>
            <input type="password" value={cfg.password} onChange={e => setCfg({ ...cfg, password: e.target.value })} placeholder="••••••" className={inputCls} /></div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={saveCfg} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors">💾 {t('saveConfig')}</button>
          <button onClick={discover} disabled={busy === 'discover'} className="bg-sky-500/20 text-sky-400 border border-sky-500/50 hover:bg-sky-500/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">{busy === 'discover' ? '⏳' : '🔍 ' + t('discoverTrackers')}</button>
          <button onClick={syncAll} disabled={busy === 'sync'} className="bg-sky-500/20 text-sky-400 border border-sky-500/50 hover:bg-sky-500/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors disabled:opacity-50">{busy === 'sync' ? '⏳ ' + t('syncing') : '⚡ ' + t('syncAllPositions')}</button>
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-white">🔴 {t('liveTracking')}</h3>
            <div className="flex items-center gap-3">
              <select value={cfg.refreshSec || 15} onChange={e => setCfg({ ...cfg, refreshSec: Number(e.target.value) })} className={inputCls}>
                {[5, 10, 15, 30, 60].map(s => <option key={s} value={s}>{t('everySec')} {s} {t('sec')}</option>)}
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!cfg.liveEnabled} onChange={e => setCfg({ ...cfg, liveEnabled: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                <span className="text-xs font-bold text-emerald-400">{t('enableLiveFeed')}</span>
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">{t('liveTrackingHint')}</p>
          {liveMsg && <p className={`text-xs font-bold mb-3 ${liveMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{liveMsg}</p>}
          <div className="flex gap-2">
            <button onClick={testConnection} className="bg-sky-600/20 text-sky-400 border border-sky-500/50 hover:bg-sky-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors">🧪 {t('testConnection')}</button>
            <button onClick={saveCfg} className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs px-5 py-2 rounded-lg font-bold transition-colors">💾 {t('saveConfig')}</button>
          </div>
        </div>
      </div>

      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🧭 {t('discoveredTrackers')}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-sky-500/20 text-sky-400">{devices.length} {t('onServer')}</span>
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-slate-400">{t('discoverHint')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-white/[0.04] text-slate-400"><tr>{[t('deviceId'), t('imeiUniqueId'), t('name'), t('status'), t('linkedAsset')].map(h => <th key={h} className="p-2 text-[10px] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {devices.map(d => {
                  const linkedAsset = (Array.isArray(assets) ? assets : []).find(a => a.gpsId === d.uniqueId);
                  return (
                    <tr key={d.id} className="border-b border-white/10">
                      <td className="p-2">{d.id}</td>
                      <td className="p-2 font-bold text-white">{d.uniqueId}</td>
                      <td className="p-2">{d.name || '—'}</td>
                      <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>{d.status || t('unknown')}</span></td>
                      <td className="p-2">{linkedAsset ? <span className="text-emerald-400 font-bold">✅ {linkedAsset.id} ({linkedAsset.plate})</span> : <span className="text-slate-500">— {t('notLinked')} —</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🔑 {t('linkedTrackersOnAssets')}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-emerald-500/20 text-emerald-400">{linked.length} {t('linked')}</span>
        </div>
        {linked.length === 0 ? (
          <p className="text-xs text-slate-400">{t('noTrackerIdHint')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-white/[0.04] text-slate-400"><tr>{[t('assetCode'), t('plateNumber'), t('trackerIdImei'), t('lastPosition'), t('updated')].map(h => <th key={h} className="p-2 text-[10px] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>
                {linked.map(a => (
                  <tr key={a.id} className="border-b border-white/10">
                    <td className="p-2 font-bold text-white">{a.id}</td>
                    <td className="p-2">{a.plate || '—'}</td>
                    <td className="p-2">{a.gpsId}</td>
                    <td className="p-2">{a.gpsLat && a.gpsLng ? `${a.gpsLat.toFixed(4)}, ${a.gpsLng.toFixed(4)}` : <span className="text-slate-500">{t('noFixYet')}</span>}</td>
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
