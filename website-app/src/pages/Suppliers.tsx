/**
 * ============================================================
 *  FIMTO SOFT — Suppliers directory (صفحة الموردين)
 * ============================================================
 *  Company-wide supplier list: search, category filter, add /
 *  edit / bulk-add, Excel export and print. First open is
 *  pre-seeded from the legacy "موردين.xls" export (240 suppliers)
 *  — afterwards the user's own list wins, nothing is overwritten.
 *  Stored per company in Firestore (users/{username}/suppliers).
 * ============================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { loadSuppliers, saveSuppliers } from '../firebase/firestore';
import { SUPPLIERS_SEED } from '../data/suppliersSeed';

export interface Supplier {
  id: string;
  name: string;
  kind: string;      // مورد / شركة / مصنع / مؤسسة ...
  category: string;  // اسمنت / رمل / نقل وناقلات ...
  phone: string;
  contactPerson: string;
  notes: string;
  createdAt: string;
}

const KINDS = ['مورد', 'شركة', 'مصنع', 'مؤسسة', 'فرع', 'ناقل', 'مقاول', 'ورشة', 'مطعم', 'مركز', 'مكتب', 'مجموعة', 'أخرى'];
const SEED_CATS = ['اسمنت', 'رمل', 'بحص', 'بلك ومنتجات أسمنتية', 'نقل وناقلات', 'قطع غيار', 'ورش وصيانة', 'محروقات', 'معدات وإيجارات', 'مقاولات', 'تقنية معلومات', 'خدمات', 'مطاعم', 'متنوع'];

const norm = (s: unknown) => String(s ?? '').trim();
const todayISO = () => new Date().toISOString().slice(0, 10);
const newId = () => `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function readCache(): Supplier[] | null {
  try {
    const s = localStorage.getItem('suppliersCache');
    return s ? (JSON.parse(s) as Supplier[]) : null;
  } catch { return null; }
}

function seedRows(): Supplier[] {
  const now = new Date().toISOString();
  return SUPPLIERS_SEED.map(s => ({
    id: s.id, name: s.name, kind: s.kind, category: s.category,
    phone: '', contactPerson: '', notes: '', createdAt: now,
  }));
}

export default function Suppliers() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<Supplier[]>(() => readCache() ?? []);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('الكل');
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [form, setForm] = useState({ name: '', kind: 'مورد', category: 'متنوع', phone: '', contactPerson: '', notes: '' });
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.username) {
      // Logged out / auth still restoring — show local data immediately instead of hanging.
      setItems(prev => (prev.length ? prev : (readCache() ?? seedRows())));
      setLoading(false);
      return;
    }
    loadSuppliers(currentUser.username).then((rows: unknown) => {
      if (Array.isArray(rows)) {
        setItems(rows as Supplier[]);
      } else {
        // First open — seed from the legacy Excel export, then persist.
        const seededRows = seedRows();
        setItems(seededRows);
        setSeeded(true);
        saveSuppliers(currentUser.username, seededRows).catch(() => {});
        try { localStorage.setItem('suppliersCache', JSON.stringify(seededRows)); } catch {}
      }
      setLoading(false);
    }).catch(() => {
      // Cloud unreachable — keep whatever local view we have.
      setItems(prev => (prev.length ? prev : (readCache() ?? seedRows())));
      setLoading(false);
    });
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser?.username || loading) return;
    const t = setTimeout(() => {
      saveSuppliers(currentUser.username, items).catch(() => {});
      try { localStorage.setItem('suppliersCache', JSON.stringify(items)); } catch {}
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading]);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of items) m.set(norm(s.category) || 'متنوع', (m.get(norm(s.category) || 'متنوع') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(s => {
      if (cat !== 'الكل' && (norm(s.category) || 'متنوع') !== cat) return false;
      if (!needle) return true;
      return [s.name, s.phone, s.contactPerson, s.notes, s.kind].some(v => norm(v).toLowerCase().includes(needle));
    });
  }, [items, q, cat]);

  const commit = (next: Supplier[]) => setItems(next);

  const guard = () => {
    if (!currentUser?.username) { alert('سجّل الدخول أولاً لحفظ التعديلات في السحابة'); return false; }
    return true;
  };

  const saveForm = () => {
    if (!guard()) return;
    if (!form.name.trim()) { alert('اكتب اسم المورد أولاً'); return; }
    if (editId) {
      commit(items.map(s => s.id === editId ? { ...s, ...form, name: form.name.trim() } : s));
    } else {
      commit([{ id: newId(), ...form, name: form.name.trim(), createdAt: new Date().toISOString() }, ...items]);
    }
    setForm({ name: '', kind: 'مورد', category: 'متنوع', phone: '', contactPerson: '', notes: '' });
    setEditId(null);
    setShowForm(false);
  };

  const startEdit = (s: Supplier) => {
    setForm({ name: s.name, kind: s.kind, category: s.category, phone: s.phone, contactPerson: s.contactPerson, notes: s.notes });
    setEditId(s.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = (s: Supplier) => {
    if (!guard()) return;
    if (!window.confirm(`حذف المورد "${s.name}" نهائياً؟`)) return;
    commit(items.filter(x => x.id !== s.id));
  };

  const addBulk = () => {
    if (!guard()) return;
    const names = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!names.length) return;
    const now = new Date().toISOString();
    const add: Supplier[] = names.map(n => ({
      id: newId(), name: n, kind: 'مورد', category: 'متنوع',
      phone: '', contactPerson: '', notes: 'إضافة جماعية', createdAt: now,
    }));
    commit([...add, ...items]);
    setBulkText('');
    setShowBulk(false);
  };

  const doExcel = () => {
    const head = ['م', 'اسم المورد', 'النوع', 'الفئة', 'الجوال', 'مسؤول التواصل', 'ملاحظات'];
    const body = rows.map((s, i) => [i + 1, s.name, s.kind, s.category, s.phone, s.contactPerson, s.notes]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`قائمة الموردين — ${todayISO()}`],
      head, ...body,
      [], ['ملخص الفئات'], ['الفئة', 'العدد'], ...cats.map(([c, n]) => [c, n]),
    ]);
    ws['!cols'] = [{ wch: 4 }, { wch: 46 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    XLSX.writeFile(wb, `suppliers-${todayISO()}.xlsx`);
  };

  const doPrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const trs = rows.map((s, i) =>
      `<tr><td style="border:1px solid #111;padding:4px;text-align:center">${i + 1}</td>` +
      `<td style="border:1px solid #111;padding:4px"><b>${s.name}</b></td>` +
      `<td style="border:1px solid #111;padding:4px;text-align:center">${s.kind}</td>` +
      `<td style="border:1px solid #111;padding:4px;text-align:center">${s.category}</td>` +
      `<td style="border:1px solid #111;padding:4px;text-align:center" dir="ltr">${s.phone || '—'}</td>` +
      `<td style="border:1px solid #111;padding:4px">${s.notes}</td></tr>`).join('');
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>الموردين</title></head><body style="font-family:Tahoma,Arial">` +
      `<p style="text-align:center;font-weight:bold;font-size:16px">قائمة موردين المصنع — ${todayISO()}</p>` +
      `<p style="text-align:center;font-size:12px">الإجمالي: ${rows.length} مورد</p>` +
      `<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#e5e7eb">` +
      `<th style="border:1px solid #111;padding:4px">م</th><th style="border:1px solid #111;padding:4px">اسم المورد</th>` +
      `<th style="border:1px solid #111;padding:4px">النوع</th><th style="border:1px solid #111;padding:4px">الفئة</th>` +
      `<th style="border:1px solid #111;padding:4px">الجوال</th><th style="border:1px solid #111;padding:4px">ملاحظات</th></tr></thead>` +
      `<tbody>${trs}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-sky-500';
  const labelCls = 'block text-[11px] font-bold text-slate-400 mb-1';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-black text-white">🏢 الموردون</h1>
            <p className="text-slate-400 text-sm">دليل موردي المصنع — بحث، فئات، إضافة وتعديل · {items.length} مورد</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setShowBulk(v => !v); setShowForm(false); }} className="text-xs bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-slate-200 px-3 py-2 rounded-lg font-bold">📋 إضافة متعددة</button>
            <button onClick={doExcel} className="text-xs bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-emerald-300 px-3 py-2 rounded-lg font-bold">📊 إكسل</button>
            <button onClick={doPrint} className="text-xs bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-slate-200 px-3 py-2 rounded-lg font-bold">🖨️ طباعة</button>
            <button onClick={() => { setShowForm(v => !v); setShowBulk(false); }} className="text-xs bg-sky-500 hover:bg-sky-400 text-white px-3 py-2 rounded-lg font-black">➕ {editId ? 'تعديل' : 'مورد جديد'}</button>
            <Link to="/procurement" className="text-xs bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-slate-200 px-3 py-2 rounded-lg font-bold">🧾 المشتريات</Link>
          </div>
        </div>

        {seeded && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl px-4 py-3 mb-4">
            ✅ تم استيراد {SUPPLIERS_SEED.length} مورداً من ملف الإكسل الأصلي (موردين.xls). عدّل الفئات أو الأرقام براحتك — أي تعديل يُحفظ تلقائياً.
          </div>
        )}

        {!currentUser?.username && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-xl px-4 py-3 mb-4">
            👁️ وضع عرض — البيانات معروضة من النسخة المحلية. سجّل الدخول لحفظ التعديلات ومزامنتها في السحابة.
          </div>
        )}

        {showBulk && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-4">
            <p className="text-sm font-black text-white mb-2">إضافة موردين جماعياً — اسم في كل سطر</p>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={6} dir="rtl" placeholder={'شركة فلان للمقاولات\nمؤسسة عبدالله للنقل\nمصنع السلام للبلك'} className={inputCls + ' mb-2 font-mono'} />
            <div className="flex gap-2">
              <button onClick={addBulk} className="text-xs bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg font-black">إضافة {bulkText.split('\n').filter(l => l.trim()).length} مورد</button>
              <button onClick={() => setShowBulk(false)} className="text-xs bg-white/[0.06] text-slate-300 px-4 py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        )}

        {showForm && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-4">
            <p className="text-sm font-black text-white mb-3">{editId ? '✏️ تعديل مورد' : '➕ مورد جديد'}</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className={labelCls}>اسم المورد *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="شركة الراشد للاسمنت" />
              </div>
              <div>
                <label className={labelCls}>النوع</label>
                <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} className={inputCls}>
                  {KINDS.map(k => <option key={k} value={k} className="bg-slate-900">{k}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>الفئة</label>
                <input list="sup-cats" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls} />
                <datalist id="sup-cats">{SEED_CATS.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className={labelCls}>الجوال</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} dir="ltr" className={inputCls} placeholder="05xxxxxxxx" />
              </div>
              <div>
                <label className={labelCls}>مسؤول التواصل</label>
                <input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} className={inputCls} />
              </div>
              <div className="md:col-span-3">
                <label className={labelCls}>ملاحظات</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveForm} className="text-xs bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-lg font-black">💾 حفظ</button>
              <button onClick={() => { setShowForm(false); setEditId(null); setForm({ name: '', kind: 'مورد', category: 'متنوع', phone: '', contactPerson: '', notes: '' }); }} className="text-xs bg-white/[0.06] text-slate-300 px-4 py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center"><p className="text-3xl font-black text-white" dir="ltr">{items.length}</p><p className="text-slate-400 text-xs">إجمالي الموردين</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center"><p className="text-3xl font-black text-sky-300" dir="ltr">{cats.length}</p><p className="text-slate-400 text-xs">الفئات</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center"><p className="text-3xl font-black text-emerald-300" dir="ltr">{items.filter(s => norm(s.phone)).length}</p><p className="text-slate-400 text-xs">لديهم جوال</p></div>
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center"><p className="text-3xl font-black text-amber-300" dir="ltr">{rows.length}</p><p className="text-slate-400 text-xs">نتائج العرض</p></div>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3 mb-4">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 بحث بالاسم أو الجوال أو الملاحظات..." className={inputCls + ' mb-3'} />
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setCat('الكل')} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold border ${cat === 'الكل' ? 'bg-sky-500 text-white border-sky-500' : 'bg-white/[0.03] text-slate-300 border-white/10'}`}>الكل ({items.length})</button>
            {cats.map(([c, n]) => (
              <button key={c} onClick={() => setCat(c)} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold border ${cat === c ? 'bg-sky-500 text-white border-sky-500' : 'bg-white/[0.03] text-slate-300 border-white/10'}`}>{c} ({n})</button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-center text-slate-500 text-lg py-10">{loading ? '...جاري التحميل' : 'لا يوجد موردون مطابقون'}</p>
        ) : (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full border-collapse" dir="rtl" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(14,116,232,0.15)' }}>
                  {['م', 'اسم المورد', 'النوع', 'الفئة', 'الجوال', 'مسؤول التواصل', 'ملاحظات', ''].map(h => (
                    <th key={h} className="text-slate-300 font-bold px-3 py-2 border-b border-white/10">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-2 text-center text-slate-500" dir="ltr">{i + 1}</td>
                    <td className="px-3 py-2 font-bold text-white">{s.name}</td>
                    <td className="px-3 py-2 text-center text-slate-300">{s.kind}</td>
                    <td className="px-3 py-2 text-center"><span className="text-[10px] bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded px-2 py-0.5">{s.category}</span></td>
                    <td className="px-3 py-2 text-center text-slate-300" dir="ltr">{s.phone || '—'}</td>
                    <td className="px-3 py-2 text-slate-300">{s.contactPerson || '—'}</td>
                    <td className="px-3 py-2 text-slate-400 text-[11px]">{s.notes}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button onClick={() => startEdit(s)} className="text-[10px] text-amber-300 border border-amber-500/30 rounded px-2 py-1 hover:bg-amber-500/10 ml-1">✏️ تعديل</button>
                      <button onClick={() => remove(s)} className="text-[10px] text-red-300 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/10">🗑️ حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-slate-600 text-center mt-4">{currentUser?.username ? 'يُحفظ القائمة في حساب الشركة على السحابة — المزامنة تلقائية بعد كل تعديل' : 'سجّل الدخول لتفعيل الحفظ السحابي'}</p>
      </div>
    </div>
  );
}
