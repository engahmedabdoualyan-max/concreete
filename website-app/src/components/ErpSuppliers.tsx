/**
 * ============================================================
 *  FIMTO SOFT — ERP Suppliers & Purchase Orders (الموردون والمشتريات)
 * ============================================================
 *  Suppliers, purchase orders with line items, PO receiving
 *  (auto-credits silo stock) and supplier payments — all via the
 *  ERP PostgreSQL backend.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  vatNumber: string | null;
  address: string | null;
}

interface Silo {
  id: string;
  siloName: string;
  siloCode: string;
  materialCategory: string;
}

interface POItem {
  id?: string;
  siloId: string | null;
  materialCategory: string;
  materialName: string;
  quantityKg: string;
  ratePerKgSar: string;
  lineTotalSar?: number;
}

interface PO {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  dueDate: string | null;
  subtotalSar: number;
  vatPercent: number;
  vatAmountSar: number;
  transportCostSar: number;
  totalAmountSar: number;
  paidAmountSar: number;
  status: string;
  notes: string | null;
  inventoryUpdated: boolean;
  balanceSar: number;
  paymentStatus: string;
  items: POItem[];
  payments: { id: string; amountSar: number; paymentDate: string; paymentMode: string; referenceNumber: string | null }[];
}

interface SuppliersData {
  suppliers: Supplier[];
  summary: { supplierCount: number; totalPayableSar: number; totalOrderedSar: number; openPoCount: number };
}

interface POsData { purchaseOrders: PO[] }

interface InventoryData { silos: Silo[] }

const CAT_LABEL: Record<string, string> = {
  CEMENT: 'أسمنت', SAND: 'رمل', GRAVEL_10MM: 'ركام 10مم', GRAVEL_20MM: 'ركام 20مم',
  GRAVEL_40MM: 'ركام 40مم', WATER: 'ماء', ADMIXTURE_PLASTICIZER: 'إضافات ملدنة',
  ADMIXTURE_RETARDER: 'إضافات مثبطة', ADMIXTURE_ACCELERATOR: 'إضافات مسرعة',
  FLY_ASH: 'رماد متطاير', SILICA_FUME: 'غبار سيليكا', STEEL_FIBER: 'ألياف فولاذية',
  POLYPROPYLENE_FIBER: 'ألياف بروبلين',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة', ORDERED: 'تم الطلب', PARTIAL_RECEIVED: 'استلام جزئي', RECEIVED: 'مستلم', CANCELLED: 'ملغي',
};

const PAY_STATUS_LABEL: Record<string, string> = {
  PAID: 'مسدد', PARTIAL: 'جزئي', PENDING: 'غير مسدد',
};

const PAY_MODE_LABEL: Record<string, string> = {
  CASH: 'نقدي', CHEQUE: 'شيك', BANK: 'تحويل بنكي', CREDIT: 'آجل', UPI: 'UPI', OTHER: 'أخرى',
};

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ErpSuppliers() {
  const [tab, setTab] = useState<'suppliers' | 'pos'>('suppliers');
  const [supData, setSupData] = useState<SuppliersData | null>(null);
  const [poData, setPoData] = useState<POsData | null>(null);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showNewPO, setShowNewPO] = useState(false);
  const [payFor, setPayFor] = useState<PO | null>(null);
  const [supForm, setSupForm] = useState({ name: '', contactPerson: '', phone: '', email: '', vatNumber: '', address: '' });
  const [poForm, setPoForm] = useState({ supplierId: '', purchaseDate: new Date().toISOString().slice(0, 10), vatPercent: '15', transportCostSar: '', notes: '', items: [] as { siloId: string; materialName: string; quantityKg: string; ratePerKgSar: string }[] });
  const [payForm, setPayForm] = useState({ amountSar: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMode: 'BANK', referenceNumber: '' });

  const loadAll = () => {
    setError('');
    api.get<SuppliersData>('/api/suppliers').then(setSupData).catch((e: any) => setError(e?.message || 'تعذر تحميل الموردين'));
    api.get<POsData>('/api/suppliers/purchase-orders').then(setPoData).catch((e: any) => setError(e?.message || 'تعذر تحميل أوامر الشراء'));
    api.get<InventoryData>('/api/inventory').then(d => setSilos(d.silos.map(s => ({ id: s.id, siloName: s.siloName, siloCode: s.siloCode, materialCategory: s.materialCategory })))).catch(() => {});
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(loadAll, []);

  const addSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/suppliers', supForm);
      setSupForm({ name: '', contactPerson: '', phone: '', email: '', vatNumber: '', address: '' });
      setShowAdd(false);
      loadAll();
    } catch (e: any) {
      setError(e?.message || 'فشل إضافة المورد');
    } finally {
      setBusy(false);
    }
  };

  const addItemRow = () => {
    setPoForm({
      ...poForm,
      items: [...poForm.items, { siloId: silos[0]?.id ?? '', materialName: '', quantityKg: '', ratePerKgSar: '' }],
    });
  };

  const updateItem = (idx: number, field: string, value: string) => {
    const items = poForm.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it));
    setPoForm({ ...poForm, items });
  };

  const createPO = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const items = poForm.items.map(it => {
      const silo = silos.find(s => s.id === it.siloId);
      const rate = Math.round((Number(it.ratePerKgSar) || 0) * 100);
      return {
        siloId: it.siloId || null,
        materialCategory: silo?.materialCategory ?? 'CEMENT',
        materialName: it.materialName || silo?.siloName || 'خامة',
        quantityKg: Number(it.quantityKg),
        ratePerKgSar: rate,
      };
    }).filter(i => i.quantityKg > 0);
    try {
      await api.post('/api/suppliers/purchase-orders', {
        supplierId: poForm.supplierId,
        purchaseDate: new Date(poForm.purchaseDate).toISOString(),
        vatPercent: Number(poForm.vatPercent) || 15,
        transportCostSar: Math.round((Number(poForm.transportCostSar) || 0) * 100),
        notes: poForm.notes || null,
        items,
      });
      setShowNewPO(false);
      setPoForm({ supplierId: '', purchaseDate: new Date().toISOString().slice(0, 10), vatPercent: '15', transportCostSar: '', notes: '', items: [] });
      loadAll();
    } catch (e: any) {
      setError(e?.message || 'فشل إنشاء أمر الشراء');
    } finally {
      setBusy(false);
    }
  };

  const receivePO = async (po: PO) => {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/suppliers/purchase-orders/receive', { poId: po.id });
      loadAll();
    } catch (e: any) {
      setError(e?.message || 'فشل استلام الأمر');
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payFor) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/suppliers/payments', {
        supplierId: payFor.supplierId,
        purchaseOrderId: payFor.id,
        amountSar: Math.round((Number(payForm.amountSar) || 0) * 100),
        paymentDate: new Date(payForm.paymentDate).toISOString(),
        paymentMode: payForm.paymentMode,
        referenceNumber: payForm.referenceNumber || null,
      });
      setPayFor(null);
      loadAll();
    } catch (e: any) {
      setError(e?.message || 'فشل تسجيل الدفعة');
    } finally {
      setBusy(false);
    }
  };

  const s = supData?.summary;

  return (
    <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🏭</span> الموردون وأوامر الشراء
        </h3>
        <div className="flex gap-2">
          <ExportButtons
            filename={tab === 'suppliers' ? 'الموردون' : 'أوامر_الشراء'}
            title={tab === 'suppliers' ? 'سجل الموردين' : 'سجل أوامر الشراء'}
            columns={
              tab === 'suppliers'
                ? [
                    { header: 'اسم المورد', key: 'name' },
                    { header: 'جهة الاتصال', key: 'contact' },
                    { header: 'الرقم الضريبي', key: 'vat' },
                    { header: 'الهاتف', key: 'phone' },
                    { header: 'العنوان', key: 'address' },
                  ]
                : [
                    { header: 'رقم الأمر', key: 'po' },
                    { header: 'المورد', key: 'supplier' },
                    { header: 'التاريخ', key: 'date' },
                    { header: 'الإجمالي', key: 'total' },
                    { header: 'المدفوع', key: 'paid' },
                    { header: 'الحالة', key: 'status' },
                  ]
            }
            rows={
              tab === 'suppliers'
                ? (supData?.suppliers ?? []).map(x => ({
                    name: x.name,
                    contact: x.contactPerson ?? '-',
                    vat: x.vatNumber ?? '-',
                    phone: x.phone ?? '-',
                    address: x.address ?? '-',
                  }))
                : (poData?.purchaseOrders ?? []).map(x => ({
                    po: x.poNumber,
                    supplier: x.supplierName,
                    date: new Date(x.purchaseDate).toLocaleDateString(),
                    total: `${fmtSar(x.totalAmountSar)} ر.س`,
                    paid: `${fmtSar(x.paidAmountSar)} ر.س`,
                    status: STATUS_LABEL[x.status] ?? x.status,
                  }))
            }
          />
          <div className="flex bg-white/[0.04] border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setTab('suppliers')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'suppliers' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>🏢 الموردون</button>
            <button onClick={() => setTab('pos')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'pos' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>📦 أوامر الشراء</button>
          </div>
          <button onClick={() => { tab === 'suppliers' ? setShowAdd(v => !v) : setShowNewPO(v => !v); }} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">
            {tab === 'suppliers' ? (showAdd ? 'إغلاق' : '➕ مورد جديد') : (showNewPO ? 'إغلاق' : '➕ أمر شراء')}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-white">{s?.supplierCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">موردون</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-red-300">{fmtSar(s?.totalPayableSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">مستحقات للموردين (ر.س)</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-sky-300">{fmtSar(s?.totalOrderedSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">قيمة المشتريات (ر.س)</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-amber-300">{s?.openPoCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">أوامر شراء مفتوحة</div>
        </div>
      </div>

      {/* ── Suppliers tab ── */}
      {tab === 'suppliers' && (
        <>
          {showAdd && (
            <form onSubmit={addSupplier} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <input value={supForm.name} onChange={e => setSupForm({ ...supForm, name: e.target.value })} placeholder="اسم المورد *" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <input value={supForm.phone} onChange={e => setSupForm({ ...supForm, phone: e.target.value })} placeholder="الهاتف *" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <input value={supForm.contactPerson} onChange={e => setSupForm({ ...supForm, contactPerson: e.target.value })} placeholder="جهة الاتصال" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.email} onChange={e => setSupForm({ ...supForm, email: e.target.value })} placeholder="البريد" type="email" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.vatNumber} onChange={e => setSupForm({ ...supForm, vatNumber: e.target.value })} placeholder="الرقم الضريبي" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.address} onChange={e => setSupForm({ ...supForm, address: e.target.value })} placeholder="العنوان" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2 md:col-span-3" />
              <button type="submit" disabled={busy} className="col-span-2 md:col-span-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">💾 حفظ المورد</button>
            </form>
          )}

          {(supData?.suppliers ?? []).length === 0 && <div className="text-xs text-slate-500 text-center py-4">لا توجد موردون</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {(supData?.suppliers ?? []).map(sup => (
              <div key={sup.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                <div className="text-xs font-bold text-white">{sup.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">📞 {sup.phone}{sup.email ? ` · ${sup.email}` : ''}</div>
                {sup.contactPerson && <div className="text-[10px] text-slate-500">👤 {sup.contactPerson}</div>}
                {sup.vatNumber && <div className="text-[10px] text-slate-500 font-mono">الرقم الضريبي: {sup.vatNumber}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── POs tab ── */}
      {tab === 'pos' && (
        <>
          {showNewPO && (
            <form onSubmit={createPO} className="mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <select value={poForm.supplierId} onChange={e => setPoForm({ ...poForm, supplierId: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required>
                  <option value="">المورد *</option>
                  {(supData?.suppliers ?? []).map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                </select>
                <input type="date" value={poForm.purchaseDate} onChange={e => setPoForm({ ...poForm, purchaseDate: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                <input type="number" value={poForm.vatPercent} onChange={e => setPoForm({ ...poForm, vatPercent: e.target.value })} placeholder="الضريبة %" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                <input type="number" step="0.01" value={poForm.transportCostSar} onChange={e => setPoForm({ ...poForm, transportCostSar: e.target.value })} placeholder="تكلفة النقل (ر.س)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>

              <div className="text-[11px] font-bold text-slate-300 mb-2">البنود — الكمية بالكجم والسعر ريال/كجم</div>
              <div className="space-y-2 mb-2">
                {poForm.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <select value={it.siloId} onChange={e => updateItem(i, 'siloId', e.target.value)} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                      <option value="">المادة / الصومعة</option>
                      {silos.map(s => <option key={s.id} value={s.id}>{s.siloName} ({CAT_LABEL[s.materialCategory]})</option>)}
                    </select>
                    <input value={it.materialName} onChange={e => updateItem(i, 'materialName', e.target.value)} placeholder="اسم المادة" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                    <input type="number" step="0.01" value={it.quantityKg} onChange={e => updateItem(i, 'quantityKg', e.target.value)} placeholder="الكمية (كجم)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                    <div className="flex gap-2">
                      <input type="number" step="0.01" value={it.ratePerKgSar} onChange={e => updateItem(i, 'ratePerKgSar', e.target.value)} placeholder="السعر (ر.س/كجم)" className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                      <button type="button" onClick={() => setPoForm({ ...poForm, items: poForm.items.filter((_, j) => j !== i) })} className="text-red-400 text-sm px-2">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addItemRow} className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded px-2 py-1">➕ بند</button>
                <button type="submit" disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">💾 إنشاء أمر الشراء</button>
              </div>
            </form>
          )}

          {(poData?.purchaseOrders ?? []).length === 0 && <div className="text-xs text-slate-500 text-center py-4">لا توجد أوامر شراء</div>}
          <div className="space-y-2">
            {(poData?.purchaseOrders ?? []).map(po => (
              <div key={po.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      {po.poNumber} — {po.supplierName}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300">{STATUS_LABEL[po.status] ?? po.status}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${po.paymentStatus === 'PAID' ? 'bg-emerald-500/20 text-emerald-300' : po.paymentStatus === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-200' : 'bg-red-500/20 text-red-300'}`}>
                        {PAY_STATUS_LABEL[po.paymentStatus] ?? po.paymentStatus}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{new Date(po.purchaseDate).toLocaleDateString()}{po.dueDate ? ` · استحقاق ${new Date(po.dueDate).toLocaleDateString()}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-white">{fmtSar(po.totalAmountSar)} ر.س</div>
                    <div className="text-[10px] text-slate-400">متبقي: <span className="text-red-300 font-bold">{fmtSar(po.balanceSar)}</span></div>
                  </div>
                </div>

                {po.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {po.items.map(it => (
                      <span key={it.id ?? it.materialName + it.quantityKg} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                        {it.materialName}: {Number(it.quantityKg).toLocaleString()} كجم
                      </span>
                    ))}
                  </div>
                )}
                {po.payments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {po.payments.map(p => (
                      <span key={p.id} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        دفعة {fmtSar(p.amountSar)} ر.س · {new Date(p.paymentDate).toLocaleDateString()} · {PAY_MODE_LABEL[p.paymentMode] ?? p.paymentMode}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  {!po.inventoryUpdated && po.status !== 'CANCELLED' && (
                    <button onClick={() => receivePO(po)} disabled={busy} className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded px-2 py-1 hover:bg-sky-500/30">📦 استلام وتحديث المخزون</button>
                  )}
                  {po.balanceSar > 0 && po.status !== 'CANCELLED' && (
                    <button onClick={() => setPayFor(po)} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">💳 تسجيل دفعة</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Payment modal */}
      {payFor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 w-full max-w-sm">
            <h4 className="text-sm font-bold text-white mb-1">💳 دفعة مورد — {payFor.poNumber}</h4>
            <p className="text-[11px] text-slate-400 mb-4">المتبقي {fmtSar(payFor.balanceSar)} ر.س</p>
            <form onSubmit={recordPayment} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">المبلغ (ر.س) *</label>
                <input type="number" step="0.01" value={payForm.amountSar} onChange={e => setPayForm({ ...payForm, amountSar: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">تاريخ الدفع</label>
                <input type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">طريقة الدفع</label>
                <select value={payForm.paymentMode} onChange={e => setPayForm({ ...payForm, paymentMode: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                  {Object.keys(PAY_MODE_LABEL).map(m => <option key={m} value={m}>{PAY_MODE_LABEL[m]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">رقم العملية / الشيك</label>
                <input value={payForm.referenceNumber} onChange={e => setPayForm({ ...payForm, referenceNumber: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs disabled:opacity-40">💾 تأكيد الدفعة</button>
                <button type="button" onClick={() => setPayFor(null)} className="px-4 border border-white/20 text-slate-300 rounded-lg text-xs">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
