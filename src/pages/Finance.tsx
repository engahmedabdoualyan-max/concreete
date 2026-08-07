import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadPayments, savePayments, loadPurchaseOrders, savePurchaseOrders, loadInventory } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import DatePicker from '../components/DatePicker';

interface Payment { id: number; date: string; client: string; orderNo: string; amount: number; method: string; status: 'paid' | 'partial' | 'pending'; note: string; }
interface PO { id: number; date: string; material: string; qty: number; unit: string; supplier: string; unitPrice: number; total: number; status: 'open' | 'delivered'; reason: string; }

const MATERIALS = [
  { key: 'cement', name: 'Cement', unit: 't', minStock: 20, reorder: 40, supplier: 'Al-Farouk Cement' },
  { key: 'sand', name: 'Sand', unit: 't', minStock: 40, reorder: 80, supplier: 'Desert Sand Co.' },
  { key: 'gravel', name: 'Gravel / Aggregate', unit: 't', minStock: 60, reorder: 100, supplier: 'Granite Aggregates' },
  { key: 'admixture', name: 'Admixture', unit: 'L', minStock: 300, reorder: 600, supplier: 'Sika / BASF' },
];

export default function Finance() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'payments' | 'reorder'>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pForm, setPForm] = useState({ date: new Date().toISOString().split('T')[0], client: '', orderNo: '', amount: '', method: 'bank', status: 'paid' as Payment['status'], note: '' });
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadPayments(currentUser.username), loadPurchaseOrders(currentUser.username), loadInventory(currentUser.username)])
      .then(([p, po, inv]) => {
        if (p?.length) setPayments(p); else { const s = localStorage.getItem('plantPayments'); if (s) setPayments(JSON.parse(s)); }
        if (po?.length) setPos(po); else { const s = localStorage.getItem('plantPOs'); if (s) setPos(JSON.parse(s)); }
        if (inv && typeof inv === 'object') {
          const init: Record<string, boolean> = {};
          MATERIALS.forEach(m => { init[m.key] = (Number(inv[m.key]) || 0) <= m.minStock; });
          setChecked(init);
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

  const generatePOs = () => {
    const selected = MATERIALS.filter(m => checked[m.key]);
    if (!selected.length) { alert('Select at least one material to reorder.'); return; }
    const now = new Date().toISOString().split('T')[0];
    const next = selected.map(m => {
      const total = m.reorder * (m.key === 'admixture' ? 12 : 650);
      return { id: Date.now() + Math.random(), date: now, material: m.name, qty: m.reorder, unit: m.unit, supplier: m.supplier, unitPrice: m.key === 'admixture' ? 12 : 650, total, status: 'open' as const, reason: `Auto reorder below min (${m.minStock}${m.unit})` };
    });
    setPos(prev => [...next, ...prev]);
    setChecked(Object.fromEntries(MATERIALS.map(m => [m.key, false])));
    alert(`✅ Generated ${next.length} purchase order${next.length > 1 ? 's' : ''} automatically.`);
  };

  const deliverPO = (id: number) => setPos(prev => prev.map(po => po.id === id ? { ...po, status: 'delivered' as const } : po));

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-blue-400 underline">Back to Login</Link></div>
      </div>
    );
  }

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalOutstanding = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const openPOs = pos.filter(po => po.status === 'open');
  const poValue = pos.reduce((s, po) => s + po.total, 0);

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💰 Finance: Payments & Auto Reorder</h1>
        </div>
        <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-2 gap-2 p-1 mb-5 bg-[#1e293b] rounded-xl border border-[#334155] max-w-md">
          <button onClick={() => setTab('payments')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'payments' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>💳 Payments</button>
          <button onClick={() => setTab('reorder')} className={`py-2 px-4 rounded-lg font-bold text-sm ${tab === 'reorder' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>📦 Auto Reorder (POs)</button>
        </div>

        {tab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-1">💳 Payment Entry</h3>
              <p className="text-xs text-slate-400 mb-4">Record client payments via mada / bank transfer / cash — with invoice-level status tracking.</p>
              <form onSubmit={addPayment} className="space-y-3">
                <DatePicker value={pForm.date} onChange={v => setPForm({ ...pForm, date: v })} label="Date" />
                <div><label className="text-xs text-slate-400 font-semibold">Client</label><input value={pForm.client} onChange={e => setPForm({ ...pForm, client: e.target.value })} placeholder="Client / customer" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Invoice #</label><input value={pForm.orderNo} onChange={e => setPForm({ ...pForm, orderNo: e.target.value })} placeholder="ORD-..." className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Amount (SAR)</label><input type="number" value={pForm.amount} onChange={e => setPForm({ ...pForm, amount: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Method</label>
                  <select value={pForm.method} onChange={e => setPForm({ ...pForm, method: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                    <option value="bank">🏦 Bank Transfer (IBAN)</option><option value="mada">💳 mada card</option><option value="visa">💳 Visa / Mastercard</option><option value="cash">💵 Cash</option><option value="cheque">📄 Cheque</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Status</label>
                  <select value={pForm.status} onChange={e => setPForm({ ...pForm, status: e.target.value as any })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                    <option value="paid">✅ Paid in full</option><option value="partial">⚠️ Partial payment</option><option value="pending">⏳ Pending / outstanding</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Note</label><input value={pForm.note} onChange={e => setPForm({ ...pForm, note: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg">💳 Record Payment</button>
              </form>
            </div>
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Collected (SAR)</p><p className="text-xl font-bold text-emerald-400">{totalPaid.toLocaleString()}</p></div>
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Outstanding (SAR)</p><p className="text-xl font-bold text-yellow-400">{totalOutstanding.toLocaleString()}</p></div>
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Transactions</p><p className="text-xl font-bold text-white">{payments.length}</p></div>
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Open POs</p><p className="text-xl font-bold text-orange-400">{openPOs.length}</p></div>
              </div>
              <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-[#334155] text-[10px]"><tr><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2">Invoice</th><th className="p-2">Method</th><th className="p-2">Amount</th><th className="p-2">Status</th></tr></thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id} className="border-b border-[#334155]/30">
                          <td className="p-2">{p.date}</td><td className="p-2 font-bold">{p.client}</td><td className="p-2">{p.orderNo}</td><td className="p-2">{p.method}</td>
                          <td className="p-2 font-bold text-emerald-400">{p.amount.toLocaleString()} SAR</td>
                          <td className="p-2">
                            {p.status === 'paid' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✅ Paid</span>}
                            {p.status === 'partial' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">⚠️ Partial</span>}
                            {p.status === 'pending' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">⏳ Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'reorder' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-1">📦 Material Reorder Alerts</h3>
              <p className="text-xs text-slate-400 mb-4">Live check against current raw stock. Materials below minimum are flagged — generate purchase orders in one click.</p>
              <div className="space-y-3">
                {MATERIALS.map(m => (
                  <label key={m.key} className="flex items-center gap-3 bg-[#0f172a] border border-[#334155] rounded-lg p-3 cursor-pointer">
                    <input type="checkbox" checked={!!checked[m.key]} onChange={e => setChecked({ ...checked, [m.key]: e.target.checked })} className="accent-orange-500 w-4 h-4" />
                    <span className="flex-1">
                      <span className="block font-bold text-white text-sm">{m.name}</span>
                      <span className="block text-[10px] text-slate-400">min {m.minStock}{m.unit} · reorder {m.reorder}{m.unit}</span>
                    </span>
                    {!!checked[m.key] && <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">🚨 LOW</span>}
                  </label>
                ))}
                <button onClick={generatePOs} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg">⚡ Auto Generate Purchase Orders</button>
                <p className="text-[10px] text-slate-500 text-center">P.O. total = reorder qty × unit price (cement/sand/gravel 650 SAR/t, admixture 12 SAR/L).</p>
              </div>
            </div>
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Open POs</p><p className="text-xl font-bold text-orange-400">{openPOs.length}</p></div>
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">PO value (SAR)</p><p className="text-xl font-bold text-white">{poValue.toLocaleString()}</p></div>
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Delivered</p><p className="text-xl font-bold text-emerald-400">{pos.filter(po => po.status === 'delivered').length}</p></div>
              </div>
              <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-[#334155] text-[10px]"><tr><th className="p-2">Date</th><th className="p-2">Material</th><th className="p-2">Qty</th><th className="p-2">Supplier</th><th className="p-2">Total (SAR)</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
                    <tbody>
                      {pos.map(po => (
                        <tr key={po.id} className="border-b border-[#334155]/30">
                          <td className="p-2">{po.date}</td><td className="p-2 font-bold">{po.material}</td><td className="p-2">{po.qty} {po.unit}</td><td className="p-2">{po.supplier}</td><td className="p-2 font-bold text-white">{po.total.toLocaleString()}</td>
                          <td className="p-2">
                            {po.status === 'open' ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">📦 Open</span> : <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">✅ Delivered</span>}
                          </td>
                          <td className="p-2">{po.status === 'open' && <button onClick={() => deliverPO(po.id)} className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-bold">Mark delivered</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
