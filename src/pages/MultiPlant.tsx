import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { getAllPlantsSummary } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';

interface Row { username: string; plantName: string; country: string; city: string; trips: number; totalVolume: number; inventory: Record<string, number>; qcCount: number; orders: any[]; payments: any[]; pos: any[]; }

export default function MultiPlant() {
  const { currentUser } = useAuth();
  const { canManageAdmin } = useAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [costView, setCostView] = useState<'consolidated' | 'separate'>('consolidated');

  useEffect(() => {
    let mounted = true;
    getAllPlantsSummary().then(r => { if (mounted) setRows(r); }).catch(e => { console.error('MULTIPLANT_ERR', e); if (mounted) setRows([]); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (!currentUser || !canManageAdmin()) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-2">🔒 Owner Access Only</p><p className="text-slate-400 text-sm mb-4">This unified multi-plant dashboard is for the owner/manager role.</p><Link to="/" className="text-blue-400 underline">Back to Dashboard</Link></div>
      </div>
    );
  }

  const filtered = rows.filter(r => (r.plantName + r.username + r.city).toLowerCase().includes(filter.toLowerCase()));
  const totalTrips = rows.reduce((s, r) => s + r.trips, 0);
  const totalVolume = rows.reduce((s, r) => s + r.totalVolume, 0);
  const totalQC = rows.reduce((s, r) => s + r.qcCount, 0);
  const totalOrders = rows.reduce((s, r) => s + (r.orders?.length || 0), 0);
  const plantsWithQCLow = rows.filter(r => r.qcCount === 0).length;
  const totalCollected = rows.reduce((s, r) => s + (r.payments?.filter((p: any) => p.status === 'paid').reduce((x: number, p: any) => x + (Number(p.amount) || 0), 0) || 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + (r.payments?.filter((p: any) => p.status !== 'paid').reduce((x: number, p: any) => x + (Number(p.amount) || 0), 0) || 0), 0);
  const totalPOValue = rows.reduce((s, r) => s + (r.pos?.reduce((x: number, po: any) => x + (Number(po.total) || 0), 0) || 0), 0);
  const openPOs = rows.reduce((s, r) => s + (r.pos?.filter((po: any) => po.status === 'open').length || 0), 0);
  const revenue = totalCollected - totalPOValue;

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🏭 Multi-Plant Command Center</h1>
        </div>
        <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">👑 {currentUser.username}</span>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Plants</p><p className="text-xl font-bold text-white">{rows.length}</p></div>
          <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Trips</p><p className="text-xl font-bold text-sky-400">{totalTrips}</p></div>
          <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Volume (m³)</p><p className="text-xl font-bold text-blue-400">{totalVolume.toFixed(0)}</p></div>
          <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">QC tests</p><p className="text-xl font-bold text-emerald-400">{totalQC}</p></div>
          <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Orders</p><p className="text-xl font-bold text-orange-400">{totalOrders}</p></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-1 mb-4 bg-[#1e293b] rounded-xl border border-[#334155] max-w-lg">
          <button onClick={() => setCostView('consolidated')} className={`py-2 px-4 rounded-lg font-bold text-sm ${costView === 'consolidated' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>🏢 Consolidated HQ</button>
          <button onClick={() => setCostView('separate')} className={`py-2 px-4 rounded-lg font-bold text-sm ${costView === 'separate' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}>🏭 Separate cost centers</button>
          <div className="py-2 px-4 rounded-lg text-[10px] text-slate-400 self-center text-center">Net = collected − PO spend</div>
        </div>

        {costView === 'consolidated' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#1e293b] rounded-xl p-4 border border-emerald-500/40"><p className="text-xs text-slate-400">Collected (SAR)</p><p className="text-xl font-bold text-emerald-400">{totalCollected.toLocaleString()}</p></div>
            <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Outstanding (SAR)</p><p className="text-xl font-bold text-yellow-400">{totalOutstanding.toLocaleString()}</p></div>
            <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">PO spend (SAR)</p><p className="text-xl font-bold text-orange-400">{totalPOValue.toLocaleString()}</p></div>
            <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]"><p className="text-xs text-slate-400">Open POs</p><p className="text-xl font-bold text-white">{openPOs}</p></div>
            <div className="col-span-2 md:col-span-4 bg-[#0f172a] rounded-xl p-4 border border-emerald-500/30">
              <p className="text-xs text-slate-400">Group net position (SAR)</p>
              <p className={`text-3xl font-black ${revenue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{revenue >= 0 ? '+' : ''}{revenue.toLocaleString()}</p>
            </div>
          </div>
        )}

        {plantsWithQCLow > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4 mb-5 text-sm text-yellow-300">
            ⚠️ {plantsWithQCLow} plant{plantsWithQCLow > 1 ? 's have' : ' has'} no QC records yet — quality monitoring gap detected.
          </div>
        )}

        <div className="mb-4"><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="🔍 Filter by plant / city / username..." className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-lg p-3 text-white text-sm" /></div>

        {loading && <p className="text-slate-400 text-sm animate-pulse">Loading plants...</p>}

        <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-[#334155] text-[10px]"><tr><th className="p-2">Plant</th><th className="p-2">Location</th><th className="p-2">Trips</th><th className="p-2">Volume</th><th className="p-2">Cement</th><th className="p-2">Sand</th><th className="p-2">Gravel</th><th className="p-2">QC</th><th className="p-2">Orders</th>{costView === 'separate' && <th className="p-2">Collected</th>}{costView === 'separate' && <th className="p-2">Net</th>}<th className="p-2">Health</th></tr></thead>
              <tbody>
                {filtered.map(r => {
                  const cement = Number(r.inventory?.cement) || 0;
                  const health = r.qcCount > 0 && cement > 0 ? '🟢 Healthy' : (r.qcCount === 0 ? '🟡 No QC' : '🔴 Stock risk');
                  const healthColor = r.qcCount === 0 ? 'text-yellow-400' : (cement > 0 ? 'text-emerald-400' : 'text-red-400');
                  const collected = r.payments?.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0) || 0;
                  const poSpend = r.pos?.reduce((s: number, po: any) => s + (Number(po.total) || 0), 0) || 0;
                  return (
                    <tr key={r.username} className="border-b border-[#334155]/30 hover:bg-[#334155]/20">
                      <td className="p-2"><span className="font-bold text-white">{r.plantName}</span><span className="block text-[10px] text-slate-500">@{r.username}</span></td>
                      <td className="p-2">{r.country}, {r.city}</td>
                      <td className="p-2 font-bold text-sky-400">{r.trips}</td>
                      <td className="p-2 font-bold text-blue-400">{r.totalVolume.toFixed(1)} m³</td>
                      <td className="p-2">{(cement).toFixed(0)}t</td>
                      <td className="p-2">{Number(r.inventory?.sand || 0).toFixed(0)}t</td>
                      <td className="p-2">{Number(r.inventory?.gravel || 0).toFixed(0)}t</td>
                      <td className="p-2">{r.qcCount > 0 ? `${r.qcCount} ✓` : <span className="text-yellow-400">0 ⚠️</span>}</td>
                      <td className="p-2">{r.orders?.length || 0}</td>
                      {costView === 'separate' && <td className="p-2 font-bold text-emerald-400">{collected.toLocaleString()}</td>}
                      {costView === 'separate' && <td className={`p-2 font-bold ${collected - poSpend >= 0 ? 'text-white' : 'text-red-400'}`}>{(collected - poSpend).toLocaleString()}</td>}
                      <td className={`p-2 font-bold ${healthColor}`}>{health}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length === 0 && <p className="p-6 text-center text-slate-500 text-sm">No plants match the filter.</p>}
        </div>
      </div>
    </div>
  );
}
