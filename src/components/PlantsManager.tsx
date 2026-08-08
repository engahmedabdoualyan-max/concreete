import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadPlants, savePlants, loadBlockPlants, saveBlockPlants } from '../firebase/firestore';

interface Plant {
  id: string; name: string; location: string; type: string; status: string;
  target: number; actual: number; capacity: number; mixerCount: number; notes: string;
}

interface BlockPlant {
  id: string; name: string; location: string; blockType: string; status: string;
  target: number; actual: number; capacity: number; workers: number; machines: number; notes: string;
}

const BLOCK_TYPES = ['Hollow Block', 'Solid Block', 'Paver / Interlock', 'Curbstone', 'Prestressed'];

const inputCls = 'w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function statusColor(s: string) {
  if (s === 'Active') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (s === 'Maintenance' || s === 'Idle') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (s === 'Stopped') return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

function Prog({ target, actual }: { target: number; actual: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
        <span>Productivity</span>
        <span className={pct >= 100 ? 'text-emerald-400 font-bold' : 'text-slate-300'}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#0f172a] border border-[#334155] overflow-hidden">
        <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PlantsManager({ onToast }: { onToast: (msg: string) => void }) {
  const { currentUser } = useAuth();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [blocks, setBlocks] = useState<BlockPlant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'plants' | 'blocks'>('plants');
  const [pf, setPf] = useState<Plant>({ id: '', name: '', location: '', type: 'Ready-Mix Batching Plant', status: 'Active', target: 0, actual: 0, capacity: 0, mixerCount: '', notes: '' } as Plant);
  const [bf, setBf] = useState<BlockPlant>({ id: '', name: '', location: '', blockType: BLOCK_TYPES[0], status: 'Active', target: 0, actual: 0, capacity: 0, workers: '', machines: '', notes: '' } as BlockPlant);
  const [editingP, setEditingP] = useState<string | null>(null);
  const [editingB, setEditingB] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadPlants(currentUser.username), loadBlockPlants(currentUser.username)])
      .then(([p, b]) => {
        if (Array.isArray(p) && p.length > 0) setPlants(p);
        if (Array.isArray(b) && b.length > 0) setBlocks(b);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentUser?.username]);

  useEffect(() => { if (!loaded || !currentUser) return; savePlants(currentUser.username, plants).catch(() => {}); }, [plants, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; saveBlockPlants(currentUser.username, blocks).catch(() => {}); }, [blocks, loaded]);

  const num = (v: any) => Number(v) || 0;

  const addPlant = () => {
    if (!pf.name) { onToast('⚠️ Enter plant name first.'); return; }
    const np: Plant = { ...pf, id: pf.id || 'p' + Date.now(), target: num(pf.target), actual: num(pf.actual), capacity: num(pf.capacity), mixerCount: String(pf.mixerCount) };
    setPlants(prev => prev.some(x => x.id === np.id) ? prev.map(x => x.id === np.id ? np : x) : [...prev, np]);
    setEditingP(null);
    setPf({ id: '', name: '', location: '', type: 'Ready-Mix Batching Plant', status: 'Active', target: 0, actual: 0, capacity: 0, mixerCount: '', notes: '' } as Plant);
    onToast(np.id.startsWith('p') ? '✅ Plant added.' : '✅ Plant updated.');
  };

  const addBlock = () => {
    if (!bf.name) { onToast('⚠️ Enter block line name first.'); return; }
    const nb: BlockPlant = { ...bf, id: bf.id || 'b' + Date.now(), target: num(bf.target), actual: num(bf.actual), capacity: num(bf.capacity), workers: String(bf.workers), machines: String(bf.machines) };
    setBlocks(prev => prev.some(x => x.id === nb.id) ? prev.map(x => x.id === nb.id ? nb : x) : [...prev, nb]);
    setEditingB(null);
    setBf({ id: '', name: '', location: '', blockType: BLOCK_TYPES[0], status: 'Active', target: 0, actual: 0, capacity: 0, workers: '', machines: '', notes: '' } as BlockPlant);
    onToast(nb.id.startsWith('b') ? '✅ Block line added.' : '✅ Block line updated.');
  };

  const totalPTarget = plants.reduce((s, p) => s + p.target, 0);
  const totalPActual = plants.reduce((s, p) => s + p.actual, 0);
  const totalBTarget = blocks.reduce((s, b) => s + b.target, 0);
  const totalBActual = blocks.reduce((s, b) => s + b.actual, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4">
          <p className="text-xs text-slate-400">🏭 Ready-Mix Plants</p>
          <p className="text-2xl font-bold text-white">{plants.length}</p>
        </div>
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4">
          <p className="text-xs text-slate-400">🎯 Target / Actual (m³)</p>
          <p className="text-2xl font-bold text-white">{totalPActual} <span className="text-sm text-slate-400">/ {totalPTarget}</span></p>
        </div>
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4">
          <p className="text-xs text-slate-400">🧱 Block Lines</p>
          <p className="text-2xl font-bold text-white">{blocks.length}</p>
        </div>
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4">
          <p className="text-xs text-slate-400">🎯 Target / Actual (blocks)</p>
          <p className="text-2xl font-bold text-white">{totalBActual} <span className="text-sm text-slate-400">/ {totalBTarget}</span></p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('plants')} className={`px-4 py-2 rounded-lg font-bold text-sm border ${tab === 'plants' ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' : 'bg-[#1e293b] text-slate-300 border-[#334155] hover:bg-[#263449]'}`}>🏭 Ready-Mix Plants</button>
        <button onClick={() => setTab('blocks')} className={`px-4 py-2 rounded-lg font-bold text-sm border ${tab === 'blocks' ? 'bg-purple-600/20 text-purple-400 border-purple-500/50' : 'bg-[#1e293b] text-slate-300 border-[#334155] hover:bg-[#263449]'}`}>🧱 Block Factories</button>
      </div>

      {tab === 'plants' && (
        <div className="space-y-4">
          <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
            <h3 className="font-bold text-white mb-4">{editingP ? '✏️ Edit Plant' : '➕ Add Plant'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="block text-xs text-slate-400 mb-1">Plant Name *</label><input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Location</label><input value={pf.location} onChange={e => setPf({ ...pf, location: e.target.value })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Type</label><select value={pf.type} onChange={e => setPf({ ...pf, type: e.target.value })} className={inputCls}><option>Ready-Mix Batching Plant</option><option>Precast Yard</option><option>Block Line</option><option>Crushing Unit</option><option>Pump / RMC</option></select></div>
              <div><label className="block text-xs text-slate-400 mb-1">Status</label><select value={pf.status} onChange={e => setPf({ ...pf, status: e.target.value })} className={inputCls}><option>Active</option><option>Maintenance</option><option>Idle</option><option>Stopped</option></select></div>
              <div><label className="block text-xs text-slate-400 mb-1">🎯 Target / Day (m³)</label><input type="number" value={pf.target || ''} onChange={e => setPf({ ...pf, target: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">✅ Actual / Day (m³)</label><input type="number" value={pf.actual || ''} onChange={e => setPf({ ...pf, actual: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">⚡ Capacity (m³/h)</label><input type="number" value={pf.capacity || ''} onChange={e => setPf({ ...pf, capacity: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">🎛️ Mixers</label><input type="number" value={pf.mixerCount || ''} onChange={e => setPf({ ...pf, mixerCount: Number(e.target.value) })} className={inputCls} /></div>
            </div>
            <div className="mt-4"><label className="block text-xs text-slate-400 mb-1">Notes</label><input value={pf.notes} onChange={e => setPf({ ...pf, notes: e.target.value })} className={inputCls} /></div>
            <div className="flex gap-2 mt-4">
              <button onClick={addPlant} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm">{editingP ? '💾 Save Plant' : '➕ Add Plant'}</button>
              {editingP && <button onClick={() => { setEditingP(null); setPf({ id: '', name: '', location: '', type: 'Ready-Mix Batching Plant', status: 'Active', target: 0, actual: 0, capacity: 0, mixerCount: '', notes: '' } as Plant); }} className="bg-[#334155] hover:bg-[#3f4863] text-white px-4 py-2 rounded-lg font-bold text-sm">Cancel</button>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plants.length === 0 && <p className="text-slate-400 text-sm col-span-full bg-[#1e293b] rounded-2xl border border-[#334155] p-8 text-center">No plants yet — add your first ready-mix plant above.</p>}
            {plants.map(p => (
              <div key={p.id} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-5">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-bold text-white">🏭 {p.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.location || '—'} · {p.type}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${statusColor(p.status)}`}>{p.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-[#0f172a] rounded-lg p-2"><p className="text-[10px] text-slate-400">Target</p><p className="font-bold text-white">{p.target} m³</p></div>
                  <div className="bg-[#0f172a] rounded-lg p-2"><p className="text-[10px] text-slate-400">Actual</p><p className="font-bold text-emerald-400">{p.actual} m³</p></div>
                  <div className="bg-[#0f172a] rounded-lg p-2"><p className="text-[10px] text-slate-400">Capacity</p><p className="font-bold text-white">{p.capacity} m³/h</p></div>
                </div>
                <Prog target={p.target} actual={p.actual} />
                {p.notes && <p className="text-xs text-slate-400 mt-2">{p.notes}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setEditingP(p.id); setPf(p); }} className="bg-[#334155] hover:bg-[#3f4863] text-white px-3 py-1.5 rounded text-xs font-bold">✏️ Edit</button>
                  <button onClick={() => setPlants(prev => prev.filter(x => x.id !== p.id))} className="bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 px-3 py-1.5 rounded text-xs font-bold">🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'blocks' && (
        <div className="space-y-4">
          <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
            <h3 className="font-bold text-white mb-4">{editingB ? '✏️ Edit Block Line' : '➕ Add Block Line'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="block text-xs text-slate-400 mb-1">Line Name *</label><input value={bf.name} onChange={e => setBf({ ...bf, name: e.target.value })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Location</label><input value={bf.location} onChange={e => setBf({ ...bf, location: e.target.value })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Block Type</label><select value={bf.blockType} onChange={e => setBf({ ...bf, blockType: e.target.value })} className={inputCls}>{BLOCK_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-slate-400 mb-1">Status</label><select value={bf.status} onChange={e => setBf({ ...bf, status: e.target.value })} className={inputCls}><option>Active</option><option>Maintenance</option><option>Idle</option><option>Stopped</option></select></div>
              <div><label className="block text-xs text-slate-400 mb-1">🎯 Target / Day</label><input type="number" value={bf.target || ''} onChange={e => setBf({ ...bf, target: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">✅ Actual / Day</label><input type="number" value={bf.actual || ''} onChange={e => setBf({ ...bf, actual: Number(e.target.value) })} className={inputCls} /></div>
              <div><label className="block text-xs text-slate-400 mb-1">⚡ Capacity / Day</label><input type="number" value={bf.capacity || ''} onChange={e => setBf({ ...bf, capacity: Number(e.target.value) })} className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs text-slate-400 mb-1">👷 Workers</label><input type="number" value={bf.workers || ''} onChange={e => setBf({ ...bf, workers: Number(e.target.value) })} className={inputCls} /></div>
                <div><label className="block text-xs text-slate-400 mb-1">⚙️ Machines</label><input type="number" value={bf.machines || ''} onChange={e => setBf({ ...bf, machines: Number(e.target.value) })} className={inputCls} /></div>
              </div>
            </div>
            <div className="mt-4"><label className="block text-xs text-slate-400 mb-1">Notes</label><input value={bf.notes} onChange={e => setBf({ ...bf, notes: e.target.value })} className={inputCls} /></div>
            <div className="flex gap-2 mt-4">
              <button onClick={addBlock} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold text-sm">{editingB ? '💾 Save Line' : '➕ Add Line'}</button>
              {editingB && <button onClick={() => { setEditingB(null); setBf({ id: '', name: '', location: '', blockType: BLOCK_TYPES[0], status: 'Active', target: 0, actual: 0, capacity: 0, workers: '', machines: '', notes: '' } as BlockPlant); }} className="bg-[#334155] hover:bg-[#3f4863] text-white px-4 py-2 rounded-lg font-bold text-sm">Cancel</button>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {blocks.length === 0 && <p className="text-slate-400 text-sm col-span-full bg-[#1e293b] rounded-2xl border border-[#334155] p-8 text-center">No block lines yet — add your first block factory above.</p>}
            {blocks.map(b => (
              <div key={b.id} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-5">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-bold text-white">🧱 {b.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{b.location || '—'} · {b.blockType}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${statusColor(b.status)}`}>{b.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div className="bg-[#0f172a] rounded-lg p-2"><p className="text-[10px] text-slate-400">Target</p><p className="font-bold text-white">{b.target}</p></div>
                  <div className="bg-[#0f172a] rounded-lg p-2"><p className="text-[10px] text-slate-400">Actual</p><p className="font-bold text-emerald-400">{b.actual}</p></div>
                  <div className="bg-[#0f172a] rounded-lg p-2"><p className="text-[10px] text-slate-400">Capacity</p><p className="font-bold text-white">{b.capacity}</p></div>
                </div>
                {(b.workers || b.machines) && <p className="text-xs text-slate-400 mt-2">👷 {b.workers} workers · ⚙️ {b.machines} machines</p>}
                <Prog target={b.target} actual={b.actual} />
                {b.notes && <p className="text-xs text-slate-400 mt-2">{b.notes}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setEditingB(b.id); setBf(b); }} className="bg-[#334155] hover:bg-[#3f4863] text-white px-3 py-1.5 rounded text-xs font-bold">✏️ Edit</button>
                  <button onClick={() => setBlocks(prev => prev.filter(x => x.id !== b.id))} className="bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 px-3 py-1.5 rounded text-xs font-bold">🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
