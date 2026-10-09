import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';
import BrandLogo from '../components/BrandLogo';
import { FORMS, DEPTS, type FormDef } from '../lib/formsCatalog';

type Rec = { id: string; formCode: string; title: string; formDate: string | null; status: string };

export default function Forms() {
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);

  const [dept, setDept] = useState<string>('');
  const [sel, setSel] = useState<FormDef | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [vals, setVals] = useState<Record<string, any>>({});
  const [rows, setRows] = useState<Record<string, string[][]>>({});
  const [docs, setDocs] = useState<{ name: string; url: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fleet, setFleet] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);

  const loadRecs = async (code?: string) => {
    try {
      const d = await api.get<{ records?: Rec[] }>(`/api/forms${code ? `?code=${code}` : ''}`);
      setRecs(Array.isArray(d?.records) ? d.records : []);
    } catch { setRecs([]); }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadRecs(sel?.code);
    api.get<any[]>('/api/fleet').then((v) => setFleet(Array.isArray(v) ? v : [])).catch(() => {});
    api.get<{ employees?: any[] }>('/api/hr/employees').then((d) => setEmps(Array.isArray((d as any)?.employees) ? (d as any).employees : [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const openForm = (f: FormDef) => {
    if (f.link) return;
    setSel(f);
    setEditing(null);
    const v: Record<string, any> = {};
    for (const fl of f.fields ?? []) v[fl.key] = fl.preset ?? (fl.type === 'date' ? new Date().toISOString().slice(0, 10) : '');
    setVals(v);
    const r: Record<string, string[][]> = {};
    for (const t of f.tables ?? []) {
      r[t.key] = t.fixed ? t.fixed.map((row) => [...row, ...Array(Math.max(0, t.columns.length - row.length)).fill('')]) : [['', '', ''].slice(0, 0)];
      if (!t.fixed) r[t.key] = [];
    }
    setRows(r);
    setDocs([]);
    setMsg('');
    loadRecs(f.code);
  };

  const editRec = async (id: string) => {
    try {
      const d = await api.get<any>(`/api/forms/${id}`);
      const f = FORMS.find((x) => x.code === d?.formCode);
      if (!f || f.link) return;
      setSel(f);
      setEditing(d);
      setVals({ ...(d?.data ?? {}) });
      const r: Record<string, string[][]> = {};
      const dd = (d?.data ?? {}) as Record<string, any>;
      for (const t of f.tables ?? []) {
        const saved = dd[`__table_${t.key}`];
        r[t.key] = Array.isArray(saved) ? saved : (t.fixed ? t.fixed.map((row) => [...row, ...Array(Math.max(0, t.columns.length - row.length)).fill('')]) : []);
      }
      setRows(r);
      setDocs(Array.isArray(d?.docs) ? d.docs : []);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? ''}`);
    }
  };

  const autofill = async () => {
    if (!sel?.autofill) return;
    setBusy(true);
    try {
      const v = { ...vals };
      const getRows = async (url: string) => {
        try {
          return await api.get<any>(url);
        } catch { return null; }
      };
      if (sel.autofill === 'ops') {
        const rd = await getRows('/api/fleet/readiness');
        const rows = (rd as any)?.rows ?? [];
        setRows((p) => ({
          ...p,
          fleet: rows.map((x: any) => [x.vehicleCode, '', x.status === 'WORKING' ? 'شغالة' : x.status === 'IN_WORKSHOP' ? 'صيانة' : x.status === 'IDLE' ? 'عطل' : '', '', '']),
        }));
        const mp = await getRows('/api/hr/absences');
        if (mp) {
          v.present = String((mp as any)?.present ?? '');
          v.absent = String((mp as any)?.absent ?? '');
        }
      } else if (sel.autofill === 'production') {
        const pr = await getRows('/api/production/runs');
        const runs = (pr as any)?.runs ?? [];
        setRows((p) => ({
          ...p,
          concrete: runs.filter((x: any) => Number(x.volumeM3) > 0).map((x: any) => ['', '', x.volumeM3, '', x.designCode ?? '', '']),
          blocks: runs.filter((x: any) => Number(x.blockUnits) > 0).map(() => ['', '', '', '', '']),
        }));
      } else if (sel.autofill === 'finance') {
        const c = await getRows('/api/finance/collections');
        const rows = (c as any)?.rows ?? [];
        setRows((p) => ({ ...p, revenues: rows.map((x: any) => ['', '', x.amountSar, '', '']) }));
        const ex = await getRows('/api/finance/expenses');
        const erows = (ex as any)?.expenses ?? [];
        setRows((p) => ({ ...p, ...(p as any), expenses: erows.map((x: any) => [x.description ?? '', x.amountSar ?? '', '', '', '']) }));
      } else if (sel.autofill === 'workshop') {
        const w = await getRows('/api/workshop');
        const open = (w as any)?.openWorkOrders ?? [];
        setRows((p) => ({
          ...p,
          done: [],
          out: open.map((x: any) => [x.vehicleCode ?? '', x.title ?? x.faultDescription ?? '', '', '', '']),
        }));
        const rd = await getRows('/api/fleet/readiness');
        const ws = ((rd as any)?.rows ?? []).filter((x: any) => x.status === 'IN_WORKSHOP');
        if (ws.length) {
          v.outCount = String(ws.length);
          setRows((p) => ({ ...p, out: ws.map((x: any) => [x.vehicleCode, '', '', '', '']) }));
        }
      }
      setVals(v);
      setMsg('✅ تمت التعبئة من النظام — راجع قبل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const setCell = (tk: string, ri: number, ci: number, val: string) => {
    setRows((p) => ({ ...p, [tk]: (p[tk] ?? []).map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? val : c)) : r)) }));
  };
  const addRow = (t: { key: string; columns: string[] }) => {
    setRows((p) => ({ ...p, [t.key]: [...(p[t.key] ?? []), Array(t.columns.length).fill('')] }));
  };
  const delRow = (tk: string, ri: number) => {
    setRows((p) => ({ ...p, [tk]: (p[tk] ?? []).filter((_, i) => i !== ri) }));
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMsg('❌ الملف أكبر من 8MB');
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setDocs((p) => [...p, { name: file.name, url }]);
  };

  const save = async () => {
    if (!sel || sel.link) return;
    setBusy(true);
    try {
      const data: Record<string, any> = { ...vals };
      for (const t of sel.tables ?? []) data[`__table_${t.key}`] = rows[t.key] ?? [];
      if (editing) {
        await api.put(`/api/forms/${editing.id}`, { data, docs, formDate: vals.date || editing.formDate });
        setMsg('✅ تم التعديل');
      } else {
        await api.post('/api/forms', {
          formCode: sel.code, title: sel.title, formDate: vals.date || undefined, data, docs,
        });
        setMsg('✅ تم الحفظ');
      }
      setEditing(null);
      loadRecs(sel.code);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? ''}`);
    } finally {
      setBusy(false);
    }
  };

  const delRec = async (id: string) => {
    if (!window.confirm(ar ? 'حذف هذا النموذج؟' : 'Delete?')) return;
    try {
      await api.del(`/api/forms/${id}`);
      setMsg('✅ تم الحذف');
      loadRecs(sel?.code);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? ''}`);
    }
  };

  const printRec = async (rec: any) => {
    try {
      const d = await api.get<any>(`/api/forms/${rec.id}`);
      const f = FORMS.find((x) => x.code === (d?.formCode ?? rec.formCode));
      if (!f || f.link) return;
      const dd = (d?.data ?? {}) as Record<string, any>;
      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) return;
      const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const fl = (f.fields ?? []).map((x) => `<tr><th>${x.label}</th><td>${esc(dd[x.key])}</td></tr>`).join('');
      const tb = (f.tables ?? []).map((t) => {
        const rr: string[][] = dd[`__table_${t.key}`] ?? [];
        return `<h2>${t.title}</h2><table><thead><tr>${t.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
          rr.length ? rr.map((r) => `<tr>${t.columns.map((_, i) => `<td>${esc(r[i])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${t.columns.length}">—</td></tr>`
        }</tbody></table>`;
      }).join('');
      const st = (f.staticBody ?? []).map((p) => `<p class="par">${esc(p)}</p>`).join('');
      const sg = (f.sigs ?? []).map((s) => `<div class="sig">${s}<br/>الاسم: .......... التوقيع: .......... التاريخ: ..../..../....</div>`).join('');
      const at = (Array.isArray(d?.docs) ? d.docs : []).map((x: any) => `<div>📎 ${esc(x.name)}</div>`).join('');
      w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${f.title} ${f.code}</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma;padding:28px;color:#111}h1{font-size:20px}.sub{font-size:12px;color:#555;margin-bottom:12px}.par{font-size:13px;margin:8px 0;line-height:1.9}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th{background:#0f172a;color:#fff;padding:6px 8px;text-align:right}td{padding:5px 8px;border-bottom:1px solid #ddd}h2{font-size:15px;margin:14px 0 4px}.foot{margin-top:18px;display:flex;gap:30px;flex-wrap:wrap}.sig{font-size:11px;border-top:1px solid #999;padding-top:4px;min-width:150px;text-align:center}@media print{body{padding:10mm}}</style></head><body>
      <h1>${f.title}</h1><div class="sub">نموذج رقم ${f.code} · ${esc(d?.formDate ?? '')}</div>
      ${st}<table>${fl}</table>${tb}${at ? `<h2>المرفقات</h2>${at}` : ''}
      <div class="foot">${sg}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
      w.document.close();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? ''}`);
    }
  };

  const printCurrent = () => {
    if (!sel) return;
    const data: Record<string, any> = { ...vals };
    for (const t of sel.tables ?? []) data[`__table_${t.key}`] = rows[t.key] ?? [];
    // Reuse the saved-record printer shape with current in-memory data.
    const f = sel;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const fl = (f.fields ?? []).map((x) => `<tr><th>${x.label}</th><td>${esc(data[x.key])}</td></tr>`).join('');
    const tb = (f.tables ?? []).map((t) => {
      const rr: string[][] = data[`__table_${t.key}`] ?? [];
      return `<h2>${t.title}</h2><table><thead><tr>${t.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
        rr.length ? rr.map((r) => `<tr>${t.columns.map((_, i) => `<td>${esc(r[i])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${t.columns.length}">—</td></tr>`
      }</tbody></table>`;
    }).join('');
    const st = (f.staticBody ?? []).map((p) => `<p class="par">${esc(p)}</p>`).join('');
    const sg = (f.sigs ?? []).map((s) => `<div class="sig">${s}<br/>الاسم: .......... التوقيع: .......... التاريخ: ..../..../....</div>`).join('');
    const at = docs.map((x) => `<div>📎 ${esc(x.name)}</div>`).join('');
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${f.title} ${f.code}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma;padding:28px;color:#111}h1{font-size:20px}.sub{font-size:12px;color:#555;margin-bottom:12px}.par{font-size:13px;margin:8px 0;line-height:1.9}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th{background:#0f172a;color:#fff;padding:6px 8px;text-align:right}td{padding:5px 8px;border-bottom:1px solid #ddd}h2{font-size:15px;margin:14px 0 4px}.foot{margin-top:18px;display:flex;gap:30px;flex-wrap:wrap}.sig{font-size:11px;border-top:1px solid #999;padding-top:4px;min-width:150px;text-align:center}@media print{body{padding:10mm}}</style></head><body>
    <h1>${f.title}</h1><div class="sub">نموذج رقم ${f.code} · ${esc(vals.date ?? '')}</div>
    ${st}<table>${fl}</table>${tb}${at ? `<h2>المرفقات</h2>${at}` : ''}
    <div class="foot">${sg}</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center">
        <p>{ar ? 'سجل الدخول أولاً.' : 'Log in first.'}</p>
      </div>
    );
  }

  const list = FORMS.filter((f) => !dept || f.dept === dept);
  const empNames = emps.map((e: any) => e.fullName ?? e.name ?? '');
  const fleetCodes = fleet.map((v: any) => `${v.vehicleCode ?? v.code} · ${v.plateNumber ?? v.plate ?? ''}`);

  const fieldInput = (fl: { key: string; label: string; type: string; options?: string[]; preset?: string }) => {
    const sug =
      /vehicle|اللوحة|المركبة|المعدة/.test(fl.key + fl.label) ? fleetCodes
      : /emp|driver|supervisor|tech|receiver|chair|member|witness|issuer|reviewer|issuer|السائق|الموظف|المشرف|الفني|المستلم|الرئيس|الحاضر|المعد|المحاسب|المراجع|المشتريات|المدير/.test(fl.key + fl.label) ? empNames
      : null;
    if (fl.type === 'select') {
      return (
        <select value={vals[fl.key] ?? ''} onChange={(e) => setVals({ ...vals, [fl.key]: e.target.value })}
          className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
          <option value="">—</option>
          {(fl.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (fl.type === 'textarea') {
      return (
        <textarea value={vals[fl.key] ?? ''} onChange={(e) => setVals({ ...vals, [fl.key]: e.target.value })} rows={2}
          className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
      );
    }
    return (
      <span>
        <input type={fl.type === 'date' ? 'date' : fl.type === 'number' ? 'number' : 'text'}
          value={vals[fl.key] ?? ''} list={sug ? `sg-${fl.key}` : undefined}
          onChange={(e) => setVals({ ...vals, [fl.key]: e.target.value })}
          className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
        {sug && (
          <datalist id={`sg-${fl.key}`}>
            {sug.slice(0, 200).map((s, i) => <option key={i} value={s} />)}
          </datalist>
        )}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-200" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-3">
            <BrandLogo width={48} />
            <div>
              <h1 className="text-base font-black text-white">📑 {L('مكتبة النماذج والمطبوعات', 'Forms library')}</h1>
              <p className="text-[11px] text-slate-400">{L('تعبئة من النظام + طباعة + تعديل + حذف + مرفقات', 'Fill, print, edit, delete, attach')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">🏠</Link>
            <QuickJump />
            <LangSelector />
          </div>
        </div>

        {msg && <p className="text-xs font-bold mb-2">{msg}</p>}

        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => setDept('')} className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${!dept ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
            {L('الكل', 'All')}
          </button>
          {DEPTS.map((d) => (
            <button key={d} onClick={() => setDept(d)} className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${dept === d ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
              {d}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
          {list.map((f) => (
            <button key={f.code} onClick={() => (f.link ? undefined : openForm(f))}
              className={`text-right rounded-xl border p-3 ${sel?.code === f.code ? 'border-sky-500/60 bg-sky-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}>
              <p className="text-xs font-black text-white">{f.title}</p>
              <p className="text-[10px] text-slate-500 font-mono" dir="ltr">{f.code} · {f.dept}</p>
              {f.link && <Link to={f.link} className="text-[11px] text-sky-400 font-black">← {L('فتح الشاشة', 'Open')}</Link>}
            </button>
          ))}
        </div>

        {sel && !sel.link && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h3 className="text-sm font-black text-white">{sel.title} <span className="text-slate-500 font-mono text-[10px]" dir="ltr">{sel.code}</span></h3>
              <span className="flex gap-2">
                {sel.autofill && (
                  <button disabled={busy} onClick={autofill} className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 disabled:opacity-50">
                    ⚡ {L('تعبئة من النظام', 'Autofill')}
                  </button>
                )}
                <button onClick={printCurrent} className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/15 text-slate-200">
                  🖨️ {L('طباعة', 'Print')}
                </button>
                <button disabled={busy} onClick={save} className="text-[11px] font-black rounded-lg px-4 py-1.5 bg-sky-500 text-white disabled:opacity-50">
                  {busy ? '…' : editing ? L('حفظ التعديل', 'Save edit') : `✅ ${L('حفظ', 'Save')}`}
                </button>
                {editing && (
                  <button onClick={() => openForm(sel)} className="text-[11px] rounded-lg px-3 py-1.5 border border-white/15 text-slate-300">
                    {L('جديد', 'New')}
                  </button>
                )}
              </span>
            </div>

            {(sel.staticBody ?? []).length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-2">
                {sel.staticBody!.map((p, i) => <p key={i} className="text-xs text-slate-300 leading-7">{p}</p>)}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(sel.fields ?? []).map((fl) => (
                <label key={fl.key} className="text-[11px] text-slate-400 font-bold">{fl.label}{fieldInput(fl)}</label>
              ))}
            </div>

            {(sel.tables ?? []).map((t) => (
              <div key={t.key} className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-black text-slate-300">{t.title}</p>
                  {!t.fixed && (
                    <button onClick={() => addRow(t)} className="text-[11px] border border-white/15 rounded-lg px-2 py-0.5 text-slate-200">+ {L('صف', 'Row')}</button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 text-[10px]">{t.columns.map((c) => <th key={c} className="text-right p-1 font-bold">{c}</th>)}<th /></tr></thead>
                    <tbody>
                      {(rows[t.key] ?? []).map((r, ri) => (
                        <tr key={ri}>
                          {t.columns.map((_, ci) => (
                            <td key={ci} className="p-0.5">
                              {t.fixed && ci === 0 ? (
                                <span className="text-[11px] text-slate-300">{r[0]}</span>
                              ) : (
                                <input value={r[ci] ?? ''} onChange={(e) => setCell(t.key, ri, ci, e.target.value)}
                                  className="w-full bg-white/[0.05] border border-white/10 rounded px-1.5 py-1 text-[11px] text-white outline-none" />
                              )}
                            </td>
                          ))}
                          <td className="p-0.5">
                            {!t.fixed && (
                              <button onClick={() => delRow(t.key, ri)} className="text-red-400 text-xs px-1">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {(sel.sigs ?? []).length > 0 && (
              <p className="text-[11px] text-slate-500 mt-3">✍️ {L('التوقيعات', 'Signatures')}: {(sel.sigs ?? []).join(' · ')}</p>
            )}

            <div className="mt-3">
              <label className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/15 text-slate-200 cursor-pointer">
                📎 {L('إرفاق مستند', 'Attach')} (PDF/صورة)
                <input type="file" accept="application/pdf,image/*" className="hidden"
                  onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <span className="flex flex-wrap gap-2 mt-1">
                {docs.map((d, i) => (
                  <span key={i} className="text-[11px] text-slate-300 border border-white/10 rounded-lg px-2 py-1">
                    📎 {d.name}
                    <button onClick={() => setDocs((p) => p.filter((_, j) => j !== i))} className="text-red-400 mr-1">✕</button>
                  </span>
                ))}
              </span>
            </div>

            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-black text-slate-300">{L('المحفوظات', 'Saved')} ({recs.length})</p>
              {recs.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs border-b border-white/5 py-1">
                  <span className="text-slate-300">{r.formDate ?? ''} · {r.title} · {r.status === 'DRAFT' ? L('مسودة', 'Draft') : L('معتمد', 'Filed')}</span>
                  <span className="flex gap-1">
                    <button onClick={() => printRec(r)} className="text-[11px] border border-white/15 rounded px-2 py-0.5 text-slate-200">🖨️</button>
                    <button onClick={() => editRec(r.id)} className="text-[11px] border border-sky-500/40 rounded px-2 py-0.5 text-sky-300">✏️</button>
                    <button onClick={() => delRec(r.id)} className="text-[11px] border border-red-500/40 rounded px-2 py-0.5 text-red-300">🗑️</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
