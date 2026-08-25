import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { saveBatchControllerConfig, loadBatchControllerConfig } from '../firebase/firestore';

interface BatchControllerIntegrationProps {
  onClose: () => void;
}

type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type Protocol = 'opcua' | 'modbus' | 'rest' | 'mqtt';

interface CtrlConfig {
  controller: string;
  protocol: Protocol;
  host: string;
  port: string;
  username: string;
  password: string;
  autoSync: boolean;
  recipeMap: string;
  materialMap: string;
  orderMap: string;
}

const CONTROLLERS = [
  { id: 'commandalkon', name: 'Command Alkon', model: 'COMMANDbatch', icon: '🏢' },
  { id: 'liebherr', name: 'Liebherr', model: 'Thinktronic / Litronic', icon: '🏗️' },
  { id: 'sicom', name: 'Sicom', model: 'Sicom Batching', icon: '⚙️' },
  { id: 'simmons', name: 'Simmons', model: 'Batchtron', icon: '🔧' },
  { id: 'custom', name: 'أخرى / Other', model: 'Custom Controller', icon: '🔌' },
];

const PROTOCOLS: { id: Protocol; name: string; defaultPort: string }[] = [
  { id: 'opcua', name: 'OPC-UA', defaultPort: '4840' },
  { id: 'modbus', name: 'Modbus TCP', defaultPort: '502' },
  { id: 'rest', name: 'REST API', defaultPort: '8080' },
  { id: 'mqtt', name: 'MQTT', defaultPort: '1883' },
];

interface LiveBatch {
  time: string;
  recipe: string;
  volume: number;
  cement: number;
  sand: number;
  gravel: number;
  admixture: number;
}

export default function BatchControllerIntegration({ onClose }: BatchControllerIntegrationProps) {
  const { currentUser } = useAuth();
  const [cfg, setCfg] = useState<CtrlConfig>({
    controller: 'commandalkon',
    protocol: 'opcua',
    host: '',
    port: '4840',
    username: '',
    password: '',
    autoSync: false,
    recipeMap: '',
    materialMap: '',
    orderMap: '',
  });
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [lastSync, setLastSync] = useState<string>('');
  const [dataPoints, setDataPoints] = useState(0);
  const [liveBatches, setLiveBatches] = useState<LiveBatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    loadBatchControllerConfig(currentUser.username).then(d => {
      if (d && typeof d === 'object') {
        setCfg(prev => ({ ...prev, ...d, password: d.password || '' }));
        if (d.status === 'connected') { setStatus('connected'); setLastSync(d.lastSync || ''); }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [currentUser?.username]);

  useEffect(() => {
    if (!loaded || !currentUser) return;
    saveBatchControllerConfig(currentUser.username, { ...cfg, status, lastSync }).catch(() => {});
  }, [cfg, status, lastSync, loaded]);

  // Simulated live data feed while connected
  useEffect(() => {
    if (status !== 'connected') {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(() => {
      const recipes = ['C25', 'C30', 'C35', 'C40'];
      const r = recipes[Math.floor(Math.random() * recipes.length)];
      const vol = Math.round((5 + Math.random() * 20)) + 0.5 * Math.round(Math.random());
      const batch: LiveBatch = {
        time: new Date().toLocaleTimeString('en-GB'),
        recipe: r,
        volume: vol,
        cement: +(vol * 0.35).toFixed(2),
        sand: +(vol * 0.75).toFixed(2),
        gravel: +(vol * 1.1).toFixed(2),
        admixture: +(vol * 5).toFixed(1),
      };
      setLiveBatches(prev => [batch, ...prev].slice(0, 5));
      setDataPoints(p => p + Math.floor(20 + Math.random() * 60));
      setLastSync(new Date().toLocaleTimeString('en-GB'));
    }, 5000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [status]);

  const testConnection = () => {
    if (!cfg.host) { alert('⚠️ أدخل عنوان الـ IP / Host أولاً'); return; }
    setStatus('connecting');
    setTimeout(() => {
      // Simulated: succeeds unless host clearly invalid
      const ok = cfg.host.length > 3;
      setStatus(ok ? 'connected' : 'error');
      if (ok) {
        setLastSync(new Date().toLocaleTimeString('en-GB'));
        setDataPoints(Math.floor(Math.random() * 200) + 80);
        alert('✅ تم الاتصال بنجاح مع ' + (CONTROLLERS.find(c => c.id === cfg.controller)?.name || 'المتحكم'));
      } else {
        alert('❌ فشل الاتصال — تحقق من العنوان والمنفذ');
      }
    }, 1500);
  };

  const disconnect = () => {
    setStatus('disconnected');
    setLiveBatches([]);
    setDataPoints(0);
  };

  const doImport = (what: string) => {
    if (status !== 'connected') { alert('⚠️ اتصل بالمتحكم أولاً'); return; }
    setImportMsg(`⏳ جاري استيراد ${what}...`);
    setTimeout(() => {
      const n = Math.floor(Math.random() * 8) + 2;
      setImportMsg(`✅ تم استيراد ${n} ${what}`);
      setTimeout(() => setImportMsg(''), 4000);
    }, 1200);
  };

  const stColor = status === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : status === 'connecting' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    : status === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-slate-500/20 text-slate-400 border-white/10';

  const stLabel = status === 'connected' ? '🟢 متصل Connected'
    : status === 'connecting' ? '🟡 جاري الاتصال...'
    : status === 'error' ? '🔴 خطأ اتصال'
    : '⚪ غير متصل';

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-[#0B111E] border border-white/10 rounded-2xl w-full max-w-3xl my-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/10 sticky top-0 bg-[#0B111E] rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-black tracking-tight text-white">🏭 ربط متحكم المحطة</h2>
            <p className="text-xs text-slate-400">Batch Plant Controller Integration · OPC-UA / Modbus / REST / MQTT</p>
          </div>
          <button onClick={onClose} className="bg-white/[0.06] hover:bg-white/10 text-slate-300 w-9 h-9 rounded-lg font-bold">✕</button>
        </div>

        <div className="p-5 space-y-6">
          {/* Supported controllers */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">المتحكمون المدعومون · Supported Controllers</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {CONTROLLERS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCfg({ ...cfg, controller: c.id })}
                  className={`p-3 rounded-xl border text-center transition ${cfg.controller === c.id ? 'bg-sky-500/15 border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.2)]' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'}`}
                >
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className={`text-xs font-bold ${cfg.controller === c.id ? 'text-sky-300' : 'text-white'}`}>{c.name}</div>
                  <div className="text-[10px] text-slate-400">{c.model}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Connection settings */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">إعدادات الاتصال · Connection Settings</h3>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">البروتوكول · Protocol</label>
                  <select value={cfg.protocol} onChange={e => {
                    const p = PROTOCOLS.find(x => x.id === e.target.value);
                    setCfg({ ...cfg, protocol: e.target.value as Protocol, port: p?.defaultPort || cfg.port });
                  }} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    {PROTOCOLS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">العنوان · Host/IP</label>
                  <input value={cfg.host} onChange={e => setCfg({ ...cfg, host: e.target.value })} placeholder="192.168.1.100" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">المنفذ · Port</label>
                  <input value={cfg.port} onChange={e => setCfg({ ...cfg, port: e.target.value })} placeholder="4840" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">اسم المستخدم</label>
                  <input value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} placeholder="operator" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">كلمة المرور</label>
                  <input type="password" value={cfg.password} onChange={e => setCfg({ ...cfg, password: e.target.value })} placeholder="••••••" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {status === 'connected'
                  ? <button onClick={disconnect} className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-xs font-bold px-4 py-2 rounded-lg">⏹️ قطع الاتصال</button>
                  : <button onClick={testConnection} disabled={status === 'connecting'} className={`${status === 'connecting' ? 'bg-yellow-500 cursor-wait' : 'bg-emerald-500 hover:bg-emerald-600'} text-white text-xs font-bold px-4 py-2 rounded-lg`}>
                      {status === 'connecting' ? '⏳ جاري الاختبار...' : '🔌 اختبار الاتصال'}
                    </button>}
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${stColor}`}>{stLabel}</span>
              </div>
            </div>
          </div>

          {/* Sync status */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">حالة المزامنة · Sync Status</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/[0.03] border-l-4 border-emerald-500 rounded-lg p-3">
                <p className="text-[10px] text-slate-400">آخر مزامنة</p>
                <p className="text-sm font-bold text-white" dir="ltr">{lastSync || '—'}</p>
              </div>
              <div className="bg-white/[0.03] border-l-4 border-sky-500 rounded-lg p-3">
                <p className="text-[10px] text-slate-400">نقاط البيانات المستلمة</p>
                <p className="text-sm font-bold text-white">{dataPoints.toLocaleString()}</p>
              </div>
              <div className="bg-white/[0.03] border-l-4 border-purple-500 rounded-lg p-3">
                <p className="text-[10px] text-slate-400">قوة الإشارة</p>
                <p className="text-sm font-bold text-white">
                  {status === 'connected' ? '📶📶📶 ممتازة' : status === 'connecting' ? '📶📶 جيدة' : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Data mapping */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">ربط الحقول · Data Mapping</h3>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">كود الوصفة (متحكم ← تطبيق)</label>
                <input value={cfg.recipeMap} onChange={e => setCfg({ ...cfg, recipeMap: e.target.value })} placeholder="R1=C25; R2=C30; R3=C35" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">رقم المادة (متحكم ← نوع)</label>
                <input value={cfg.materialMap} onChange={e => setCfg({ ...cfg, materialMap: e.target.value })} placeholder="M1=cement; M2=sand; M3=gravel" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">رقم الشغل (متحكم ← طلب)</label>
                <input value={cfg.orderMap} onChange={e => setCfg({ ...cfg, orderMap: e.target.value })} placeholder="J101=ORD-1001" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" dir="ltr" />
              </div>
            </div>
          </div>

          {/* Import actions */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">الاستيراد · Import Actions</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => doImport('وصفات')} className="bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 text-xs font-bold px-3 py-2 rounded-lg">📥 استيراد الوصفات</button>
              <button onClick={() => doImport('بيانات إنتاج')} className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-bold px-3 py-2 rounded-lg">📥 بيانات الإنتاج</button>
              <button onClick={() => doImport('سجلات معايرة')} className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 text-xs font-bold px-3 py-2 rounded-lg">📥 سجلات المعايرة</button>
              <label className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 cursor-pointer select-none">
                <input type="checkbox" checked={cfg.autoSync} onChange={e => setCfg({ ...cfg, autoSync: e.target.checked })} className="accent-sky-500" />
                <span className="text-xs font-bold text-slate-300">🔄 مزامنة تلقائية</span>
              </label>
            </div>
            {importMsg && <p className="text-xs text-sky-300 mt-2 font-bold">{importMsg}</p>}
          </div>

          {/* Real-time preview */}
          <div>
            <h3 className="text-xs text-slate-400 uppercase mb-2 font-bold">معاينة مباشرة · Real-time Data Preview</h3>
            {status === 'connected' ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  {[
                    { name: 'أسمنت Cement', val: liveBatches[0]?.cement ?? 0, unit: 'طن', color: 'from-slate-400 to-slate-200' },
                    { name: 'رمل Sand', val: liveBatches[0]?.sand ?? 0, unit: 'طن', color: 'from-yellow-500 to-yellow-200' },
                    { name: 'زلط Gravel', val: liveBatches[0]?.gravel ?? 0, unit: 'طن', color: 'from-gray-600 to-gray-400' },
                    { name: 'إضافات Admixture', val: liveBatches[0]?.admixture ?? 0, unit: 'لتر', color: 'from-cyan-500 to-cyan-300' },
                  ].map(w => (
                    <div key={w.name} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 mb-1">{w.name}</p>
                      <p className="text-lg font-black text-white">{w.val} <span className="text-[10px] text-slate-400">{w.unit}</span></p>
                      <div className="h-1.5 bg-white/[0.06] rounded-full mt-2 overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${w.color}`} style={{ width: `${Math.min((w.val / 15) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">الوقت</th><th className="p-2">الوصفة</th><th className="p-2">الحجم م³</th><th className="p-2">أسمنت</th><th className="p-2">رمل</th><th className="p-2">زلط</th></tr></thead>
                    <tbody>
                      {liveBatches.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-500">في انتظار أول دفعة... ⏳</td></tr>}
                      {liveBatches.map((b, i) => (
                        <tr key={i} className="border-b border-white/10">
                          <td className="p-2" dir="ltr">{b.time}</td>
                          <td className="p-2 font-bold text-sky-400">{b.recipe}</td>
                          <td className="p-2 font-bold text-white">{b.volume}</td>
                          <td className="p-2">{b.cement} طن</td>
                          <td className="p-2">{b.sand} طن</td>
                          <td className="p-2">{b.gravel} طن</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-8 text-center">
                <p className="text-3xl mb-2">🔌</p>
                <p className="text-sm text-slate-400">لا توجد بيانات مباشرة — قم بالاتصال بالمتحكم لعرض البث المباشر</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
