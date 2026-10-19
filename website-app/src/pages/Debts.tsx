/**
 * ============================================================
 *  العملاء والمديونيات — Aged Debts
 * ============================================================
 *  Shows customer debt aging grouped by "من حمل عليه المديونية"
 *  (per PDF file). Mirrors the original "أعمار الديون (حساب الأستاذ)
 *  - تجميع حسب العميل" sheet exactly: columns, totals, report date/time.
 *  Each debtor row has a ✏️ edit pencil: partial/full payment (سداد جزئي/
 *  كامل), papers status (عقد / سند أمر / لا يوجد) and collection follow-up
 *  employee (متابعة التحصيل). Edits persist to Firestore per user + cache.
 * ============================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { loadDebtsEdits, saveDebtsEdits } from '../firebase/firestore';
import { api } from '../api/client';
import { DEBTS_SEED, type DebtGroup, type DebtRow } from '../data/debtsSeed';
import BrandLogo from '../components/BrandLogo';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';

/** Special tab id: show every group's rows merged in one sheet */
const ALL_ID = '__all__';

/** Per-row operational overlay (not part of the original sheet data) */
interface DebtEdit {
  paid: number;                          // إجمالي المسدد
  papers: 'contract' | 'note' | 'none' | ''; // الورقيات: عقد / سند أمر / لا يوجد
  collector: string;                     // موظف متابعة التحصيل
  updatedAt?: string;
  updatedBy?: string;
}
type EditsMap = Record<string, DebtEdit>;

type ViewRow = DebtRow & { debtor: string; gid: string };

const PAPERS_LABEL: Record<string, string> = {
  contract: '📝 يوجد عقد',
  note: '📄 يوجد سند أمر',
  none: '❌ لا يوجد',
  '': '—',
};

const editKey = (gid: string, r: DebtRow) => `${gid}|${r.code}|${r.acc}`;

export default function Debts() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [groups] = useState<DebtGroup[]>(() => DEBTS_SEED.slice());
  const [selected, setSelected] = useState<string>(ALL_ID);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ---- التعديلات (سداد / ورقيات / متابعة) ----
  const [edits, setEdits] = useState<EditsMap>({});
  const [editsLoading, setEditsLoading] = useState(true);
  const [editing, setEditing] = useState<ViewRow | null>(null); // الصف المفتوح في المودال
  const [draftPaid, setDraftPaid] = useState('');
  const [draftAdd, setDraftAdd] = useState('');
  const [draftPapers, setDraftPapers] = useState<DebtEdit['papers']>('');
  const [draftCollector, setDraftCollector] = useState('');
  const [emps, setEmps] = useState<{ id: string; name: string }[]>([]);

  const isAll = selected === ALL_ID;
  const group = useMemo(() => groups.find(g => g.id === selected), [groups, selected]);

  const allCount = useMemo(() => groups.reduce((s, g) => s + g.rows.length, 0), [groups]);

  // تحميل التعديلات من Firestore (مع كاش محلي)
  useEffect(() => {
    const cache = localStorage.getItem('debtsEditsCache');
    if (cache) { try { setEdits(JSON.parse(cache)); } catch { /* ignore */ } }
    const owner = currentUser?.username;
    if (!owner) { setEditsLoading(false); return; }
    loadDebtsEdits(owner)
      .then((rows: unknown) => {
        if (rows && typeof rows === 'object') setEdits(rows as EditsMap);
      })
      .catch(() => { /* offline → keep cache */ })
      .finally(() => setEditsLoading(false));
  }, [currentUser?.username]);

  // حفظ التعديلات عند أي تغيير
  useEffect(() => {
    if (editsLoading) return;
    const owner = currentUser?.username;
    if (owner) saveDebtsEdits(owner, edits).catch(() => { /* ignore */ });
    try { localStorage.setItem('debtsEditsCache', JSON.stringify(edits)); } catch { /* ignore */ }
  }, [edits, editsLoading, currentUser?.username]);

  // قائمة الموظفين لاختيار متابع التحصيل
  useEffect(() => {
    api.get<{ employees: any[] }>('/api/hr/employees')
      .then(r => {
        const arr = Array.isArray((r as any)?.employees) ? (r as any).employees : [];
        setEmps(arr
          .map((e: any) => ({ id: String(e?.id ?? e?._id ?? ''), name: String(e?.fullName || e?.name || e?.username || '').trim() }))
          .filter((e: { name: string }) => e.name));
      })
      .catch(() => setEmps([])); // فشل الاتصال بالسيرفر → إدخال يدوي
  }, []);

  const items = useMemo<ViewRow[]>(() => {
    const list: ViewRow[] = isAll
      ? groups.flatMap(g => g.rows.map(r => ({ ...r, debtor: g.debtor, gid: g.id })))
      : (group?.rows ?? []).map(r => ({ ...r, debtor: group.debtor, gid: group.id }));
    let out = list;
    const s = q.trim();
    if (s) {
      out = out.filter(r =>
        r.name.includes(s) || r.code.includes(s) || r.acc.includes(s) ||
        (edits[editKey(r.gid, r)]?.collector ?? '').includes(s)
      );
    }
    if (statusFilter !== 'all') {
      out = out.filter(r => {
        const e = edits[editKey(r.gid, r)];
        const paid = e?.paid ?? 0;
        switch (statusFilter) {
          case 'contract': return e?.papers === 'contract';
          case 'note': return e?.papers === 'note';
          case 'unfiled': return !e?.papers; // لم يُحدد أو لا يوجد
          case 'paidFull': return r.total > 0 && paid >= r.total;
          case 'partial': return paid > 0 && paid < r.total;
          case 'unpaid': return paid <= 0;
          default: return true;
        }
      });
    }
    return out;
  }, [isAll, groups, group, q, statusFilter, edits]);

  const filtered = items;
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.today += r.today; acc.d30 += r.d30; acc.d60 += r.d60; acc.d90 += r.d90; acc.d120 += r.d120; acc.d120p += r.d120p; acc.total += r.total;
        acc.paid += edits[editKey(r.gid, r)]?.paid ?? 0;
        return acc;
      },
      { today: 0, d30: 0, d60: 0, d90: 0, d120: 0, d120p: 0, total: 0, paid: 0 }
    );
  }, [filtered, edits]);

  const grand = useMemo(() => {
    return groups.reduce(
      (acc, g) => { acc += g.total; return acc; },
      0
    );
  }, [groups]);

  // ملخص سريع: مين ليه ورقيات / مسدد
  const summary = useMemo(() => {
    let contract = 0, note = 0, paidFull = 0, partial = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        const e = edits[editKey(g.id, r)];
        if (e?.papers === 'contract') contract++;
        else if (e?.papers === 'note') note++;
        const paid = e?.paid ?? 0;
        if (paid >= r.total && r.total > 0) paidFull++;
        else if (paid > 0) partial++;
      }
    }
    return { contract, note, paidFull, partial };
  }, [groups, edits]);

  function applyEdit(row: ViewRow, patch: Partial<DebtEdit>) {
    const k = editKey(row.gid, row);
    setEdits(prev => {
      const cur: DebtEdit = prev[k] ?? { paid: 0, papers: '', collector: '' };
      return {
        ...prev,
        [k]: {
          ...cur,
          ...patch,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.username || '—',
        },
      };
    });
  }

  function openEdit(row: ViewRow) {
    const e = edits[editKey(row.gid, row)];
    setEditing(row);
    setDraftPaid(String(e?.paid ?? 0));
    setDraftAdd('');
    setDraftPapers(e?.papers ?? '');
    setDraftCollector(e?.collector ?? '');
  }

  function saveEdit() {
    if (!editing) return;
    const paid = Math.max(0, Math.min(Number(draftPaid) || 0, editing.total));
    applyEdit(editing, { paid, papers: draftPapers, collector: draftCollector.trim() });
    setEditing(null);
  }

  function exportExcel() {
    const head = ['المسدد', 'المتبقي', 'الورقيات', 'متابع التحصيل'];
    const wsData: any[] = [
      [`أعمار الديون (حساب الأستاذ) - تجميع حسب العميل`],
      [isAll ? `الوقت: ${groups.map(g => g.reportAt).filter(Boolean).sort().pop() || '—'} (أحدث تقرير)` : `الوقت: ${group?.reportAt}`],
      [isAll ? `من يحمل عليه المديونية: الكل (${groups.length} ملف)` : `من يحمل عليه المديونية: ${group?.debtor}`],
      [],
      isAll
        ? ['من حمل عليه', 'كود العميل', 'رقم الحساب', 'الاسم', 'اليوم', '30 - 1 يوم', '60 - 31 يوم', '90 - 61 يوم', '120 - 91 يوم', '+120 يوم', 'الإجمالي', ...head]
        : ['كود العميل', 'رقم الحساب', 'الاسم', 'اليوم', '30 - 1 يوم', '60 - 31 يوم', '90 - 61 يوم', '120 - 91 يوم', '+120 يوم', 'الإجمالي', ...head],
    ];
    for (const r of filtered) {
      const e = edits[editKey(r.gid, r)];
      const paid = e?.paid ?? 0;
      const extra = [paid, Math.max(0, r.total - paid), PAPERS_LABEL[e?.papers ?? ''] || '—', e?.collector || '—'];
      const row = isAll
        ? [r.debtor, r.code, r.acc, r.name, r.today, r.d30, r.d60, r.d90, r.d120, r.d120p, r.total, ...extra]
        : [r.code, r.acc, r.name, r.today, r.d30, r.d60, r.d90, r.d120, r.d120p, r.total, ...extra];
      wsData.push(row);
    }
    wsData.push(isAll
      ? ['المجموع', '', '', '', totals.today, totals.d30, totals.d60, totals.d90, totals.d120, totals.d120p, totals.total, totals.paid, Math.max(0, totals.total - totals.paid), '', '']
      : ['المجموع', '', '', totals.today, totals.d30, totals.d60, totals.d90, totals.d120, totals.d120p, totals.total, totals.paid, Math.max(0, totals.total - totals.paid), '', '']);
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
            .no-print{display:none}
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  const cols = (isAll ? 11 : 10) + 5; // الأعمدة الأصلية + المسدد/المتبقي/الورقيات/المتابعة/تعديل

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

        {/* ملخص الحالة */}
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="bg-sky-500/10 text-sky-300 border border-sky-500/30 px-2.5 py-1 rounded-lg">📝 عقود: <strong>{summary.contract}</strong></span>
          <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg">📄 سندات أمر: <strong>{summary.note}</strong></span>
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg">✅ سداد كامل: <strong>{summary.paidFull}</strong></span>
          <span className="bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg">🟡 سداد جزئي: <strong>{summary.partial}</strong></span>
        </div>

        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث بالاسم أو الكود أو رقم الحساب أو الموظف المتابع..." className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-sm w-full sm:w-80" />
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-xs">
            <option value="all"> الكل</option>
            <option value="contract">📝 له عقد</option>
            <option value="note">📄 له سند أمر</option>
            <option value="unfiled">🚫 بدون ورقيات</option>
            <option value="paidFull">✅ مسدد بالكامل</option>
            <option value="partial">🟡 سداد جزئي</option>
            <option value="unpaid">⏳ بدون سداد</option>
          </select>
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
                <th className="border border-white/10 px-2 py-1.5 text-center">المسدد</th>
                <th className="border border-white/10 px-2 py-1.5 text-center">المتبقي</th>
                <th className="border border-white/10 px-2 py-1.5 text-center">الورقيات</th>
                <th className="border border-white/10 px-2 py-1.5 text-center">متابع التحصيل</th>
                <th className="border border-white/10 px-2 py-1.5 text-center no-print">تعديل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const e = edits[editKey(r.gid, r)];
                const paid = e?.paid ?? 0;
                const remaining = Math.max(0, r.total - paid);
                return (
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
                    <td className="border border-white/10 px-2 py-1 text-right num text-emerald-400">{paid > 0 ? paid.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
                    <td className={`border border-white/10 px-2 py-1 text-right num font-bold ${remaining <= 0 ? 'text-emerald-400' : paid > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                      {remaining <= 0 ? '✅ مسدد بالكامل' : remaining.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </td>
                    <td className="border border-white/10 px-2 py-1 text-center text-[11px]">{PAPERS_LABEL[e?.papers ?? ''] || '—'}</td>
                    <td className="border border-white/10 px-2 py-1 text-center text-[11px] text-sky-300">{e?.collector || '—'}</td>
                    <td className="border border-white/10 px-2 py-1 text-center no-print">
                      <button onClick={() => openEdit(r)} title="تعديل (سداد / ورقيات / متابعة)" className="text-base hover:scale-125 transition-transform">✏️</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={cols} className="p-4 text-center text-slate-400">لا توجد نتائج مطابقة</td></tr>
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
                <td className="border border-white/10 px-2 py-1.5 text-right num text-emerald-400">{totals.paid > 0 ? totals.paid.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
                <td className="border border-white/10 px-2 py-1.5 text-right num">{Math.max(0, totals.total - totals.paid).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="border border-white/10 px-2 py-1.5" colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-2 text-[10px] text-slate-500">
          💾 التعديلات (السداد والورقيات ومتابعة التحصيل) تُحفظ تلقائياً{currentUser?.username ? ` على حساب ${currentUser.username}` : ' محلياً — سجّل الدخول للحفظ على السيرفر'}.
          {editsLoading && ' جارِ التحميل...'}
        </p>
      </div>

      {/* ===================== مودال التعديل ===================== */}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setEditing(null)}>
          <div className="bg-[#0F172A] border border-white/15 rounded-xl w-full max-w-lg p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()} dir="rtl">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-sm font-bold text-white">✏️ تعديل بيانات المديونية</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-red-400 text-lg leading-none">✕</button>
            </div>
            <div className="text-xs text-slate-400 mb-4 space-y-0.5">
              <div>العميل: <strong className="text-white">{editing.name}</strong> (كود {editing.code} — حساب {editing.acc})</div>
              {isAll && <div>من حمل عليه: <strong className="text-sky-300">{editing.debtor}</strong></div>}
              <div>إجمالي الدين: <strong className="text-amber-300">{editing.total.toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> ر.س</div>
            </div>

            {/* السداد */}
            <div className="mb-4 bg-white/[0.04] border border-white/10 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-emerald-400">💰 السداد</div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-slate-300">إجمالي المسدد:</label>
                <input type="number" min={0} step="0.01" value={draftPaid} onChange={ev => setDraftPaid(ev.target.value)} className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-sm w-36" />
                <span className="text-[10px] text-slate-500">ر.س</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-slate-300">سداد جزئي (أضف مبلغ):</label>
                <input type="number" min={0} step="0.01" value={draftAdd} onChange={ev => setDraftAdd(ev.target.value)} placeholder="0.00" className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-sm w-32" />
                <button
                  onClick={() => {
                    const add = Number(draftAdd) || 0;
                    if (add <= 0) return;
                    setDraftPaid(String(Math.min((Number(draftPaid) || 0) + add, editing.total)));
                    setDraftAdd('');
                  }}
                  className="bg-amber-600/80 hover:bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition"
                >➕ إضافة</button>
                <button
                  onClick={() => setDraftPaid(String(editing.total))}
                  className="bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition"
                >✅ سداد كامل</button>
                <button
                  onClick={() => setDraftPaid('0')}
                  className="bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-white/10 transition"
                  title="إلغاء كل المسدد"
                >↺ تصفير</button>
              </div>
              <div className="text-[11px] text-slate-400">
                المتبقي بعد السداد: <strong className={editing.total - (Number(draftPaid) || 0) <= 0 ? 'text-emerald-400' : 'text-amber-300'}>
                  {Math.max(0, editing.total - (Number(draftPaid) || 0)).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </strong> ر.س
              </div>
            </div>

            {/* الورقيات */}
            <div className="mb-4 bg-white/[0.04] border border-white/10 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-indigo-300">📁 الورقيات</div>
              <div className="flex gap-2 flex-wrap">
                {([['contract', '📝 يوجد عقد'], ['note', '📄 يوجد سند أمر'], ['none', '❌ لا يوجد اى عقود او سندات امر']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setDraftPapers(v)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition font-bold ${draftPapers === v ? 'bg-indigo-500/25 text-indigo-200 border-indigo-400/60' : 'bg-white/[0.04] text-slate-300 border-white/10 hover:bg-white/[0.08]'}`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* متابعة التحصيل */}
            <div className="mb-4 bg-white/[0.04] border border-white/10 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-sky-300">🎯 متابعة التحصيل</div>
              {emps.length > 0 ? (
                <select value={emps.some(e => e.name === draftCollector) ? draftCollector : ''} onChange={ev => setDraftCollector(ev.target.value)} className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 text-sm w-full">
                  <option value="">— بدون متابعة —</option>
                  {emps.map(e => <option key={e.id || e.name} value={e.name}>{e.name}</option>)}
                </select>
              ) : (
                <div className="text-[10px] text-amber-300/70">تعذر تحميل قائمة الموظفين — اكتب الاسم يدويًا بالأسفل.</div>
              )}
              <input value={draftCollector} onChange={ev => setDraftCollector(ev.target.value)} placeholder="اسم الموظف المتابع (يدوي)..." className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 text-sm w-full" />
            </div>

            {(() => {
              const prev = edits[editKey(editing.gid, editing)];
              if (!prev?.updatedAt) return null;
              return <div className="text-[10px] text-slate-500 mb-3">آخر تعديل: {new Date(prev.updatedAt).toLocaleString('ar-EG')} بواسطة {prev.updatedBy || '—'}</div>;
            })()}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs px-4 py-2 rounded-lg border border-white/10 transition font-bold">إلغاء</button>
              <button onClick={saveEdit} className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-5 py-2 rounded-lg font-bold transition">💾 حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
