import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadRecipes, saveRecipes, loadCalibrationLogs, saveCalibrationLogs, loadQCRecords, saveQCRecords } from '../firebase/firestore';
import DatePicker from '../components/DatePicker';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';

// ============ Interfaces ============
interface Recipe { code: string; cement: number; sand: number; gravel: number; water: number; admixture: number; }
interface CalibrationCert {
  id: number; date: string; scaleType: string; target: number; measured: number; dev: number; status: string;
  reportFile: string; reportFileName: string; accreditation: string; accreditingBody: string; accreditationDate: string; notes: string;
}
interface QCRecord { id: number; date: string; truck: string; design: string; slump: number; break7d: number; break28d: number; blade: string; }

type Tab = 'recipes' | 'calibration' | 'mixDesigner' | 'quality';

const DEF_RECIPES: Recipe[] = [
  { code: 'C25', cement: 320, sand: 780, gravel: 1080, water: 160, admixture: 4.8 },
  { code: 'C30', cement: 350, sand: 750, gravel: 1100, water: 160, admixture: 5.5 },
  { code: 'C35', cement: 380, sand: 720, gravel: 1120, water: 155, admixture: 6.2 },
  { code: 'C40', cement: 420, sand: 680, gravel: 1140, water: 150, admixture: 7.5 },
];

export default function MixingQuality() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>('recipes');
  
  // Data states
  const [recipes, setRecipes] = useState<Recipe[]>(DEF_RECIPES);
  const [calibLogs, setCalibLogs] = useState<CalibrationCert[]>([]);
  const [qcRecords, setQcRecords] = useState<QCRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Forms
  const [recipeForm, setRecipeForm] = useState({ code: '', cement: '', sand: '', gravel: '', water: '', admixture: '' });
  const [calForm, setCalForm] = useState({
    date: new Date().toISOString().split('T')[0], scaleType: 'Cement Scale', measured: '',
    reportFileName: '', reportFile: '', accreditation: '', accreditingBody: '', accreditationDate: '', notes: '',
  });
  const [designerForm, setDesignerForm] = useState({
    targetStrength: '30', maxAggregateSize: '20', slump: '12', fineModulus: '2.6',
    cementType: 'OPC', aggregateType: 'Crushed', waterAbsorption: '1.5',
  });
  const [designerResult, setDesignerResult] = useState<Recipe | null>(null);
  const [qcForm, setQcForm] = useState({ truck: 'm01', design: 'C30', slump: '', break7d: '', break28d: '', blade: 'Optimal' });
  
  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [trucks, setTrucks] = useState<string[]>(['m01', 'm02', 'm03', 'm04']);

  // Load data
  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      loadRecipes(currentUser.username),
      loadCalibrationLogs(currentUser.username),
      loadQCRecords(currentUser.username)
    ]).then(([r, c, q]) => {
      if (r?.length) setRecipes(r); else { const s = localStorage.getItem('plantRecipes'); if (s) setRecipes(JSON.parse(s)); }
      if (c?.length) setCalibLogs(c); else { const s = localStorage.getItem('calibrationLogs'); if (s) setCalibLogs(JSON.parse(s)); }
      if (q?.length) setQcRecords(q); else { const s = localStorage.getItem('qcRecords'); if (s) setQcRecords(JSON.parse(s)); }
      setLoaded(true);
    }).catch(() => { setLoaded(true); });
  }, [currentUser?.username]);

  // Save data
  useEffect(() => { if (!loaded) return; localStorage.setItem('plantRecipes', JSON.stringify(recipes)); if (currentUser) saveRecipes(currentUser.username, recipes).catch(() => {}); }, [recipes, loaded]);
  useEffect(() => { if (!loaded) return; localStorage.setItem('calibrationLogs', JSON.stringify(calibLogs)); if (currentUser) saveCalibrationLogs(currentUser.username, calibLogs).catch(() => {}); }, [calibLogs, loaded]);
  useEffect(() => { if (!loaded) return; localStorage.setItem('qcRecords', JSON.stringify(qcRecords)); if (currentUser) saveQCRecords(currentUser.username, qcRecords).catch(() => {}); }, [qcRecords, loaded]);

  // Load trucks from trips
  useEffect(() => {
    try {
      const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (saved) { const trips = JSON.parse(saved); const codes = [...new Set(trips.map((t: any) => t.code))].filter(Boolean); if (codes.length) setTrucks(codes as string[]); }
    } catch {}
  }, []);

  // ============ Recipe Functions ============
  const addRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    const code = recipeForm.code.trim().toUpperCase();
    if (!code) return;
    if (recipes.some(r => r.code === code)) { alert('❌ Recipe code already exists!'); return; }
    setRecipes(prev => [...prev, { code, cement: +recipeForm.cement, sand: +recipeForm.sand, gravel: +recipeForm.gravel, water: +recipeForm.water, admixture: +recipeForm.admixture }]);
    setRecipeForm({ code: '', cement: '', sand: '', gravel: '', water: '', admixture: '' });
  };
  const deleteRecipe = (idx: number) => { if (confirm('Remove this recipe?')) setRecipes(prev => prev.filter((_, i) => i !== idx)); };

  // ============ Calibration Functions ============
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCalForm(prev => ({ ...prev, reportFile: reader.result as string, reportFileName: file.name })); };
    reader.readAsDataURL(file);
  };
  const addCalibration = (e: React.FormEvent) => {
    e.preventDefault();
    const scaleType = calForm.scaleType;
    const measured = parseFloat(calForm.measured);
    let target = 500; if (scaleType === 'Aggregate Scale') target = 1000; if (scaleType === 'Water Scale') target = 200;
    const dev = ((measured - target) / target) * 100;
    let status = 'Passed'; if (Math.abs(dev) > 1.5) status = 'Failed'; else if (Math.abs(dev) > 0.8) status = 'Warning';
    setCalibLogs(prev => [...prev, { id: Date.now(), date: calForm.date, scaleType, target, measured, dev, status, reportFile: calForm.reportFile, reportFileName: calForm.reportFileName, accreditation: calForm.accreditation, accreditingBody: calForm.accreditingBody, accreditationDate: calForm.accreditationDate, notes: calForm.notes }]);
    setCalForm({ date: new Date().toISOString().split('T')[0], scaleType: 'Cement Scale', measured: '', reportFileName: '', reportFile: '', accreditation: '', accreditingBody: '', accreditationDate: '', notes: '' });
  };
  const deleteCalibration = (id: number) => { if (confirm('Delete?')) setCalibLogs(prev => prev.filter(c => c.id !== id)); };

  // ============ Mix Designer Functions ============
  const calculateMixDesign = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(designerForm.targetStrength);
    const maxAgg = parseFloat(designerForm.maxAggregateSize);
    const slump = parseFloat(designerForm.slump);
    const fm = parseFloat(designerForm.fineModulus);
    let waterEstimate = 0;
    if (maxAgg <= 10) waterEstimate = slump <= 10 ? 180 : 205;
    else if (maxAgg <= 20) waterEstimate = slump <= 10 ? 160 : 185;
    else if (maxAgg <= 40) waterEstimate = slump <= 10 ? 145 : 165;
    else waterEstimate = slump <= 10 ? 130 : 150;
    let wcRatio = 0.5;
    if (target >= 40) wcRatio = 0.35; else if (target >= 35) wcRatio = 0.40; else if (target >= 30) wcRatio = 0.45; else if (target >= 25) wcRatio = 0.50; else wcRatio = 0.58;
    const cement = Math.round(waterEstimate / wcRatio);
    let coarseAggVol = 0.65;
    if (fm >= 2.8) coarseAggVol = maxAgg <= 20 ? 0.67 : 0.73;
    else if (fm >= 2.4) coarseAggVol = maxAgg <= 20 ? 0.65 : 0.71;
    else coarseAggVol = maxAgg <= 20 ? 0.63 : 0.69;
    const coarseAggDensity = 2.65; const fineAggDensity = 2.60; const cementDensity = 3.15;
    const coarseAgg = Math.round(coarseAggVol * coarseAggDensity * 1000);
    const cementVol = cement / (cementDensity * 1000); const waterVol = waterEstimate / 1000; const coarseAggAbsVol = coarseAgg / (coarseAggDensity * 1000); const airVol = 0.02;
    const fineAggVol = 1 - cementVol - waterVol - coarseAggAbsVol - airVol;
    const sand = Math.round(fineAggVol * fineAggDensity * 1000);
    const admixture = Math.round(cement * 1.2) / 100;
    setDesignerResult({ code: `C${target}`, cement: Math.round(cement / 5) * 5, sand: Math.round(sand / 5) * 5, gravel: Math.round(coarseAgg / 5) * 5, water: Math.round(waterEstimate), admixture: parseFloat(admixture.toFixed(1)) });
  };

  // ============ QC Functions ============
  const addQCRecord = (e: React.FormEvent) => {
    e.preventDefault();
    setQcRecords(prev => [...prev, { id: Date.now(), date: new Date().toISOString().split('T')[0], truck: qcForm.truck, design: qcForm.design, slump: +qcForm.slump, break7d: +qcForm.break7d, break28d: +qcForm.break28d, blade: qcForm.blade }]);
    setQcForm({ truck: 'm01', design: 'C30', slump: '', break7d: '', break28d: '', blade: 'Optimal' });
    alert('🔬 QC data saved!');
  };

  // Filtered data
  const filteredCalib = calibLogs.filter(c => (!fromDate || c.date >= fromDate) && (!toDate || c.date <= toDate));
  const filteredQC = qcRecords.filter(r => (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate));
  const totalSlump = filteredQC.reduce((s, r) => s + r.slump, 0);
  const total7d = filteredQC.reduce((s, r) => s + r.break7d, 0);
  const passed28d = filteredQC.filter(r => { const target = parseInt(r.design.replace('C', '')); return r.break28d >= target; }).length;
  const count = filteredQC.length || 1;

  const exportRecipesCSV = () => {
    let csv = 'Code,Cement,Sand,Gravel,Water,Admixture\n';
    recipes.forEach(r => { csv += `${r.code},${r.cement},${r.sand},${r.gravel},${r.water},${r.admixture}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'recipes.csv'; a.click();
  };
  const exportQCCSV = () => {
    let csv = 'Date,Truck,Design,Slump,7-Day,28-Day,Blade\n';
    qcRecords.forEach(r => { csv += `${r.date},${r.truck},${r.design},${r.slump},${r.break7d},${r.break28d},${r.blade}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quality_records.csv'; a.click();
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-blue-400 underline">Back to Login</Link></div></div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🎛️ Mixing & Quality Control</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-2 p-4 max-w-6xl mx-auto">
        {[
          { id: 'recipes', label: '📋 Recipes', icon: '📋' },
          { id: 'calibration', label: '⚖️ Calibration', icon: '⚖️' },
          { id: 'mixDesigner', label: '🧮 Mix Designer', icon: '🧮' },
          { id: 'quality', label: '🔬 Quality Control', icon: '🔬' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)} className={`py-2 px-4 rounded-lg font-bold text-sm transition ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-[#1e293b] text-slate-400 border border-[#334155] hover:bg-blue-600/30'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {/* Recipes Tab */}
        {tab === 'recipes' && (
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">➕ Add Recipe</h3>
              <form onSubmit={addRecipe} className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">Code</label><input value={recipeForm.code} onChange={e => setRecipeForm({ ...recipeForm, code: e.target.value })} placeholder="C30" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Cement (kg)</label><input type="number" value={recipeForm.cement} onChange={e => setRecipeForm({ ...recipeForm, cement: e.target.value })} placeholder="350" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Sand (kg)</label><input type="number" value={recipeForm.sand} onChange={e => setRecipeForm({ ...recipeForm, sand: e.target.value })} placeholder="750" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Gravel (kg)</label><input type="number" value={recipeForm.gravel} onChange={e => setRecipeForm({ ...recipeForm, gravel: e.target.value })} placeholder="1100" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">Water (kg)</label><input type="number" value={recipeForm.water} onChange={e => setRecipeForm({ ...recipeForm, water: e.target.value })} placeholder="160" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">Admixture (kg)</label><input type="number" step="0.1" value={recipeForm.admixture} onChange={e => setRecipeForm({ ...recipeForm, admixture: e.target.value })} placeholder="5.5" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg">💾 Save Recipe</button>
              </form>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">📋 Recipes ({recipes.length})</h3>
                <button onClick={exportRecipesCSV} className="bg-yellow-500 text-slate-900 text-xs px-3 py-1.5 rounded font-bold">📊 Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-[#334155] text-[10px]">
                    <tr><th className="p-2">Code</th><th className="p-2">Cement</th><th className="p-2">Sand</th><th className="p-2">Gravel</th><th className="p-2">Water</th><th className="p-2">Admix</th><th className="p-2">Act</th></tr>
                  </thead>
                  <tbody>
                    {recipes.map((r, i) => (
                      <tr key={i} className="border-b border-[#334155]/30">
                        <td className="p-2 font-bold text-purple-400">{r.code}</td>
                        <td className="p-2">{r.cement}</td><td className="p-2">{r.sand}</td><td className="p-2">{r.gravel}</td>
                        <td className="p-2">{r.water}</td><td className="p-2">{r.admixture}</td>
                        <td className="p-2"><button onClick={() => deleteRecipe(i)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Calibration Tab */}
        {tab === 'calibration' && (
          <div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">⚖️ Calibration Record</h3>
              <form onSubmit={addCalibration} className="space-y-3">
                <DatePicker value={calForm.date} onChange={val => setCalForm({ ...calForm, date: val })} label="Date" required />
                <div><label className="text-xs text-slate-400 font-semibold">Scale Type</label>
                  <select value={calForm.scaleType} onChange={e => setCalForm({ ...calForm, scaleType: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                    <option>Cement Scale (500kg)</option><option>Aggregate Scale (1000kg)</option><option>Water Scale (200kg)</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Measured Weight (kg)</label><input type="number" step="0.01" value={calForm.measured} onChange={e => setCalForm({ ...calForm, measured: e.target.value })} placeholder="502.5" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Upload Report</label><input type="file" accept=".pdf,.jpg,.png" onChange={handleFileUpload} className="w-full text-xs text-slate-400" /></div>
                {calForm.reportFileName && <p className="text-xs text-emerald-400">✓ {calForm.reportFileName}</p>}
                <div><label className="text-xs text-slate-400 font-semibold">Accreditation</label><input value={calForm.accreditation} onChange={e => setCalForm({ ...calForm, accreditation: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" /></div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg">💾 Save Calibration</button>
              </form>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">⚖️ Calibration Logs ({filteredCalib.length})</h3>
              <div className="grid grid-cols-2 gap-3 mb-4"><DatePicker value={fromDate} onChange={setFromDate} label="From" /><DatePicker value={toDate} onChange={setToDate} label="To" /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-[#334155] text-[10px]"><tr><th className="p-2">Date</th><th className="p-2">Scale</th><th className="p-2">Target</th><th className="p-2">Measured</th><th className="p-2">Dev%</th><th className="p-2">Status</th><th className="p-2">Report</th><th className="p-2">Act</th></tr></thead>
                  <tbody>
                    {filteredCalib.map(c => (
                      <tr key={c.id} className="border-b border-[#334155]/30">
                        <td className="p-2">{c.date}</td><td className="p-2 font-bold">{c.scaleType}</td>
                        <td className="p-2">{c.target}</td><td className="p-2">{c.measured}</td>
                        <td className={`p-2 font-bold ${Math.abs(c.dev) > 1.5 ? 'text-red-400' : Math.abs(c.dev) > 0.8 ? 'text-yellow-400' : 'text-emerald-400'}`}>{c.dev.toFixed(2)}%</td>
                        <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.status === 'Passed' ? 'bg-emerald-500/20 text-emerald-400' : c.status === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{c.status}</span></td>
                        <td className="p-2">{c.reportFileName ? <a href={c.reportFile} download={c.reportFileName} className="text-blue-400 underline">📄</a> : '-'}</td>
                        <td className="p-2"><button onClick={() => deleteCalibration(c.id)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Mix Designer Tab */}
        {tab === 'mixDesigner' && (
          <div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">🧮 Mix Design Calculator</h3>
              <form onSubmit={calculateMixDesign} className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">Target Strength (MPa)</label><input type="number" value={designerForm.targetStrength} onChange={e => setDesignerForm({ ...designerForm, targetStrength: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Max Aggregate Size (mm)</label>
                  <select value={designerForm.maxAggregateSize} onChange={e => setDesignerForm({ ...designerForm, maxAggregateSize: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">
                    <option value="10">10mm</option><option value="20">20mm</option><option value="40">40mm</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Slump (cm)</label><input type="number" value={designerForm.slump} onChange={e => setDesignerForm({ ...designerForm, slump: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Fine Modulus</label><input type="number" step="0.1" value={designerForm.fineModulus} onChange={e => setDesignerForm({ ...designerForm, fineModulus: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg">🧮 Calculate</button>
              </form>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">📊 Result</h3>
              {designerResult ? (
                <div className="space-y-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <p className="text-emerald-400 font-bold text-lg">{designerResult.code}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0f172a] rounded-lg p-4"><p className="text-xs text-slate-400">Cement</p><p className="text-lg font-bold text-white">{designerResult.cement} kg</p></div>
                    <div className="bg-[#0f172a] rounded-lg p-4"><p className="text-xs text-slate-400">Sand</p><p className="text-lg font-bold text-white">{designerResult.sand} kg</p></div>
                    <div className="bg-[#0f172a] rounded-lg p-4"><p className="text-xs text-slate-400">Gravel</p><p className="text-lg font-bold text-white">{designerResult.gravel} kg</p></div>
                    <div className="bg-[#0f172a] rounded-lg p-4"><p className="text-xs text-slate-400">Water</p><p className="text-lg font-bold text-white">{designerResult.water} kg</p></div>
                    <div className="bg-[#0f172a] rounded-lg p-4"><p className="text-xs text-slate-400">Admixture</p><p className="text-lg font-bold text-white">{designerResult.admixture} kg</p></div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-12">Enter parameters and calculate</p>
              )}
            </div>
          </div>
        )}

        {/* Quality Tab */}
        {tab === 'quality' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">🔬 QC Record</h3>
              <form onSubmit={addQCRecord} className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">Truck</label><select value={qcForm.truck} onChange={e => setQcForm({ ...qcForm, truck: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm">{trucks.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="text-xs text-slate-400 font-semibold">Design</label><select value={qcForm.design} onChange={e => setQcForm({ ...qcForm, design: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm"><option value="C25">C25</option><option value="C30">C30</option><option value="C35">C35</option><option value="C40">C40</option></select></div>
                <div><label className="text-xs text-slate-400 font-semibold">Slump (cm)</label><input type="number" value={qcForm.slump} onChange={e => setQcForm({ ...qcForm, slump: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">7-Day (MPa)</label><input type="number" step="0.1" value={qcForm.break7d} onChange={e => setQcForm({ ...qcForm, break7d: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">28-Day (MPa)</label><input type="number" step="0.1" value={qcForm.break28d} onChange={e => setQcForm({ ...qcForm, break28d: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm" required /></div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg">💾 Save</button>
              </form>
            </div>
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">🔬 QC Records ({filteredQC.length})</h3>
                <button onClick={exportQCCSV} className="bg-yellow-500 text-slate-900 text-xs px-3 py-1.5 rounded font-bold">📊 Export</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-[#0f172a] rounded-lg p-3"><p className="text-xs text-slate-400">Samples</p><p className="text-lg font-bold text-white">{filteredQC.length}</p></div>
                <div className="bg-[#0f172a] rounded-lg p-3"><p className="text-xs text-slate-400">7-Day Avg</p><p className="text-lg font-bold text-blue-400">{(total7d / count).toFixed(1)} MPa</p></div>
                <div className="bg-[#0f172a] rounded-lg p-3"><p className="text-xs text-slate-400">28-Day Pass</p><p className="text-lg font-bold text-emerald-400">{((passed28d / count) * 100).toFixed(0)}%</p></div>
                <div className="bg-[#0f172a] rounded-lg p-3"><p className="text-xs text-slate-400">Slump Avg</p><p className="text-lg font-bold text-yellow-400">{(totalSlump / count).toFixed(1)} cm</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4"><DatePicker value={fromDate} onChange={setFromDate} label="From" /><DatePicker value={toDate} onChange={setToDate} label="To" /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-[#334155] text-[10px]"><tr><th className="p-2">Date</th><th className="p-2">Truck</th><th className="p-2">Design</th><th className="p-2">Slump</th><th className="p-2">7-Day</th><th className="p-2">28-Day</th><th className="p-2">Pass</th></tr></thead>
                  <tbody>
                    {filteredQC.map(r => {
                      const target = parseInt(r.design.replace('C', ''));
                      const pass = r.break28d >= target;
                      return (
                        <tr key={r.id} className="border-b border-[#334155]/30">
                          <td className="p-2">{r.date}</td><td className="p-2 font-bold">{r.truck}</td><td className="p-2 text-blue-400">{r.design}</td>
                          <td className="p-2">{r.slump}</td><td className="p-2">{r.break7d}</td><td className="p-2">{r.break28d}</td>
                          <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pass ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{pass ? '✓' : '✗'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
