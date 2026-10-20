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
import { useErpDict } from '../i18n/erpDict';
import { useTenant } from '../hooks/useTenant';

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  vatNumber: string | null;
  /** السجل التجاري */
  crNumber?: string | null;
  /** شروط الدفع المتفق عليها */
  paymentTerms?: string | null;
  /** آيبان المورد — وجهة التحويل */
  bankIban?: string | null;
  address: string | null;
  isActive?: boolean;
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

/** تقادم ذمم المورد — balance bucketed by how overdue it is */
interface AgingBuckets { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number }

interface AgingRow {
  supplierId: string;
  supplierName: string;
  phone: string | null;
  openPoCount: number;
  balanceSar: number;
  overdueSar: number;
  oldestOpenDate: string | null;
  buckets: AgingBuckets;
}

interface AgingData {
  rows: AgingRow[];
  totals: { supplierCount: number; balanceSar: number; overdueSar: number; buckets: AgingBuckets };
}

const CAT_LABEL: Record<string, string> = {
  CEMENT: 'catCement', SAND: 'catSand', GRAVEL_10MM: 'catGravel10', GRAVEL_20MM: 'catGravel20',
  GRAVEL_40MM: 'catGravel40', WATER: 'catWater', ADMIXTURE_PLASTICIZER: 'catPlasticizer',
  ADMIXTURE_RETARDER: 'catRetarder', ADMIXTURE_ACCELERATOR: 'catAccelerator',
  FLY_ASH: 'catFlyAsh', SILICA_FUME: 'catSilicaFume', STEEL_FIBER: 'catSteelFiber',
  POLYPROPYLENE_FIBER: 'catPolypropyleneFiber',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'poStatusDraft', ORDERED: 'poStatusOrdered', PARTIAL_RECEIVED: 'poStatusPartialReceived', RECEIVED: 'poStatusReceived', CANCELLED: 'poStatusCancelled',
};

const PAY_STATUS_LABEL: Record<string, string> = {
  PAID: 'payStatusPaid', PARTIAL: 'payStatusPartial', PENDING: 'payStatusPending',
};

const PAY_MODE_LABEL: Record<string, string> = {
  CASH: 'payModeCash', CHEQUE: 'payModeCheque', BANK: 'payModeBank', CREDIT: 'payModeCredit', UPI: 'payModeUpi', OTHER: 'payModeOther',
};

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

const EMPTY_SUP_FORM = {
  name: '', contactPerson: '', phone: '', email: '', vatNumber: '',
  crNumber: '', paymentTerms: '', bankIban: '', address: '',
};

/** null instead of '' — the API validates '' as a malformed email */
const nullable = (v: string) => (v.trim() ? v.trim() : null);

export default function ErpSuppliers() {
  const t = useErpDict();
  const catLabel = (k: string) => t(CAT_LABEL[k] ?? k);
  const statusLabel = (k: string) => t(STATUS_LABEL[k] ?? k);
  const payStatusLabel = (k: string) => t(PAY_STATUS_LABEL[k] ?? k);
  const payModeLabel = (k: string) => t(PAY_MODE_LABEL[k] ?? k);
  const [tab, setTab] = useState<'suppliers' | 'pos' | 'aging'>('suppliers');
  const [supData, setSupData] = useState<SuppliersData | null>(null);
  const [poData, setPoData] = useState<POsData | null>(null);
  const [agingData, setAgingData] = useState<AgingData | null>(null);
  /** non-null while editing a supplier — the add-form doubles as the edit-form */
  const [editFor, setEditFor] = useState<Supplier | null>(null);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showNewPO, setShowNewPO] = useState(false);
  const [payFor, setPayFor] = useState<PO | null>(null);
  const [supForm, setSupForm] = useState(EMPTY_SUP_FORM);
  const [poForm, setPoForm] = useState({ supplierId: '', purchaseDate: new Date().toISOString().slice(0, 10), vatPercent: '15', transportCostSar: '', notes: '', items: [] as { siloId: string; materialName: string; quantityKg: string; ratePerKgSar: string }[] });
  const [payForm, setPayForm] = useState({ amountSar: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMode: 'BANK', referenceNumber: '' });

  const loadAll = () => {
    setError('');
    // includeInactive=1 so a retired supplier can be brought back — the
    // register keeps its history either way (POs reference it).
    api.get<SuppliersData>('/api/suppliers?includeInactive=1').then(setSupData).catch((e: any) => setError(e?.message || t('errLoadSuppliers')));
    api.get<POsData>('/api/suppliers/purchase-orders').then(setPoData).catch((e: any) => setError(e?.message || t('errLoadPOs')));
    api.get<AgingData>('/api/suppliers/aging').then(setAgingData).catch(() => { /* aging is additive */ });
    api.get<InventoryData>('/api/inventory').then(d => setSilos(d.silos.map(s => ({ id: s.id, siloName: s.siloName, siloCode: s.siloCode, materialCategory: s.materialCategory })))).catch(() => {});
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(loadAll, []);

  const startEdit = (sup: Supplier) => {
    setEditFor(sup);
    setSupForm({
      name: sup.name,
      contactPerson: sup.contactPerson ?? '',
      phone: sup.phone,
      email: sup.email ?? '',
      vatNumber: sup.vatNumber ?? '',
      crNumber: sup.crNumber ?? '',
      paymentTerms: sup.paymentTerms ?? '',
      bankIban: sup.bankIban ?? '',
      address: sup.address ?? '',
    });
    setShowAdd(true);
  };

  const cancelEdit = () => {
    setEditFor(null);
    setSupForm(EMPTY_SUP_FORM);
    setShowAdd(false);
  };

  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: supForm.name.trim(),
      contactPerson: nullable(supForm.contactPerson),
      phone: supForm.phone.trim(),
      email: nullable(supForm.email),
      vatNumber: nullable(supForm.vatNumber),
      crNumber: nullable(supForm.crNumber),
      paymentTerms: nullable(supForm.paymentTerms),
      bankIban: nullable(supForm.bankIban),
      address: nullable(supForm.address),
    };
    try {
      if (editFor) {
        await api.put(`/api/suppliers/${editFor.id}`, payload);
      } else {
        await api.post('/api/suppliers', payload);
      }
      cancelEdit();
      loadAll();
    } catch (e: any) {
      setError(e?.message || t('errAddSupplier'));
    } finally {
      setBusy(false);
    }
  };

  /** إيقاف/تفعيل مورد — soft retire; PO history stays untouched */
  const toggleSupplierActive = async (sup: Supplier) => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/api/suppliers/${sup.id}`, { isActive: !(sup.isActive !== false) });
      loadAll();
    } catch (e: any) {
      setError(e?.message || t('errAddSupplier'));
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
        materialName: it.materialName || silo?.siloName || t('defaultMaterial'),
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
      setError(e?.message || t('errCreatePO'));
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
      setError(e?.message || t('errReceivePO'));
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
      setError(e?.message || t('errRecordPayment'));
    } finally {
      setBusy(false);
    }
  };

  const s = supData?.summary;
  const tenant = useTenant();

  /** طباعة أمر الشراء — ورقة A4 بالهوية الكاملة للمورد + البنود + الإجماليات */
  const printPO = (po: PO) => {
    const sup = (supData?.suppliers ?? []).find(x => x.id === po.supplierId);
    const esc = (v: unknown) =>
      String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    const line = (label: string, value: unknown) =>
      `<tr><th>${esc(label)}</th><td colspan="3">${esc(value)}</td></tr>`;
    const itemRows = po.items
      .map(
        (it) =>
          `<tr><td>${esc(it.materialName)}</td><td>${Number(it.quantityKg).toLocaleString('en-US')}</td><td>${fmtSar(Number(it.ratePerKgSar))}</td><td>${fmtSar(Number(it.lineTotalSar ?? 0))}</td></tr>`
      )
      .join('');
    const payRows = (po.payments ?? [])
      .map(
        (p) =>
          `<tr><td>${new Date(p.paymentDate).toLocaleDateString('ar-EG')}</td><td>${esc(payModeLabel(p.paymentMode))}</td><td>${esc(p.referenceNumber ?? '—')}</td><td>${fmtSar(p.amountSar)}</td></tr>`
      )
      .join('');
    const logo = tenant?.logoUrl ? `<img src="${tenant.logoUrl}" style="height:54px;object-fit:contain;" />` : '';
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(po.poNumber)}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma;padding:28px;color:#111}.head{display:flex;align-items:center;gap:14px;margin-bottom:6px}h1{font-size:22px}.sub{font-size:12px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th{background:#0f172a;color:#fff;padding:6px 8px;text-align:right}td{padding:5px 8px;border-bottom:1px solid #ddd}h2{font-size:15px;margin:14px 0 4px}.tot{text-align:left;font-weight:800}.foot{margin-top:18px;font-size:11px;color:#555;display:flex;gap:40px}.sig{border-top:1px solid #999;padding-top:4px;min-width:140px;text-align:center}@media print{body{padding:10mm}}</style></head><body>
    <div class="head">${logo}<div><div style="font-size:18px;font-weight:800;">${esc(tenant?.companyName ?? '')}</div><h1>أمر شراء — ${esc(po.poNumber)}</h1></div></div>
    <div class="sub">التاريخ: ${new Date(po.purchaseDate).toLocaleDateString('ar-EG')}${po.dueDate ? ` · الاستحقاق: ${new Date(po.dueDate).toLocaleDateString('ar-EG')}` : ''} · الحالة: ${esc(statusLabel(po.status))}</div>
    <h2>المورد</h2>
    <table>
    ${line('الاسم', sup?.name ?? po.supplierName)}
    ${line('السجل التجاري', sup?.crNumber)}
    ${line('الرقم الضريبي', sup?.vatNumber)}
    ${line('الهاتف', sup?.phone)}${sup?.contactPerson ? `<tr><th>مسؤول التواصل</th><td colspan="3">${esc(sup.contactPerson)}</td></tr>` : ''}
    ${line('شروط الدفع', sup?.paymentTerms)}
    ${line('الآيبان', sup?.bankIban)}
    </table>
    <h2>بنود أمر الشراء</h2>
    <table><thead><tr><th>المادة</th><th>الكمية (كجم)</th><th>السعر/كجم (ر.س)</th><th>الإجمالي (ر.س)</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
    <table>
    <tr><th>الإجمالي قبل الضريبة</th><td>${fmtSar(po.subtotalSar)}</td><th>ضريبة ${esc(po.vatPercent)}%</th><td>${fmtSar(po.vatAmountSar)}</td></tr>
    <tr><th>النقل</th><td>${fmtSar(po.transportCostSar)}</td><th>الإجمالي</th><td>${fmtSar(po.totalAmountSar)} ر.س</td></tr>
    <tr><th>المدفوع</th><td>${fmtSar(po.paidAmountSar)}</td><th>المتبقي</th><td>${fmtSar(po.balanceSar)} ر.س</td></tr>
    </table>
    ${payRows ? `<h2>الدفعات</h2><table><thead><tr><th>التاريخ</th><th>الطريقة</th><th>المرجع</th><th>المبلغ (ر.س)</th></tr></thead><tbody>${payRows}</tbody></table>` : ''}
    <div class="foot"><div class="sig">مدير المشتريات</div><div class="sig">المحاسب</div><div class="sig">المستلم</div></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🏭</span> {t('suppliersHeader')}
        </h3>
        <div className="flex gap-2">
          <ExportButtons
            filename={tab === 'aging' ? t('fileNameAging') : tab === 'suppliers' ? t('fileNameSuppliers') : t('fileNamePOs')}
            title={tab === 'aging' ? t('agingExportTitle') : tab === 'suppliers' ? t('suppliersExportTitle') : t('posExportTitle')}
            columns={
              tab === 'aging'
                ? [
                    { header: t('exportColSupplierName'), key: 'name' },
                    { header: t('balance'), key: 'balance' },
                    { header: t('overdue'), key: 'overdue' },
                    { header: t('openPos'), key: 'openPos' },
                    { header: t('ageCurrent'), key: 'current' },
                    { header: t('age1_30'), key: 'd1_30' },
                    { header: t('age31_60'), key: 'd31_60' },
                    { header: t('age61_90'), key: 'd61_90' },
                    { header: t('age90Plus'), key: 'd90_plus' },
                  ]
                : tab === 'suppliers'
                ? [
                    { header: t('exportColSupplierName'), key: 'name' },
                    { header: t('exportColContact'), key: 'contact' },
                    { header: t('exportColVat'), key: 'vat' },
                    { header: t('exportColPhone'), key: 'phone' },
                    { header: t('exportColAddress'), key: 'address' },
                  ]
                : [
                    { header: t('exportColPoNo'), key: 'po' },
                    { header: t('exportColSupplier'), key: 'supplier' },
                    { header: t('date'), key: 'date' },
                    { header: t('total'), key: 'total' },
                    { header: t('paid'), key: 'paid' },
                    { header: t('status'), key: 'status' },
                  ]
            }
            rows={
              tab === 'aging'
                ? (agingData?.rows ?? []).map(x => ({
                    name: x.supplierName,
                    balance: `${fmtSar(x.balanceSar)} ${t('sar')}`,
                    overdue: `${fmtSar(x.overdueSar)} ${t('sar')}`,
                    openPos: x.openPoCount,
                    current: fmtSar(x.buckets.current),
                    d1_30: fmtSar(x.buckets.d1_30),
                    d31_60: fmtSar(x.buckets.d31_60),
                    d61_90: fmtSar(x.buckets.d61_90),
                    d90_plus: fmtSar(x.buckets.d90_plus),
                  }))
                : tab === 'suppliers'
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
                    total: `${fmtSar(x.totalAmountSar)} ${t('sar')}`,
                    paid: `${fmtSar(x.paidAmountSar)} ${t('sar')}`,
                    status: statusLabel(x.status),
                  }))
            }
          />
          <div className="flex bg-white/[0.04] border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setTab('suppliers')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'suppliers' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{t('tabSuppliers')}</button>
            <button onClick={() => setTab('pos')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'pos' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{t('tabPurchaseOrders')}</button>
            <button onClick={() => setTab('aging')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'aging' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{t('tabAging')}</button>
          </div>
          {tab !== 'aging' && (
            <button onClick={() => { tab === 'suppliers' ? setShowAdd(v => !v) : setShowNewPO(v => !v); }} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">
              {tab === 'suppliers' ? (showAdd ? t('close') : t('addSupplier')) : (showNewPO ? t('close') : t('addPurchaseOrder'))}
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-white">{s?.supplierCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">{t('suppliersLabel')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-red-300">{fmtSar(s?.totalPayableSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('payableToSuppliers')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-sky-300">{fmtSar(s?.totalOrderedSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('purchasesValue')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-amber-300">{s?.openPoCount ?? 0}</div>
          <div className="text-[10px] text-slate-400">{t('openPOCount')}</div>
        </div>
      </div>

      {/* ── Suppliers tab ── */}
      {tab === 'suppliers' && (
        <>
          {showAdd && (
            <form onSubmit={saveSupplier} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <div className="col-span-2 md:col-span-4 text-[11px] font-black text-emerald-200">
                {editFor ? `✏️ ${t('editingSupplier')}: ${editFor.name}` : `➕ ${t('addSupplier')}`}
              </div>
              <input value={supForm.name} onChange={e => setSupForm({ ...supForm, name: e.target.value })} placeholder={t('supplierNameReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <input value={supForm.phone} onChange={e => setSupForm({ ...supForm, phone: e.target.value })} placeholder={t('phoneReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <input value={supForm.contactPerson} onChange={e => setSupForm({ ...supForm, contactPerson: e.target.value })} placeholder={t('contactPerson')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.email} onChange={e => setSupForm({ ...supForm, email: e.target.value })} placeholder={t('emailLabel')} type="email" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.vatNumber} onChange={e => setSupForm({ ...supForm, vatNumber: e.target.value })} placeholder={t('vatNumber')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.crNumber} onChange={e => setSupForm({ ...supForm, crNumber: e.target.value })} placeholder={t('crNumber')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.paymentTerms} onChange={e => setSupForm({ ...supForm, paymentTerms: e.target.value })} placeholder={t('paymentTerms')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={supForm.bankIban} onChange={e => setSupForm({ ...supForm, bankIban: e.target.value })} placeholder={t('bankIban')} dir="ltr" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs font-mono" />
              <input value={supForm.address} onChange={e => setSupForm({ ...supForm, address: e.target.value })} placeholder={t('address')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2 md:col-span-3" />
              <div className="col-span-2 md:col-span-1 flex gap-2">
                <button type="submit" disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{editFor ? t('saveChanges') : t('saveSupplier')}</button>
                {editFor && (
                  <button type="button" onClick={cancelEdit} className="bg-white/[0.06] border border-white/15 text-slate-300 font-bold py-1.5 rounded-lg text-xs px-3">{t('cancel')}</button>
                )}
              </div>
            </form>
          )}

          {(supData?.suppliers ?? []).length === 0 && <div className="text-xs text-slate-500 text-center py-4">{t('noSuppliers')}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {(supData?.suppliers ?? []).map(sup => (
              <div key={sup.id} className={`bg-white/[0.03] border rounded-lg p-3 ${sup.isActive === false ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-bold text-white truncate">{sup.name}</div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(sup)} title={t('editSupplier')} className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-slate-300 hover:text-white">✏️</button>
                    <button onClick={() => toggleSupplierActive(sup)} disabled={busy}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${sup.isActive === false ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'}`}>
                      {sup.isActive === false ? t('activate') : t('deactivate')}
                    </button>
                  </div>
                </div>
                {sup.isActive === false && <div className="text-[10px] text-amber-400 font-bold">⚠️ {t('inactiveSupplier')}</div>}
                <div className="text-[10px] text-slate-400 mt-0.5">📞 {sup.phone}{sup.email ? ` · ${sup.email}` : ''}</div>
                {sup.contactPerson && <div className="text-[10px] text-slate-500">👤 {sup.contactPerson}</div>}
                {sup.vatNumber && <div className="text-[10px] text-slate-500 font-mono">{t('vatNumberLabel')}{sup.vatNumber}</div>}
                {sup.crNumber && <div className="text-[10px] text-slate-500">🏛 {t('crNumberLabel')}: <span className="font-mono" dir="ltr">{sup.crNumber}</span></div>}
                {sup.paymentTerms && <div className="text-[10px] text-slate-500">🧾 {t('paymentTerms')}: {sup.paymentTerms}</div>}
                {sup.bankIban && <div className="text-[10px] text-slate-500">🏦 {t('bankIban')}: <span className="font-mono" dir="ltr">{sup.bankIban}</span></div>}
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
                  <option value="">{t('supplierSelect')}</option>
                  {(supData?.suppliers ?? []).map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                </select>
                <input type="date" value={poForm.purchaseDate} onChange={e => setPoForm({ ...poForm, purchaseDate: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                <input type="number" value={poForm.vatPercent} onChange={e => setPoForm({ ...poForm, vatPercent: e.target.value })} placeholder={t('vatPct')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                <input type="number" step="0.01" value={poForm.transportCostSar} onChange={e => setPoForm({ ...poForm, transportCostSar: e.target.value })} placeholder={t('transportCost')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>

              <div className="text-[11px] font-bold text-slate-300 mb-2">{t('poLinesHint')}</div>
              <div className="space-y-2 mb-2">
                {poForm.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <select value={it.siloId} onChange={e => updateItem(i, 'siloId', e.target.value)} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                      <option value="">{t('materialOrSilo')}</option>
                      {silos.map(s => <option key={s.id} value={s.id}>{s.siloName} ({catLabel(s.materialCategory)})</option>)}
                    </select>
                    <input value={it.materialName} onChange={e => updateItem(i, 'materialName', e.target.value)} placeholder={t('materialName')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                    <input type="number" step="0.01" value={it.quantityKg} onChange={e => updateItem(i, 'quantityKg', e.target.value)} placeholder={t('quantityKg')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                    <div className="flex gap-2">
                      <input type="number" step="0.01" value={it.ratePerKgSar} onChange={e => updateItem(i, 'ratePerKgSar', e.target.value)} placeholder={t('ratePerKg')} className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                      <button type="button" onClick={() => setPoForm({ ...poForm, items: poForm.items.filter((_, j) => j !== i) })} className="text-red-400 text-sm px-2">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={addItemRow} className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded px-2 py-1">{t('addItem')}</button>
                <button type="submit" disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('createPurchaseOrder')}</button>
              </div>
            </form>
          )}

          {(poData?.purchaseOrders ?? []).length === 0 && <div className="text-xs text-slate-500 text-center py-4">{t('noPurchaseOrders')}</div>}
          <div className="space-y-2">
            {(poData?.purchaseOrders ?? []).map(po => (
              <div key={po.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      {po.poNumber} — {po.supplierName}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300">{statusLabel(po.status)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${po.paymentStatus === 'PAID' ? 'bg-emerald-500/20 text-emerald-300' : po.paymentStatus === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-200' : 'bg-red-500/20 text-red-300'}`}>
                        {payStatusLabel(po.paymentStatus)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{new Date(po.purchaseDate).toLocaleDateString()}{po.dueDate ? ` · ${t('due')} ${new Date(po.dueDate).toLocaleDateString()}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-white">{fmtSar(po.totalAmountSar)} {t('sar')}</div>
                    <div className="text-[10px] text-slate-400">{t('balanceDue')}<span className="text-red-300 font-bold">{fmtSar(po.balanceSar)}</span></div>
                  </div>
                </div>

                {po.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {po.items.map(it => (
                      <span key={it.id ?? it.materialName + it.quantityKg} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                        {it.materialName}: {Number(it.quantityKg).toLocaleString()} {t('kg')}
                      </span>
                    ))}
                  </div>
                )}
                {po.payments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {po.payments.map(p => (
                      <span key={p.id} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        {t('payment')} {fmtSar(p.amountSar)} {t('sar')} · {new Date(p.paymentDate).toLocaleDateString()} · {payModeLabel(p.paymentMode)}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button onClick={() => printPO(po)} className="text-[11px] bg-white/[0.06] text-slate-200 border border-white/15 rounded px-2 py-1 hover:bg-white/10">🖨️ {t('printPO')}</button>
                  {!po.inventoryUpdated && po.status !== 'CANCELLED' && (
                    <button onClick={() => receivePO(po)} disabled={busy} className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded px-2 py-1 hover:bg-sky-500/30">{t('receiveAndUpdateStock')}</button>
                  )}
                  {po.balanceSar > 0 && po.status !== 'CANCELLED' && (
                    <button onClick={() => setPayFor(po)} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">{t('recordPayment')}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Aging tab — عمر ذمم الموردين ── */}
      {tab === 'aging' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-white">{agingData?.totals.supplierCount ?? 0}</div>
              <div className="text-[10px] text-slate-400">{t('suppliersLabel')}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-white">{fmtSar(agingData?.totals.balanceSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('balance')} ({t('sar')})</div>
            </div>
            <div className="bg-white/[0.03] border border-red-500/20 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-red-300">{fmtSar(agingData?.totals.overdueSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('overdue')} ({t('sar')})</div>
            </div>
            <div className="bg-white/[0.03] border border-red-500/20 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-red-400">{fmtSar(agingData?.totals.buckets.d90_plus ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('age90Plus')} ({t('sar')})</div>
            </div>
          </div>

          {(agingData?.rows ?? []).length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-6">{t('noAging')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10">
                    <th className="text-right px-2 py-2 font-black">{t('exportColSupplierName')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('openPos')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('balance')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('overdue')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('ageCurrent')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('age1_30')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('age31_60')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('age61_90')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('age90Plus')}</th>
                    <th className="text-right px-2 py-2 font-black">{t('oldestOpen')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(agingData?.rows ?? []).map(r => (
                    <tr key={r.supplierId} className="border-b border-white/5">
                      <td className="px-2 py-1.5 font-bold text-white">{r.supplierName}</td>
                      <td className="px-2 py-1.5 text-slate-300">{r.openPoCount}</td>
                      <td className="px-2 py-1.5 font-black text-white">{fmtSar(r.balanceSar)}</td>
                      <td className={`px-2 py-1.5 font-bold ${r.overdueSar > 0 ? 'text-red-300' : 'text-slate-500'}`}>{fmtSar(r.overdueSar)}</td>
                      <td className="px-2 py-1.5 text-slate-300">{fmtSar(r.buckets.current)}</td>
                      <td className="px-2 py-1.5 text-amber-200">{fmtSar(r.buckets.d1_30)}</td>
                      <td className="px-2 py-1.5 text-amber-300">{fmtSar(r.buckets.d31_60)}</td>
                      <td className="px-2 py-1.5 text-orange-300">{fmtSar(r.buckets.d61_90)}</td>
                      <td className="px-2 py-1.5 text-red-400 font-bold">{fmtSar(r.buckets.d90_plus)}</td>
                      <td className="px-2 py-1.5 text-slate-400">{r.oldestOpenDate ? new Date(`${r.oldestOpenDate.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-2">{t('agingHint')}</p>
            </div>
          )}
        </div>
      )}

      {/* Payment modal */}
      {payFor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 w-full max-w-sm">
            <h4 className="text-sm font-bold text-white mb-1">{t('supplierPayment')}{payFor.poNumber}</h4>
            <p className="text-[11px] text-slate-400 mb-4">{t('remaining')} {fmtSar(payFor.balanceSar)} {t('sar')}</p>
            <form onSubmit={recordPayment} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('amountSarReq')}</label>
                <input type="number" step="0.01" value={payForm.amountSar} onChange={e => setPayForm({ ...payForm, amountSar: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('paymentDate')}</label>
                <input type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('paymentMethod')}</label>
                <select value={payForm.paymentMode} onChange={e => setPayForm({ ...payForm, paymentMode: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                  {Object.keys(PAY_MODE_LABEL).map(m => <option key={m} value={m}>{payModeLabel(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('txnRefNo')}</label>
                <input value={payForm.referenceNumber} onChange={e => setPayForm({ ...payForm, referenceNumber: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs disabled:opacity-40">{t('confirmPayment')}</button>
                <button type="button" onClick={() => setPayFor(null)} className="px-4 border border-white/20 text-slate-300 rounded-lg text-xs">{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
