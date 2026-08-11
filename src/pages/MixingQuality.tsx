import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadRecipes, saveRecipes, loadCalibrationLogs, saveCalibrationLogs, loadQCRecords, saveQCRecords, loadPlantLogo, loadOrders, loadTrips, addNotification } from '../firebase/firestore';
import DatePicker from '../components/DatePicker';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import NotificationsBell from '../components/NotificationsBell';

// ============ Interfaces ============
interface Recipe { code: string; cement: number; sand: number; gravel: number; water: number; admixture: number; }
interface CalibrationCert {
  id: number; date: string; scaleType: string; target: number; measured: number; dev: number; status: string;
  reportFile: string; reportFileName: string; accreditation: string; accreditingBody: string; accreditationDate: string; notes: string;
}
interface QCRecord { id: number; date: string; truck: string; design: string; slump: number; break7d: number; break28d: number; blade: string; bonNo: string; customer: string; site: string; mixDesignCode: string; orderId?: string; sampleId?: string; }
interface CompensatedResult { base: Recipe; water: number; admixture: number; temp: number; humidity: number; note: string; }

type Tab = 'recipes' | 'calibration' | 'mixDesigner' | 'quality' | 'aiPredictor';

const DEF_RECIPES: Recipe[] = [
  { code: 'C25', cement: 320, sand: 780, gravel: 1080, water: 160, admixture: 4.8 },
  { code: 'C30', cement: 350, sand: 750, gravel: 1100, water: 160, admixture: 5.5 },
  { code: 'C35', cement: 380, sand: 720, gravel: 1120, water: 155, admixture: 6.2 },
  { code: 'C40', cement: 420, sand: 680, gravel: 1140, water: 150, admixture: 7.5 },
];

export default function MixingQuality() {
  const { currentUser } = useAuth();
  const { t } = useLang();
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
    ambientTemp: '25', humidity: '60',
  });
  const [designerResult, setDesignerResult] = useState<CompensatedResult | null>(null);
  const [qcForm, setQcForm] = useState({ truck: 'm01', design: 'C30', slump: '', break7d: '', break28d: '', blade: 'Optimal', bonNo: '', customer: '', site: '', mixDesignCode: '', orderId: '' });
  const [aiForm, setAiForm] = useState({ design: 'C30', slump: '12', break7d: '22' });
  const [aiResult, setAiResult] = useState<{ predicted: number; target: number; margin: number; ok: boolean; confidence: number; rmse: number; band: number; reliability: 'high' | 'medium' | 'low' } | null>(null);
  const [aiR2, setAiR2] = useState('—');
  const [aiRMSE, setAiRMSE] = useState('—');
  const [aiTrainSamples, setAiTrainSamples] = useState(0);
  const [aiPredictions, setAiPredictions] = useState<{ id: number; date: string; design: string; slump: number; break7d: number; predicted: number; target: number; ok: boolean }[]>([]);
  
  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [trucks, setTrucks] = useState<string[]>(['m01', 'm02', 'm03', 'm04']);
  const [orders, setOrders] = useState<any[]>([]);

  // Load data
  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      loadRecipes(currentUser.username),
      loadCalibrationLogs(currentUser.username),
      loadQCRecords(currentUser.username),
      loadOrders(currentUser.username),
    ]).then(([r, c, q, o]) => {
      if (r?.length) setRecipes(r); else { const s = localStorage.getItem('plantRecipes'); if (s) setRecipes(JSON.parse(s)); }
      if (c?.length) setCalibLogs(c); else { const s = localStorage.getItem('calibrationLogs'); if (s) setCalibLogs(JSON.parse(s)); }
      if (q?.length) setQcRecords(q); else { const s = localStorage.getItem('qcRecords'); if (s) setQcRecords(JSON.parse(s)); }
      if (Array.isArray(o)) setOrders(o);
      setLoaded(true);
    }).catch(() => { setLoaded(true); });
  }, [currentUser?.username]);

  // Save data
  useEffect(() => { if (!loaded) return; localStorage.setItem('plantRecipes', JSON.stringify(recipes)); if (currentUser) saveRecipes(currentUser.username, recipes).catch(() => {}); }, [recipes, loaded]);
  useEffect(() => { if (!loaded) return; localStorage.setItem('calibrationLogs', JSON.stringify(calibLogs)); if (currentUser) saveCalibrationLogs(currentUser.username, calibLogs).catch(() => {}); }, [calibLogs, loaded]);
  useEffect(() => { if (!loaded) return; localStorage.setItem('qcRecords', JSON.stringify(qcRecords)); if (currentUser) saveQCRecords(currentUser.username, qcRecords).catch(() => {}); }, [qcRecords, loaded]);

  // Load trucks from trips (Firestore-first, cross-device)
  useEffect(() => {
    if (!currentUser) return;
    loadTrips(currentUser.username).then(fbTrips => {
      if (Array.isArray(fbTrips) && fbTrips.length) {
        const codes = [...new Set(fbTrips.map((t: any) => t.code))].filter(Boolean);
        if (codes.length) setTrucks(codes as string[]);
      } else {
        try {
          const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
          if (saved) { const trips = JSON.parse(saved); const codes = [...new Set(trips.map((t: any) => t.code))].filter(Boolean); if (codes.length) setTrucks(codes as string[]); }
        } catch {}
      }
    }).catch(() => {
      try {
        const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
        if (saved) { const trips = JSON.parse(saved); const codes = [...new Set(trips.map((t: any) => t.code))].filter(Boolean); if (codes.length) setTrucks(codes as string[]); }
      } catch {}
    });
  }, [currentUser?.username]);

  // ============ Recipe Functions ============
  const addRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    const code = recipeForm.code.trim().toUpperCase();
    if (!code) return;
    if (recipes.some(r => r.code === code)) { alert('❌ ' + t('recipeCodeExists')); return; }
    setRecipes(prev => [...prev, { code, cement: +recipeForm.cement, sand: +recipeForm.sand, gravel: +recipeForm.gravel, water: +recipeForm.water, admixture: +recipeForm.admixture }]);
    setRecipeForm({ code: '', cement: '', sand: '', gravel: '', water: '', admixture: '' });
  };
  const deleteRecipe = (idx: number) => { if (confirm(t('removeThisRecipe'))) setRecipes(prev => prev.filter((_, i) => i !== idx)); };

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
  const deleteCalibration = (id: number) => { if (confirm(t('deleteQuestion'))) setCalibLogs(prev => prev.filter(c => c.id !== id)); };

  // ============ Mix Designer Functions (with environment compensation) ============
  const calculateMixDesign = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(designerForm.targetStrength);
    const maxAgg = parseFloat(designerForm.maxAggregateSize);
    const slump = parseFloat(designerForm.slump);
    const fm = parseFloat(designerForm.fineModulus);
    const temp = parseFloat(designerForm.ambientTemp) || 25;
    const humidity = parseFloat(designerForm.humidity) || 60;
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
    const baseAdmix = Math.round(cement * 1.2) / 100;

    // Environment compensation factors
    const waterCorr = (temp - 25) * 0.6 + (60 - humidity) * 0.4;
    const admixCorr = (temp - 25) * 0.05 + (60 - humidity) * 0.02;
    const water = Math.round((waterEstimate + waterCorr) * 10) / 10;
    const admixture = parseFloat((baseAdmix + admixCorr).toFixed(2));
    const note = waterCorr > 1.5 ? t('hotDryWeatherNote') : waterCorr < -1.5 ? t('coolHumidWeatherNote') : t('ambientWithinRange');

    setDesignerResult({
      base: { code: `C${target}`, cement: Math.round(cement / 5) * 5, sand: Math.round(sand / 5) * 5, gravel: Math.round(coarseAgg / 5) * 5, water: Math.round(waterEstimate), admixture: parseFloat(baseAdmix.toFixed(1)) },
      water, admixture, temp, humidity, note,
    });
  };

  const saveDesignAsRecipe = () => {
    if (!designerResult) return;
    const code = designerResult.base.code;
    if (recipes.some(r => r.code === code)) { alert('❌ ' + t('recipeCodeExists')); return; }
    setRecipes(prev => [...prev, { ...designerResult.base, water: designerResult.water, admixture: designerResult.admixture }]);
    alert('✅ ' + t('savedAsRecipe') + ' ' + code);
  };

  // ============ QC Functions ============
  const addQCRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const order = orders.find(o => o.id === qcForm.orderId);
    const orderId = order?.orderNo || '';
    const sampleId = order ? `${order.customerCode || 'NA'}-${order.orderNo || order.id}` : '';
    setQcRecords(prev => [...prev, { id: Date.now(), date: new Date().toISOString().split('T')[0], truck: qcForm.truck, design: qcForm.design, slump: +qcForm.slump, break7d: +qcForm.break7d, break28d: +qcForm.break28d, blade: qcForm.blade, bonNo: qcForm.bonNo || sampleId, customer: order?.customerName || qcForm.customer, site: order?.projectName || qcForm.site, mixDesignCode: qcForm.mixDesignCode, orderId, sampleId: sampleId || undefined }]);
    setQcForm({ truck: 'm01', design: 'C30', slump: '', break7d: '', break28d: '', blade: 'Optimal', bonNo: '', customer: '', site: '', mixDesignCode: '', orderId: '' });
    if (order && currentUser) addNotification(currentUser.username, {
      level: 'info', title: '🔬 ' + t('labSampleNotificationTitle') + ' ' + (sampleId || order.orderNo),
      body: t('labSampleNotificationBody') + ' ' + order.orderNo + ' · ' + t('truck') + ' ' + qcForm.truck + ' · ' + qcForm.design + ' — ' + sampleId,
    }).catch(() => {});
    alert('🔬 ' + t('qcDataSaved') + (sampleId ? ` — ${t('sampleId')}: ${sampleId}` : ''));
  };

  const printQCRecord = async (r: QCRecord) => {
    const target = parseInt(r.design.replace('C', ''));
    const pass = r.break28d >= target;
    const logo = currentUser ? await loadPlantLogo(currentUser.username).catch(() => '') : '';
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${t('qualityReport')} — ${r.bonNo || r.id}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0f172a;padding:32px;max-width:760px;margin:auto}
        h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;color:#64748b;font-weight:normal;margin:0 0 20px}
        .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f172a;padding-bottom:12px;margin-bottom:20px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:20px}
        .field{font-size:12px}.field b{display:block;font-size:11px;color:#64748b;text-transform:uppercase}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left}
        th{background:#f1f5f9;font-size:11px;text-transform:uppercase}
        .pass{color:#16a34a;font-weight:bold}.fail{color:#dc2626;font-weight:bold}
        .footer{margin-top:40px;display:flex;justify-content:space-between;font-size:11px;color:#64748b}
      </style></head><body>
      <div class="head">
        <div style="display:flex;align-items:center;gap:14px">
          ${logo ? `<img src="${logo}" style="height:64px;max-width:110px;object-fit:contain" />` : ''}
          <div><h1>🔬 ${t('concreteQualityTestReport')}</h1><h2>${currentUser?.plantName || t('readyMixConcretePlant')}</h2></div>
        </div>
        <div style="text-align:right"><div class="field" style="font-size:12px"><b>${t('reportDate')}</b>${r.date}</div><div class="field" style="font-size:12px"><b>${t('ticketBonNo')}</b>${r.bonNo || '—'}</div></div>
      </div>
      <div class="grid">
        <div class="field"><b>${t('mixDesign')}</b>${r.design}${r.mixDesignCode ? ' (' + r.mixDesignCode + ')' : ''}</div>
        <div class="field"><b>${t('mixerTruck')}</b>${r.truck}</div>
        <div class="field"><b>${t('customer')}</b>${r.customer || '—'}</div>
        <div class="field"><b>${t('siteProject')}</b>${r.site || '—'}</div>
      </div>
      <table>
        <tr><th>${t('test')}</th><th>${t('result')}</th><th>${t('requirement')}</th><th>${t('status')}</th></tr>
        <tr><td>${t('slumpTest')}</td><td>${r.slump} cm</td><td>${t('designSlump')}</td><td>${r.slump >= 8 && r.slump <= 18 ? '<span class="pass">✓ ' + t('pass') + '</span>' : '<span class="fail">✗ ' + t('check') + '</span>'}</td></tr>
        <tr><td>${t('compressive7Days')}</td><td>${r.break7d} MPa</td><td>≈ ${(target * 0.65).toFixed(1)} MPa</td><td>${r.break7d >= target * 0.65 ? '<span class="pass">✓ ' + t('pass') + '</span>' : '<span class="fail">✗ ' + t('fail') + '</span>'}</td></tr>
        <tr><td>${t('compressive28Days')}</td><td>${r.break28d} MPa</td><td>${target} MPa</td><td>${pass ? '<span class="pass">✓ ' + t('pass') + '</span>' : '<span class="fail">✗ ' + t('fail') + '</span>'}</td></tr>
      </table>
      <p style="font-size:11px;color:#64748b;margin-top:16px">${t('bladeCondition')}: <b>${r.blade}</b></p>
      <div class="footer"><span>${t('certifiedByFimto')}</span><span>${t('reportLinkedToBon')}</span></div>
      <script>window.onload=function(){window.print()}<\/script>
      </body></html>`);
    w.document.close();
  };

  // Filtered data
  const filteredCalib = calibLogs.filter(c => (!fromDate || c.date >= fromDate) && (!toDate || c.date <= toDate));
  const filteredQC = qcRecords.filter(r => (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate));
  const totalSlump = filteredQC.reduce((s, r) => s + r.slump, 0);
  const total7d = filteredQC.reduce((s, r) => s + r.break7d, 0);
  const passed28d = filteredQC.filter(r => { const target = parseInt(r.design.replace('C', '')); return r.break28d >= target; }).length;
  const count = filteredQC.length || 1;

  // ===== AI: multi-feature regression (design, slump, 7d) -> 28d =====
  const solveLeastSquares = (rows: number[][], y: number[]): number[] | null => {
    const n = rows[0].length;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) A[j][k] += rows[i][j] * rows[i][k];
        b[j] += rows[i][j] * y[i];
      }
    }
    for (let i = 0; i < n; i++) A[i].push(b[i]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      if (Math.abs(A[col][col]) < 1e-10) return null;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col] / A[col][col];
        for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
      }
    }
    return A.map((row, i) => row[n] / A[i][i]);
  };

  const trainModel = () => {
    const samples = qcRecords.filter(r => r.break28d > 0 && r.break7d > 0 && r.slump > 0);
    if (samples.length < 3) return null;
    const ys = samples.map(r => r.break28d);
    const designs = samples.map(r => parseInt(r.design.replace('C', '')));
    const featBuilders: Array<[string, (r: any) => number][]> = [
      [['design', r => parseInt(r.design.replace('C', ''))], ['slump', r => r.slump], ['7d', r => r.break7d]],
      [['slump', r => r.slump], ['7d', r => r.break7d]],
      [['7d', r => r.break7d]],
    ];
    let best: { beta: number[]; r2: number; rmse: number; samples: number; feats: string[] } | null = null;
    for (const feats of featBuilders) {
      const rows = samples.map(s => [1, ...feats.map(f => f[1](s))]);
      const beta = solveLeastSquares(rows, ys);
      if (!beta) continue;
      const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
      let ssTot = 0, ssRes = 0;
      rows.forEach((row, i) => {
        const pred = row.reduce((s, v, j) => s + v * beta[j], 0);
        ssTot += (ys[i] - mean) ** 2;
        ssRes += (ys[i] - pred) ** 2;
      });
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      const rmse = Math.sqrt(ssRes / samples.length);
      if (!best || r2 > best.r2) best = { beta, r2, rmse, samples: samples.length, feats: feats.map(f => f[0]) };
    }
    return best;
  };

  useEffect(() => {
    const m = trainModel();
    setAiTrainSamples(m ? m.samples : qcRecords.filter(r => r.break28d > 0 && r.break7d > 0 && r.slump > 0).length);
    setAiR2(m ? Math.max(0, m.r2).toFixed(2) : '—');
    setAiRMSE(m ? m.rmse.toFixed(2) : '—');
  }, [qcRecords]);

  const predictStrength = (e: React.FormEvent) => {
    e.preventDefault();
    const m = trainModel();
    const target = parseInt(aiForm.design.replace('C', ''));
    if (!m) { setAiResult(null); return; }
    const feats = m.feats.map(f => {
      if (f === 'design') return target;
      if (f === 'slump') return Number(aiForm.slump);
      return Number(aiForm.break7d);
    });
    const predicted = m.beta[0] + m.beta.slice(1).reduce((s, b, i) => s + b * (feats[i] || 0), 0);
    const margin = predicted - target;
    const band = 1.96 * m.rmse;
    const reliability: 'high' | 'medium' | 'low' = m.samples >= 15 && m.r2 > 0.7 ? 'high' : m.samples >= 8 && m.r2 > 0.5 ? 'medium' : 'low';
    setAiResult({
      predicted: Math.max(0, predicted),
      target,
      margin,
      ok: predicted >= target,
      confidence: Math.max(0, m.r2),
      rmse: m.rmse,
      band,
      reliability,
    });
    setAiPredictions(prev => [{ id: Date.now(), date: new Date().toISOString().split('T')[0], design: aiForm.design, slump: Number(aiForm.slump), break7d: Number(aiForm.break7d), predicted: Math.max(0, predicted), target, ok: predicted >= target }, ...prev].slice(0, 20));
  };


  const exportRecipesCSV = () => {
    let csv = 'Code,Cement,Sand,Gravel,Water,Admixture\n';
    recipes.forEach(r => { csv += `${r.code},${r.cement},${r.sand},${r.gravel},${r.water},${r.admixture}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'recipes.csv'; a.click();
  };
  const exportQCCSV = () => {
    let csv = 'Date,Truck,Design,Bon No,Customer,Site,Slump,7-Day,28-Day,Blade\n';
    qcRecords.forEach(r => { csv += `${r.date},${r.truck},${r.design},${r.bonNo},${r.customer},${r.site},${r.slump},${r.break7d},${r.break28d},${r.blade}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quality_records.csv'; a.click();
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 {t('accessDenied')}</p><Link to="/" className="text-sky-400 underline">{t('backToLogin')}</Link></div></div>;

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      {/* Header */}
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← {t('dashboard')}</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-black tracking-tight text-white">🎛️ {t('mixingQualityControl')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NotificationsBell />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-2 p-4 max-w-6xl mx-auto">
        {[
          { id: 'recipes', label: `📋 ${t('recipes')}`, icon: '📋' },
          { id: 'calibration', label: `⚖️ ${t('calibration')}`, icon: '⚖️' },
          { id: 'mixDesigner', label: `🧮 ${t('mixDesigner')}`, icon: '🧮' },
          { id: 'quality', label: `🔬 ${t('qualityControl')}`, icon: '🔬' },
          { id: 'aiPredictor', label: `🤖 ${t('aiPredictor')}`, icon: '🤖' },
        ].map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id as Tab)} className={`py-2 px-4 rounded-lg font-bold text-sm transition ${tab === tb.id ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40' : 'bg-white/[0.03] text-slate-400 border border-white/10 hover:text-sky-300 hover:bg-white/[0.06]'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {/* Recipes Tab */}
        {tab === 'recipes' && (
          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">➕ {t('addRecipe')}</h3>
              <form onSubmit={addRecipe} className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('code')}</label><input value={recipeForm.code} onChange={e => setRecipeForm({ ...recipeForm, code: e.target.value })} placeholder="C30" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('cementKg')}</label><input type="number" value={recipeForm.cement} onChange={e => setRecipeForm({ ...recipeForm, cement: e.target.value })} placeholder="350" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">{t('sandKg')}</label><input type="number" value={recipeForm.sand} onChange={e => setRecipeForm({ ...recipeForm, sand: e.target.value })} placeholder="750" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('gravelKg')}</label><input type="number" value={recipeForm.gravel} onChange={e => setRecipeForm({ ...recipeForm, gravel: e.target.value })} placeholder="1100" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">{t('waterKg')}</label><input type="number" value={recipeForm.water} onChange={e => setRecipeForm({ ...recipeForm, water: e.target.value })} placeholder="160" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('admixtureKg')}</label><input type="number" step="0.1" value={recipeForm.admixture} onChange={e => setRecipeForm({ ...recipeForm, admixture: e.target.value })} placeholder="5.5" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                </div>
                <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">💾 {t('saveRecipe')}</button>
              </form>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black tracking-tight text-white">📋 {t('recipes')} ({recipes.length})</h3>
                <button onClick={exportRecipesCSV} className="bg-yellow-500 text-slate-900 text-xs px-3 py-1.5 rounded font-bold">📊 {t('exportCsv')}</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                    <tr><th className="p-2">{t('code')}</th><th className="p-2">{t('cement')}</th><th className="p-2">{t('sand')}</th><th className="p-2">{t('gravel')}</th><th className="p-2">{t('water')}</th><th className="p-2">{t('admix')}</th><th className="p-2">{t('act')}</th></tr>
                  </thead>
                  <tbody>
                    {recipes.map((r, i) => (
                      <tr key={i} className="border-b border-white/10">
                        <td className="p-2 font-bold text-purple-400">{r.code}</td>
                        <td className="p-2">{r.cement}</td><td className="p-2">{r.sand}</td><td className="p-2">{r.gravel}</td>
                        <td className="p-2">{r.water}</td><td className="p-2">{r.admixture}</td>
                        <td className="p-2"><button onClick={() => deleteRecipe(i)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">{t('del')}</button></td>
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
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">⚖️ {t('calibrationRecord')}</h3>
              <form onSubmit={addCalibration} className="space-y-3">
                <DatePicker value={calForm.date} onChange={val => setCalForm({ ...calForm, date: val })} label={t('date')} required />
                <div><label className="text-xs text-slate-400 font-semibold">{t('scaleType')}</label>
                  <select value={calForm.scaleType} onChange={e => setCalForm({ ...calForm, scaleType: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]">
                    <option>{t('cementScale500')}</option><option>{t('aggregateScale1000')}</option><option>{t('waterScale200')}</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('measuredWeightKg')}</label><input type="number" step="0.01" value={calForm.measured} onChange={e => setCalForm({ ...calForm, measured: e.target.value })} placeholder="502.5" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('uploadReport')}</label><input type="file" accept=".pdf,.jpg,.png" onChange={handleFileUpload} className="w-full text-xs text-slate-400" /></div>
                {calForm.reportFileName && <p className="text-xs text-emerald-400">✓ {calForm.reportFileName}</p>}
                <div><label className="text-xs text-slate-400 font-semibold">{t('accreditation')}</label><input value={calForm.accreditation} onChange={e => setCalForm({ ...calForm, accreditation: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" /></div>
                <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">💾 {t('saveCalibration')}</button>
              </form>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">⚖️ {t('calibrationLogs')} ({filteredCalib.length})</h3>
              <div className="grid grid-cols-2 gap-3 mb-4"><DatePicker value={fromDate} onChange={setFromDate} label={t('from')} /><DatePicker value={toDate} onChange={setToDate} label={t('to')} /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('scale')}</th><th className="p-2">{t('target')}</th><th className="p-2">{t('measured')}</th><th className="p-2">Dev%</th><th className="p-2">{t('status')}</th><th className="p-2">{t('report')}</th><th className="p-2">{t('act')}</th></tr></thead>
                  <tbody>
                    {filteredCalib.map(c => (
                      <tr key={c.id} className="border-b border-white/10">
                        <td className="p-2">{c.date}</td><td className="p-2 font-bold">{c.scaleType}</td>
                        <td className="p-2">{c.target}</td><td className="p-2">{c.measured}</td>
                        <td className={`p-2 font-bold ${Math.abs(c.dev) > 1.5 ? 'text-red-400' : Math.abs(c.dev) > 0.8 ? 'text-yellow-400' : 'text-emerald-400'}`}>{c.dev.toFixed(2)}%</td>
                        <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c.status === 'Passed' ? 'bg-emerald-500/20 text-emerald-400' : c.status === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{c.status}</span></td>
                        <td className="p-2">{c.reportFileName ? <a href={c.reportFile} download={c.reportFileName} className="text-sky-400 underline">📄</a> : '-'}</td>
                        <td className="p-2"><button onClick={() => deleteCalibration(c.id)} className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded">{t('del')}</button></td>
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
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">🧮 {t('mixDesignCalculator')}</h3>
              <form onSubmit={calculateMixDesign} className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('targetStrengthMpa')}</label><input type="number" value={designerForm.targetStrength} onChange={e => setDesignerForm({ ...designerForm, targetStrength: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('maxAggregateSizeMm')}</label>
                  <select value={designerForm.maxAggregateSize} onChange={e => setDesignerForm({ ...designerForm, maxAggregateSize: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]">
                    <option value="10">10mm</option><option value="20">20mm</option><option value="40">40mm</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('slumpCm')}</label><input type="number" value={designerForm.slump} onChange={e => setDesignerForm({ ...designerForm, slump: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('fineModulus')}</label><input type="number" step="0.1" value={designerForm.fineModulus} onChange={e => setDesignerForm({ ...designerForm, fineModulus: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">{t('ambientTempC')}</label><input type="number" value={designerForm.ambientTemp} onChange={e => setDesignerForm({ ...designerForm, ambientTemp: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('humidityPercent')}</label><input type="number" value={designerForm.humidity} onChange={e => setDesignerForm({ ...designerForm, humidity: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                </div>
                <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">🧮 {t('calculateWithEnvCompensation')}</button>
              </form>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black tracking-tight text-white mb-0">📊 {t('result')}</h3>
                {designerResult && <button onClick={saveDesignAsRecipe} className="bg-sky-500 hover:bg-sky-400 text-white text-xs px-3 py-1.5 rounded font-bold">💾 {t('saveAsRecipe')}</button>}
              </div>
              {designerResult ? (
                <div className="space-y-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex justify-between items-center">
                    <p className="text-emerald-400 font-bold text-lg">{designerResult.base.code}</p>
                    <p className="text-xs text-slate-400">{designerResult.note}</p>
                  </div>
                  <div className="bg-[#0B111E] border border-white/10 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">🌡️ {t('environment')}: {designerResult.temp}°C / {designerResult.humidity}% RH</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between"><span className="text-slate-400">{t('baseWater')}</span><b className="text-white">{designerResult.base.water} kg</b></div>
                      <div className="flex justify-between"><span className="text-yellow-400">{t('adjustedWater')}</span><b className="text-yellow-300">{designerResult.water} kg</b></div>
                      <div className="flex justify-between"><span className="text-slate-400">{t('baseAdmixture')}</span><b className="text-white">{designerResult.base.admixture} kg</b></div>
                      <div className="flex justify-between"><span className="text-yellow-400">{t('adjustedAdmixture')}</span><b className="text-yellow-300">{designerResult.admixture} kg</b></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0B111E] rounded-lg p-4"><p className="text-xs text-slate-400">{t('cement')}</p><p className="text-lg font-black tracking-tight text-white">{designerResult.base.cement} kg</p></div>
                    <div className="bg-[#0B111E] rounded-lg p-4"><p className="text-xs text-slate-400">{t('sand')}</p><p className="text-lg font-black tracking-tight text-white">{designerResult.base.sand} kg</p></div>
                    <div className="bg-[#0B111E] rounded-lg p-4"><p className="text-xs text-slate-400">{t('gravel')}</p><p className="text-lg font-black tracking-tight text-white">{designerResult.base.gravel} kg</p></div>
                    <div className="bg-[#0B111E] rounded-lg p-4"><p className="text-xs text-slate-400">{t('waterAdjusted')}</p><p className="text-lg font-bold text-yellow-300">{designerResult.water} kg</p></div>
                    <div className="bg-[#0B111E] rounded-lg p-4"><p className="text-xs text-slate-400">{t('admixtureAdjusted')}</p><p className="text-lg font-bold text-yellow-300">{designerResult.admixture} kg</p></div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-12">{t('enterParametersAndCalculate')}</p>
              )}
            </div>
          </div>
        )}

        {/* Quality Tab */}
        {tab === 'quality' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">🔬 {t('qcRecord')}</h3>
              <form onSubmit={addQCRecord} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-slate-400 font-semibold">{t('bonTicketNo')}</label><input value={qcForm.bonNo} onChange={e => setQcForm({ ...qcForm, bonNo: e.target.value })} placeholder="BON-1024" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                  <div><label className="text-xs text-slate-400 font-semibold">{t('mixDesignCode')}</label><input value={qcForm.mixDesignCode} onChange={e => setQcForm({ ...qcForm, mixDesignCode: e.target.value })} placeholder="C30-v2" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" /></div>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('customer')}</label><input value={qcForm.customer} onChange={e => setQcForm({ ...qcForm, customer: e.target.value })} placeholder={t('clientNamePlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('siteProject')}</label><input value={qcForm.site} onChange={e => setQcForm({ ...qcForm, site: e.target.value })} placeholder={t('projectSitePlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('truck')}</label><select value={qcForm.truck} onChange={e => setQcForm({ ...qcForm, truck: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]">{trucks.map(tr => <option key={tr} value={tr}>{tr}</option>)}</select></div>
                <div>
                  <label className="text-xs text-slate-400 font-semibold">{t('linkSampleToOrder')}</label>
                  <select value={qcForm.orderId} onChange={e => {
                    const id = e.target.value;
                    setQcForm(prev => ({ ...prev, orderId: id }));
                    const o = orders.find(x => x.id === id);
                    if (o) setQcForm(prev => ({ ...prev, customer: o.customerName, site: o.projectName }));
                  }} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]">
                    <option value="">{t('noLink')}</option>
                    {orders.filter((o: any) => o.accountStatus === 'approved').map((o: any) => <option key={o.id} value={o.id}>{o.orderNo || o.id} · {o.customerName}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('design')}</label><select value={qcForm.design} onChange={e => setQcForm({ ...qcForm, design: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"><option value="C25">C25</option><option value="C30">C30</option><option value="C35">C35</option><option value="C40">C40</option></select></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('slumpCm')}</label><input type="number" value={qcForm.slump} onChange={e => setQcForm({ ...qcForm, slump: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('day7Mpa')}</label><input type="number" step="0.1" value={qcForm.break7d} onChange={e => setQcForm({ ...qcForm, break7d: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('day28Mpa')}</label><input type="number" step="0.1" value={qcForm.break28d} onChange={e => setQcForm({ ...qcForm, break28d: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">💾 {t('save')}</button>
              </form>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black tracking-tight text-white">🔬 {t('qcRecords')} ({filteredQC.length})</h3>
                <button onClick={exportQCCSV} className="bg-yellow-500 text-slate-900 text-xs px-3 py-1.5 rounded font-bold">📊 {t('export')}</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-[#0B111E] rounded-lg p-3"><p className="text-xs text-slate-400">{t('samples')}</p><p className="text-lg font-black tracking-tight text-white">{filteredQC.length}</p></div>
                <div className="bg-[#0B111E] rounded-lg p-3"><p className="text-xs text-slate-400">{t('day7Avg')}</p><p className="text-lg font-bold text-sky-400">{(total7d / count).toFixed(1)} MPa</p></div>
                <div className="bg-[#0B111E] rounded-lg p-3"><p className="text-xs text-slate-400">{t('day28Pass')}</p><p className="text-lg font-bold text-emerald-400">{((passed28d / count) * 100).toFixed(0)}%</p></div>
                <div className="bg-[#0B111E] rounded-lg p-3"><p className="text-xs text-slate-400">{t('slumpAvg')}</p><p className="text-lg font-bold text-yellow-400">{(totalSlump / count).toFixed(1)} cm</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4"><DatePicker value={fromDate} onChange={setFromDate} label={t('from')} /><DatePicker value={toDate} onChange={setToDate} label={t('to')} /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('date')}</th><th className="p-2">{t('bonNo')}</th><th className="p-2">{t('customer')}</th><th className="p-2">{t('truck')}</th><th className="p-2">{t('design')}</th><th className="p-2">{t('slump')}</th><th className="p-2">{t('day7Short')}</th><th className="p-2">{t('day28Short')}</th><th className="p-2">{t('pass')}</th><th className="p-2">{t('report')}</th></tr></thead>
                  <tbody>
                    {filteredQC.map(r => {
                      const target = parseInt(r.design.replace('C', ''));
                      const pass = r.break28d >= target;
                      return (
                        <tr key={r.id} className="border-b border-white/10">
                          <td className="p-2">{r.date}</td>
                          <td className="p-2 font-bold text-cyan-400">{r.sampleId || r.bonNo || '—'}{r.orderId && <div className="text-[9px] text-slate-500 font-normal">{t('order')}: {r.orderId}</div>}</td>
                          <td className="p-2">{r.customer || '—'}</td><td className="p-2 font-bold">{r.truck}</td><td className="p-2 text-sky-400">{r.design}</td>
                          <td className="p-2">{r.slump}</td><td className="p-2">{r.break7d}</td><td className="p-2">{r.break28d}</td>
                          <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pass ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{pass ? '✓' : '✗'}</span></td>
                          <td className="p-2"><button onClick={() => printQCRecord(r)} className="bg-sky-600 hover:bg-sky-700 text-white text-[10px] px-2 py-0.5 rounded">🖨️ {t('report')}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AI Predictor Tab */}
        {tab === 'aiPredictor' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-1">🤖 28-Day Strength Predictor</h3>
              <p className="text-xs text-slate-400 mb-4">Multi-feature regression trained on your QC history (design + slump + 7-day → 28-day). Predicts strength BEFORE the consultant tests, protecting you from rejection fines.</p>
              <form onSubmit={predictStrength} className="space-y-3">
                <div><label className="text-xs text-slate-400 font-semibold">Design Strength</label>
                  <select value={aiForm.design} onChange={e => setAiForm({ ...aiForm, design: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]">
                    <option value="C25">C25 (25 MPa)</option><option value="C30">C30 (30 MPa)</option><option value="C35">C35 (35 MPa)</option><option value="C40">C40 (40 MPa)</option>
                  </select>
                </div>
                <div><label className="text-xs text-slate-400 font-semibold">Expected Slump (cm)</label><input type="number" step="0.5" value={aiForm.slump} onChange={e => setAiForm({ ...aiForm, slump: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Expected 7-Day (MPa)</label><input type="number" step="0.1" value={aiForm.break7d} onChange={e => setAiForm({ ...aiForm, break7d: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]" required /></div>
                <button type="submit" className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">🔮 Predict 28-Day Strength</button>
              </form>
              <div className="mt-4 bg-[#0B111E] border border-white/10 rounded-lg p-3 text-[11px] text-slate-400">
                📚 Model trained on <b className="text-white">{aiTrainSamples}</b> QC samples.
                {aiTrainSamples > 0 && <><br />Accuracy (R²): <b className="text-emerald-400">{aiR2}</b> · RMSE: <b className="text-sky-400">{aiRMSE} MPa</b></>}
                {aiTrainSamples >= 8 && <><br />Reliability: {aiTrainSamples >= 15 ? <b className="text-emerald-400">🟢 High</b> : <b className="text-yellow-400">🟡 Medium</b>}</>}
                {aiTrainSamples < 3 && <><br /><span className="text-yellow-400">⚠️ Add at least 3 QC records for a reliable model.</span></>}
              </div>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-black tracking-tight text-white mb-4">📊 Prediction Result</h3>
              {aiResult ? (
                <div className="space-y-4">
                  <div className={`rounded-xl p-5 border ${aiResult.ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
                    <p className="text-xs text-slate-400">Predicted 28-Day Compressive Strength</p>
                    <p className={`text-4xl font-black ${aiResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{aiResult.predicted.toFixed(1)} MPa</p>
                    <p className="text-xs mt-1 text-slate-300">
                      Target: {aiResult.target} MPa → margin {aiResult.ok ? '+' : ''}{aiResult.margin.toFixed(1)} MPa
                    </p>
                    <p className={`text-sm font-bold mt-2 ${aiResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                      {aiResult.ok ? '✅ Likely to PASS — safe to pour' : '🚨 RISK OF REJECTION — adjust mix before pouring'}
                    </p>
                    {!aiResult.ok && (
                      <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 mt-3 text-xs text-red-200">
                        <p className="font-bold mb-1">Recommended actions:</p>
                        <p>• Reduce water (lower W/C) or add water-reducing admixture</p>
                        <p>• Increase cement content or use higher-strength mix</p>
                        <p>• Re-run Mix Designer with environment compensation and re-predict</p>
                      </div>
                    )}
                  </div>
                  {aiResult.reliability !== 'high' && (
                    <p className={`text-[11px] font-bold ${aiResult.reliability === 'medium' ? 'text-yellow-400' : 'text-orange-400'}`}>
                      🟡 {aiResult.reliability === 'medium' ? 'Medium reliability' : 'Low reliability'} — limited training data, confirm with a lab test.
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#0B111E] rounded-lg p-3 border border-white/10 text-center">
                      <p className="text-[10px] text-slate-400">R²</p><p className="text-lg font-bold text-emerald-400">{aiResult.confidence.toFixed(2)}</p>
                    </div>
                    <div className="bg-[#0B111E] rounded-lg p-3 border border-white/10 text-center">
                      <p className="text-[10px] text-slate-400">RMSE</p><p className="text-lg font-bold text-sky-400">{aiResult.rmse.toFixed(2)}</p>
                    </div>
                    <div className="bg-[#0B111E] rounded-lg p-3 border border-white/10 text-center">
                      <p className="text-[10px] text-slate-400">95% band ±</p><p className="text-lg font-bold text-purple-400">{aiResult.band.toFixed(1)} MPa</p>
                    </div>
                  </div>
                  <div className="bg-[#0B111E] rounded-lg p-4 border border-white/10">
                    <p className="text-xs text-slate-400 mb-2">Confidence band — predicted range {Math.max(0, aiResult.predicted - aiResult.band).toFixed(1)} to {(aiResult.predicted + aiResult.band).toFixed(1)} MPa</p>
                    <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500" style={{ width: `${Math.min(100, (aiResult.predicted / (aiResult.target * 1.3)) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Predicted is {((aiResult.predicted / aiResult.target) * 100).toFixed(0)}% of target</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2">📜 Recent predictions ({aiPredictions.length})</p>
                    <div className="bg-[#0B111E] border border-white/10 rounded-lg overflow-hidden">
                      {aiPredictions.slice(0, 6).map(p => (
                        <div key={p.id} className="flex justify-between items-center px-3 py-2 border-b border-white/10 text-xs">
                          <span className="text-slate-400">{p.date} · {p.design} · 7d {p.break7d}</span>
                          <span className={`font-bold ${p.ok ? 'text-emerald-400' : 'text-red-400'}`}>{p.predicted.toFixed(1)} MPa {p.ok ? '✓' : '✗'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-4xl mb-3">🔮</p>
                  <p className="text-slate-500">Enter expected slump and 7-day result, then predict.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
