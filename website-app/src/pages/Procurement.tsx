import { useCallback, useEffect, useState } from 'react';
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
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ itemName: '', quantity: '', unit: '', reason: '', workshopRef: '' });
  const [quoteForm, setQuoteForm] = useState({ supplierName: '', amountSar: '' });
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
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
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api.get<{ request?: any; quotes?: any[]; approvals?: any[] }>(`/api/procure/requests/${id}/detail`);
      setSel(d?.request ?? null);
      setQuotes(Array.isArray(d?.quotes) ? d.quotes : []);
      setApprovals(Array.isArray(d?.approvals) ? d.approvals : []);
    } catch (e: any) {
      setMsg(`❌ ${e?.message ?? ''}`);
    }
  }, []);

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
        quantity: Number(form.quantity),
        unit: form.unit.trim() || undefined,
        reason: form.reason.trim() || undefined,
        workshopRef: form.workshopRef.trim() || undefined,
      });
      setForm({ itemName: '', quantity: '', unit: '', reason: '', workshopRef: '' });
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
              <label className="text-[11px] text-slate-400 font-bold">{ar ? 'الصنف *' : 'Item *'}
                <input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                  className="mt-0.5 w-full bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none" /></label>
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
                  <span className="font-black text-white">{r.itemName} · {r.quantity} {r.unit}</span>
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
                  <h3 className="text-sm font-black text-white">{sel.itemName}</h3>
                  <span className="text-[10px] font-black rounded px-2 py-0.5 bg-sky-500/15 text-sky-300">{STATUS_AR[sel.status] ?? sel.status}</span>
                </div>

                <div>
                  <h4 className="text-[11px] font-black text-slate-300 mb-1">{ar ? 'العروض' : 'Quotes'} ({quotes.length}/3)</h4>
                  {quotes.map((q, i) => (
                    <div key={q.id ?? i} className="flex items-center justify-between text-[11px] border-b border-white/5 py-1">
                      <span className="text-slate-200 font-bold">{q.supplierName} · {q.amountSar} {ar ? 'ر.س' : 'SAR'}</span>
                      {q.storageUrl && <a href={q.storageUrl} target="_blank" rel="noreferrer" className="text-sky-400 font-black">⬇</a>}
                    </div>
                  ))}
                  {sel.status === 'DRAFT' && (
                    <div className="grid grid-cols-2 gap-1 mt-2">
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
