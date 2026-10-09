import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import DatePicker from '../components/DatePicker';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import NotificationsBell from '../components/NotificationsBell';
import BatchControllerIntegration from '../components/BatchControllerIntegration';
import { DeviceStatusBadge } from '../components/DeviceHub';
import { useProductionDict } from '../i18n/productionDict';

// ─── Central API types ──────────────────────────────────────────────
interface Silo {
  id: string;
  siloCode: string;
  siloName: string;
  materialCategory: string;
  currentStockKg: string;
  capacityKg: string;
  reorderLevelKg: string;
  stockPct: number;
  isLowStock: boolean;
  isCritical: boolean;
}

interface InventoryData {
  silos: Silo[];
  alerts: { lowStockCount: number; criticalSilos: Silo[]; lowStockSilos: Silo[] };
  recentTransactions: Tx[];
}

interface Tx {
  id: string;
  transactionType: string;
  quantityKg: string;
  balanceAfterKg: string;
  createdAt: string;
  notes: string | null;
  siloCode: string;
  siloName: string;
  performedByName: string | null;
}

interface MixDesign {
  id: string;
  designCode: string;
  gradeDescription: string | null;
}

interface Run {
  id: string;
  mixDesignId: string | null;
  designCode: string | null;
  volumeM3: string;
  blockUnits: number;
  producedAt: string;
  notes: string | null;
}

// نظام الإضافات (محلي — لا علاقة له بواجهة المخزون المركزية)
interface Addition {
  id: number;
  name: string;
  type: 'delay_set' | 'strength_enhance' | 'integrated';
  dosagePerM3: number;
  currentStock: number;
  minStock: number;
  unit: string;
  supplier: string;
  costPerUnit: number;
}

// نظام البلوك (محلي — كتالوج الأصناف فقط؛ الإنتاج عبر API بـ blockUnits)
interface BlockType {
  id: number;
  code: string;
  name: string;
  length: number;
  width: number;
  height: number;
  stock: number;
  minStock: number;
  pricePerUnit: number;
}

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

export default function Production() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const t = useProductionDict();

  // ─── API state ───
  const [silos, setSilos] = useState<Silo[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [mixes, setMixes] = useState<MixDesign[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [notice, setNotice] = useState('');
  const [offlineFallback, setOfflineFallback] = useState(false);
  const [busy, setBusy] = useState(false);

  // ─── Local-only state (additives / block catalogue) ───
  const [additions, setAdditions] = useState<Addition[]>([
    { id: 1, name: 'مضاف تأخير شك', type: 'delay_set', dosagePerM3: 2.5, currentStock: 500, minStock: 100, unit: 'كجم', supplier: 'شركة الكيمياويات', costPerUnit: 15 },
    { id: 2, name: 'مضاف زيادة قوة', type: 'strength_enhance', dosagePerM3: 3.0, currentStock: 300, minStock: 80, unit: 'كجم', supplier: 'مصنع الإضافات', costPerUnit: 25 },
    { id: 3, name: 'مضاف متكامل', type: 'integrated', dosagePerM3: 4.0, currentStock: 400, minStock: 100, unit: 'كجم', supplier: 'شركة البناء', costPerUnit: 20 },
  ]);
  const [additionForm, setAdditionForm] = useState({ name: '', type: 'delay_set' as Addition['type'], dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' });
  const [editingAddition, setEditingAddition] = useState<number | null>(null);
  const [showBatchCtrl, setShowBatchCtrl] = useState(false);
  const [blocks] = useState<BlockType[]>([
    { id: 1, code: 'BLK-20x20x40', name: 'بلوك عادي', length: 40, width: 20, height: 20, stock: 5000, minStock: 1000, pricePerUnit: 2.5 },
    { id: 2, code: 'BLK-15x20x40', name: 'بلوك رفيع', length: 40, width: 20, height: 15, stock: 3000, minStock: 800, pricePerUnit: 2.0 },
  ]);

  // ─── Forms (API-backed) ───
  const [delivForm, setDelivForm] = useState({ siloId: '', qtyKg: '', invoice: '', notes: '' });
  const [batchForm, setBatchForm] = useState({ mixDesignId: '', volume: '', notes: '' });
  const [blockProdForm, setBlockProdForm] = useState({ mixDesignId: '', quantity: '', notes: '' });
  const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setApiError('');
    try {
      const [inv, mixList, runList] = await Promise.all([
        api.get<InventoryData>('/api/inventory'),
        api.get<MixDesign[]>('/api/mix-designs'),
        api.get<{ runs: Run[] }>('/api/production/runs'),
      ]);
      setSilos(inv.silos ?? []);
      setTransactions(inv.recentTransactions ?? []);
      setMixes(mixList ?? []);
      setRuns(runList.runs ?? []);
      setOfflineFallback(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message || 'تعذر تحميل البيانات';
      // Offline fallback ONLY if API fails AND local data exists
      try {
        const sInv = localStorage.getItem('plantInventory');
        const sDel = localStorage.getItem('plantDeliveries');
        const sRuns = localStorage.getItem('plantProductionRuns');
        if (sInv || sDel || sRuns) {
          setOfflineFallback(true);
          setApiError(`${msg} — عرض نسخة محلية محفوظة (Offline)`);
        } else {
          setApiError(msg);
        }
      } catch {
        setApiError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { if (currentUser) loadAll(); }, [currentUser, loadAll]);

  const errMsg = (e: unknown, fallback: string) =>
    e instanceof ApiError ? e.message : (e as Error)?.message || fallback;

  // ─── (1) استلام خامات → POST /api/inventory ───
  const addDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delivForm.siloId || !delivForm.qtyKg) return;
    setBusy(true);
    setApiError(''); setNotice('');
    try {
      await api.post('/api/inventory', {
        siloId: delivForm.siloId,
        quantityKg: Number(delivForm.qtyKg),
        referenceDoc: delivForm.invoice || undefined,
        notes: delivForm.notes || undefined,
      });
      setDelivForm({ siloId: '', qtyKg: '', invoice: '', notes: '' });
      setNotice('✅ تم تسجيل التوريد في الصومعة');
      await loadAll();
    } catch (e) {
      setApiError(errMsg(e, 'فشل تسجيل التوريد'));
    } finally {
      setBusy(false);
    }
  };

  // ─── (2) تشغيل خلطة خرسانية → POST /api/production/runs ───
  const runBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const vol = parseFloat(batchForm.volume);
    if (!batchForm.mixDesignId || !(vol > 0)) return;
    setBusy(true);
    setApiError(''); setNotice('');
    try {
      await api.post('/api/production/runs', {
        mixDesignId: batchForm.mixDesignId,
        volumeM3: vol,
        notes: batchForm.notes || undefined,
      });
      setBatchForm({ mixDesignId: '', volume: '', notes: '' });
      setNotice(`🚀 تم تسجيل تشغيل ${vol} م³ وخصم الصوامع`);
      await loadAll();
    } catch (e) {
      // Server 400/409 messages name the missing/low silos in Arabic — show as-is
      setApiError(errMsg(e, 'فشل تسجيل التشغيل'));
    } finally {
      setBusy(false);
    }
  };

  // ─── (3) إنتاج بلوك → POST /api/production/runs { blockUnits } ───
  const produceBlocks = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(blockProdForm.quantity, 10);
    if (!(qty > 0)) return;
    setBusy(true);
    setApiError(''); setNotice('');
    try {
      await api.post('/api/production/runs', {
        mixDesignId: blockProdForm.mixDesignId || undefined,
        blockUnits: qty,
        notes: blockProdForm.notes || undefined,
      });
      setBlockProdForm({ mixDesignId: '', quantity: '', notes: '' });
      setNotice(`🧱 تم تسجيل إنتاج ${qty} بلوك`);
      await loadAll();
    } catch (e) {
      setApiError(errMsg(e, 'فشل تسجيل إنتاج البلوك'));
    } finally {
      setBusy(false);
    }
  };

  // ─── Additives CRUD (local only) ───
  const addAddition = () => {
    if (!additionForm.name) return;
    const newAddition: Addition = {
      id: Date.now(),
      name: additionForm.name,
      type: additionForm.type,
      dosagePerM3: parseFloat(additionForm.dosagePerM3) || 0,
      currentStock: parseFloat(additionForm.currentStock) || 0,
      minStock: parseFloat(additionForm.minStock) || 0,
      unit: additionForm.unit,
      supplier: additionForm.supplier,
      costPerUnit: parseFloat(additionForm.costPerUnit) || 0,
    };
    setAdditions([...additions, newAddition]);
    setAdditionForm({ name: '', type: 'delay_set', dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' });
  };

  const updateAddition = (id: number) => {
    setAdditions(additions.map(a => a.id === id ? {
      ...a,
      name: additionForm.name || a.name,
      type: additionForm.type,
      dosagePerM3: parseFloat(additionForm.dosagePerM3) || a.dosagePerM3,
      currentStock: parseFloat(additionForm.currentStock) || a.currentStock,
      minStock: parseFloat(additionForm.minStock) || a.minStock,
      unit: additionForm.unit,
      supplier: additionForm.supplier || a.supplier,
      costPerUnit: parseFloat(additionForm.costPerUnit) || a.costPerUnit,
    } : a));
    setEditingAddition(null);
    setAdditionForm({ name: '', type: 'delay_set', dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' });
  };

  const deleteAddition = (id: number) => {
    if (confirm(t('deleteAdditionConfirm'))) {
      setAdditions(additions.filter(a => a.id !== id));
    }
  };

  const startEditAddition = (a: Addition) => {
    setEditingAddition(a.id);
    setAdditionForm({
      name: a.name,
      type: a.type,
      dosagePerM3: a.dosagePerM3.toString(),
      currentStock: a.currentStock.toString(),
      minStock: a.minStock.toString(),
      unit: a.unit,
      supplier: a.supplier,
      costPerUnit: a.costPerUnit.toString(),
    });
  };

  // ─── Derived display ───
  const receipts = transactions.filter(tx => tx.transactionType === 'RECEIPT');
  const inRange = (iso: string) => {
    const day = iso.slice(0, 10);
    return (!fromDate || day >= fromDate) && (!toDate || day <= toDate);
  };
  const filteredDeliv = receipts.filter(tx => inRange(tx.createdAt));
  const filteredRuns = runs.filter(r => inRange(r.producedAt));
  const totalPoured = runs.reduce((s, r) => s + num(r.volumeM3), 0);
  const avgLevel = silos.length ? silos.reduce((s, x) => s + (x.stockPct ?? 0), 0) / silos.length : 0;
  const lowCount = silos.filter(s => s.isLowStock).length;

  const exportCSV = () => {
    let csv = 'Timestamp,Recipe,Volume,Blocks,Notes\n';
    runs.forEach(p => { csv += `${p.producedAt},${p.designCode ?? ''},${p.volumeM3},${p.blockUnits},${(p.notes ?? '').replace(/,/g, ';')}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'production_runs.csv'; a.click();
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-black tracking-tight text-white">🏭 Concrete Production & Material Inventory</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowBatchCtrl(true)} className="bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 text-xs font-bold px-3 py-1.5 rounded-lg">{t('batchCtrl')}</button>
          <DeviceStatusBadge id="batchController" />
          <NotificationsBell />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
          <p className="text-[10px] text-emerald-500/80">Design by Dr. Ahmad Abdo Alyan</p>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {apiError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">{apiError}</div>}
        {notice && <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-4">{notice}</div>}
        {offlineFallback && <div className="text-[11px] text-yellow-200 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-1.5 mb-4">⚠️ وضع عدم الاتصال — البيانات المعروضة نسخة محلية محفوظة</div>}
        {loading && <div className="text-xs text-slate-400 mb-4">… جارٍ التحميل من الخادم</div>}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Poured', value: `${totalPoured.toFixed(1)} m³`, border: 'border-emerald-500' },
            { label: 'Silo Avg Level', value: `${avgLevel.toFixed(1)}%`, border: 'border-yellow-500' },
            { label: 'Deliveries', value: `${receipts.length} Logs`, border: 'border-sky-500' },
            { label: 'Low Stock Alerts', value: `${lowCount} Silos`, border: 'border-red-500' },
          ].map(kpi => (
            <div key={kpi.label} className={`bg-white/[0.04] rounded-xl p-5 border-l-4 ${kpi.border} shadow-lg`}>
              <p className="text-xs text-slate-400 mb-1">{kpi.label}</p><p className="text-xl font-bold text-white">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Silo Visuals — from GET /api/inventory */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {silos.map(silo => (
            <div key={silo.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center">
              <h4 className="text-sm text-slate-300 mb-1">{silo.siloName}</h4>
              <p className="text-[10px] text-slate-500 mb-3">{silo.siloCode} · {silo.materialCategory}</p>
              <div className="w-14 h-24 bg-white/[0.06] rounded-t-sm rounded-b-xl mx-auto relative overflow-hidden border-2 border-white/10 mb-3">
                <div className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${silo.isCritical ? 'bg-gradient-to-t from-red-600 to-red-300' : silo.isLowStock ? 'bg-gradient-to-t from-yellow-600 to-yellow-300' : 'bg-gradient-to-t from-emerald-600 to-emerald-300'}`} style={{ height: `${Math.min(silo.stockPct ?? 0, 100)}%` }} />
              </div>
              <p className="text-xs font-bold">{num(silo.currentStockKg).toLocaleString('en-US', { maximumFractionDigits: 0 })} كجم ({silo.stockPct ?? 0}%)</p>
              {silo.isLowStock && <p className="text-[10px] text-yellow-300 font-bold mt-1">⚠️ مخزون منخفض</p>}
            </div>
          ))}
          {silos.length === 0 && !loading && <div className="text-xs text-slate-500 col-span-full text-center py-4">لا صوامع مسجلة — سجل الصوامع أولاً</div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Forms */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-black tracking-tight text-white mb-4 pb-2 border-b border-white/10">➕ Raw Material Delivery</h3>
            <form onSubmit={addDelivery} className="space-y-3">
              <div><label className="text-xs text-slate-400 font-semibold">الصومعة</label><select value={delivForm.siloId} onChange={e => setDelivForm({ ...delivForm, siloId: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required><option value="">— اختر الصومعة —</option>{silos.map(s => <option key={s.id} value={s.id}>{s.siloName} ({s.siloCode})</option>)}</select></div>
              <div><label className="text-xs text-slate-400 font-semibold">الكمية (كجم)</label><input type="number" step="0.01" min="0" value={delivForm.qtyKg} onChange={e => setDelivForm({ ...delivForm, qtyKg: e.target.value })} placeholder="5000" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <div><label className="text-xs text-slate-400 font-semibold">Invoice</label><input value={delivForm.invoice} onChange={e => setDelivForm({ ...delivForm, invoice: e.target.value })} placeholder="INV-8879" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400 font-semibold">ملاحظات</label><input value={delivForm.notes} onChange={e => setDelivForm({ ...delivForm, notes: e.target.value })} placeholder="ملاحظات التوريد" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
              <button type="submit" disabled={busy} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg disabled:opacity-40">💾 Record Delivery</button>
            </form>

            <h3 className="text-lg font-black tracking-tight text-white mt-8 mb-4 pb-2 border-b border-white/10">⚙️ Run Manual Batch</h3>
            <form onSubmit={runBatch} className="space-y-3">
              <div><label className="text-xs text-slate-400 font-semibold">Concrete Recipe (الخلطة)</label>
                <select value={batchForm.mixDesignId} onChange={e => setBatchForm({ ...batchForm, mixDesignId: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required>
                  <option value="">— اختر الخلطة —</option>
                  {mixes.map((m) => <option key={m.id} value={m.id}>{m.designCode}{m.gradeDescription ? ` — ${m.gradeDescription}` : ''}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-400 font-semibold">Volume (m³)</label><input type="number" step="0.1" min="0" value={batchForm.volume} onChange={e => setBatchForm({ ...batchForm, volume: e.target.value })} placeholder="10" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <div><label className="text-xs text-slate-400 font-semibold">ملاحظات</label><input value={batchForm.notes} onChange={e => setBatchForm({ ...batchForm, notes: e.target.value })} placeholder="ملاحظات التشغيل" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
              <button type="submit" disabled={busy} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg disabled:opacity-40">🚀 Execute Batch</button>
            </form>

            {/* 🧱 إنتاج البلوك */}
            <h3 className="text-lg font-black tracking-tight text-white mt-8 mb-4 pb-2 border-b border-white/10">🧱 Produce Blocks</h3>
            <form onSubmit={produceBlocks} className="space-y-3">
              <div><label className="text-xs text-slate-400 font-semibold">Block Type</label>
                <select value={blockProdForm.mixDesignId} onChange={e => setBlockProdForm({ ...blockProdForm, mixDesignId: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                  <option value="">-- بدون خلطة (بدون خصم) --</option>
                  {mixes.map(m => (
                    <option key={m.id} value={m.id}>{m.designCode}{m.gradeDescription ? ` — ${m.gradeDescription}` : ''}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">كتالوج الأصناف: {blocks.map(b => `${b.code} (${b.name})`).join('، ')}</p>
              </div>
              <div><label className="text-xs text-slate-400 font-semibold">Quantity (Blocks)</label><input type="number" min="1" step="1" value={blockProdForm.quantity} onChange={e => setBlockProdForm({ ...blockProdForm, quantity: e.target.value })} placeholder="1000" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
              <div><label className="text-xs text-slate-400 font-semibold">ملاحظات</label><input value={blockProdForm.notes} onChange={e => setBlockProdForm({ ...blockProdForm, notes: e.target.value })} placeholder="ملاحظات الإنتاج" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
              <button type="submit" disabled={busy} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg disabled:opacity-40">🧱 Produce Blocks</button>
            </form>

            {/* 🧪 إدارة الإضافات الكيماوية */}
            <h3 className="text-lg font-black tracking-tight text-white mt-8 mb-4 pb-2 border-b border-white/10">{t('admixSection')}</h3>
            <div className="space-y-3">
              <input value={additionForm.name} onChange={e => setAdditionForm({ ...additionForm, name: e.target.value })} placeholder={t('namePlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              <select value={additionForm.type} onChange={e => setAdditionForm({ ...additionForm, type: e.target.value as Addition['type'] })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                <option value="delay_set">{t('delaySet')}</option>
                <option value="strength_enhance">{t('strengthEnhance')}</option>
                <option value="integrated">{t('integrated')}</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.1" value={additionForm.dosagePerM3} onChange={e => setAdditionForm({ ...additionForm, dosagePerM3: e.target.value })} placeholder={t('dosagePlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input type="number" step="0.1" value={additionForm.currentStock} onChange={e => setAdditionForm({ ...additionForm, currentStock: e.target.value })} placeholder={t('stockPlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.1" value={additionForm.minStock} onChange={e => setAdditionForm({ ...additionForm, minStock: e.target.value })} placeholder={t('minStockPlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
                <input type="number" step="0.1" value={additionForm.costPerUnit} onChange={e => setAdditionForm({ ...additionForm, costPerUnit: e.target.value })} placeholder={t('costPlaceholder')} className="bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              </div>
              <input value={additionForm.supplier} onChange={e => setAdditionForm({ ...additionForm, supplier: e.target.value })} placeholder={t('supplierPlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" />
              {editingAddition ? (
                <div className="flex gap-2">
                  <button onClick={() => updateAddition(editingAddition)} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg">{t('saveEdit')}</button>
                  <button onClick={() => { setEditingAddition(null); setAdditionForm({ name: '', type: 'delay_set', dosagePerM3: '', currentStock: '', minStock: '', unit: 'كجم', supplier: '', costPerUnit: '' }); }} className="flex-1 bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 rounded-lg">{t('cancel')}</button>
                </div>
              ) : (
                <button onClick={addAddition} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 rounded-lg">{t('addAddition')}</button>
              )}
            </div>
          </div>

          {/* 📊 حالة الصوامع */}
          <div className="space-y-6">
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-black tracking-tight text-white mb-4 pb-2 border-b border-white/10">📊 Silo Status vs Reorder Level</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Total Poured</p>
                <p className="text-lg font-bold text-white">{totalPoured.toFixed(1)} m³</p>
              </div>
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Runs</p>
                <p className="text-lg font-bold text-white">{runs.length}</p>
              </div>
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Silos</p>
                <p className="text-lg font-bold text-white">{silos.length}</p>
              </div>
              <div className="bg-[#0B111E] rounded-lg p-4">
                <p className="text-xs text-slate-400">Low Stock</p>
                <p className="text-lg font-bold text-white">{lowCount}</p>
              </div>
            </div>
            {lowCount > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400 font-bold mb-2">⚠️ Material Shortages Detected!</p>
                {silos.filter(s => s.isLowStock).map(s => <p key={s.id} className="text-sm text-slate-300">• {s.siloName} ({s.siloCode}): {num(s.currentStockKg).toFixed(0)} / {num(s.reorderLevelKg).toFixed(0)} كجم</p>)}
              </div>
            )}
            {lowCount === 0 && silos.length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <p className="text-emerald-400 font-bold">✅ All silos above reorder level</p>
              </div>
            )}
          </div>

          {/* Tables */}
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/10">
              <h3 className="text-lg font-black tracking-tight text-white">📋 Reconciliation Logs</h3>
              <div className="flex gap-2"><button onClick={exportCSV} className="bg-yellow-500 text-slate-900 text-xs px-3 py-1.5 rounded font-bold">Excel</button><button onClick={() => window.print()} className="bg-sky-500 text-white text-xs px-3 py-1.5 rounded font-bold">Print</button></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4"><DatePicker value={fromDate} onChange={setFromDate} label="From" /><DatePicker value={toDate} onChange={setToDate} label="To" /></div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">📥 Recent Deliveries</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">Date</th><th className="p-3">Silo</th><th className="p-3">Qty</th><th className="p-3">Balance</th><th className="p-3">Status</th></tr></thead>
                <tbody>{filteredDeliv.slice(0, 5).map((d) => <tr key={d.id} className="border-b border-white/10"><td className="p-3">{new Date(d.createdAt).toLocaleDateString()}</td><td className="p-3 uppercase font-bold">{d.siloName}</td><td className="p-3">+{num(d.quantityKg).toFixed(0)} كجم</td><td className="p-3">{num(d.balanceAfterKg).toFixed(0)} كجم</td><td className="p-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">Verified</span></td></tr>)}</tbody></table>
            </div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">🏭 Recent Production Runs</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">Time</th><th className="p-3">Recipe</th><th className="p-3">Vol</th><th className="p-3">Blocks</th><th className="p-3">Status</th></tr></thead>
                <tbody>{filteredRuns.slice(0, 5).map((p) => <tr key={p.id} className="border-b border-white/10"><td className="p-3">{new Date(p.producedAt).toLocaleString()}</td><td className="p-3 font-bold text-sky-400">{p.designCode ?? '—'}</td><td className="p-3">{num(p.volumeM3)} m³</td><td className="p-3">{p.blockUnits ?? 0}</td><td className="p-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">Dispatched</span></td></tr>)}</tbody></table>
            </div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">🧱 Recent Block Productions</h4>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">Date</th><th className="p-3">Recipe</th><th className="p-3">Qty</th><th className="p-3">Notes</th><th className="p-3">Status</th></tr></thead>
                <tbody>{filteredRuns.filter(r => (r.blockUnits ?? 0) > 0).slice(0, 5).map((p) => <tr key={p.id} className="border-b border-white/10"><td className="p-3">{new Date(p.producedAt).toLocaleDateString()}</td><td className="p-3 font-bold text-sky-400">{p.designCode ?? '—'}</td><td className="p-3">{p.blockUnits}</td><td className="p-3">{p.notes ?? '—'}</td><td className="p-3"><span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">Produced</span></td></tr>)}</tbody></table>
            </div>

            <h4 className="text-xs text-slate-400 uppercase mb-2">🧪 {t('admixTitle')} ({additions.length})</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300"><thead className="bg-white/[0.04] text-slate-400 text-xs uppercase"><tr><th className="p-3">{t('thName')}</th><th className="p-3">{t('thType')}</th><th className="p-3">{t('thDosage')}</th><th className="p-3">{t('thStock')}</th><th className="p-3">{t('thMinStock')}</th><th className="p-3">{t('thSupplier')}</th><th className="p-3">{t('thActions')}</th></tr></thead>
                <tbody>{additions.map(a => (
                  <tr key={a.id} className="border-b border-white/10">
                    <td className="p-3 font-bold text-white">{a.name}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${a.type === 'delay_set' ? 'bg-blue-500/20 text-blue-400' : a.type === 'strength_enhance' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/20 text-purple-400'}`}>{a.type === 'delay_set' ? t('delaySet') : a.type === 'strength_enhance' ? t('strengthEnhance') : t('integrated')}</span></td>
                    <td className="p-3">{a.dosagePerM3} {a.unit}</td>
                    <td className="p-3"><span className={a.currentStock < a.minStock ? 'text-red-400 font-bold' : 'text-emerald-400'}>{a.currentStock} {a.unit}</span></td>
                    <td className="p-3">{a.minStock} {a.unit}</td>
                    <td className="p-3">{a.supplier}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEditAddition(a)} className="bg-sky-500/20 text-sky-400 text-[10px] px-2 py-0.5 rounded hover:bg-sky-500/30">✏️</button>
                        <button onClick={() => deleteAddition(a.id)} className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded hover:bg-red-500/30">🗑️</button>
                      </div>
                    </td>
                  </tr>
                 ))}</tbody></table>
            </div>
          </div>
          </div>
        </div>
      </main>

      {/* نافذة ربط متحكم المحطة */}
      {showBatchCtrl && <BatchControllerIntegration onClose={() => setShowBatchCtrl(false)} />}
    </div>
  );
}
