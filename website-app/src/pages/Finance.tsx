import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';
import ErpFinance from '../components/ErpFinance';
import ErpLedger from '../components/ErpLedger';
import ErpCommitments from '../components/ErpCommitments';
import ErpExpenses from '../components/ErpExpenses';
import ErpSuppliers from '../components/ErpSuppliers';
import AccountingIntegration from '../components/AccountingIntegration';
import DemandForecast from '../components/DemandForecast';
import { DeviceStatusBadge } from '../components/DeviceHub';
import { useFinanceDict } from '../i18n/financeDict';

/* ── Backend shapes (exact fields from route files, no invention) ── */

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amountSar: number; // minor units (halala); display ÷ 100
  transactionType: string;
  referenceNumber: string | null;
  bankAccountId: string | null;
  counterpartyName: string | null;
  counterpartyType: string | null;
  bankAccountName: string | null;
  bankName: string | null;
}

interface LedgerData {
  accounts: { id: string; accountName: string }[];
  entries: LedgerEntry[];
  transactions: unknown[];
  summary: { totalAccounts: number; totalBalanceSar: number; totalDebitsSar: number; totalCreditsSar: number };
}

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
}

interface SuppliersData {
  suppliers: Supplier[];
  summary: { supplierCount: number; totalPayableSar: number; totalOrderedSar: number; openPoCount: number };
}

interface BackendPOItem {
  id?: string;
  materialName: string;
  quantityKg: string | number;
}

interface BackendPO {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  totalAmountSar: number;
  paidAmountSar: number;
  balanceSar: number;
  status: string;
  paymentStatus: string;
  inventoryUpdated: boolean;
  items: BackendPOItem[];
}

interface POsData { purchaseOrders: BackendPO[]; }

interface SiloRow {
  id: string;
  siloName: string;
  siloCode: string;
  materialCategory: string;
  currentStockKg?: string | number | null;
}

interface InventoryData { silos: SiloRow[]; }

interface OrderRow {
  id: string;
  status: string;
  totalVolumeM3: string | number;
}

interface OrdersData { orders: OrderRow[]; }

interface FinanceSummary {
  creditSummary?: { totalOutstandingSar?: number | string; totalCreditLimitSar?: number | string; overLimitCount?: number };
}

/** Local-only simulated payment request — no backend exists for QR gateway. NOT persisted. */
interface LocalPayRequest { id: number; date: string; client: string; orderNo: string; amount: number; method: string; link: string; qr: string; ref: string; }

const DEMAND_PER_M3 = { cement: 0.38, sand: 0.7, gravel: 1.05 }; // t per m³ — estimate coefficients

const MATERIALS = [
  { key: 'cement', name: 'Cement', unit: 't', minStock: 20, reorder: 40, category: 'CEMENT' },
  { key: 'sand', name: 'Sand', unit: 't', minStock: 40, reorder: 80, category: 'SAND' },
  { key: 'gravel', name: 'Gravel / Aggregate', unit: 't', minStock: 60, reorder: 100, category: 'GRAVEL_20MM' },
  { key: 'admixture', name: 'Admixture', unit: 'L', minStock: 300, reorder: 600, category: 'ADMIXTURE_PLASTICIZER' },
];

const toSar = (minor: number) => (Number(minor) || 0) / 100;

export default function Finance() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const t = useFinanceDict();
  const [tab, setTab] = useState<'payments' | 'reorder'>('payments');

  /* ── Central API state ── */
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<BackendPO[]>([]);
  const [poError, setPoError] = useState('');
  const [poBusy, setPoBusy] = useState(false);
  const [poLoading, setPoLoading] = useState(false);

  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);

  /* Demand estimate inputs (best-effort reads from central API, computed locally) */
  const [silos, setSilos] = useState<SiloRow[]>([]);
  const [demandM3, setDemandM3] = useState(0);
  const [estimateNote, setEstimateNote] = useState('');

  const [pForm, setPForm] = useState({ date: new Date().toISOString().split('T')[0], client: '', orderNo: '', amount: '', method: 'bank', note: '' });
  const [poForm, setPoForm] = useState({ supplierId: '', purchaseDate: new Date().toISOString().split('T')[0], materialCategory: 'CEMENT', materialName: '', quantityT: '', ratePerT: '650', notes: '' });

  /* Local-only widgets (no backend): QR payment-request simulation + reorder suggestions */
  const [localRequests, setLocalRequests] = useState<LocalPayRequest[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reorderSuggestion, setReorderSuggestion] = useState<string>('');
  const [demandSuggestion, setDemandSuggestion] = useState<string>('');
  const [showAccounting, setShowAccounting] = useState(false);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    setLedgerError('');
    try {
      const d = await api.get<LedgerData>('/api/finance/ledger');
      setLedger(d);
    } catch (e: unknown) {
      setLedgerError(e instanceof Error ? e.message : 'Failed to load ledger');
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const loadPOs = useCallback(async () => {
    setPoLoading(true);
    setPoError('');
    try {
      const [s, p] = await Promise.all([
        api.get<SuppliersData>('/api/suppliers'),
        api.get<POsData>('/api/suppliers/purchase-orders'),
      ]);
      setSuppliers(s.suppliers ?? []);
      setPos(p.purchaseOrders ?? []);
    } catch (e: unknown) {
      setPoError(e instanceof Error ? e.message : 'Failed to load purchase orders');
    } finally {
      setPoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void loadLedger();
    void loadPOs();
    // Finance credit summary (best-effort; full queue lives in ErpFinance below)
    api.get<FinanceSummary>('/api/finance?limit=1').then(setFinanceSummary).catch(() => {});
    // Demand estimate inputs: silo stock + order volumes from central API
    api.get<InventoryData>('/api/inventory')
      .then(d => setSilos(d.silos ?? []))
      .catch(() => setEstimateNote('تعذّر تحميل المخزون من الخادم — التقديرات أدناه غير متوفرة.'));
    api.get<OrdersData>('/api/orders?limit=100')
      .then(d => {
        const vols = (d.orders ?? [])
          .filter(o => !['CANCELLED', 'FINANCE_REJECTED'].includes(String(o.status)))
          .reduce((s, o) => s + (Number(o.totalVolumeM3) || 0), 0);
        setDemandM3(vols);
      })
      .catch(() => setEstimateNote('تعذّر تحميل الطلبات من الخادم — التقديرات أدناه غير متوفرة.'));
  }, [currentUser, loadLedger, loadPOs]);

  /* (1) Client payments → POST /api/finance/ledger/entries (transactionType 'sale') */
  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountSar = Math.round((Number(pForm.amount) || 0) * 100);
    if (!pForm.client.trim() || !amountSar) { setPayError('Enter client and amount.'); return; }
    setPayBusy(true);
    setPayError('');
    try {
      await api.post('/api/finance/ledger/entries', {
        date: new Date(pForm.date).toISOString(),
        description: `Client payment — ${pForm.client.trim()}${pForm.orderNo ? ` (${pForm.orderNo.trim()})` : ''}${pForm.note ? ` — ${pForm.note.trim()}` : ''} [${pForm.method}]`,
        amountSar,
        transactionType: 'sale',
        referenceNumber: pForm.orderNo.trim() || null,
        counterpartyType: 'client',
        counterpartyName: pForm.client.trim(),
      });
      setPForm({ ...pForm, client: '', orderNo: '', amount: '', note: '' });
      await loadLedger();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setPayBusy(false);
    }
  };

  /* Local-only: QR payment-request simulation — no backend endpoint exists. Kept in memory only. */
  const generatePaymentRequest = async () => {
    const amt = Number(pForm.amount);
    if (!pForm.client || !amt) { alert('Enter client and amount to generate a payment request.'); return; }
    const ref = 'PAY-' + Date.now().toString().slice(-8);
    const link = `https://pay.fimtosoft.com/${ref}?amt=${amt}&client=${encodeURIComponent(pForm.client)}&method=${pForm.method}`;
    const payload = JSON.stringify({ ref, amount: amt, currency: 'SAR', client: pForm.client, method: pForm.method, merchant: 'FimtoSoft Concrete', timestamp: new Date().toISOString() });
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 200, color: { dark: '#000000', light: '#ffffff' } }).catch(() => '');
    setLocalRequests(prev => [{ id: Date.now(), date: new Date().toISOString().split('T')[0], client: pForm.client, orderNo: pForm.orderNo, amount: amt, method: pForm.method, link, qr, ref }, ...prev]);
    setPForm({ ...pForm, client: '', orderNo: '', amount: '', note: '' });
  };

  /* (2) Supplier POs → POST /api/suppliers/purchase-orders (single-line PO from page form) */
  const createPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.supplierId) { setPoError('Select a supplier first.'); return; }
    const qtyKg = Math.round((Number(poForm.quantityT) || 0) * 1000);
    const ratePerKgSar = Math.round(((Number(poForm.ratePerT) || 0) * 100) / 1000);
    if (!qtyKg || qtyKg <= 0) { setPoError('Enter a valid quantity in tonnes.'); return; }
    setPoBusy(true);
    setPoError('');
    try {
      const siloMatch = silos.find(s => s.materialCategory === poForm.materialCategory);
      await api.post('/api/suppliers/purchase-orders', {
        supplierId: poForm.supplierId,
        purchaseDate: new Date(poForm.purchaseDate).toISOString(),
        vatPercent: 15,
        notes: poForm.notes || null,
        items: [{
          siloId: siloMatch?.id ?? null,
          materialCategory: poForm.materialCategory,
          materialName: poForm.materialName.trim() || siloMatch?.siloName || poForm.materialCategory,
          quantityKg: qtyKg,
          ratePerKgSar,
        }],
      });
      setPoForm({ ...poForm, materialName: '', quantityT: '', notes: '' });
      await loadPOs();
    } catch (err: unknown) {
      setPoError(err instanceof Error ? err.message : 'Failed to create purchase order');
    } finally {
      setPoBusy(false);
    }
  };

  /* (2) Receive PO → POST /api/suppliers/purchase-orders/receive { poId } */
  const receivePO = async (poId: string) => {
    setPoBusy(true);
    setPoError('');
    try {
      await api.post('/api/suppliers/purchase-orders/receive', { poId });
      await loadPOs();
    } catch (err: unknown) {
      setPoError(err instanceof Error ? err.message : 'Failed to receive purchase order');
    } finally {
      setPoBusy(false);
    }
  };

  /* (3) Local estimates only — never posted, never persisted. */
  const stockT = (category: string) => {
    const kg = silos.filter(s => s.materialCategory === category).reduce((s, r) => s + (Number(r.currentStockKg) || 0), 0);
    return kg / 1000;
  };
  const onOrderT = (category: string) => {
    const label = MATERIALS.find(m => m.category === category)?.name;
    void label;
    return pos.filter(po => po.status !== 'RECEIVED' && po.status !== 'CANCELLED')
      .flatMap(po => po.items)
      .reduce((s, it) => s + (Number(it.quantityKg) || 0), 0) / 1000;
  };

  const demandCoverage = (key: 'cement' | 'sand' | 'gravel') => {
    const needed = demandM3 * DEMAND_PER_M3[key];
    const cat = key === 'cement' ? 'CEMENT' : key === 'sand' ? 'SAND' : 'GRAVEL_20MM';
    const current = stockT(cat);
    const onOrder = cat === 'GRAVEL_20MM'
      ? ['GRAVEL_10MM', 'GRAVEL_20MM', 'GRAVEL_40MM'].reduce((s, c) => s + onOrderT(c), 0)
      : onOrderT(cat);
    return { needed, current, onOrder, short: Math.max(0, needed - current - onOrder) };
  };

  const generatePOs = () => {
    const selected = MATERIALS.filter(m => checked[m.key]);
    if (!selected.length) { alert('Select at least one material to estimate.'); return; }
    setReorderSuggestion(
      'تقدير محلي (لم يُرسل): ' + selected.map(m => `${m.name} ≈ ${m.reorder}${m.unit}`).join('، ') +
      ' — لإنشاء أمر شراء حقيقي استخدم نموذج الشراء أعلاه (يُرسل إلى /api/suppliers/purchase-orders).'
    );
  };

  const genDemandPOs = () => {
    const cov = [demandCoverage('cement'), demandCoverage('sand'), demandCoverage('gravel')];
    if (!demandM3) { alert('No order volume loaded for the demand estimate — nothing to cover.'); return; }
    if (!cov.some(c => c.short > 0)) { setDemandSuggestion('تقدير محلي: المخزون الحالي يغطي الطلب المتوقع — لا حاجة لأوامر شراء.'); return; }
    setDemandSuggestion(
      'تقدير محلي (لم يُرسل) — عجز متوقع: ' +
      cov.map((c, i) => `${['cement', 'sand', 'gravel'][i]} ≈ ${c.short.toFixed(1)}t`).join('، ') +
      ' — لإنشاء أمر شراء حقيقي استخدم نموذج الشراء أعلاه.'
    );
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div>
      </div>
    );
  }

  const incomeEntries = (ledger?.entries ?? []).filter(e => e.transactionType === 'income' || e.transactionType === 'sale');
  const totalPaid = toSar(ledger?.summary.totalCreditsSar ?? incomeEntries.reduce((s, e) => s + e.amountSar, 0));
  const outstanding = financeSummary?.creditSummary?.totalOutstandingSar;
  const openPOs = pos.filter(po => po.status !== 'RECEIVED' && po.status !== 'CANCELLED');
  const poValue = pos.reduce((s, po) => s + toSar(po.totalAmountSar), 0);

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💰 Finance: Payments & Auto Reorder</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 gap-2 p-1 mb-5 bg-white/[0.04] rounded-xl border border-white/10 max-w-md backdrop-blur-xl">
          <button onClick={() => setTab('payments')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'payments' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>💳 Payments</button>
          <button onClick={() => setTab('reorder')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'reorder' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>📦 Auto Reorder (POs)</button>
        </div>

        {['sysadmin', 'accountant', 'ptown'].includes(currentUser.role || '') && <ErpFinance />}
        {['sysadmin', 'accountant', 'ptown'].includes(currentUser.role || '') && <ErpLedger />}
        {['sysadmin', 'accountant', 'ptown'].includes(currentUser.role || '') && <ErpCommitments />}
        {['sysadmin', 'accountant', 'ptown'].includes(currentUser.role || '') && <ErpExpenses />}
        {['sysadmin', 'accountant', 'ptown'].includes(currentUser.role || '') && <ErpSuppliers />}

        {/* ربط المحاسبة */}
        {['sysadmin', 'accountant', 'ptown'].includes(currentUser.role || '') && (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl mt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black tracking-tight text-white">{t('accountingLink')} <DeviceStatusBadge id="accounting" /></h3>
                <p className="text-xs text-slate-400">{t('qbNote')}</p>
              </div>
              <button onClick={() => setShowAccounting(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg">
                {t('accountingSetup')}
              </button>
            </div>
          </div>
        )}

        {tab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">💳 Payment Entry</h3>
              <p className="text-xs text-slate-400 mb-4">{t('devNoteLedger')}</p>
              {payError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{payError}</div>}
              <form onSubmit={addPayment} className="space-y-3">
                <DatePicker value={pForm.date} onChange={v => setPForm({ ...pForm, date: v })} label="Date" />
                <div><label className="text-xs text-slate-400 font-semibold">Client</label><input value={pForm.client} onChange={e => setPForm({ ...pForm, client: e.target.value })} placeholder="Client / customer" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Invoice #</label><input value={pForm.orderNo} onChange={e => setPForm({ ...pForm, orderNo: e.target.value })} placeholder="ORD-..." className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Amount (SAR)</label><input type="number" step="0.01" value={pForm.amount} onChange={e => setPForm({ ...pForm, amount: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Method (recorded in description)</label>
                  <select value={pForm.method} onChange={e => setPForm({ ...pForm, method: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="bank">🏦 Bank Transfer (IBAN)</option><option value="mada">💳 mada card</option><option value="visa">💳 Visa / Mastercard</option><option value="cash">💵 Cash</option><option value="cheque">📄 Cheque</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('noteLbl')}</label><input value={pForm.note} onChange={e => setPForm({ ...pForm, note: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" disabled={payBusy} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)] disabled:opacity-40">{payBusy ? 'Saving…' : '💳 Record Payment to Ledger'}</button>
                <button type="button" onClick={generatePaymentRequest} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">🔗 Generate Payment Request + QR (local simulation — no backend)</button>
              </form>
              {localRequests.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] text-slate-500 font-bold">⚠️ Local simulation only — these QR requests are NOT posted to the ledger and are NOT saved.</p>
                  {localRequests.map(r => (
                    <div key={r.id} className="flex items-center gap-2 bg-white/[0.02] border border-white/10 rounded-lg p-2">
                      {r.qr && <img src={r.qr} alt="payment qr" className="w-12 h-12 rounded border border-white/10" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white truncate">{r.client} — {r.amount.toLocaleString()} SAR</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{r.ref}</p>
                        <a href={r.link} target="_blank" rel="noreferrer" className="text-[10px] text-sky-400 underline break-all">{r.link}</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Collected (SAR)</p><p className="text-xl font-bold text-emerald-400">{totalPaid.toLocaleString()}</p><p className="text-[10px] text-slate-500">from GET /api/finance/ledger</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">Outstanding (SAR)</p><p className="text-xl font-bold text-yellow-400">{outstanding !== undefined && outstanding !== null ? Number(outstanding).toLocaleString() : '—'}</p><p className="text-[10px] text-slate-500">from GET /api/finance</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('ledgerEntriesLbl')}</p><p className="text-xl font-bold text-white">{ledger?.entries.length ?? 0}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('openPOsLbl')}</p><p className="text-xl font-bold text-orange-400">{openPOs.length}</p></div>
              </div>
              {ledgerError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{ledgerError} <button onClick={loadLedger} className="underline">{t('retryBtn')}</button></div>}
              {ledgerLoading && <div className="text-xs text-slate-400 py-4 text-center">Loading ledger…</div>}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('thDate')}</th><th className="p-2 uppercase tracking-wider">{t('thCounterparty')}</th><th className="p-2 uppercase tracking-wider">{t('thReference')}</th><th className="p-2 uppercase tracking-wider">{t('thType')}</th><th className="p-2 uppercase tracking-wider">{t('thAmount')}</th><th className="p-2 uppercase tracking-wider">{t('thDesc')}</th></tr></thead>
                    <tbody>
                      {incomeEntries.map(e => (
                        <tr key={e.id} className="border-b border-white/10">
                          <td className="p-2">{new Date(e.date).toLocaleDateString()}</td>
                          <td className="p-2 font-bold">{e.counterpartyName ?? '—'}</td>
                          <td className="p-2">{e.referenceNumber ?? '—'}</td>
                          <td className="p-2">{e.transactionType}</td>
                          <td className="p-2 font-bold text-emerald-400">{toSar(e.amountSar).toLocaleString()} SAR</td>
                          <td className="p-2 text-slate-400 max-w-[220px] truncate" title={e.description}>{e.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {incomeEntries.length === 0 && !ledgerLoading && <p className="text-xs text-slate-500 text-center py-4">{t('noIncome')}</p>}
                </div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mt-4 backdrop-blur-xl">
                <p className="text-xs font-bold text-white mb-2">🧾 Collected per counterparty (from ledger — outstanding status has no backend, shown as collected only)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {Array.from(new Set(incomeEntries.map(e => e.counterpartyName || 'Unknown'))).slice(0, 9).map(client => {
                    const sum = incomeEntries.filter(e => (e.counterpartyName || 'Unknown') === client).reduce((s, e) => s + e.amountSar, 0);
                    return (
                      <div key={client} className="bg-white/[0.02] rounded-lg p-3 border border-emerald-500/30">
                        <p className="text-[11px] text-slate-400 truncate">{client}</p>
                        <p className="text-sm font-bold text-emerald-400">{toSar(sum).toLocaleString()} SAR collected</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'reorder' && (
          <div className="space-y-6">
            <DemandForecast />
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">📅 Next-Day Demand Coverage <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded ml-2">تقدير محلي — ليس من الخادم</span></h3>
              <p className="text-xs text-slate-400 mb-4">Local estimate from central-API stock + order volumes. Suggestions below are NOT posted and NOT saved — create real POs with the form above or in the Suppliers section.</p>
              {estimateNote && <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded p-2 mb-3">{estimateNote}</div>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-white/[0.02] rounded-xl p-4 border border-white/10"><p className="text-xs text-slate-400">{t('estVol')}</p><p className="text-xl font-bold text-white">{demandM3.toFixed(0)} m³</p></div>
                {(['cement', 'sand', 'gravel'] as const).map(k => {
                  const c = demandCoverage(k);
                  return (
                    <div key={k} className={`bg-white/[0.02] rounded-xl p-4 border ${c.short > 0 ? 'border-red-500/50' : 'border-emerald-500/40'}`}>
                      <p className="text-xs text-slate-400 capitalize">{k}</p>
                      <p className="text-xl font-bold text-white">{c.needed.toFixed(1)}t <span className="text-[10px] text-slate-500">need (est.)</span></p>
                      <p className="text-[10px] text-slate-400">have {c.current.toFixed(0)}t{c.onOrder > 0 ? ` + ${c.onOrder.toFixed(0)}t PO` : ''}</p>
                      <p className={`text-[10px] font-bold ${c.short > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{c.short > 0 ? `🚨 short ${c.short.toFixed(1)}t (est.)` : '✅ covered (est.)'}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={genDemandPOs} className="bg-amber-500 hover:bg-amber-400 text-white font-bold py-2.5 px-4 rounded-lg text-sm shadow-[0_0_20px_rgba(56,189,248,0.3)]">⚡ Estimate POs for shortfall (local only)</button>
                <span className={`text-xs self-center font-bold ${demandCoverage('cement').short > 0 || demandCoverage('sand').short > 0 || demandCoverage('gravel').short > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {demandCoverage('cement').short > 0 || demandCoverage('sand').short > 0 || demandCoverage('gravel').short > 0 ? '🚨 ESTIMATE: stock may NOT cover upcoming demand' : '✅ ESTIMATE: stock covers upcoming demand'}
                </span>
              </div>
              {demandSuggestion && <p className="text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/30 rounded p-2 mt-3">{demandSuggestion}</p>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">📦 Material Reorder Alerts <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded ml-1">تقدير محلي</span></h3>
              <p className="text-xs text-slate-400 mb-4">{t('devNotePO')}</p>
              <div className="space-y-3">
                {MATERIALS.map(m => (
                  <label key={m.key} className="flex items-center gap-3 bg-white/[0.02] border border-white/10 rounded-lg p-3 cursor-pointer">
                    <input type="checkbox" checked={!!checked[m.key]} onChange={e => setChecked({ ...checked, [m.key]: e.target.checked })} className="accent-orange-500 w-4 h-4" />
                    <span className="flex-1">
                      <span className="block font-bold text-white text-sm">{m.name}</span>
                      <span className="block text-[10px] text-slate-400">min {m.minStock}{m.unit} · reorder {m.reorder}{m.unit}</span>
                    </span>
                    {!!checked[m.key] && <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">🚨 LOW</span>}
                  </label>
                ))}
                <button onClick={generatePOs} className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">⚡ Estimate Purchase Orders (local only)</button>
                {reorderSuggestion && <p className="text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/30 rounded p-2">{reorderSuggestion}</p>}
                <p className="text-[10px] text-slate-500 text-center">Estimates use reorder qty × 650 SAR/t (admixture 12 SAR/L) and are never posted automatically.</p>
              </div>
            </div>
            <div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-4 backdrop-blur-xl">
                <h4 className="text-sm font-bold text-white mb-1">➕ New Purchase Order (POST /api/suppliers/purchase-orders)</h4>
                {poError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{poError}</div>}
                <form onSubmit={createPO} className="grid grid-cols-2 gap-2">
                  <select value={poForm.supplierId} onChange={e => setPoForm({ ...poForm, supplierId: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" required>
                    <option value="">{t('devNoteSup')}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input type="date" value={poForm.purchaseDate} onChange={e => setPoForm({ ...poForm, purchaseDate: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                  <select value={poForm.materialCategory} onChange={e => setPoForm({ ...poForm, materialCategory: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                    <option value="CEMENT">{t('matCement')}</option><option value="SAND">{t('matSand')}</option><option value="GRAVEL_10MM">{t('matGravel')} 10mm</option><option value="GRAVEL_20MM">{t('matGravel')} 20mm</option><option value="GRAVEL_40MM">{t('matGravel')} 40mm</option><option value="ADMIXTURE_PLASTICIZER">{t('matAdmix')}</option>
                  </select>
                  <input value={poForm.materialName} onChange={e => setPoForm({ ...poForm, materialName: e.target.value })} placeholder="Material name (optional)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                  <input type="number" step="0.01" value={poForm.quantityT} onChange={e => setPoForm({ ...poForm, quantityT: e.target.value })} placeholder="Qty (tonnes)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
                  <input type="number" step="0.01" value={poForm.ratePerT} onChange={e => setPoForm({ ...poForm, ratePerT: e.target.value })} placeholder="Rate (SAR/t)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                  <input value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })} placeholder="Notes (optional)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" />
                  <button type="submit" disabled={poBusy} className="col-span-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs disabled:opacity-40">{poBusy ? 'Creating…' : 'Create Purchase Order'}</button>
                </form>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('openPOsLbl')}</p><p className="text-xl font-bold text-orange-400">{openPOs.length}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">PO value (SAR)</p><p className="text-xl font-bold text-white">{poValue.toLocaleString()}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('receivedLbl')}</p><p className="text-xl font-bold text-emerald-400">{pos.filter(po => po.status === 'RECEIVED' || po.inventoryUpdated).length}</p></div>
              </div>
              {poLoading && <div className="text-xs text-slate-400 py-4 text-center">Loading purchase orders…</div>}
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">PO #</th><th className="p-2 uppercase tracking-wider">{t('thDate')}</th><th className="p-2 uppercase tracking-wider">{t('thSupplier')}</th><th className="p-2 uppercase tracking-wider">{t('thTotal')}</th><th className="p-2 uppercase tracking-wider">{t('thStatus')}</th><th className="p-2 uppercase tracking-wider"></th></tr></thead>
                    <tbody>
                      {pos.map(po => (
                        <tr key={po.id} className="border-b border-white/10">
                          <td className="p-2 font-bold">{po.poNumber}</td>
                          <td className="p-2">{new Date(po.purchaseDate).toLocaleDateString()}</td>
                          <td className="p-2">{po.supplierName}</td>
                          <td className="p-2 font-bold text-white">{toSar(po.totalAmountSar).toLocaleString()}</td>
                          <td className="p-2">
                            {po.status === 'CANCELLED'
                              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">Cancelled</span>
                              : po.inventoryUpdated || po.status === 'RECEIVED'
                                ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✅ Received</span>
                                : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">📦 {po.status}</span>}
                          </td>
                          <td className="p-2">{!po.inventoryUpdated && po.status !== 'CANCELLED' && po.status !== 'RECEIVED' && <button onClick={() => receivePO(po.id)} disabled={poBusy} className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-white px-2 py-1 rounded font-bold disabled:opacity-40">{t('devNoteRecv')}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pos.length === 0 && !poLoading && <p className="text-xs text-slate-500 text-center py-4">{t('noPOs')}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* نافذة ربط المحاسبة */}
      {showAccounting && <AccountingIntegration onClose={() => setShowAccounting(false)} />}
    </div>
  );
}
