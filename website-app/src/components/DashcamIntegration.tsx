import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { saveDashcamConfig, loadDashcamConfig, loadAssets, loadDevicesRegistry, saveDevicesRegistry } from '../firebase/firestore';

async function reportDashcamDevice(connected: boolean) {
  try {
    const raw = localStorage.getItem('currentUserSession');
    const username = raw ? (JSON.parse(raw)?.username || '') : '';
    if (!username) return;
    const list = (await loadDevicesRegistry(username)) || [];
    const next = list.map((d: any) => d.id === 'dashcam'
      ? { ...d, connected, lastCheckedAt: new Date().toISOString() }
      : d);
    if (!next.find((d: any) => d.id === 'dashcam')) next.push({ id: 'dashcam', name: 'داش كام الأسطول', connected });
    await saveDevicesRegistry(username, next);
  } catch { /* best-effort */ }
}

interface DashcamIntegrationProps {
  onClose: () => void;
}

type CamStatus = 'online' | 'recording' | 'offline' | 'error';

interface TruckCam {
  code: string;
  driver: string;
  status: CamStatus;
  front: boolean;
  rear: boolean;
  cabin: boolean;
  storageGB: number;
  storageUsedGB: number;
  lastClip: string;
  speed: number;
  event?: string;
}

const CAM_LABELS: Record<CamStatus, { ar: string; cls: string }> = {
  online: { ar: '🟢 متصل', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  recording: { ar: '🔴 يسجل', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  offline: { ar: '⚪ غير متصل', cls: 'bg-slate-500/20 text-slate-400 border-white/10' },
  error: { ar: '🔴 خطأ', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
};

const EVENTS = [
  '⚠️ فرملة مفاجئة Hard Braking',
  '⚡ تسارع مفاجئ Rapid Acceleration',
  '🌀 انحراف عن المسار Lane Departure',
  '🚨 تصادم خفيف Collision Alert',
];

export default function DashcamIntegration({ onClose }: DashcamIntegrationProps) {
  const { currentUser } = useAuth();
  const [trucks, setTrucks] = useState<TruckCam[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [quality, setQuality] = useState<'1080p' | '720p' | '480p'>('1080p');
  const [loopRecording, setLoopRecording] = useState(true);
  const [eventDetection, setEventDetection] = useState(true);
  const [liveMode, setLiveMode] = useState(false);
  const [camOnline, setCamOnline] = useState(false);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load trucks + config
  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadAssets(currentUser.username), loadDashcamConfig(currentUser.username)]).then(([assets, cfg]) => {
      const list: TruckCam[] = (Array.isArray(assets) ? assets : []).slice(0, 12).map((a: any) => {
        const r = Math.random();
        const status: CamStatus = r > 0.85 ? 'offline' : r > 0.5 ? 'recording' : 'online';
        return {
          code: a.code || a.name || `T-${Math.floor(Math.random() * 900 + 100)}`,
          driver: a.driver || a.assignedDriver || '—',
          status,
          front: true,
          rear: Math.random() > 0.3,
          cabin: Math.random() > 0.6,
          storageGB: 128,
          storageUsedGB: Math.round(Math.random() * 90 + 20),
          lastClip: new Date(Date.now() - Math.random() * 86400000).toLocaleTimeString('en-GB'),
          speed: status === 'offline' ? 0 : Math.round(Math.random() * 70 + 10),
          event: eventDetection && Math.random() > 0.8 ? EVENTS[Math.floor(Math.random() * EVENTS.length)] : undefined,
        };
      });
      setTrucks(list);
      if (cfg && typeof cfg === 'object') {
        if (cfg.quality) setQuality(cfg.quality);
        if (typeof cfg.loopRecording === 'boolean') setLoopRecording(cfg.loopRecording);
        if (typeof cfg.eventDetection === 'boolean') setEventDetection(cfg.eventDetection);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  // Save config
  useEffect(() => {
    if (!currentUser) return;
    saveDashcamConfig(currentUser.username, { quality, loopRecording, eventDetection }).catch(() => {});
  }, [quality, loopRecording, eventDetection]);

  // Live simulation
  useEffect(() => {
    if (!liveMode) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(() => {
      setTrucks(prev => prev.map(t => t.status === 'offline' ? t : ({
        ...t,
        speed: Math.max(0, Math.min(90, t.speed + Math.round((Math.random() - 0.5) * 15))),
        storageUsedGB: Math.min(t.storageGB, +(t.storageUsedGB + 0.01).toFixed(2)),
      })));
      drawSim();
    }, 1500);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [liveMode]);

  // Draw simulated road feed on canvas
  const drawSim = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    // Sky
    ctx.fillStyle = '#1a2436'; ctx.fillRect(0, 0, W, H * 0.4);
    // Road
    ctx.fillStyle = '#2d3440'; ctx.fillRect(0, H * 0.4, W, H * 0.6);
    // Lane lines moving
    const offset = (Date.now() / 120) % 60;
    ctx.strokeStyle = '#eab308'; ctx.lineWidth = 4; ctx.setLineDash([30, 30]); ctx.lineDashOffset = -offset;
    ctx.beginPath(); ctx.moveTo(W / 2, H * 0.45); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
    // Side markers
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const y = H * 0.45 + i * (H * 0.55 / 5) + ((Date.now() / 100) % (H * 0.55 / 5));
      const spread = (y - H * 0.4) / (H * 0.6);
      ctx.beginPath();
      ctx.moveTo(W * (0.5 - 0.05 - spread * 0.45), y); ctx.lineTo(W * (0.5 - 0.02 - spread * 0.3), y + 6);
      ctx.moveTo(W * (0.5 + 0.05 + spread * 0.45), y); ctx.lineTo(W * (0.5 + 0.02 + spread * 0.3), y + 6);
      ctx.stroke();
    }
    // Timestamp overlay
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace';
    ctx.fillText(new Date().toLocaleTimeString('en-GB'), 10, 20);
    ctx.fillText(`● REC ${quality}`, W - 90, 20);
  };

  useEffect(() => { drawSim(); }, [selected]);

  const selectedTruck = trucks.find(t => t.code === selected);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-[#0B111E] border border-white/10 rounded-2xl w-full max-w-4xl my-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/10 sticky top-0 bg-[#0B111E] rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-black tracking-tight text-white">📹 داش كام الشاحنات</h2>
            <p className="text-xs text-slate-400">Fleet Dashcam · Live Feed & Recordings</p>
            <span className="mt-1 inline-block bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-[10px] font-bold px-2 py-0.5 rounded">⚠️ معاينة تجريبية — يحتاج أجهزة كاميرات فعلية</span>
          </div>
          <button onClick={onClose} className="bg-white/[0.06] hover:bg-white/10 text-slate-300 w-9 h-9 rounded-lg font-bold">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Settings bar */}
          <div className="flex flex-wrap items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
              الجودة:
              <select value={quality} onChange={e => setQuality(e.target.value as any)} className="bg-white/[0.04] border border-white/10 rounded-lg p-1.5 text-white text-xs">
                <option value="1080p">1080p HD</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
              </select>
            </label>
            <label className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={loopRecording} onChange={e => setLoopRecording(e.target.checked)} className="accent-sky-500" />
              <span className="text-xs font-bold text-slate-300">♻️ تسجيل حلقي Loop</span>
            </label>
            <label className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={eventDetection} onChange={e => setEventDetection(e.target.checked)} className="accent-red-500" />
              <span className="text-xs font-bold text-slate-300">🚨 كشف الأحداث AI</span>
            </label>
            <button
              onClick={() => { const v = !camOnline; setCamOnline(v); reportDashcamDevice(v); }}
              className={`mr-auto text-xs font-bold px-3 py-1.5 rounded-lg border ${camOnline ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-white/[0.05] text-slate-300 border-white/10'}`}>
              {camOnline ? '✅ نظام الكاميرات متصل' : '🔌 توصيل نظام الكاميرات'}
            </button>
            <span className="text-[10px] text-slate-500">📹 {trucks.length} كاميرا · 🟢 {trucks.filter(t => t.status !== 'offline').length} متصلة</span>
          </div>

          {/* Fleet grid */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">الأسطول · Fleet Cameras</h3>
            {trucks.length === 0 ? (
              <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-6 text-center text-sm text-slate-400">لا توجد شاحنات مسجلة — أضف الأسطول من صفحة الإدارة</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {trucks.map(t => (
                  <button key={t.code} onClick={() => { setSelected(t.code); setLiveMode(true); }}
                    className={`p-3 rounded-xl border text-right transition ${selected === t.code ? 'bg-sky-500/15 border-sky-500/40' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-black text-white text-sm" dir="ltr">{t.code}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${CAM_LABELS[t.status].cls}`}>{CAM_LABELS[t.status].ar}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-1">👤 {t.driver}</p>
                    <p className="text-[10px] text-slate-400">🚀 {t.speed} كم/س · 💾 {Math.round((t.storageUsedGB / t.storageGB) * 100)}%</p>
                    <div className="flex gap-1 mt-1 text-[9px]">
                      <span className={t.front ? 'text-emerald-400' : 'text-slate-600'}>⬆ أمامية</span>
                      {t.rear && <span className={t.rear ? 'text-emerald-400' : 'text-slate-600'}>⬇ خلفية</span>}
                      {t.cabin && <span className="text-emerald-400">👤 كبينة</span>}
                    </div>
                    {t.event && <p className="text-[9px] text-orange-400 mt-1 font-bold">{t.event}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Live viewer */}
          {selectedTruck && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs text-slate-400 uppercase font-bold">البث المباشر · Live — {selectedTruck.code}</h3>
                <div className="flex gap-2">
                  <button onClick={() => setLiveMode(!liveMode)} className={`${liveMode ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white text-[10px] font-bold px-3 py-1.5 rounded-lg`}>
                    {liveMode ? '⏹️ إيقاف البث' : '▶️ تشغيل البث'}
                  </button>
                  <button onClick={() => alert('💾 تم حفظ مقطع من بث ' + selectedTruck.code)} className="bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 text-[10px] font-bold px-3 py-1.5 rounded-lg">💾 حفظ مقطع</button>
                </div>
              </div>
              <div className="relative bg-black rounded-xl overflow-hidden border border-white/10">
                <canvas ref={canvasRef} width={800} height={380} className="w-full block" />
                {!liveMode && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <button onClick={() => setLiveMode(true)} className="bg-white/10 hover:bg-white/20 backdrop-blur text-white rounded-full w-16 h-16 text-2xl">▶</button>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${CAM_LABELS[selectedTruck.status].cls}`}>{CAM_LABELS[selectedTruck.status].ar}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-black/60 text-white font-bold">📍 GPS متزامن</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-black/60 text-white font-bold">🚀 {selectedTruck.speed} كم/س</span>
                </div>
              </div>

              {/* Recent clips */}
              <div className="mt-3">
                <h4 className="text-[10px] text-slate-400 uppercase mb-1 font-bold">أحدث المقاطع · Recent Clips</h4>
                <div className="space-y-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex justify-between items-center bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-300">🎬 مقطع {i + 1} — {new Date(Date.now() - (i + 1) * 3600000).toLocaleString('en-GB')}</span>
                      <div className="flex gap-2">
                        <button onClick={() => alert('▶️ تشغيل المقطع')} className="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded font-bold">▶️ تشغيل</button>
                        <button onClick={() => alert('⬇️ تحميل المقطع')} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">⬇️ تحميل</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
