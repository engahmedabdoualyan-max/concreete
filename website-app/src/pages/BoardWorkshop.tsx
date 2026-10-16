/**
 * ============================================================
 *  FIMTO SOFT — Workshop display board (شاشة الورشة)
 * ============================================================
 *  Cashier-style live screen for the workshop TV: open breakdowns with
 *  severity colors, flashing emergencies, spare-parts availability, and
 *  fleet status counts. Reads the same local stores as the Workshop page
 *  and refreshes every 30 seconds. Display-only — no editing here.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface BD {
  id: number;
  date: string;
  assetId: string;
  symptom: string;
  severity: 'Critical' | 'Major' | 'Minor';
  status: string;
  mechanicAssigned: string;
  partsReady?: boolean;
  emergency?: boolean;
}

function read<T>(key: string, def: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : def;
  } catch {
    return def;
  }
}

export default function BoardWorkshop() {
  const [list, setList] = useState<BD[]>(() => read<BD[]>('ws_breakdowns', []));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = () => {
      setList(read<BD[]>('ws_breakdowns', []));
      setTick(x => x + 1);
    };
    load();
    const onStorage = () => load();
    window.addEventListener('storage', onStorage);
    const i = setInterval(load, 30000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(i);
    };
  }, []);
  void tick;

  const open = list.filter(b => b.status === 'Open' || b.status === 'In Repair');
  const emergencies = open.filter(b => b.emergency || b.severity === 'Critical');
  const waitingParts = open.filter(b => !b.partsReady);
  const ready = open.filter(b => b.partsReady && !b.emergency && b.severity !== 'Critical');

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-black text-white">🔧 شاشة الورشة <span className="text-sm font-normal text-slate-400">مباشر · يتحدث كل ٣٠ ثانية</span></h1>
          <Link to="/workshop" className="text-slate-400 text-sm border border-white/10 px-3 py-1.5 rounded hover:text-white">← الورشة</Link>
        </div>

        {emergencies.length > 0 && (
          <div className="bg-red-600 text-white rounded-2xl p-5 mb-4 animate-pulse border-4 border-red-300">
            <p className="text-2xl font-black">🚨 طوارئ ({emergencies.length})</p>
            <div className="grid md:grid-cols-2 gap-2 mt-2">
              {emergencies.map(b => (
                <p key={b.id} className="text-lg font-bold">🚨 {b.assetId} — {b.symptom} <span className="text-sm">({b.mechanicAssigned || 'بدون فني'})</span></p>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-white">{open.length}</p><p className="text-slate-400 text-sm">بلاغات مفتوحة</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-amber-300">{waitingParts.length}</p><p className="text-slate-400 text-sm">بانتظار قطع الغيار</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-emerald-300">{ready.length}</p><p className="text-slate-400 text-sm">القطع متوفرة</p></div>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
          {open.length === 0 ? (
            <p className="text-center text-emerald-400 text-xl font-black py-10">✅ لا بلاغات مفتوحة — الورشة جاهزة</p>
          ) : (
            <div className="space-y-2">
              {open.map(b => (
                <div key={b.id} className={`rounded-xl px-4 py-3 border flex flex-wrap items-center gap-x-4 gap-y-1 ${b.emergency || b.severity === 'Critical' ? 'bg-red-500/10 border-red-500/50' : 'bg-white/[0.02] border-white/10'}`}>
                  <span className="text-xl font-black text-white">{b.assetId}</span>
                  <span className="text-slate-300 flex-1 min-w-[200px]">{b.symptom}</span>
                  <span className={`text-xs px-2 py-1 rounded font-bold ${b.status === 'Open' ? 'bg-red-500/80 text-white' : 'bg-yellow-500/80 text-white'}`}>{b.status === 'Open' ? 'مفتوح' : 'قيد الإصلاح'}</span>
                  <span className={`text-xs px-2 py-1 rounded font-bold ${b.partsReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600/40 text-slate-300'}`}>{b.partsReady ? '✅ القطع متوفرة' : '⬜ بانتظار القطع'}</span>
                  <span className="text-xs text-slate-400">{b.mechanicAssigned || '—'}</span>
                  <span className="text-xs text-slate-500" dir="ltr">{b.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
