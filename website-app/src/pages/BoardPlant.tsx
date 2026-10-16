/**
 * ============================================================
 *  FIMTO SOFT — Plant operator display board (شاشة الأوبريتر)
 * ============================================================
 *  Cashier-style live screen for the batch plant: the full sales
 *  schedule assigned to THIS plant (plantNo set in Operations),
 *  today's delivery notes with auto-remaining, per-truck status.
 *  Reads cloud stores (same login) + local fallback, refreshes
 *  every 30 seconds. Filter by ?plant= or the chips on top.
 *  Display-only.
 * ============================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadOrders, loadDeliveryNotes } from '../firebase/firestore';

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
  orderId?: string;
  plantNo?: string;
  operatorName?: string;
}

interface Ord {
  id: string | number;
  customerName?: string;
  customerPhone?: string;
  salesRep?: string;
  projectName?: string;
  projectLocation?: string;
  quantity?: number;
  concreteType?: string;
  status?: string;
  plantNo?: string;
  operatorName?: string;
  [k: string]: unknown;
}

function read<T>(key: string, def: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : def;
  } catch {
    return def;
  }
}

const norm = (s: unknown) => String(s ?? '').trim();
const todayISO = () => new Date().toISOString().split('T')[0];

export default function BoardPlant() {
  const { currentUser } = useAuth();
  const [params] = useSearchParams();
  const [notes, setNotes] = useState<Note[]>(() => read<Note[]>('deliveryNotes', []));
  const [orders, setOrders] = useState<Ord[]>(() => read<Ord[]>('opsOrdersCache', []));
  const [plant, setPlant] = useState<string>(() => params.get('plant') ?? '');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = async () => {
      setNotes(read<Note[]>('deliveryNotes', []));
      const cached = read<Ord[]>('opsOrdersCache', []);
      if (cached.length) setOrders(cached);
      try {
        if (currentUser?.username) {
          const [o, n] = await Promise.all([
            loadOrders(currentUser.username).catch(() => null),
            loadDeliveryNotes(currentUser.username).catch(() => null),
          ]);
          if (Array.isArray(o) && o.length) {
            setOrders(o);
            try { localStorage.setItem('opsOrdersCache', JSON.stringify(o)); } catch {}
          }
          if (Array.isArray(n) && n.length) setNotes(n);
        }
      } catch {}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);
  void tick;

  const plants = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) {
      const p = norm(o.plantNo);
      if (p && String(o.status ?? '') !== 'cancelled') s.add(p);
    }
    for (const n of notes) {
      const p = norm(n.plantNo);
      if (p) s.add(p);
    }
    return [...s].sort();
  }, [orders, notes]);

  const activePlant = plant || params.get('plant') || '';

  const rows = useMemo(() => {
    return orders
      .filter(o => String(o.status ?? '') !== 'cancelled')
      .filter(o => !activePlant || norm(o.plantNo) === activePlant)
      .map((o, idx) => {
        const key = String(o.id);
        const used = notes.filter(n => (n.orderId && n.orderId === key) ||
          (!n.orderId && norm(n.client) === norm(o.customerName)));
        const delivered = used.reduce((a, n) => a + (Number(n.qty) || 0), 0);
        const ordered = Number(o.quantity) || 0;
        const drivers = [...new Set(used.map(n => norm(n.driver)).filter(Boolean))].join('، ');
        return {
          i: idx + 1,
          client: norm(o.customerName),
          phone: norm(o.customerPhone),
          salesRep: norm(o.salesRep),
          pour: norm((o as Record<string, unknown>).elementType) || norm(o.concreteType),
          grade: norm(o.concreteType),
          ordered,
          delivered,
          remaining: Math.max(0, ordered - delivered),
          district: norm(o.projectLocation),
          drivers,
          operatorName: norm(o.operatorName),
          postponed: String(o.status ?? '') === 'postponed',
        };
      });
  }, [orders, notes, activePlant]);

  const sched = rows.filter(r => !r.postponed);
  const totOrdered = sched.reduce((a, r) => a + r.ordered, 0);
  const totDelivered = sched.reduce((a, r) => a + r.delivered, 0);

  const today = todayISO();
  const list = notes
    .filter(n => (n.date || '').slice(0, 10) === today)
    .filter(n => !activePlant || norm(n.plantNo) === activePlant || (!norm(n.plantNo) && rows.some(r => norm(n.client) === r.client)))
    .slice().reverse();
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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-3xl font-black text-white">🏭 شاشة المحطة (الأوبريتر) <span className="text-sm font-normal text-slate-400">مباشر · {today}</span></h1>
          <Link to="/operations" className="text-slate-400 text-sm border border-white/10 px-3 py-1.5 rounded hover:text-white">← التشغيل</Link>
        </div>

        {plants.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setPlant('')} className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${!activePlant ? 'bg-sky-500 text-white border-sky-500' : 'bg-white/[0.04] text-slate-300 border-white/10'}`}>كل البلانتات</button>
            {plants.map(p => (
              <button key={p} onClick={() => setPlant(p)} className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${activePlant === p ? 'bg-sky-500 text-white border-sky-500' : 'bg-white/[0.04] text-slate-300 border-white/10'}`}>بلانت {p}</button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-white" dir="ltr">{list.length}</p><p className="text-slate-400 text-sm">تحميلة اليوم</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-sky-300" dir="ltr">{totalM3}</p><p className="text-slate-400 text-sm">إجمالي م³ اليوم</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4"><p className="text-4xl font-black text-emerald-300" dir="ltr">{byTruck.size}</p><p className="text-slate-400 text-sm">خلاطات شغالة</p></div>
        </div>

        <div className="bg-white text-slate-900 rounded-xl p-4 mb-4" dir="rtl">
          <p className="font-black text-[15px] mb-2">📋 جدول البلانت {activePlant || ''} — المطلوب / المتبقي تلقائياً</p>
          {sched.length === 0 ? (
            <p className="text-center text-slate-500 py-4">لا حجوزات {activePlant ? `للبلانت ${activePlant}` : 'اليوم'} بعد — وزّع الأوردرات من لوحة التشغيل</p>
          ) : (
            <table className="w-full border-collapse" style={{ fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#c4b5fd' }}>
                  {['م', 'العميل', 'المندوب', 'الجوال', 'نوع الصبة', 'الأسمنت', 'المطلوبة', 'المنفذة', 'المتبقي', 'الحي', 'السائقون', 'المشغل'].map(h => (
                    <th key={h} style={{ border: '1px solid #111', padding: 4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sched.map(r => (
                  <tr key={r.i}>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.i}</td>
                    <td style={{ border: '1px solid #111', padding: 4, fontWeight: 'bold' }}>{r.client}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.salesRep}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }} dir="ltr">{r.phone}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.pour}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }} dir="ltr">{r.grade}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.ordered}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.delivered}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center', fontWeight: 'black', fontSize: 14, color: r.remaining > 0 ? '#b45309' : '#047857' }}>{r.remaining}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.district}</td>
                    <td style={{ border: '1px solid #111', padding: 4 }}>{r.drivers}</td>
                    <td style={{ border: '1px solid #111', padding: 4, textAlign: 'center' }}>{r.operatorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex gap-2 mt-2 text-[12px] font-black">
            <span className="border border-slate-900 px-3 py-1">المطلوب: <span dir="ltr">{totOrdered}</span></span>
            <span className="border border-slate-900 px-3 py-1">المنفذ: <span dir="ltr">{totDelivered}</span></span>
            <span className="border border-slate-900 px-3 py-1">المتبقي: <span dir="ltr">{Math.max(0, totOrdered - totDelivered)}</span></span>
          </div>
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
