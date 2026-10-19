/**
 * ============================================================
 *  العملاء والمديونيات — Aged Debts
 * ============================================================
 *  Shows customer debt aging grouped by "من حمل عليه المديونية"
 *  (per PDF file). Mirrors the original "أعمار الديون (حساب الأستاذ)
 *  - تجميع حسب العميل" sheet exactly: columns, totals, report date/time.
 * ============================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { DEBTS_SEED, type DebtGroup, type DebtRow } from '../data/debtsSeed';
import BrandLogo from '../components/BrandLogo';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';

/** Special tab id: show every group's rows merged in one sheet */
const ALL_ID = '__all__';

type ViewRow = DebtRow & { debtor: string };

export default function Debts() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [groups] = useState<DebtGroup[]>(() => {
    const base = DEBTS_SEED.slice();
    // Keep all groups (include master even if duplicates أحمد حسين content-wise)
    return base;
  });
  const [selected, setSelected] = useState<string>(ALL_ID);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(true);

  const isAll = selected === ALL_ID;
  const group = useMemo(() => groups.find(g => g.id === selected), [groups, selected]);

  const allCount = useMemo(() => groups.reduce((s, g) => s + g.rows.length, 0), [groups]);

  const items = useMemo<ViewRow[]>(() => {
    const list: ViewRow[] = isAll
      ? groups.flatMap(g => g.rows.map(r => ({ ...r, debtor: g.debtor })))
      : (group?.rows ?? []).map(r => ({ ...r, debtor: group.debtor }));
    if (!q.trim()) return list;
    const s = q.trim();
    return list.filter(r =>
      r.name.includes(s) || r.code.includes(s) || r.acc.includes(s)
    );
  }, [isAll, groups, group, q]);

  const filtered = items;
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.today += r.today; acc.d30 += r.d30; acc.d60 += r.d60; acc.d90 += r.d90; acc.d120 += r.d120; acc.d120p += r.d120p; acc.total += r.total; return acc;
      },
      { today: 0, d30: 0, d60: 0, d90: 0, d120: 0, d120p: 0, total: 0 }
    );
  }, [filtered]);

  const grand = useMemo(() => {
    return groups.reduce(
      (acc, g) => { acc += g.total; return acc; },
      0
    );
  }, [groups]);

  function exportExcel() {
    const wsData: any[] = [
      [`أعمار الديون (حساب الأستاذ) - تجميع حسب العميل`],
      [isAll ? `الوقت: ${groups.map(g => g.reportAt).filter(Boolean).sort().pop() || '—'} (أحدث تقرير)` : `الوقت: ${group?.reportAt}`],
      [isAll ? `من يحمل عليه المديونية: الكل (${groups.length} ملف)` : `من يحمل عليه المديونية: ${group?.debtor}`],
      [],
      isAll
        ? ['من حمل عليه', 'كود العميل', 'رقم الحساب', 'الاسم', 'اليوم', '30 - 1 يوم', '60 - 31 يوم', '90 - 61 يوم', '120 - 91 يوم', '+120 يوم', 'الإجمالي']
        : ['كود العميل', 'رقم الحساب', 'الاسم', 'اليوم', '30 - 1 يوم', '60 - 31 يوم', '90 - 61 يوم', '120 - 91 يوم', '+120 يوم', 'الإجمالي'],
    ];
    for (const r of filtered) {
      const row = isAll
        ? [r.debtor, r.code, r.acc, r.name, r.today, r.d30, r.d60, r.d90, r.d120, r.d120p, r.total]
        : [r.code, r.acc, r.name, r.today, r.d30, r.d60, r.d90, r.d120, r.d120p, r.total];
      wsData.push(row);
    }
    wsData.push(isAll
      ? ['المجموع', '', '', '', totals.today, totals.d30, totals.d60, totals.d90, totals.d120, totals.d120p, totals.total]
      : ['المجموع', '', '', totals.today, totals.d30, totals.d60, totals.d90, totals.d120, totals.d120p, totals.total]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الديون');
    XLSX.writeFile(wb, isAll ? 'الديون_الكل.xlsx' : `الديون_${group!.debtor.replace(/\s+/g, '_')}.xlsx`);
  }

  function printTable() {
    const content = document.getElementById('debts-table-wrap')?.outerHTML;
    if (!content) return;
    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) return;
    w.document.write(`
      <html lang="ar" dir="rtl">
        <head><title>أعمار الديون</title>
          <style>
            body{font-family:Cairo,Segoe UI,Arial,sans-serif;padding:20px;background:#fff;color:#000}
            table{width:100%;border-collapse:collapse;font-size:11px}
            th,td{border:1px solid #111;padding:4px 6px}
            th{background:#f2f2f2;font-weight:700}
            .num{text-align:right;white-space:nowrap}
            .tot{font-weight:700;background:#f7f7f7}
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200" dir="rtl">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💳 العملاء والمديونيات</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.username ? (
            <>
              <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">👑 {currentUser.username}</span>
              <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">🚪 خروج</button>
            </>
          ) : (
            <Link to="/login" className="bg-sky-500/15 text-sky-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-sky-500/40 hover:bg-sky-500/25 transition">🔑 دخول</Link>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-slate-400 text-sm">أعمار الديون (حساب الأستاذ) – تجميع حسب العميل · {isAll ? `${allCount} سجل في ${groups.length} ملف` : `${group?.rows.length ?? 0} سجل`}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={exportExcel} className="bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg border border-emerald-500/40 transition">⬇️ Excel</button>
            <button onClick={printTable} className="bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg border border-indigo-500/40 transition">🖨️ طباعة</button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 max-w-full overflow-x-auto pb-1">
          <button
            onClick={() => setSelected(ALL_ID)}
            className={`text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap font-bold ${selected===ALL_ID ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/[0.06]'}`}
            title="عرض كل الملفات في شيت واحد"
          >
            📋 الكل ({allCount})
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelected(g.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition whitespace-nowrap ${selected===g.id ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/[0.06]'}`}
              title={g.file}
            >
              {g.debtor}
            </button>
          ))}
        </div>

        {isAll ? (
          <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-lg p-3 text-xs space-y-1">
            <div className="flex flex-wrap justify-between gap-3">
              <div>العرض: <strong>الكل ({groups.length} ملف)</strong></div>
              <div>عدد السجلات: <strong>{allCount}</strong></div>
              <div>الإجمالي الكلي: <strong>{grand.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> ر.س</div>
            </div>
            <div className="text-[10px] text-slate-400">تظهر السجلات من كل الملفات في شيت واحد، والعمود "من حمل عليه" يوضح الملف المصدر. الملف الرئيسي مطابق لملف "احمد حسين.pdf" (التكرار محتفظ به كما هو).</div>
          </div>
        ) : group && (
          <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-lg p-3 text-xs space-y-1">
            <div className="flex flex-wrap justify-between gap-3">
              <div>الوقت: <strong>{group.reportAt || '—'}</strong></div>
              <div>من يحمل عليه المديونية: <strong>{group.debtor}</strong></div>
              <div>إجمالي المجموعة: <strong>{group.total.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> ر.س</div>
              <div>الإجمالي الكلي (جميع الملفات): <strong>{grand.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> ر.س</div>
            </div>
            <div className="text-[10px] text-slate-400">ملاحظة: الملف الرئيسي "أعمار الديون (حساب الأستاذ)..." مطابق لملف "احمد حسين.pdf" — الإجمالي الكلي يُحسب شاملًا للتكرار إن وُجد.</div>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث بالاسم أو الكود أو رقم الحساب..." className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-sm w-full sm:w-80" />
          <label className="text-xs text-slate-400 flex items-center gap-2">
            <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} />
            عرض الكل
          </label>
        </div>

        <div id="debts-table-wrap" className="overflow-x-auto border border-white/10 rounded-lg">
          <table className="w-full text-sm border-collapse" dir="rtl">
            <thead>
              <tr className="bg-white/[0.05]">
                {isAll && <th className="border border-white/10 px-2 py-1.5 text-right">من حمل عليه</th>}
                <th className="border border-white/10 px-2 py-1.5 text-center">كود العميل</th>
                <th className="border border-white/10 px-2 py-1.5 text-center">رقم الحساب</th>
                <th className="border border-white/10 px-2 py-1.5 text-right">الاسم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center whitespace-nowrap">اليوم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center whitespace-nowrap">30 - 1 يوم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center whitespace-nowrap">60 - 31 يوم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center whitespace-nowrap">90 - 61 يوم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center whitespace-nowrap">120 - 91 يوم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center whitespace-nowrap">+120 يوم</th>
                <th className="border border-white/10 px-2 py-1.5 text-center">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="even:bg-white/[0.02] hover:bg-white/[0.05]">
                  {isAll && <td className="border border-white/10 px-2 py-1 text-[11px] text-sky-300 whitespace-nowrap">{r.debtor}</td>}
                  <td className="border border-white/10 px-2 py-1">{r.code}</td>
                  <td className="border border-white/10 px-2 py-1">{r.acc}</td>
                  <td className="border border-white/10 px-2 py-1 text-right">{r.name}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num">{r.today.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num">{r.d30.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num">{r.d60.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num">{r.d90.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num">{r.d120.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num">{r.d120p.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td className="border border-white/10 px-2 py-1 text-right num font-bold">{r.total.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={isAll ? 11 : 10} className="p-4 text-center text-slate-400">لا توجد نتائج مطابقة</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.08] font-bold">
                <td className="border border-white/10 px-2 py-1.5">المجموع</td>
                <td className="border border-white/10 px-2 py-1.5" colSpan={isAll ? 3 : 2}></td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.today.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.d30.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.d60.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.d90.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.d120.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.d120p.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{totals.total.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
