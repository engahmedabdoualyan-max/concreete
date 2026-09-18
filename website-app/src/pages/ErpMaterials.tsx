/**
 * ============================================================
 *  FIMTO SOFT — ERP Materials & Inventory (الخامات والمخزون)
 * ============================================================
 *  Silos / stock levels, purchase requests (reorder), and
 *  mix-ratio (MixRatio) stock sufficiency checks via the ERP API.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ExportButtons from '../components/ExportButtons';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

interface Silo {
  id: string;
  siloCode: string;
  siloName: string;
  materialCategory: string;
  currentStockKg: string;
  capacityKg: string;
  reorderLevelKg: string;
  costSarPerTonne: string | null;
  stockPct: number;
  daysRemaining: number;
  isLowStock: boolean;
  isCritical: boolean;
}

interface InventoryData {
  silos: Silo[];
  alerts: { lowStockCount: number; criticalSilos: Silo[]; lowStockSilos: Silo[] };
  recentTransactions: { id: string; transactionType: string; quantityKg: string; balanceAfterKg: string; createdAt: string; notes: string | null; siloCode: string; siloName: string; performedByName: string | null }[];
}

interface PR {
  id: string;
  prNumber: string;
  materialCategory: string;
  requestedQuantityKg: string;
  stockAtGenerationKg: string;
  reorderLevelKg: string;
  status: string;
  priority: string;
  notes: string | null;
  createdAt: string;
  siloCode: string;
  siloName: string;
  generatedByName: string | null;
}

interface PRData { purchaseRequests: PR[]; openCount: number }

interface MixDesign {
  id: string;
  designCode: string;
  gradeDescription: string;
  targetStrengthMpa: string;
  targetSlumpCm: string;
  cementKgPerM3: string;
  sandKgPerM3: string;
  gravel10mmKgPerM3: string;
  gravel20mmKgPerM3: string;
  gravel40mmKgPerM3: string;
  waterLitresPerM3: string;
  admixturePlasiticzerLPerM3: string;
  admixtureRetarderLPerM3: string;
  flyAshKgPerM3: string;
  silicaFumeKgPerM3: string;
}

interface StockCheckLine {
  material: string;
  category: string;
  kgPerM3: number;
  requiredKg: number;
  availableKg: number;
  sufficient: boolean;
  shortageKg: number;
}

interface StockCheckResult {
  designCode: string;
  gradeDescription: string;
  quantityM3: number;
  lines: StockCheckLine[];
  ok: boolean;
  insufficientCount: number;
}

const CAT_LABEL: Record<string, string> = {
  CEMENT: 'أسمنت', SAND: 'رمل', GRAVEL_10MM: 'ركام 10مم', GRAVEL_20MM: 'ركام 20مم',
  GRAVEL_40MM: 'ركام 40مم', WATER: 'ماء', ADMIXTURE_PLASTICIZER: 'إضافات ملدنة',
  ADMIXTURE_RETARDER: 'إضافات مثبطة', ADMIXTURE_ACCELERATOR: 'إضافات مسرعة',
  FLY_ASH: 'رماد متطاير', SILICA_FUME: 'غبار سيليكا', STEEL_FIBER: 'ألياف فولاذية',
  POLYPROPYLENE_FIBER: 'ألياف بروبلين',
};

const STATUS_LABEL: Record<string, string> = {
  AUTO_GENERATED: 'تلقائي', ACKNOWLEDGED: 'مؤكَّد', QUOTED: 'عرض سعر',
  APPROVED: 'معتمد', ORDERED: 'تم الطلب', RECEIVED: 'مستلم', CANCELLED: 'ملغي',
};

const fmtKg = (n: string | number) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });

export default function ErpMaterials() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'inv' | 'pr' | 'mix'>('inv');
  const [inv, setInv] = useState<InventoryData | null>(null);
  const [prData, setPrData] = useState<PRData | null>(null);
  const [mixes, setMixes] = useState<MixDesign[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState({ siloId: '', quantityKg: '', notes: '' });
  const [stockCheck, setStockCheck] = useState({ designCode: '', quantityM3: '10' });
  const [stockResult, setStockResult] = useState<StockCheckResult | null>(null);

  const loadAll = () => {
    setError('');
    api.get<InventoryData>('/api/inventory').then(setInv).catch((e: any) => setError(e?.message || 'تعذر تحميل المخزون'));
    api.get<PRData>('/api/inventory/purchase-requests').then(setPrData).catch((e: any) => setError(e?.message || 'تعذر تحميل طلبات الشراء'));
    api.get<MixDesign[]>('/api/mix-designs').then(setMixes).catch((e: any) => setError(e?.message || 'تعذر تحميل الخلطات'));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(loadAll, []);

  const addReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/inventory', {
        siloId: receipt.siloId,
        quantityKg: Number(receipt.quantityKg),
        notes: receipt.notes || undefined,
      });
      setReceipt({ siloId: '', quantityKg: '', notes: '' });
      loadAll();
    } catch (e: any) {
      setError(e?.message || 'فشل تسجيل الاستلام');
    } finally {
      setBusy(false);
    }
  };

  const generatePR = async (siloId: string) => {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/inventory/purchase-requests', { siloId });
      loadAll();
    } catch (e: any) {
      setError(e?.message || 'فشل إنشاء طلب الشراء');
    } finally {
      setBusy(false);
    }
  };

  const runStockCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStockResult(null);
    try {
      const res = await api.post<StockCheckResult>('/api/mix-designs/stock-check', {
        designCode: stockCheck.designCode,
        quantityM3: Number(stockCheck.quantityM3),
      });
      setStockResult(res);
    } catch (e: any) {
      setError(e?.message || 'فشل فحص الخلطة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B111E]">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <button onClick={() => navigate('/')} className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← Dashboard</button>
          <h1 className="text-sm font-black tracking-tight text-white">🏗️ الخامات والمخزون</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currentUser && (
            <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          )}
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">🚪 خروج</button>
        </div>
      </div>
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-black text-white tracking-tight">🏗️ الخامات والمخزون وخلطات الإنتاج</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            filename={tab === 'inv' ? 'المخزون' : tab === 'pr' ? 'طلبات_إعادة_الطلب' : 'الخلطات'}
            title={tab === 'inv' ? 'تقارير المخزون' : tab === 'pr' ? 'طلبات إعادة الطلب' : 'خلطات الإنتاج'}
            columns={
              tab === 'inv'
                ? [
                    { header: 'الصومعة', key: 'silo' },
                    { header: 'الفئة', key: 'cat' },
                    { header: 'المخزون الحالي', key: 'stock' },
                    { header: 'حد إعادة الطلب', key: 'reorder' },
                    { header: 'السعة', key: 'cap' },
                    { header: 'الحالة', key: 'status' },
                  ]
                : tab === 'pr'
                ? [
                    { header: 'رقم الطلب', key: 'no' },
                    { header: 'الصومعة', key: 'silo' },
                    { header: 'الأولوية', key: 'prio' },
                    { header: 'التاريخ', key: 'date' },
                    { header: 'الحالة', key: 'status' },
                  ]
                : [
                    { header: 'الكود', key: 'code' },
                    { header: 'الاسم', key: 'name' },
                    { header: 'الأسمنت كجم/م³', key: 'cement' },
                    { header: 'الرمل كجم/م³', key: 'sand' },
                    { header: 'الحصى كجم/م³', key: 'gravel' },
                  ]
            }
            rows={
              tab === 'inv'
                ? (inv?.silos ?? []).map(s => ({
                    silo: `${s.siloName} (${s.siloCode})`,
                    cat: CAT_LABEL[s.materialCategory] ?? s.materialCategory,
                    stock: fmtKg(s.currentStockKg),
                    reorder: fmtKg(s.reorderLevelKg),
                    cap: fmtKg(s.capacityKg),
                    status: s.currentStockKg <= s.reorderLevelKg ? 'منخفض' : 'جيد',
                  }))
                : tab === 'pr'
                ? (prData?.purchaseRequests ?? []).map(p => ({
                    no: p.prNumber,
                    silo: p.siloName,
                    prio: p.priority,
                    date: new Date(p.createdAt).toLocaleDateString(),
                    status: p.status,
                  }))
                : (mixes ?? []).map(m => ({
                    code: m.designCode,
                    name: m.gradeDescription ?? m.designCode,
                    cement: m.cementKgPerM3 ?? 0,
                    sand: m.sandKgPerM3 ?? 0,
                    gravel: `${m.gravel10mmKgPerM3 ?? 0}+${m.gravel20mmKgPerM3 ?? 0}+${m.gravel40mmKgPerM3 ?? 0}`,
                  }))
            }
          />
          <div className="flex bg-white/[0.04] border border-white/10 rounded-lg overflow-hidden">
          <button onClick={() => setTab('inv')} className={`px-4 py-2 text-xs font-bold ${tab === 'inv' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>🛢️ المخزون</button>
          <button onClick={() => setTab('pr')} className={`px-4 py-2 text-xs font-bold ${tab === 'pr' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>📋 إعادة الطلب</button>
          <button onClick={() => setTab('mix')} className={`px-4 py-2 text-xs font-bold ${tab === 'mix' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>⚗️ الخلطات</button>
          </div>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {/* ── INVENTORY ── */}
      {tab === 'inv' && (
        <div className="space-y-4">
          {inv && inv.alerts.lowStockCount > 0 && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3">
              <div className="text-xs font-bold text-red-300 mb-2">⚠️ تنبيه انخفاض المخزون ({inv.alerts.lowStockCount} صوامع)</div>
              <div className="flex flex-wrap gap-2">
                {inv.alerts.lowStockSilos.map(s => (
                  <span key={s.id} className={`text-[10px] px-2 py-1 rounded border ${s.isCritical ? 'bg-red-500/20 border-red-500/50 text-red-200' : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200'}`}>
                    {s.siloName} — {fmtKg(s.currentStockKg)} / {fmtKg(s.reorderLevelKg)} كجم
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">🛢️ الصوامع وبنوك المواد</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(inv?.silos ?? []).map(s => (
                <div key={s.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <div className="text-xs font-bold text-white">{s.siloName}</div>
                      <div className="text-[10px] text-slate-400">{CAT_LABEL[s.materialCategory] ?? s.materialCategory} · {s.siloCode}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${s.isCritical ? 'bg-red-500/30 text-red-200' : s.isLowStock ? 'bg-yellow-500/20 text-yellow-200' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {s.isCritical ? 'حرج' : s.isLowStock ? 'منخفض' : 'جيد'}
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1">
                    <div className={`h-full ${s.isCritical ? 'bg-red-500' : s.isLowStock ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, s.stockPct)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{fmtKg(s.currentStockKg)} / {fmtKg(s.capacityKg)} كجم</span>
                    <span>{s.stockPct}%</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">حد إعادة الطلب: {fmtKg(s.reorderLevelKg)} كجم · السعة التخزينية: {fmtKg(s.capacityKg)} كجم</div>
                </div>
              ))}
              {(inv?.silos ?? []).length === 0 && <div className="text-xs text-slate-500 col-span-full text-center py-4">لا توجد صوامع</div>}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">🚚 استلام مخزون</h3>
            <form onSubmit={addReceipt} className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={receipt.siloId} onChange={e => setReceipt({ ...receipt, siloId: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required>
                <option value="">الصومعة *</option>
                {(inv?.silos ?? []).map(s => <option key={s.id} value={s.id}>{s.siloName} ({s.siloCode})</option>)}
              </select>
              <input type="number" step="0.01" value={receipt.quantityKg} onChange={e => setReceipt({ ...receipt, quantityKg: e.target.value })} placeholder="الكمية (كجم) *" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <input value={receipt.notes} onChange={e => setReceipt({ ...receipt, notes: e.target.value })} placeholder="ملاحظات / رقم الإذن" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <button type="submit" disabled={busy} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">💾 تسجيل الاستلام</button>
            </form>
          </div>

          {inv && inv.recentTransactions.length > 0 && (
            <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">📜 آخر الحركات ({inv.recentTransactions.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                    <tr>
                      <th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">الصومعة</th>
                      <th className="p-2">النوع</th><th className="p-2">الكمية (كجم)</th><th className="p-2">الرصيد بعد</th><th className="p-2 text-right">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.recentTransactions.map(tx => (
                      <tr key={tx.id} className="border-b border-white/10">
                        <td className="p-2 whitespace-nowrap">{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td className="p-2 font-semibold text-white">{tx.siloName}</td>
                        <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tx.transactionType === 'RECEIPT' ? 'bg-emerald-500/20 text-emerald-300' : tx.transactionType === 'CONSUMPTION' ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-300'}`}>{tx.transactionType}</span></td>
                        <td className="p-2 font-mono">{Number(tx.quantityKg) > 0 ? '+' : ''}{fmtKg(tx.quantityKg)}</td>
                        <td className="p-2 font-mono">{fmtKg(tx.balanceAfterKg)}</td>
                        <td className="p-2 text-slate-400">{tx.performedByName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PURCHASE REQUESTS ── */}
      {tab === 'pr' && (
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">📋 طلبات الشراء ({prData?.purchaseRequests.length ?? 0})</h3>
              {prData && prData.openCount > 0 && <span className="text-[10px] px-2 py-1 rounded bg-yellow-500/20 text-yellow-200 font-bold">مفتوح: {prData.openCount}</span>}
            </div>
            {prData && prData.purchaseRequests.length === 0 && <div className="text-xs text-slate-500 text-center py-4">لا توجد طلبات شراء — أنشئ واحداً من زر إنشاء طلب شراء أسفل الصوامع</div>}
            {prData && prData.purchaseRequests.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                    <tr>
                      <th className="p-2 text-right">الرقم</th><th className="p-2 text-right">المادة</th><th className="p-2 text-right">الصومعة</th>
                      <th className="p-2">الكمية (كجم)</th><th className="p-2">المخزون عند الإنشاء</th><th className="p-2">الأولوية</th><th className="p-2">الحالة</th><th className="p-2 text-right">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prData.purchaseRequests.map(pr => (
                      <tr key={pr.id} className="border-b border-white/10">
                        <td className="p-2 font-mono text-emerald-300">{pr.prNumber}</td>
                        <td className="p-2">{CAT_LABEL[pr.materialCategory] ?? pr.materialCategory}</td>
                        <td className="p-2 text-slate-400">{pr.siloName}</td>
                        <td className="p-2 font-mono">{fmtKg(pr.requestedQuantityKg)}</td>
                        <td className="p-2 font-mono">{fmtKg(pr.stockAtGenerationKg)}</td>
                        <td className="p-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pr.priority === 'URGENT' ? 'bg-red-500/30 text-red-200' : pr.priority === 'HIGH' ? 'bg-yellow-500/20 text-yellow-200' : 'bg-slate-500/20 text-slate-300'}`}>{pr.priority}</span></td>
                        <td className="p-2"><span className="px-2 py-0.5 rounded bg-white/10 text-slate-200 text-[10px]">{STATUS_LABEL[pr.status] ?? pr.status}</span></td>
                        <td className="p-2 text-slate-400">{pr.generatedByName ?? 'النظام'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">🛢️ إنشاء طلب شراء يدوي</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {(inv?.silos ?? []).map(s => (
                <div key={s.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-white">{s.siloName}</div>
                    <div className="text-[10px] text-slate-400">{CAT_LABEL[s.materialCategory]} · {fmtKg(s.currentStockKg)} / {fmtKg(s.reorderLevelKg)} كجم</div>
                  </div>
                  <button onClick={() => generatePR(s.id)} disabled={busy} className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30 disabled:opacity-40 whitespace-nowrap">📋 إنشاء PR</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MIX RATIOS ── */}
      {tab === 'mix' && (
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">⚗️ خلطات الإنتاج — المكونات لكل متر مكعب</h3>
            {mixes && mixes.length === 0 && <div className="text-xs text-slate-500 text-center py-4">لا توجد خلطات</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(mixes ?? []).map(m => (
                <div key={m.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-bold text-white">{m.designCode}</div>
                    <span className="text-[10px] text-slate-400">{Number(m.targetStrengthMpa)} MPa</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mb-2">{m.gradeDescription} · هبوط {Number(m.targetSlumpCm)} سم</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                    {[
                      ['أسمنت', m.cementKgPerM3, 'kg'],
                      ['رمل', m.sandKgPerM3, 'kg'],
                      ['ركام 10مم', m.gravel10mmKgPerM3, 'kg'],
                      ['ركام 20مم', m.gravel20mmKgPerM3, 'kg'],
                      ['ركام 40مم', m.gravel40mmKgPerM3, 'kg'],
                      ['ماء', m.waterLitresPerM3, 'L'],
                      ['ملدن', m.admixturePlasiticzerLPerM3, 'L'],
                      ['مثبط', m.admixtureRetarderLPerM3, 'L'],
                      ['رماد متطاير', m.flyAshKgPerM3, 'kg'],
                      ['سيليكا', m.silicaFumeKgPerM3, 'kg'],
                    ].filter(r => Number(r[1]) > 0).map(r => (
                      <div key={r[0] as string} className="flex justify-between border-b border-white/5 py-0.5">
                        <span className="text-slate-400">{r[0]}</span>
                        <span className="font-mono text-white">{Number(r[1])} {r[2]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">🔍 فحص توفر المواد للخلطة (MixRatio Check)</h3>
            <form onSubmit={runStockCheck} className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={stockCheck.designCode} onChange={e => setStockCheck({ ...stockCheck, designCode: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required>
                <option value="">الخلطة *</option>
                {(mixes ?? []).map(m => <option key={m.id} value={m.designCode}>{m.designCode} — {m.gradeDescription}</option>)}
              </select>
              <input type="number" step="0.5" min="0.5" value={stockCheck.quantityM3} onChange={e => setStockCheck({ ...stockCheck, quantityM3: e.target.value })} placeholder="الكمية (م³)" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <button type="submit" disabled={busy} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">🔍 فحص التوفر</button>
            </form>

            {stockResult && (
              <div className={`mt-4 rounded-lg border p-3 ${stockResult.ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
                <div className={`text-xs font-bold mb-2 ${stockResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                  {stockResult.ok ? `✅ الخلطة ${stockResult.designCode} متوفرة لكمية ${stockResult.quantityM3} م³` : `⚠️ الخلطة ${stockResult.designCode} — نقص في ${stockResult.insufficientCount} مكونات`}
                </div>
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                    <tr>
                      <th className="p-2 text-right">المادة</th><th className="p-2">كجم/م³</th>
                      <th className="p-2">المطلوب (كجم)</th><th className="p-2">المتاح (كجم)</th><th className="p-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockResult.lines.map(l => (
                      <tr key={l.category + l.material} className="border-b border-white/10">
                        <td className="p-2 font-semibold text-white">{l.material}</td>
                        <td className="p-2 font-mono">{l.kgPerM3}</td>
                        <td className="p-2 font-mono">{l.requiredKg}</td>
                        <td className="p-2 font-mono">{l.availableKg}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.sufficient ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/30 text-red-200'}`}>
                            {l.sufficient ? '✔ متوفر' : `ناقص ${l.shortageKg} كجم`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
