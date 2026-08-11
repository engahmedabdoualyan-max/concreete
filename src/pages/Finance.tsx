import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadPayments, savePayments, loadPurchaseOrders, savePurchaseOrders, loadInventory, loadOrders } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';

interface Payment { id: number; date: string; client: string; orderNo: string; amount: number; method: string; status: 'paid' | 'partial' | 'pending'; note: string; link?: string; qr?: string; ref?: string; }
interface PO { id: number; date: string; material: string; qty: number; unit: string; supplier: string; unitPrice: number; total: number; status: 'open' | 'delivered'; reason: string; }

const DEMAND_PER_M3 = { cement: 0.38, sand: 0.7, gravel: 1.05 }; // t per m³

const MATERIALS = [
  { key: 'cement', name: 'Cement', unit: 't', minStock: 20, reorder: 40, supplier: 'Al-Farouk Cement' },
  { key: 'sand', name: 'Sand', unit: 't', minStock: 40, reorder: 80, supplier: 'Desert Sand Co.' },
  { key: 'gravel', name: 'Gravel / Aggregate', unit: 't', minStock: 60, reorder: 100, supplier: 'Granite Aggregates' },
  { key: 'admixture', name: 'Admixture', unit: 'L', minStock: 300, reorder: 600, supplier: 'Sika / BASF' },
];

export default function Finance() {
  const { currentUser } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState<'payments' | 'reorder'>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pForm, setPForm] = useState({ date: new Date().toISOString().split('T')[0], client: '', orderNo: '', amount: '', method: 'bank', status: 'paid' as Payment['status'], note: '' });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [stock, setStock] = useState<Record<string, number>>({});
  const [demandM3, setDemandM3] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadPayments(currentUser.username), loadPurchaseOrders(currentUser.username), loadInventory(currentUser.username), loadOrders(currentUser.username)])
      .then(([p, po, inv, ords]) => {
        if (p?.length) setPayments(p); else { const s = localStorage.getItem('plantPayments'); if (s) setPayments(JSON.parse(s)); }
        if (po?.length) setPos(po); else { const s = localStorage.getItem('plantPOs'); if (s) setPos(JSON.parse(s)); }
        if (inv && typeof inv === 'object') {
          setStock(inv);
          const init: Record<string, boolean> = {};
          MATERIALS.forEach(m => { init[m.key] = (Number(inv[m.key]) || 0) <= m.minStock; });
          setChecked(init);
        }
        if (Array.isArray(ords)) {
          const scheduledM3 = ords.filter(o => o.status === 'scheduled').reduce((s: number, o: any) => s + (Number(o.quantity) || 0), 0);
          setDemandM3(scheduledM3);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentUser?.username]);

  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantPayments', JSON.stringify(payments)); savePayments(currentUser.username, payments).catch(() => {}); }, [payments, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; localStorage.setItem('plantPOs', JSON.stringify(pos)); savePurchaseOrders(currentUser.username, pos).catch(() => {}); }, [pos, loaded]);

  const addPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPayments(prev => [...prev, { id: Date.now(), ...pForm, amount: Number(pForm.amount) } as any]);
    setPForm({ ...pForm, client: '', orderNo: '', amount: '', note: '' });
  };

  const generatePaymentRequest = async () => {
    const amt = Number(pForm.amount);
    if (!pForm.client || !amt) { alert(t('enterClientAmount')); return; }
    const ref = 'PAY-' + Date.now().toString().slice(-8);
    const link = `https://pay.fimtosoft.com/${ref}?amt=${amt}&client=${encodeURIComponent(pForm.client)}&method=${pForm.method}`;
    const payload = JSON.stringify({ ref, amount: amt, currency: 'SAR', client: pForm.client, method: pForm.method, merchant: 'FimtoSoft Concrete', timestamp: new Date().toISOString() });
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 200, color: { dark: '#000000', light: '#ffffff' } }).catch(() => '');
    setPayments(prev => [{ id: Date.now(), date: new Date().toISOString().split('T')[0], client: pForm.client, orderNo: pForm.orderNo, amount: amt, method: pForm.method, status: 'pending', note: `Payment request ${ref}`, link, qr, ref }, ...prev]);
    setPForm({ ...pForm, client: '', orderNo: '', amount: '', note: '' });
  };

  const confirmGateway = (id: number) => {
    setPayments(prev => prev.map(p => p.id === id ? { ...p, status: 'paid' as const, note: `${p.note} · confirmed via ${p.method} gateway` } : p));
    alert('✅ ' + t('paymentConfirmed'));
  };

  const generatePOs = () => {
    const selected = MATERIALS.filter(m => checked[m.key]);
    if (!selected.length) { alert(t('selectMaterialToReorder')); return; }
    const now = new Date().toISOString().split('T')[0];
    const next = selected.map(m => {
      const total = m.reorder * (m.key === 'admixture' ? 12 : 650);
      return { id: Date.now() + Math.random(), date: now, material: m.name, qty: m.reorder, unit: m.unit, supplier: m.supplier, unitPrice: m.key === 'admixture' ? 12 : 650, total, status: 'open' as const, reason: `Auto reorder below min (${m.minStock}${m.unit})` };
    });
    setPos(prev => [...next, ...prev]);
    setChecked(Object.fromEntries(MATERIALS.map(m => [m.key, false])));
    alert(`✅ ${t('generated')} ${next.length} ${t('purchaseOrder')}${next.length > 1 ? 's' : ''} ${t('automatically')}.`);
  };

  const deliverPO = (id: number) => setPos(prev => prev.map(po => po.id === id ? { ...po, status: 'delivered' as const } : po));

  const demandCoverage = (key: 'cement' | 'sand' | 'gravel') => {
    const needed = demandM3 * DEMAND_PER_M3[key];
    const current = Number(stock[key]) || 0;
    const onOrder = pos.filter(po => po.status === 'open' && po.material === MATERIALS.find(m => m.key === key)?.name).reduce((s, po) => s + po.qty, 0);
    return { needed, current, onOrder, short: Math.max(0, needed - current - onOrder) };
  };

  const genDemandPOs = () => {
    const cov = [demandCoverage('cement'), demandCoverage('sand'), demandCoverage('gravel')];
    const anyShort = cov.some(c => c.short > 0);
    if (!demandM3) { alert(t('noScheduledOrders')); return; }
    if (!anyShort) { alert('✅ ' + t('stockCoversDemand')); return; }
    const now = new Date().toISOString().split('T')[0];
    const next = MATERIALS.filter((m, i) => cov[i].short > 0).map(m => {
      const i = MATERIALS.indexOf(m);
      const qty = Math.ceil(cov[i].short * 2) / 2;
      const unitPrice = m.key === 'admixture' ? 12 : 650;
      return { id: Date.now() + Math.random(), date: now, material: m.name, qty, unit: m.unit, supplier: m.supplier, unitPrice, total: Math.round(qty * unitPrice), status: 'open' as const, reason: `Tomorrow demand shortfall (${demandM3} m³ scheduled)` };
    });
    setPos(prev => [...next, ...prev]);
    alert(`✅ ${t('generated')} ${next.length} ${t('purchaseOrder')}${next.length > 1 ? 's' : ''} ${t('toCoverTomorrowDemand')}.`);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 {t('accessDenied')}</p><Link to="/" className="text-sky-400 underline">{t('backToLogin')}</Link></div>
      </div>
    );
  }

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalOutstanding = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const openPOs = pos.filter(po => po.status === 'open');
  const poValue = pos.reduce((s, po) => s + po.total, 0);

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← {t('backToDashboard')}</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💰 {t('finance')}: {t('payments')} & {t('autoReorder')}</h1>
        </div>
        <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 gap-2 p-1 mb-5 bg-white/[0.04] rounded-xl border border-white/10 max-w-md backdrop-blur-xl">
          <button onClick={() => setTab('payments')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'payments' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>💳 {t('payments')}</button>
          <button onClick={() => setTab('reorder')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'reorder' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-sky-300'}`}>📦 {t('autoReorder')}</button>
        </div>

        {tab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">💳 {t('paymentEntry')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('paymentEntryDesc')}</p>
              <form onSubmit={addPayment} className="space-y-3">
                <DatePicker value={pForm.date} onChange={v => setPForm({ ...pForm, date: v })} label={t('date')} />
                <div><label className="text-xs text-slate-400 font-semibold">{t('client')}</label><input value={pForm.client} onChange={e => setPForm({ ...pForm, client: e.target.value })} placeholder={t('clientPlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">{t('invoiceNo')}</label><input value={pForm.orderNo} onChange={e => setPForm({ ...pForm, orderNo: e.target.value })} placeholder="ORD-..." className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('amount')} (SAR)</label><input type="number" value={pForm.amount} onChange={e => setPForm({ ...pForm, amount: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('method')}</label>
                  <select value={pForm.method} onChange={e => setPForm({ ...pForm, method: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="bank">🏦 {t('bankTransfer')}</option><option value="mada">💳 {t('madaCard')}</option><option value="visa">💳 {t('visaMastercard')}</option><option value="cash">💵 {t('cash')}</option><option value="cheque">📄 {t('cheque')}</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('status')}</label>
                  <select value={pForm.status} onChange={e => setPForm({ ...pForm, status: e.target.value as any })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm">
                    <option value="paid">✅ {t('paidInFull')}</option><option value="partial">⚠️ {t('partialPayment')}</option><option value="pending">⏳ {t('pendingOutstanding')}</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('notes')}</label><input value={pForm.note} onChange={e => setPForm({ ...pForm, note: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">💳 {t('recordPayment')}</button>
                <button type="button" onClick={generatePaymentRequest} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">🔗 {t('generatePaymentRequest')}</button>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('collected')} (SAR)</p><p className="text-xl font-bold text-emerald-400">{totalPaid.toLocaleString()}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('outstanding')} (SAR)</p><p className="text-xl font-bold text-yellow-400">{totalOutstanding.toLocaleString()}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('transactions')}</p><p className="text-xl font-bold text-white">{payments.length}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('openPos')}</p><p className="text-xl font-bold text-orange-400">{openPOs.length}</p></div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('date')}</th><th className="p-2 uppercase tracking-wider">{t('client')}</th><th className="p-2 uppercase tracking-wider">{t('invoice')}</th><th className="p-2 uppercase tracking-wider">{t('method')}</th><th className="p-2 uppercase tracking-wider">{t('amount')}</th><th className="p-2 uppercase tracking-wider">{t('status')}</th><th className="p-2 uppercase tracking-wider">{t('digitalPay')}</th></tr></thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} className="border-b border-white/10">
                          <td className="p-2">{p.date}</td><td className="p-2 font-bold">{p.client}</td><td className="p-2">{p.orderNo}</td><td className="p-2">{p.method}</td>
                          <td className="p-2 font-bold text-emerald-400">{p.amount.toLocaleString()} SAR</td>
                          <td className="p-2">
                            {p.status === 'paid' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✅ {t('paid')}</span>}
                            {p.status === 'partial' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">⚠️ {t('partial')}</span>}
                            {p.status === 'pending' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">⏳ {t('pending')}</span>}
                          </td>
                          <td className="p-2">
                            {p.status === 'pending' && p.qr ? (
                              <div className="flex items-center gap-2">
                                <img src={p.qr} alt={t('paymentQr')} className="w-12 h-12 rounded border border-white/10" />
                                <button onClick={() => confirmGateway(p.id)} className="text-[10px] bg-sky-500 hover:bg-sky-400 text-white px-2 py-1.5 rounded font-bold">{t('confirmGateway')}</button>
                              </div>
                            ) : p.ref ? <span className="text-[10px] text-slate-500">{p.ref}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mt-4 backdrop-blur-xl">
                <p className="text-xs font-bold text-white mb-2">🧾 {t('reconciliation')}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {Array.from(new Set(payments.map(p => p.client))).slice(0, 9).map(client => {
                    const out = payments.filter(p => p.client === client && p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
                    return (
                      <div key={client} className={`bg-white/[0.02] rounded-lg p-3 border ${out > 0 ? 'border-yellow-500/40' : 'border-emerald-500/30'}`}>
                        <p className="text-[11px] text-slate-400 truncate">{client}</p>
                        <p className={`text-sm font-bold ${out > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>{out > 0 ? `${out.toLocaleString()} SAR` : `✅ ${t('clear')}`}</p>
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
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">📅 {t('nextDayDemandCoverage')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('nextDayDemandCoverageDesc')}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-white/[0.02] rounded-xl p-4 border border-white/10"><p className="text-xs text-slate-400">{t('scheduledTomorrow')}</p><p className="text-xl font-bold text-white">{demandM3.toFixed(0)} m³</p></div>
                {(['cement', 'sand', 'gravel'] as const).map(k => {
                  const c = demandCoverage(k);
                  return (
                    <div key={k} className={`bg-white/[0.02] rounded-xl p-4 border ${c.short > 0 ? 'border-red-500/50' : 'border-emerald-500/40'}`}>
                      <p className="text-xs text-slate-400 capitalize">{k}</p>
                      <p className="text-xl font-bold text-white">{c.needed.toFixed(1)}t <span className="text-[10px] text-slate-500">{t('need')}</span></p>
                      <p className="text-[10px] text-slate-400">{t('have')} {c.current.toFixed(0)}t{c.onOrder > 0 ? ` + ${c.onOrder.toFixed(0)}t PO` : ''}</p>
                      <p className={`text-[10px] font-bold ${c.short > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{c.short > 0 ? `🚨 ${t('short')} ${c.short.toFixed(1)}t` : `✅ ${t('covered')}`}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={genDemandPOs} className="bg-amber-500 hover:bg-amber-400 text-white font-bold py-2.5 px-4 rounded-lg text-sm shadow-[0_0_20px_rgba(56,189,248,0.3)]">⚡ {t('generatePosForShortfall')}</button>
                <span className={`text-xs self-center font-bold ${demandCoverage('cement').short > 0 || demandCoverage('sand').short > 0 || demandCoverage('gravel').short > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {demandCoverage('cement').short > 0 || demandCoverage('sand').short > 0 || demandCoverage('gravel').short > 0 ? `🚨 ${t('stockAlertNoCover')}` : `✅ ${t('stockCoversCommitments')}`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">📦 {t('materialReorderAlerts')}</h3>
              <p className="text-xs text-slate-400 mb-4">{t('materialReorderAlertsDesc')}</p>
              <div className="space-y-3">
                {MATERIALS.map(m => (
                  <label key={m.key} className="flex items-center gap-3 bg-white/[0.02] border border-white/10 rounded-lg p-3 cursor-pointer">
                    <input type="checkbox" checked={!!checked[m.key]} onChange={e => setChecked({ ...checked, [m.key]: e.target.checked })} className="accent-orange-500 w-4 h-4" />
                    <span className="flex-1">
                      <span className="block font-bold text-white text-sm">{m.name}</span>
                      <span className="block text-[10px] text-slate-400">{t('min')} {m.minStock}{m.unit} · {t('reorder')} {m.reorder}{m.unit}</span>
                    </span>
                    {!!checked[m.key] && <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">🚨 {t('low')}</span>}
                  </label>
                ))}
                <button onClick={generatePOs} className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">⚡ {t('autoGeneratePurchaseOrders')}</button>
                <p className="text-[10px] text-slate-500 text-center">{t('poFormulaNote')}</p>
              </div>
            </div>
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('openPos')}</p><p className="text-xl font-bold text-orange-400">{openPOs.length}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('poValue')} (SAR)</p><p className="text-xl font-bold text-white">{poValue.toLocaleString()}</p></div>
                <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10 backdrop-blur-xl"><p className="text-xs text-slate-400">{t('delivered')}</p><p className="text-xl font-bold text-emerald-400">{pos.filter(po => po.status === 'delivered').length}</p></div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2 uppercase tracking-wider">{t('date')}</th><th className="p-2 uppercase tracking-wider">{t('material')}</th><th className="p-2 uppercase tracking-wider">{t('quantity')}</th><th className="p-2 uppercase tracking-wider">{t('supplier')}</th><th className="p-2 uppercase tracking-wider">{t('total')} (SAR)</th><th className="p-2 uppercase tracking-wider">{t('status')}</th><th className="p-2 uppercase tracking-wider"></th></tr></thead>
                    <tbody>
                      {pos.map(po => (
                        <tr key={po.id} className="border-b border-white/10">
                          <td className="p-2">{po.date}</td><td className="p-2 font-bold">{po.material}</td><td className="p-2">{po.qty} {po.unit}</td><td className="p-2">{po.supplier}</td><td className="p-2 font-bold text-white">{po.total.toLocaleString()}</td>
                          <td className="p-2">
                            {po.status === 'open' ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">📦 {t('open')}</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✅ {t('delivered')}</span>}
                          </td>
                          <td className="p-2">{po.status === 'open' && <button onClick={() => deliverPO(po.id)} className="text-[10px] bg-emerald-500 hover:bg-emerald-400 text-white px-2 py-1 rounded font-bold">{t('markDelivered')}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
