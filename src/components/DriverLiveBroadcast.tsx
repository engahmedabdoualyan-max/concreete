import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadAssets, saveLivePosition } from '../firebase/firestore';

export default function DriverLiveBroadcast({ compact }: { compact?: boolean }) {
  const { currentUser } = useAuth();
  const { t } = useLang();
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
    if (!assetId) { setStatus('⚠️ ' + t('selectVehicleFirst')); return; }
    if (!navigator.geolocation) { setStatus('⚠️ ' + t('gpsUnavailable')); return; }
    setOn(true);
    setStatus('⏳ ' + t('gettingGpsFix'));
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        posRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? undefined };
        setLast({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() });
        setStatus('📍 ' + t('broadcastingLive'));
      },
      err => setStatus('⚠️ ' + err.message + ' — ' + t('allowLocationAccess')),
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
    setStatus(t('broadcastStopped'));
  };

  const ageSec = last ? Math.round((Date.now() - last.ts) / 1000) : null;

  return (
    <div className={`bg-white/[0.04] rounded-2xl border ${on ? 'border-emerald-500/50' : 'border-white/10'} p-5`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-white">📱 {t('driverLiveBroadcast')}</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${on ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.03] text-slate-400'}`}>{on ? `● ${t('live')}` : t('off')}</span>
      </div>
      <p className="text-xs text-slate-400 mb-3">{t('fallbackGpsDescription')}</p>
      {!compact && (
        <div className="mb-3">
          <label className="text-[10px] text-slate-400 font-semibold">{t('yourVehicle')}</label>
          <select value={assetId} onChange={e => setAssetId(e.target.value)} className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]">
            <option value="">— {t('selectVehicle')} —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.id} ({a.plate || a.type || '—'})</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        {!on ? (
          <button onClick={start} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors">▶️ {t('startBroadcast')}</button>
        ) : (
          <button onClick={stop} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors">⏹️ {t('stop')}</button>
        )}
        {last && <span className="text-[11px] text-slate-400">📍 {last.lat.toFixed(5)}, {last.lng.toFixed(5)} · {ageSec != null && ageSec < 60 ? `${ageSec}${t('secondsAgo')}` : `${Math.floor((ageSec || 0) / 60)}${t('minutesAgo')}`}</span>}
      </div>
      {status && <p className={`text-xs font-bold mt-2 ${status.includes('⚠️') ? 'text-yellow-400' : status.includes('📍') || status.includes('⏳') ? 'text-emerald-400' : 'text-slate-400'}`}>{status}</p>}
      {on && <p className="text-[10px] text-slate-500 mt-2">{t('broadcastTip')}</p>}
    </div>
  );
}
