import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadAssets, saveLivePosition } from '../firebase/firestore';

export default function DriverLiveBroadcast({ compact }: { compact?: boolean }) {
  const { currentUser } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState('');
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState('');
  const [last, setLast] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const posRef = useRef<{ lat: number; lng: number; accuracy?: number; speed?: number } | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    loadAssets(currentUser.username).then(a => { if (Array.isArray(a)) setAssets(a); }).catch(() => {});
  }, [currentUser?.username]);

  useEffect(() => () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = () => {
    if (!assetId) { setStatus('⚠️ Select your vehicle first.'); return; }
    if (!navigator.geolocation) { setStatus('⚠️ GPS is not available on this device/browser.'); return; }
    setOn(true);
    setStatus('⏳ Getting a GPS fix...');
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        posRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? undefined };
        setLast({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() });
        setStatus('📍 Broadcasting live — keep this screen open.');
      },
      err => setStatus('⚠️ ' + err.message + ' — allow location access for this site.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      if (!posRef.current || !currentUser) return;
      saveLivePosition(currentUser.username, { assetId, lat: posRef.current.lat, lng: posRef.current.lng, ts: Date.now(), speed: posRef.current.speed, accuracy: posRef.current.accuracy }).catch(() => {});
      setLast({ lat: posRef.current.lat, lng: posRef.current.lng, ts: Date.now() });
    }, 10000);
  };

  const stop = () => {
    setOn(false);
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setStatus('Broadcast stopped — you are no longer visible on the fleet map.');
  };

  const ageSec = last ? Math.round((Date.now() - last.ts) / 1000) : null;

  return (
    <div className={`bg-[#1e293b] rounded-2xl border ${on ? 'border-emerald-500/50' : 'border-[#334155]'} p-5`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-white">📱 Driver Live Broadcast</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${on ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>{on ? '● LIVE' : 'OFF'}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">Fallback GPS: send your phone&apos;s live location to the fleet map when the tracking-company server is not used. Works from any phone browser (PWA).</p>
      {!compact && (
        <div className="mb-3">
          <label className="text-[10px] text-slate-400 font-semibold">Your Vehicle</label>
          <select value={assetId} onChange={e => setAssetId(e.target.value)} className="w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select vehicle —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.id} ({a.plate || a.type || '—'})</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        {!on ? (
          <button onClick={start} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors">▶️ Start Broadcast</button>
        ) : (
          <button onClick={stop} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors">⏹️ Stop</button>
        )}
        {last && <span className="text-[11px] text-slate-400">📍 {last.lat.toFixed(5)}, {last.lng.toFixed(5)} · {ageSec != null && ageSec < 60 ? `${ageSec}s ago` : `${Math.floor((ageSec || 0) / 60)}m ago`}</span>}
      </div>
      {status && <p className={`text-xs font-bold mt-2 ${status.includes('⚠️') ? 'text-yellow-400' : status.includes('Broadcasting') || status.includes('fix') ? 'text-emerald-400' : 'text-slate-400'}`}>{status}</p>}
      {on && <p className="text-[10px] text-slate-500 mt-2">Tip: keep this screen open and the phone unlocked while driving.</p>}
    </div>
  );
}
