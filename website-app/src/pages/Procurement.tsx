import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QuickJump from '../components/QuickJump';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';

/**
 * Procurement — إدارة المشتريات.
 * Workshop-driven requisitions: the rep attaches ≥3 supplier invoices,
 * a reviewer signs, the procurement manager approves + disburses, goods
 * arrive at the warehouse (existing warehouse endpoints), go out to the
 * workshop, and the part gets a QR label (existing qr/labels).
 * Server gates every transition; the UI only offers valid next steps.
 */

const STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة', SUBMITTED: 'مرسل', UNDER_REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمد', REJECTED: 'مرفوض', RECEIVED: 'مستلم', ISSUED: 'مصروف', CLOSED: 'مغلق',
};

export default function Procurement() {
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [filter, setFilter] = useState('ALL');
  const [requests, setRequests] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [attachs, setAttachs] = useState<any[]>([]);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ itemName: '', itemCode: '', vehicleId: '', quantity: '', unit: '', reason: '', workshopRef: '' });
  const [regItems, setRegItems] = useState<any[]>([]);
  const [fleetList, setFleetList] = useState<any[]>([]);
  const [quoteForm, setQuoteForm] = useState({ supplierName: '', amountSar: '' });
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [quoteSlot, setQuoteSlot] = useState<1 | 2 | 3>(1);
  const [branding, setBranding] = useState<{ companyName?: string; logoDataUrl?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [quotePick, setQuotePick] = useState('');
  const [disbursed, setDisbursed] = useState('');
  const [recvForm, setRecvForm] = useState({ itemCode: '', qty: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ requests?: any[] }>(`/api/procure/requests${filter === 'ALL' ? '' : `?status=${filter}`}`);
      setRequests(Array.isArray(r?.requests) ? r.requests : []);
    } catch { setRequests([]); }
    try {
      const it = await api.get<any[]>(`/api/warehouse/items`);
      setRegItems(Array.isArray(it) ? it : (it as any)?.items ?? []);
    } catch { /* registry optional */ }
    try {
      const fl = await api.get<any[]>(`/api/fleet`);
      setFleetList(Array.isArray(fl) ? fl : (fl as any)?.vehicles ?? []);
    } catch { /* fleet optional */ }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api.get<{ request?: any; quotes?: any[]; approvals?: any[] }>(`/api/procure/requests/${id}/detail`);
      setSel(d?.request ?? null);
      setQuotes(Array.isArray(d?.quotes) ? d.quotes : []);
      setApprovals(Array.isArray(d?.approvals) ? d.approvals : []);
      try {
        const a = await api.get<{ attachments?: any[] }>(`/api/procure/requests/${id}/attachments`);
        setAttachs(Array.isArray(a?.attachments) ? a.attachments : []);
      } catch { setAttachs([]); }
      try {
        const b = await api.get<{ branding?: { companyName?: string; logoUrl?: string } }>('/api/tenant/branding');
        if (b?.branding) setBranding({ companyName: b.branding.companyName, logoDataUrl: b.branding.logoUrl ?? undefined });
      } catch { /* keep previous */ }
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? ''}`);
    }
  }, []);

  const printDoc = (kind: 'request' | 'order') => {
    if (!sel) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    const logo = branding?.logoDataUrl ? `<img src="${branding.logoDataUrl}" style="height:54px;object-fit:contain;" />` : '';
    const co = branding?.companyName ?? '';
    const qs = quotes.map((q, i) => `<tr><td>${i + 1}</td><td>${q.supplierName}</td><td>${q.amountSar}</td><td>${q.slotNo ?? ''}</td></tr>`).join('');
    const trail = approvals.map((a) => `<tr><td>${a.stage}</td><td>${a.decision}</td><td>${a.note ?? ''}</td></tr>`).join('');
    const title = kind === 'request' ? 'مستند طلب شراء' : 'مستند أمر شراء';
    const chosen = quotes.find((q) => q.id === sel.chosenQuoteId);
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} - ${sel.itemName}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma;padding:28px;color:#111}.head{display:flex;align-items:center;gap:14px;margin-bottom:6px}h1{font-size:22px}.sub{font-size:12px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th{background:#0f172a;color:#fff;padding:6px 8px;text-align:right}td{padding:5px 8px;border-bottom:1px solid #ddd}h2{font-size:15px;margin:14px 0 4px}.foot{margin-top:18px;font-size:11px;color:#555;display:flex;gap:40px}.sig{border-top:1px solid #999;padding-top:4px;min-width:140px;text-align:center}@media print{body{padding:10mm}}</style></head><body>
    <div class="head">${logo}<div><div style="font-size:18px;font-weight:800;">${co}</div><h1>${title}</h1></div></div>
    <div class="sub">التاريخ: ${new Date().toISOString().slice(0, 10)} · الحالة: ${sel.status}</div>
    <h2>بيانات الطلب</h2>
    <table><tr><th>الصنف</th><td>${sel.itemCode ? `[${sel.itemCode}] ` : ''}${sel.itemName}</td><th>الكمية</th><td>${sel.quantity} ${sel.unit ?? ''}</td></tr>
    <tr><th>المركبة</th><td>${sel.vehicleCode ? `${sel.vehicleCode}${sel.plateNumber ? ` · ${sel.plateNumber}` : ''}` : '—'}</td><th>مرجع الورشة</th><td>${sel.workshopRef ?? '—'}</td></tr>
    <tr><th>سبب الطلب</th><td colspan="3">${sel.reason ?? '—'}</td></tr>
    ${kind === 'order' ? `<tr><th>المبلغ المصروف</th><td>${sel.disbursedSar ?? '—'} ر.س</td><th>العرض الفائز</th><td>${chosen ? `${chosen.supplierName} (${chosen.amountSar})` : '—'}</td></tr>` : ''}
    </table>
    <h2>عروض الأسعار (3)</h2>
    <table><thead><tr><th>#</th><th>المورد</th><th>المبلغ</th><th>الخانة</th></tr></thead><tbody>${qs || '<tr><td colspan=4>—</td></tr>'}</tbody></table>
    <h2>ملاحظات الاعتمادات</h2>
    <table><thead><tr><th>المرحلة</th><th>القرار</th><th>ملاحظة</th></tr></thead><tbody>${trail || '<tr><td colspan=3>—</td></tr>'}</tbody></table>
    <div class="foot"><div class="sig">توقيع المراجع</div><div class="sig">توقيع مدير المشتريات</div><div class="sig">توقيع المستلم</div></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
  };

  const attachFile = async (file: File | undefined) => {
    if (!sel || !file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMsg('❌ الملف أكبر من 8MB');
      return;
    }
    if (!/pdf|image/i.test(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setMsg('❌ PDF أو صور فقط');
      return;
    }
    setUploadingAtt(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api.post(`/api/procure/requests/${sel.id}/attachments`, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        fileData: dataUrl.startsWith('data:') ? dataUrl : `data:${file.type};base64,${dataUrl}`,
      });
      setMsg('✅ تم إرفاق الملف');
      await loadDetail(sel.id);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    } finally {
      setUploadingAtt(false);
    }
  };

  const delAttach = async (id: string) => {
    if (!window.confirm('حذف المرفق؟')) return;
    try {
      await api.del(`/api/procure/requests/x/attachments?id=${id}`);
      setMsg('✅ تم الحذف');
      if (sel) await loadDetail(sel.id);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    load();
  }, [currentUser, load]);

  const act = async (fn: () => Promise<any>, ok: string, tag: string) => {
    setBusy(tag);
    setMsg('');
    try {
      await fn();
      setMsg(`✅ ${ok}`);
      await load();
      if (sel) await loadDetail(sel.id);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    } finally {
      setBusy('');
    }
  };

  const createReq = () =>
    act(async () => {
      if (!form.itemName.trim() || !form.quantity.trim()) throw new Error(ar ? 'الصنف والكمية مطلوبة' : 'required');
      await api.post('/api/procure/requests', {
        itemName: form.itemName.trim(),
        ...(form.itemCode.trim() ? { itemCode: form.itemCode.trim() } : {}),
        ...(form.vehicleId ? { vehicleId: form.vehicleId } : {}),
        quantity: Number(form.quantity),
        unit: form.unit.trim() || undefined,
        reason: form.reason.trim() || undefined,
        workshopRef: form.workshopRef.trim() || undefined,
      });
      setForm({ itemName: '', itemCode: '', vehicleId: '', quantity: '', unit: '', reason: '', workshopRef: '' });
      setShowNew(false);
    }, ar ? 'تم إنشاء الطلب' : 'Created', 'new');

  const attachQuote = async () => {
    if (!sel || !quoteForm.supplierName.trim() || !quoteForm.amountSar.trim()) {
      setMsg(ar ? '❌ المورد والمبلغ مطلوبان' : 'required');
      return;
    }
    const file = quoteFile;
    setUploading(true);
    try {
      let storageUrl: string | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;
      let sizeBytes: number | undefined;
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error(ar ? 'الملف أكبر من 8MB' : 'too big');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        storageUrl = dataUrl.startsWith('data:') ? dataUrl : `data:${file.type};base64,${dataUrl}`;
        fileName = file.name;
        mimeType = file.type || 'application/octet-stream';
        sizeBytes = file.size;
      }
      await api.post(`/api/procure/requests/${sel.id}/quotes`, {
        supplierName: quoteForm.supplierName.trim(),
        amountSar: Number(quoteForm.amountSar),
        slotNo: quoteSlot,
        fileName, mimeType, sizeBytes, storageUrl,
      });
      setQuoteForm({ supplierName: '', amountSar: '' });
      setMsg('✅ تم إرفاق العرض');
      await loadDetail(sel.id);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? 'فشل'}`);
    } finally {
      setUploading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080C14] text-slate-200 flex items-center justify-center p-6 text-center">
        <p>{ar ? 'سجل الدخول أولاً.' : 'Log in first.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-200" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-xl sm:text-2xl font-black text-white">🧾 {ar ? 'إدارة المشتريات' : 'Procurement'}</h1>
        <p className="text-xs text-slate-500 mt-1">{ar ? 'طلب الورشة ← 3 عروض ← مراجعة ← اعتماد وصرف ← مخزن ← صرف للورشة ← QR' : 'Workshop → quotes → review → approve → warehouse → workshop → QR'}</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">🏠</Link>
          <QuickJump />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {['ALL', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RECEIVED', 'ISSUED', 'CLOSED', 'REJECTED'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[11px] font-black rounded-lg px-3 py-1.5 border ${filter === f ? 'bg-white text-black border-white' : 'text-slate-400 border-white/10'}`}>
              {f === 'ALL' ? (ar ? 'الكل' : 'All') : (STATUS_AR[f] ?? f)}
            </button>
          ))}
          <button onClick={() => setShowNew((v) => !v)}
            className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300">
            ➕ {ar ? 'طلب شراء' : 'New request'}
          </button>
        </div>

        {msg && <p className="text-xs font-bold text-slate-200 mt-3">{msg}</p>}

        {showNew && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الصنف * (ابحث بالكود أو الاسم)' : 'Item * (search code/name)'}
                <input value={form.itemName} list="proc-reg-items"
                  onChange={(e) => {
                    const v = e.target.value;
                    const hit = regItems.find((it: any) =>
                      v === (it.itemCode ?? it.code) || v === (it.name ?? it.itemName) ||
                      v === `${it.itemCode ?? it.code} · ${it.name ?? it.itemName}`);
                    setForm({
                      ...form,
                      itemName: hit ? (hit.name ?? hit.itemName ?? v) : v,
                      itemCode: hit ? (hit.itemCode ?? hit.code ?? '') : (/^[A-Za-z0-9-]+$/.test(v.trim()) ? v.trim() : form.itemCode),
                      unit: hit?.unit && !form.unit ? (hit.unit ?? '') : form.unit,
                    });
                  }}
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" />
                <datalist id="proc-reg-items">
                  {regItems.slice(0, 200).map((it: any, i: number) => (
                    <option key={it.id ?? i} value={`${it.itemCode ?? it.code} · ${it.name ?? it.itemName}`} />
                  ))}
                </datalist></label>
              {form.itemCode ? (
                <p className="-mt-1 text-[10px] text-emerald-300 font-black">🔖 {ar ? 'كود الصنف' : 'Code'}: <span dir="ltr">{form.itemCode}</span></p>
              ) : null}
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'المركبة (رقم/كود)' : 'Vehicle'}
                <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
                  <option value="">—</option>
                  {fleetList.map((v: any) => (
                    <option key={v.id ?? v.vehicleId} value={v.id ?? v.vehicleId}>
                      {v.vehicleCode ?? v.code} · {v.plateNumber ?? v.plate}
                    </option>
                  ))}
                </select></label>
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الكمية *' : 'Qty *'}
                <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} inputMode="decimal"
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الوحدة' : 'Unit'}
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'سبب الطلب (الورشة)' : 'Reason'}
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'مرجع الورشة' : 'Workshop ref'}
                <input value={form.workshopRef} onChange={(e) => setForm({ ...form, workshopRef: e.target.value })}
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
            </div>
            <button disabled={busy === 'new'} onClick={createReq}
              className="mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-black rounded-lg px-6 py-2">
              {busy === 'new' ? '…' : `✅ ${ar ? 'إنشاء' : 'Create'}`}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-3 mt-4">
          <div className="space-y-2">
            {requests.length === 0 && <p className="text-xs text-slate-500">{ar ? 'لا طلبات.' : 'None.'}</p>}
            {requests.map((r) => (
              <button key={r.id} onClick={() => loadDetail(r.id)}
                className={`w-full text-right rounded-xl border px-3 py-2 text-xs ${sel?.id === r.id ? 'border-sky-500/60 bg-sky-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-black text-white">
                    {r.itemCode ? <span dir="ltr" className="text-emerald-300">[{r.itemCode}] </span> : ''}{r.itemName} · {r.quantity} {r.unit}
                    {r.vehicleCode ? <span className="text-sky-300"> · 🚛 {r.vehicleCode}</span> : ''}
                  </span>
                  <span className="text-[10px] font-black rounded px-2 py-0.5 bg-white/10 text-slate-300">{STATUS_AR[r.status] ?? r.status}</span>
                </div>
                <p className="text-slate-500 text-[10px] mt-0.5">{ar ? 'العروض' : 'Quotes'}: {r.quotes}/3</p>
              </button>
            ))}
          </div>

          <div>
            {!sel && <p className="text-xs text-slate-500">{ar ? 'اختر طلباً للتفاصيل.' : 'Select a request.'}</p>}
            {sel && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-white">
                    {sel.itemCode ? <span dir="ltr" className="text-emerald-300">[{sel.itemCode}] </span> : ''}{sel.itemName}
                  </h3>
                  <span className="text-[10px] font-black rounded px-2 py-0.5 bg-sky-500/15 text-sky-300">{STATUS_AR[sel.status] ?? sel.status}</span>
                </div>
                {sel.vehicleCode && (
                  <p className="text-[11px] text-sky-300 font-black">🚛 {sel.vehicleCode}{sel.plateNumber ? ` · ${sel.plateNumber}` : ''}</p>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-[11px] font-black text-slate-300">{ar ? 'العروض (3 خانات)' : 'Quotes'}</h4>
                    <span className="flex gap-1">
                      <button onClick={() => printDoc('request')} className="text-[10px] font-black rounded px-2 py-1 border border-white/15 text-slate-200">🖨️ {ar ? 'مستند طلب' : 'Request'}</button>
                      <button onClick={() => printDoc('order')} className="text-[10px] font-black rounded px-2 py-1 border border-white/15 text-slate-200">🖨️ {ar ? 'مستند أمر' : 'Order'}</button>
                    </span>
                  </div>
                  {[1, 2, 3].map((slot) => {
                    const q = quotes.find((x) => Number(x.slotNo) === slot);
                    return (
                      <div key={slot} className="rounded-lg border border-white/10 bg-white/[0.02] p-2 mb-1.5">
                        <p className="text-[10px] font-black text-slate-400 mb-1">{ar ? `العرض ${slot}` : `Quote ${slot}`}</p>
                        {q ? (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-200 font-bold">{q.supplierName} · {q.amountSar} {ar ? 'ر.س' : 'SAR'}</span>
                            {q.storageUrl && <a href={q.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇</a>}
                          </div>
                        ) : sel.status === 'DRAFT' ? (
                          <p className="text-[10px] text-slate-500">{ar ? 'فارغة — ارفع من الأسفل برقم الخانة' : 'Empty'}</p>
                        ) : (
                          <p className="text-[10px] text-slate-500">—</p>
                        )}
                      </div>
                    );
                  })}
                  {sel.status === 'DRAFT' && (
                    <div className="grid grid-cols-3 gap-1 mt-2">
                      <div className="flex gap-1 col-span-3">
                        {[1, 2, 3].map((s) => (
                          <button key={s} onClick={() => setQuoteSlot(s as 1 | 2 | 3)}
                            className={`flex-1 text-[11px] font-black rounded-lg px-2 py-1.5 border ${quoteSlot === s ? 'bg-sky-500 text-white border-sky-400' : 'text-slate-400 border-white/10'}`}>
                            {ar ? `خانة ${s}` : `Slot ${s}`}
                          </button>
                        ))}
                      </div>
                      <input value={quoteForm.supplierName} onChange={(e) => setQuoteForm({ ...quoteForm, supplierName: e.target.value })}
                        placeholder={ar ? 'المورد *' : 'Supplier *'}
                        className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
                      <input value={quoteForm.amountSar} onChange={(e) => setQuoteForm({ ...quoteForm, amountSar: e.target.value })} inputMode="decimal"
                        placeholder={ar ? 'المبلغ *' : 'Amount *'}
                        className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
                      <label className="col-span-2 text-[11px] font-black rounded-lg px-2 py-1.5 border border-white/15 text-slate-300 cursor-pointer text-center">
                        📎 {uploading ? '…' : quoteFile ? quoteFile.name : (ar ? 'فاتورة PDF/صورة' : 'Invoice file')}
                        <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploading}
                          onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; setQuoteFile(f); }} />
                      </label>
                      <button disabled={uploading} onClick={async () => { await attachQuote(); setQuoteFile(null); }}
                        className="col-span-2 text-[11px] font-black rounded-lg px-2 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300">
                        ➕ {ar ? 'إرفاق العرض' : 'Attach'}
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-[11px] font-black text-slate-300 mb-1">{ar ? '📎 مرفقات الطلب (PDF)' : 'Attachments'}</h4>
                  {attachs.map((a, i) => (
                    <div key={a.id ?? i} className="flex items-center justify-between text-[11px] border-b border-white/5 py-1">
                      <span className="text-slate-200 font-bold truncate">{a.fileName}</span>
                      <span className="flex gap-2 shrink-0">
                        <a href={a.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇</a>
                        <button onClick={() => delAttach(a.id)} className="text-red-400 font-black">✕</button>
                      </span>
                    </div>
                  ))}
                  <label className="block mt-1 text-[11px] font-black rounded-lg px-2 py-1.5 border border-white/15 text-slate-300 cursor-pointer text-center">
                    📎 {uploadingAtt ? '…' : (ar ? 'إرفاق PDF/صورة' : 'Attach')}
                    <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploadingAtt}
                      onChange={(e) => { attachFile(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>

                {sel.status === 'DRAFT' && (
                  <button disabled={busy === 'sub'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/submit`, {}), ar ? 'أُرسل للمراجعة' : 'Submitted', 'sub')}
                    className="w-full text-[11px] font-black rounded-lg px-2 py-2 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                    {busy === 'sub' ? '…' : (ar ? 'إرسال للمراجعة (3 عروض)' : 'Submit')}
                  </button>
                )}
                {sel.status === 'SUBMITTED' && (
                  <div className="flex gap-1">
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={ar ? 'ملاحظة المراجعة' : 'Note'}
                      className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
                    <button disabled={busy === 'rev'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/review`, { decision: 'APPROVED', note: note || undefined }), ar ? 'اعتماد المراجعة' : 'OK', 'rev')}
                      className="text-[11px] font-black rounded-lg px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">✓</button>
                    <button disabled={busy === 'rev'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/review`, { decision: 'REJECTED', note: note || undefined }), ar ? 'مرفوض' : 'No', 'rev')}
                      className="text-[11px] font-black rounded-lg px-3 py-1.5 bg-red-500/15 border border-red-500/40 text-red-300 disabled:opacity-50">✕</button>
                  </div>
                )}
                {sel.status === 'UNDER_REVIEW' && (
                  <div className="space-y-1">
                    <select value={quotePick} onChange={(e) => setQuotePick(e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none">
                      <option value="">{ar ? 'العرض الفائز (اختياري)' : 'Winning quote'}</option>
                      {quotes.map((q) => <option key={q.id} value={q.id}>{q.supplierName} · {q.amountSar}</option>)}
                    </select>
                    <div className="flex gap-1">
                      <input value={disbursed} onChange={(e) => setDisbursed(e.target.value)} inputMode="decimal" placeholder={ar ? 'المبلغ المصروف' : 'Disbursed'}
                        className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
                      <button disabled={busy === 'app'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/approve`, { decision: 'APPROVED', quoteId: quotePick || undefined, disbursedSar: disbursed ? Number(disbursed) : undefined }), ar ? 'اعتماد نهائي' : 'Approve', 'app')}
                        className="text-[11px] font-black rounded-lg px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 disabled:opacity-50">✓</button>
                      <button disabled={busy === 'app'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/approve`, { decision: 'REJECTED' }), ar ? 'رفض' : 'No', 'app')}
                        className="text-[11px] font-black rounded-lg px-3 py-1.5 bg-red-500/15 border border-red-500/40 text-red-300 disabled:opacity-50">✕</button>
                    </div>
                  </div>
                )}
                {sel.status === 'APPROVED' && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500">{ar ? 'بعد إدخال الصنف وحركة الدخول بالمخزن:' : 'After warehouse entry:'}</p>
                    <div className="grid grid-cols-2 gap-1">
                      <input value={recvForm.itemCode} onChange={(e) => setRecvForm({ ...recvForm, itemCode: e.target.value })}
                        placeholder={ar ? 'كود الصنف' : 'Item code'}
                        className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
                      <input value={recvForm.qty} onChange={(e) => setRecvForm({ ...recvForm, qty: e.target.value })} inputMode="decimal"
                        placeholder={ar ? 'الكمية' : 'Qty'}
                        className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
                    </div>
                    <button disabled={busy === 'recv'} onClick={() => act(async () => {
                      if (!recvForm.itemCode.trim() || !recvForm.qty.trim()) throw new Error(ar ? 'الكود والكمية مطلوبة' : 'required');
                      await api.post(`/api/procure/requests/${sel.id}/receive`, {});
                    }, ar ? 'تم الاستلام' : 'Received', 'recv')}
                      className="w-full text-[11px] font-black rounded-lg px-2 py-2 border border-sky-500/50 bg-sky-500/15 text-sky-300 disabled:opacity-50">
                      {busy === 'recv' ? '…' : (ar ? 'تأكيد الاستلام بالمخزن' : 'Confirm receipt')}
                    </button>
                  </div>
                )}
                {sel.status === 'RECEIVED' && (
                  <button disabled={busy === 'iss'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/issue`, {}), ar ? 'تم الصرف للورشة' : 'Issued', 'iss')}
                    className="w-full text-[11px] font-black rounded-lg px-2 py-2 border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 disabled:opacity-50">
                    {busy === 'iss' ? '…' : (ar ? 'صرف للورشة' : 'Issue to workshop')}
                  </button>
                )}
                {sel.status === 'ISSUED' && (
                  <button disabled={busy === 'cls'} onClick={() => act(() => api.post(`/api/procure/requests/${sel.id}/close`, {}), ar ? 'أُغلق' : 'Closed', 'cls')}
                    className="w-full text-[11px] font-black rounded-lg px-2 py-2 border border-white/15 text-slate-300 disabled:opacity-50">
                    {busy === 'cls' ? '…' : (ar ? 'إغلاق الطلب' : 'Close')}
                  </button>
                )}

                {approvals.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-500 mb-1">{ar ? 'سجل الاعتمادات' : 'Trail'}</h4>
                    {approvals.map((a, i) => (
                      <p key={a.id ?? i} className="text-[10px] text-slate-400">{a.stage} · {a.decision}{a.note ? ` · ${a.note}` : ''}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
