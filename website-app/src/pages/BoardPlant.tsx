/**
 * ============================================================
 *  FIMTO SOFT — Plant operator display board (شاشة الأوبريتر)
 * ============================================================
 *  Cashier-style live screen for the batch plant: today's delivery
 *  notes (loads with truck/driver/times), per-truck status, schedule
 *  totals and remaining. Reads the same local stores as Operations
 *  and refreshes every 30 seconds. Display-only.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Note {
  ticket: string;
  date: string;
  client: string;
  mix: string;
  qty: number;
  truck: string;
  driver: string;
  departTime: string;
  arriveTime: string;
  posted: boolean;
}

function read<T>(key: string, def: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : def;
  } catch {
    return def;
  }
}

const todayISO = () => new Date().toISOString().split('T')[0];

export default function BoardPlant() {
  const [notes, setNotes] = useState<Note[]>(() => read<Note[]>('deliveryNotes', []));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = () => {
      setNotes(read<Note[]>('deliveryNotes', []));
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

  const today = todayISO();
  const list = notes.filter(n => (n.date || '').slice(0, 10) === today).slice().reverse();
  const totalM3 = list.reduce((a, n) => a + (Number(n.qty) || 0), 0);
  const byTruck = new Map<string, Note[]>();
  for (const n of list) {
    const k = (n.truck || '—').trim() || '—';
    if (!byTruck.has(k)) byTruck.set(k, []);
    byTruck.get(k)!.push(n);
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-black text-white">🏭 شاشة المحطة (الأوبريتر) <span className="text-sm font-normal text-slate-400">مباشر · {today}</span></h1>
          <Link to="/operations" className="text-slate-400 text-sm border border-white/10 px-3 py-1.5 rounded hover:text-white">← التشغيل</Link>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-white" dir="ltr">{list.length}</p><p className="text-slate-400 text-sm">تحميلة اليوم</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-sky-300" dir="ltr">{totalM3}</p><p className="text-slate-400 text-sm">إجمالي م³ اليوم</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-emerald-300" dir="ltr">{byTruck.size}</p><p className="text-slate-400 text-sm">خلاطات شغالة</p></div>
        </div>

        {list.length === 0 ? (
          <p className="text-center text-slate-500 text-xl py-10">لا تحميلات اليوم بعد</p>
        ) : (
          <div className="space-y-2">
            {list.map(n => (
              <div key={n.ticket} className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-lg font-black text-white" dir="ltr">{n.truck || '—'}</span>
                <span className="text-slate-300">{n.client}</span>
                <span className="text-sky-300 font-bold" dir="ltr">{n.mix} · {n.qty}m³</span>
                <span className="text-slate-400 text-sm">{n.driver}</span>
                <span className="text-slate-500 text-xs" dir="ltr">{n.departTime || n.ticket} {n.arriveTime ? `→ ${n.arriveTime}` : ''}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold ${n.posted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{n.posted ? 'مُرحّلة' : 'معلقة'}</span>
              </div>
            ))}
          </div>
        )}

        {byTruck.size > 0 && (
          <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-xl p-4">
            <h2 className="text-white font-black mb-2">حالة الخلاطات</h2>
            <div className="grid md:grid-cols-3 gap-2">
              {[...byTruck.entries()].map(([truck, arr]) => (
                <div key={truck} className="bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2 text-sm">
                  <span className="font-black text-white" dir="ltr">{truck}</span>
                  <span className="text-slate-400"> — <span dir="ltr">{arr.length}</span> تحميلة · <span dir="ltr">{arr.reduce((a, x) => a + (Number(x.qty) || 0), 0)}m³</span></span>
                  <p className="text-[11px] text-slate-500">آخر تحميل: <span dir="ltr">{arr[arr.length - 1]?.departTime || arr[arr.length - 1]?.ticket}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
