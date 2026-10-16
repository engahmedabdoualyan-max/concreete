/**
 * ============================================================
 *  FIMTO SOFT — Daily reservations board (جدول حجوزات اليوم)
 * ============================================================
 *  Mirrors the plant's paper schedule: one row per sales order with
 *  ordered qty, auto-remaining (ordered − delivered via delivery notes),
 *  postponed section, totals and the three-signature footer.
 *  Read-only display + print + Excel. Refreshes from local stores.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import type { DNOrder } from './DeliveryNote';

interface NoteLite {
  orderId: string;
  client: string;
  project: string;
  qty: number;
  driver: string;
  ticket: string;
}
interface TripLite {
  orderId?: string;
  driver: string;
  code: string;
}

const norm = (s: unknown) => String(s ?? '').trim();
const todayISO = () => new Date().toISOString().split('T')[0];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function readNotes(): NoteLite[] {
  try {
    const raw = localStorage.getItem('deliveryNotes');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function ScheduleBoard({ orders, trips }: { orders: DNOrder[]; trips: TripLite[] }) {
  const [day, setDay] = useState(todayISO());
  const [notes, setNotes] = useState<NoteLite[]>(() => readNotes());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setNotes(readNotes());
    const onStorage = () => setNotes(readNotes());
    window.addEventListener('storage', onStorage);
    const i = setInterval(() => {
      setNotes(readNotes());
      setTick(x => x + 1);
    }, 20000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(i);
    };
  }, []);
  void tick;

  const rows = (() => {
    return orders
      .filter((o: DNOrder) => String(o.status ?? '') !== 'cancelled')
      .map((o: DNOrder, idx: number) => {
        const key = String(o.id);
        const byOrder = notes.filter(n => n.orderId && n.orderId === key);
        const byClient = !byOrder.length
          ? notes.filter(
              n => !n.orderId && norm(n.client) === norm(o.customerName) && norm(n.project) === norm(o.projectName)
            )
          : [];
        const used = [...byOrder, ...byClient];
        const delivered = used.reduce((a, n) => a + (Number(n.qty) || 0), 0);
        const ordered = Number(o.quantity) || 0;
        const drivers = [...new Set([
          ...used.map(n => norm(n.driver)).filter(Boolean),
          ...trips.filter(t => String(t.orderId ?? '') === key).map(t => String(t.driver ?? '')),
        ])].join('، ');
        return {
          i: idx + 1,
          client: norm(o.customerName),
          phone: norm(o.customerPhone),
          contractor: norm((o as unknown as Record<string, unknown>).customerCode),
          pour: norm((o as unknown as Record<string, unknown>).elementType) || norm(o.concreteType),
          grade: norm(o.concreteType),
          cement: String((o as unknown as Record<string, unknown>).cementType ?? '') === 'resistant' ? 'مقاوم' : 'عادي',
          ordered,
          remaining: Math.max(0, ordered - delivered),
          district: norm(o.projectLocation),
          delivered,
          drivers,
          postponed: String(o.status ?? '') === 'postponed',
        };
      });
  })();

  const active = rows.filter(r => !r.postponed);
  const postponed = rows.filter(r => r.postponed);
  const totOrdered = rows.reduce((a, r) => a + r.ordered, 0);
  const totDelivered = rows.reduce((a, r) => a + r.delivered, 0);
  const dayName = AR_DAYS[new Date(day + 'T12:00:00').getDay()] ?? '';

  const doExcel = () => {
    const head = ['م', 'العميل', 'الجوال', 'المقاول', 'نوع الصبة', 'الأسمنت', 'نوعه', 'الكمية المطلوبة', 'المتبقي', 'الحي', 'النهائية', 'السائقون'];
    const body = rows.map(r => [r.i, r.client, r.phone, r.contractor, r.pour, r.grade, r.cement, r.ordered, r.remaining, r.district, r.delivered, r.drivers]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`جدول حجوزات الخرسانة اليومي — ${dayName} ${day}`],
      head, ...body,
      ['المجموع', '', '', '', '', '', '', totOrdered, '', '', totDelivered, ''],
    ]);
    ws['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    XLSX.writeFile(wb, `schedule-${day}.xlsx`);
  };

  const table = (list: typeof rows, start: number) => (
    <table className="w-full border-collapse" dir="rtl" style={{ fontSize: 10 }}>
      <thead>
        <tr style={{ background: '#c4b5fd' }}>
          {['م', 'العميل', 'الجوال', 'المقاول', 'نوع الصبة', 'الأسمنت', 'نوعه', 'المطلوبة', 'المتبقي', 'الحي', 'النهائية', 'السائقون'].map(h => (
            <th key={h} style={{ border: '1px solid #111', padding: 3 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.map((r, j) => (
          <tr key={j}>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }}>{start + j}</td>
            <td style={{ border: '1px solid #111', padding: 3 }}>{r.client}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }} dir="ltr">{r.phone}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }} dir="ltr">{r.contractor}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }}>{r.pour}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }} dir="ltr">{r.grade}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }}>{r.cement}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }}>{r.ordered}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center', fontWeight: 'bold', color: r.remaining > 0 ? '#b45309' : '#047857' }}>{r.remaining}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }}>{r.district}</td>
            <td style={{ border: '1px solid #111', padding: 3, textAlign: 'center' }}>{r.delivered}</td>
            <td style={{ border: '1px solid #111', padding: 3 }}>{r.drivers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const sheet = (
    <div className="bg-white text-slate-900 max-w-[1100px] mx-auto border-2 border-slate-900 p-4" dir="rtl">
      <p className="text-center font-black text-[15px]">جدول حجوزات الخرسانة اليومي لمصنع المطور - فرع حفرالباطن</p>
      <div className="flex justify-between text-[11px] font-bold mt-1 mb-2">
        <span>اليوم {dayName}</span>
        <span dir="ltr">تاريخ {day} م</span>
      </div>
      {table(active, 1)}
      {postponed.length > 0 && (
        <>
          <p className="text-center font-black text-[14px] bg-rose-200 border border-slate-900 mt-3 py-1">المؤجلات</p>
          {table(postponed, active.length + 1)}
        </>
      )}
      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] font-black">
        <div className="border border-slate-900 p-2 text-center">المجموع: <span dir="ltr">{totOrdered}</span></div>
        <div className="border border-slate-900 p-2 text-center">إجمالي كمية الصب الفعلية: <span dir="ltr">{totDelivered}</span></div>
        <div className="border border-slate-900 p-2 text-center">المتبقي الكلي: <span dir="ltr">{Math.max(0, totOrdered - totDelivered)}</span></div>
      </div>
      <div className="flex justify-between text-[11px] mt-6" dir="rtl">
        <p>مسؤول الحجوزات: .................... التوقيع: ..........</p>
        <p>مدير التشغيل: .................... التوقيع: ..........</p>
        <p>مدير المبيعات: .................... التوقيع: ..........</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <style>{`@page schedsheet { size: A4 landscape; margin: 8mm; } @media print { #root { display: none !important; } #sched-print-root { display: block !important; visibility: visible !important; page: schedsheet; } #sched-print-root * { visibility: visible !important; } }`}</style>
      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-black tracking-tight text-white">📋 جدول الحجوزات اليومي <span className="text-[10px] font-normal text-slate-400 border border-white/10 rounded px-1.5 py-0.5">AUTO</span></h3>
          <div className="flex flex-wrap gap-2">
            <input type="date" value={day} onChange={e => setDay(e.target.value)} className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none" />
            <button onClick={() => setNotes(readNotes())} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-2 rounded-lg font-bold border border-white/10 hover:text-sky-300">🔄 تحديث</button>
            <button onClick={doExcel} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-4 py-2 rounded-lg font-bold text-xs">📊 إكسل</button>
            <button onClick={() => setTimeout(() => window.print(), 60)} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white px-4 py-2 rounded-lg font-bold text-xs">🖨️ طباعة</button>
          </div>
        </div>
        {sheet}
      </div>
      {createPortal(
        <div id="sched-print-root" style={{ display: 'none' }}>{sheet}</div>,
        document.body
      )}
    </div>
  );
}
