/**
 * ============================================================
 *  FIMTO SOFT — Lab test report (Compressive strength)
 * ============================================================
 *  Technician-friendly: pick mix + pick/type client, enter 3 crushing
 *  loads — everything else (age, density, MPa, kg/cm², averages,
 *  verdict, report number) is computed automatically.
 *
 *  Correct cylinder math (150×300mm): Area 176.71 cm², Volume 5301.44 cm³,
 *  MPa = Load(kN)/17.6715, kg/cm² = MPa×10.1972.
 *
 *  Export: Excel workbook (same layout as the lab's template) + browser
 *  print (save as PDF from the print dialog). Arabic renders perfectly in
 *  both because we avoid canvas-based PDF text shaping entirely.
 * ============================================================
 */

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useLang } from '../context/LangContext';
import { loadCustomers, loadPlantProfile } from '../firebase/firestore';

export interface LabRecipe {
  code: string;
  cement: number;
  sand: number;
  gravel: number;
  water: number;
  admixture: number;
}

interface SampleIn {
  load: string;
  weight: string;
}

interface SavedReport {
  no: string;
  createdAt: string;
  mix: string;
  client: string;
  project: string;
  avgMpa: number;
  verdict: string;
  payload: ReportPayload;
}

interface ReportPayload {
  no: string;
  mix: string;
  fc: number;
  exp7: number;
  exp28: number;
  client: string;
  project: string;
  location: string;
  element: string;
  supplier: string;
  mixType: string;
  casting: string;
  tested: string;
  age: number;
  slump: string;
  tempC: string;
  airTemp: string;
  recipe: LabRecipe | null;
  rows: Array<{ n: number; s: string; w: number | null; d: number | null; load: number; kg: number; mpa: number }>;
  avgKg: number;
  avgMpa: number;
  target: number;
  pct: number;
  verdict: string;
  company: string;
  logo: string;
}

const AREA_DIV = 17.67146; // kN → MPa for Ø150×300 cylinder
const VOL = 5301.44; // cm³
const KG = 10.19716; // MPa → kg/cm²

const STR: Record<string, { en: string; ar: string; ur: string }> = {
  title: { en: '🧪 Lab test report', ar: '🧪 التقرير الفني للمختبر', ur: '🧪 لیب ٹیسٹ رپورٹ' },
  subtitle: {
    en: 'Pick the mix and the client, enter 3 crushing loads — the rest is automatic.',
    ar: 'اختر الخلطة والعميل وأدخل نتائج التكسيير الثلاث — والباقي تلقائي.',
    ur: 'مکس اور کلائنٹ منتخب کریں، 3 کرشنگ لوڈ درج کریں — باقی خودکار ہے۔',
  },
  mix: { en: 'Concrete mix', ar: 'الخلطة الخرسانية', ur: 'کنکریٹ مکس' },
  client: { en: 'Client (pick or type)', ar: 'العميل (اختر أو اكتب)', ur: 'کلائنٹ (منتخب یا لکھیں)' },
  project: { en: 'Project', ar: 'المشروع', ur: 'پروجیکٹ' },
  location: { en: 'Location', ar: 'الموقع', ur: 'مقام' },
  element: { en: 'Element type', ar: 'نوع العنصر', ur: 'عنصر کی قسم' },
  supplier: { en: 'Concrete supplier', ar: 'مورد الخرسانة', ur: 'کنکریٹ فراہم کنندہ' },
  mixType: { en: 'Cement type', ar: 'نوع الأسمنت', ur: 'سیمنٹ کی قسم' },
  casting: { en: 'Casting date', ar: 'تاريخ الصب', ur: 'کاسٹنگ کی تاریخ' },
  tested: { en: 'Test date', ar: 'تاريخ الاختبار', ur: 'ٹیسٹ کی تاریخ' },
  exp7: { en: 'Required 7-day (MPa)', ar: 'المطلوب بعد 7 أيام (MPa)', ur: 'مطلوبہ 7 دن (MPa)' },
  exp28: { en: 'Required 28-day (MPa)', ar: 'المطلوب بعد 28 يوم (MPa)', ur: 'مطلوبہ 28 دن (MPa)' },
  sLoad: { en: 'Load (kN)', ar: 'الحمل (kN)', ur: 'لوڈ (kN)' },
  sWeight: { en: 'Weight (g)', ar: 'الوزن (جم)', ur: 'وزن (g)' },
  slump: { en: 'Slump (mm)', ar: 'الهبوط (مم)', ur: 'سلンプ (mm)' },
  tempC: { en: 'Concrete temp (°C)', ar: 'حرارة الخرسانة (°م)', ur: 'کنکریٹ درجہ حرارت (°C)' },
  airTemp: { en: 'Air temp (°C)', ar: 'حرارة الجو (°م)', ur: 'ہوا کا درجہ حرارت (°C)' },
  save: { en: '💾 Save report', ar: '💾 حفظ التقرير', ur: '💾 رپورٹ محفوظ کریں' },
  saved: { en: 'Report saved', ar: 'تم حفظ التقرير', ur: 'رپورٹ محفوظ ہو گئی' },
  needLoads: { en: 'Enter at least one crushing load first.', ar: 'أدخل حمل تكسيير واحداً على الأقل أولاً.', ur: 'پہلے کم از کم ایک کرشنگ لوڈ درج کریں۔' },
  preview: { en: 'Report preview', ar: 'معاينة التقرير', ur: 'رپورٹ کا پیش نظارہ' },
  print: { en: '🖨️ Print / PDF', ar: '🖨️ طباعة / PDF', ur: '🖨️ پرنٹ / PDF' },
  excel: { en: '📊 Excel', ar: '📊 إكسل', ur: '📊 ایکسل' },
  history: { en: 'Saved reports', ar: 'التقارير المحفوظة', ur: 'محفوظ رپورٹس' },
  none: { en: 'No saved reports yet.', ar: 'لا توجد تقارير محفوظة بعد.', ur: 'ابھی کوئی محفوظ رپورٹ نہیں۔' },
  reprint: { en: 'View', ar: 'عرض', ur: 'دیکھیں' },
  pass: { en: '✅ PASS', ar: '✅ ناجح', ur: '✅ کامیاب' },
  fail: { en: '❌ FAIL — review', ar: '❌ راسب — يحتاج مراجعة', ur: '❌ ناکام — جائزہ لیں' },
  age: { en: 'Age', ar: 'العمر', ur: 'عمر' },
  days: { en: 'days', ar: 'يوم', ur: 'دن' },
  avg: { en: 'Average', ar: 'المتوسط', ur: 'اوسط' },
  ofRequired: { en: 'of required', ar: 'من المطلوب', ur: 'مطلوبہ کا' },
};

const ELEMENTS = ['قواعد', 'أعمدة', 'أسقف', 'جسور', 'خزانات', 'مسبح'];
const MIX_TYPES = ['عادي', 'SRC', 'مقاوم للكبريتات'];

const todayISO = () => new Date().toISOString().split('T')[0];
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};
const diffDays = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const parseFc = (code: string): number => {
  const m = /C\s*(\d+)/i.exec(code || '');
  return m ? parseInt(m[1], 10) : 0;
};

export default function LabReport({ recipes, username, plantName, onToast }: {
  recipes: LabRecipe[];
  username: string;
  plantName: string;
  onToast: (m: string) => void;
}) {
  const { lang } = useLang();
  const t = (k: keyof typeof STR): string => STR[k][lang as 'en' | 'ar' | 'ur'] ?? STR[k].en;

  const [mixCode, setMixCode] = useState('');
  const [client, setClient] = useState('');
  const [clientOpts, setClientOpts] = useState<string[]>([]);
  const [project, setProject] = useState('');
  const [location, setLocation] = useState('');
  const [element, setElement] = useState(ELEMENTS[0]);
  const [supplier, setSupplier] = useState('شركة المطور للخرسانة الجاهزة');
  const [mixType, setMixType] = useState(MIX_TYPES[1]);
  const [casting, setCasting] = useState(todayISO());
  const [tested, setTested] = useState(addDays(todayISO(), 7));
  const [exp7, setExp7] = useState('');
  const [exp28, setExp28] = useState('');
  const [expTouched, setExpTouched] = useState(false);
  const [samples, setSamples] = useState<SampleIn[]>([{ load: '', weight: '' }, { load: '', weight: '' }, { load: '', weight: '' }]);
  const [slump, setSlump] = useState('120');
  const [tempC, setTempC] = useState('35');
  const [airTemp, setAirTemp] = useState('32');
  const [company, setCompany] = useState('');
  const [logo, setLogo] = useState('');
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  useEffect(() => {
    if (recipes.length && !mixCode) setMixCode(recipes[0].code);
  }, [recipes, mixCode]);
  useEffect(() => {
    loadCustomers(username).then((list: unknown) => {
      if (Array.isArray(list)) {
        const names = list
          .map((u: unknown) => {
            const o = u as Record<string, unknown>;
            return String(o.name ?? o.customerName ?? o.clientName ?? o.username ?? '').trim();
          })
          .filter(Boolean);
        setClientOpts([...new Set(names)]);
      }
    }).catch(() => {});
    loadPlantProfile(username).then((p: unknown) => {
      const o = (p ?? {}) as Record<string, unknown>;
      setCompany(String(o.name ?? '') || plantName);
      setLogo(String(o.logo ?? ''));
    }).catch(() => setCompany(plantName));
    try {
      const raw = localStorage.getItem('labReports');
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [username, plantName]);

  const recipe = useMemo(() => recipes.find(r => r.code === mixCode) ?? null, [recipes, mixCode]);
  const fc = parseFc(mixCode);
  const effExp7 = expTouched && exp7 !== '' ? Number(exp7) : Math.round(fc * 0.75);
  const effExp28 = expTouched && exp28 !== '' ? Number(exp28) : fc;
  const age = diffDays(casting, tested);

  const rows = useMemo(() => {
    const names = ['A1', 'A2', 'A3'];
    return samples.map((s, i) => {
      const load = Number(s.load);
      const w = s.weight === '' ? null : Number(s.weight);
      if (!Number.isFinite(load) || load <= 0) {
        return { n: i + 1, s: names[i], w, d: null, load: 0, kg: 0, mpa: 0 };
      }
      const mpa = load / AREA_DIV;
      return {
        n: i + 1, s: names[i], w,
        d: w !== null && Number.isFinite(w) && w > 0 ? w / VOL : null,
        load, kg: mpa * KG, mpa,
      };
    });
  }, [samples]);
  const valid = rows.filter(r => r.load > 0);
  const avgMpa = valid.length ? valid.reduce((a, r) => a + r.mpa, 0) / valid.length : 0;
  const avgKg = valid.length ? valid.reduce((a, r) => a + r.kg, 0) / valid.length : 0;
  const target = age <= 7 ? effExp7 : effExp28;
  const pct = target > 0 && valid.length ? (avgMpa / target) * 100 : 0;
  const verdict = !valid.length ? '' : avgMpa >= target ? 'pass' : 'fail';

  const buildPayload = (): ReportPayload | null => {
    if (!valid.length || !mixCode) return null;
    const count = Number((localStorage.getItem('labReportSeq') ?? '0')) + 1;
    const no = `LAB-${casting.split('-').join('')}-${String(count).padStart(3, '0')}`;
    return {
      no, mix: mixCode, fc, exp7: effExp7, exp28: effExp28,
      client: client.trim(), project: project.trim(), location: location.trim(),
      element, supplier: supplier.trim(), mixType, casting, tested, age,
      slump, tempC, airTemp, recipe,
      rows, avgKg, avgMpa, target, pct,
      verdict: verdict === 'pass' ? t('pass') : t('fail'),
      company: company || plantName, logo,
    };
  };

  const persist = (list: SavedReport[]) => {
    setSaved(list);
    try { localStorage.setItem('labReports', JSON.stringify(list)); } catch {}
  };

  const doSave = () => {
    const p = buildPayload();
    if (!p) { onToast(t('needLoads')); return; }
    try { localStorage.setItem('labReportSeq', String(Number(localStorage.getItem('labReportSeq') ?? '0') + 1)); } catch {}
    persist([{
      no: p.no, createdAt: new Date().toISOString(), mix: p.mix, client: p.client,
      project: p.project, avgMpa: Number(p.avgMpa.toFixed(2)), verdict: p.verdict, payload: p,
    }, ...saved]);
    setViewIdx(0);
    onToast(t('saved'));
  };

  const doExcel = (p: ReportPayload) => {
    const aoa: unknown[][] = [
      ['ALMOTWR COMPANY | READY-MIX CONCRETE'],
      [p.company],
      ['COMPRESSIVE STRENGTH OF CONCRETE CYLINDERS'],
      ['Report No', p.no, '', 'Date', tested],
      ['Client Name', p.client, '', 'Project', p.project],
      ['Location', p.location, '', 'Element', p.element],
      ['Concrete Supplier', p.supplier, '', 'Mix', `${p.mix} (${p.fc} MPa ${p.mixType})`],
      ['Casting Date', p.casting, '', 'Test Date', `${p.tested} (${p.age} days)`],
      ['Age', `${p.age} Days`, '', 'Area', '176.7 cm²'],
      ['Required 7-day', `${p.exp7} MPa`, '', 'Required 28-day', `${p.exp28} MPa`],
      ['Slump', `${p.slump} mm`, '', 'Temp', `${p.tempC}°C / air ${p.airTemp}°C`],
      [],
      ['TEST NO', 'SAMPLE', 'WEIGHT (g)', 'DENSITY (g/cm³)', 'LOAD (kN)', 'kg/cm²', 'MPa'],
      ...p.rows.filter(r => r.load > 0).map(r => [
        r.n, r.s, r.w ?? '', r.d !== null ? Number(r.d.toFixed(3)) : '',
        r.load, Number(r.kg.toFixed(2)), Number(r.mpa.toFixed(2)),
      ]),
      ['AVERAGE', '', '', '', '', Number(p.avgKg.toFixed(2)), Number(p.avgMpa.toFixed(2))],
      [],
      [`Result: ${p.avgMpa.toFixed(2)} MPa = ${p.pct.toFixed(1)}% of required ${p.target} MPa — ${p.verdict}`],
      [],
      ['Notes:'],
      ['Batch weight adjustments vary on the daily moisture content of aggregates at the time of batching.'],
      ['Concrete will be supplied according to ASTM C94.'],
      ['Concrete mixes are designed according to project specification.'],
      [],
      ['Test Performed By', p.company],
    ];
    if (p.recipe) {
      aoa.splice(12, 0, ['Mix ingredients (kg/m³)', `Cement ${p.recipe.cement}`, `Sand ${p.recipe.sand}`, `Gravel ${p.recipe.gravel}`, `Water ${p.recipe.water}`, `Admix ${p.recipe.admixture}`], []);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compressive Strength');
    XLSX.writeFile(wb, `${p.no}.xlsx`);
  };

  const doPrint = () => {
    setTimeout(() => window.print(), 60);
  };

  const viewing: ReportPayload | null =
    viewIdx !== null && saved[viewIdx] ? saved[viewIdx].payload
    : buildPayload();

  const setS = (i: number, k: keyof SampleIn, v: string) =>
    setSamples(prev => prev.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70';
  const labelCls = 'block text-xs text-slate-400 font-semibold mb-1';

  return (
    <div className="space-y-6">
      <style>{`@media print { body * { visibility: hidden; } #lab-report-print, #lab-report-print * { visibility: visible; } #lab-report-print { position: absolute; inset: 0; margin: 0; } }`}</style>

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-1">{t('title')}</h3>
        <p className="text-xs text-slate-400 mb-5">{t('subtitle')}</p>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t('mix')}</label>
            <select value={mixCode} onChange={e => { setMixCode(e.target.value); setExpTouched(false); }} className={inputCls}>
              {recipes.map(r => <option key={r.code} value={r.code} className="bg-slate-900">{r.code}{parseFc(r.code) ? ` (${parseFc(r.code)} MPa)` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('client')}</label>
            <input value={client} onChange={e => setClient(e.target.value)} list="lab-clients" placeholder="…" className={inputCls} />
            <datalist id="lab-clients">{clientOpts.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>{t('project')}</label>
            <input value={project} onChange={e => setProject(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('location')}</label>
            <input value={location} onChange={e => setLocation(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('element')}</label>
            <select value={element} onChange={e => setElement(e.target.value)} className={inputCls}>
              {ELEMENTS.map(x => <option key={x} value={x} className="bg-slate-900">{x}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('supplier')}</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('mixType')}</label>
            <select value={mixType} onChange={e => setMixType(e.target.value)} className={inputCls}>
              {MIX_TYPES.map(x => <option key={x} value={x} className="bg-slate-900">{x}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('casting')}</label>
            <input type="date" value={casting} onChange={e => { setCasting(e.target.value); }} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('tested')}</label>
            <input type="date" value={tested} onChange={e => setTested(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('exp7')}</label>
            <input type="number" value={expTouched ? exp7 : effExp7} onChange={e => { setExp7(e.target.value); setExpTouched(true); }} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('exp28')}</label>
            <input type="number" value={expTouched ? exp28 : effExp28} onChange={e => { setExp28(e.target.value); setExpTouched(true); }} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>{t('slump')}</label><input value={slump} onChange={e => setSlump(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('tempC')}</label><input value={tempC} onChange={e => setTempC(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('airTemp')}</label><input value={airTemp} onChange={e => setAirTemp(e.target.value)} className={inputCls} /></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          {samples.map((s, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/10 rounded-lg p-3">
              <p className="text-xs font-black text-sky-300 mb-2">A{i + 1}</p>
              <label className={labelCls}>{t('sLoad')}</label>
              <input type="number" step="0.1" value={s.load} onChange={e => setS(i, 'load', e.target.value)} placeholder="412.7" className={inputCls} />
              <div className="mt-2"><label className={labelCls}>{t('sWeight')}</label>
              <input type="number" value={s.weight} onChange={e => setS(i, 'weight', e.target.value)} placeholder="12393" className={inputCls} /></div>
              <p className="text-[11px] text-slate-400 mt-2" dir="ltr">
                {rows[i].load > 0 ? `${f2(rows[i].mpa)} MPa · ${f2(rows[i].kg)} kg/cm²` : '—'}
              </p>
            </div>
          ))}
        </div>

        {valid.length > 0 && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm font-black ${verdict === 'pass' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
            {t('avg')}: <span dir="ltr">{f2(avgMpa)} MPa</span> ({t('age')} {age} {t('days')} · {pct.toFixed(1)}% {t('ofRequired')} {target} MPa) — {verdict === 'pass' ? t('pass') : t('fail')}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={doSave} className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2.5 rounded-lg text-sm">{t('save')}</button>
          <button onClick={() => { const p = buildPayload(); if (p) doExcel(p); else onToast(t('needLoads')); }} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-5 py-2.5 rounded-lg font-bold text-sm">{t('excel')}</button>
          <button onClick={() => { if (valid.length) doPrint(); else onToast(t('needLoads')); }} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white px-5 py-2.5 rounded-lg font-bold text-sm">{t('print')}</button>
        </div>
      </div>

      {viewing && valid.length > 0 && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-black tracking-tight text-white mb-4">{t('preview')}</h3>
          <div id="lab-report-print" className="bg-white text-slate-900 rounded-lg p-8 max-w-[800px] mx-auto" dir="rtl">
            <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
              <div>
                <p className="font-black text-lg">ALMOTWR COMPANY | READY-MIX CONCRETE</p>
                <p className="text-xs text-slate-600">{viewing.company}</p>
                <p className="font-black mt-2">COMPRESSIVE STRENGTH OF CONCRETE CYLINDERS</p>
              </div>
              {viewing.logo && <img src={viewing.logo} alt="logo" style={{ height: 64, maxWidth: 140, objectFit: 'contain' }} />}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-3">
              <p><b>رقم التقرير:</b> <span dir="ltr">{viewing.no}</span></p>
              <p><b>التاريخ:</b> <span dir="ltr">{viewing.tested}</span></p>
              <p><b>العميل:</b> {viewing.client || '—'}</p>
              <p><b>المشروع:</b> {viewing.project || '—'}</p>
              <p><b>الموقع:</b> {viewing.location || '—'}</p>
              <p><b>العنصر:</b> {viewing.element}</p>
              <p><b>المورد:</b> {viewing.supplier}</p>
              <p><b>الخلطة:</b> <span dir="ltr">{viewing.mix} ({viewing.fc} MPa {viewing.mixType})</span></p>
              <p><b>تاريخ الصب:</b> <span dir="ltr">{viewing.casting}</span></p>
              <p><b>العمر:</b> {viewing.age} يوم</p>
              <p><b>الهبوط:</b> <span dir="ltr">{viewing.slump} mm</span></p>
              <p><b>الحرارة:</b> <span dir="ltr">{viewing.tempC}°C / {viewing.airTemp}°C</span></p>
            </div>
            {viewing.recipe && (
              <p className="text-[11px] text-slate-600 mt-2">
                مكونات الخلطة (كجم/م³): أسمنت {viewing.recipe.cement} · رمل {viewing.recipe.sand} · بحص {viewing.recipe.gravel} · ماء {viewing.recipe.water} · إضافات {viewing.recipe.admixture}
              </p>
            )}
            <table className="w-full text-xs mt-3 border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-1">م</th>
                  <th className="border border-slate-300 p-1">العينة</th>
                  <th className="border border-slate-300 p-1">الوزن (جم)</th>
                  <th className="border border-slate-300 p-1">الكثافة</th>
                  <th className="border border-slate-300 p-1">الحمل (kN)</th>
                  <th className="border border-slate-300 p-1">kg/cm²</th>
                  <th className="border border-slate-300 p-1">MPa</th>
                </tr>
              </thead>
              <tbody>
                {viewing.rows.filter(r => r.load > 0).map(r => (
                  <tr key={r.n}>
                    <td className="border border-slate-300 p-1 text-center">{r.n}</td>
                    <td className="border border-slate-300 p-1 text-center" dir="ltr">{r.s}</td>
                    <td className="border border-slate-300 p-1 text-center" dir="ltr">{r.w ?? '—'}</td>
                    <td className="border border-slate-300 p-1 text-center" dir="ltr">{r.d !== null ? r.d.toFixed(3) : '—'}</td>
                    <td className="border border-slate-300 p-1 text-center" dir="ltr">{r.load}</td>
                    <td className="border border-slate-300 p-1 text-center" dir="ltr">{r.kg.toFixed(2)}</td>
                    <td className="border border-slate-300 p-1 text-center" dir="ltr">{r.mpa.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-300 p-1 text-center" colSpan={5}>المتوسط</td>
                  <td className="border border-slate-300 p-1 text-center" dir="ltr">{viewing.avgKg.toFixed(2)}</td>
                  <td className="border border-slate-300 p-1 text-center" dir="ltr">{viewing.avgMpa.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm font-black mt-3">
              النتيجة: <span dir="ltr">{viewing.avgMpa.toFixed(2)} MPa</span> = {viewing.pct.toFixed(1)}% من المطلوب ({viewing.target} MPa) — {viewing.verdict}
            </p>
            <div className="text-[11px] text-slate-600 mt-3 space-y-0.5">
              <p>Batch weight adjustments vary on the daily moisture content of aggregates at the time of batching.</p>
              <p>Concrete will be supplied according to ASTM C94.</p>
              <p>Concrete mixes are designed according to project specification.</p>
            </div>
            <div className="flex justify-between text-xs mt-6">
              <p>أجرى الاختبار: ....................</p>
              <p>التوقيع: ....................</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-4">{t('history')} ({saved.length})</h3>
        {!saved.length ? (
          <p className="text-slate-500 text-sm">{t('none')}</p>
        ) : (
          <div className="space-y-2">
            {saved.map((r, i) => (
              <div key={r.no + i} className="flex items-center justify-between gap-3 bg-white/[0.02] rounded-lg px-4 py-3 border border-white/10">
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm" dir="ltr">📄 {r.no}</p>
                  <p className="text-[11px] text-slate-500">{r.client || '—'} · {r.mix} · <span dir="ltr">{r.avgMpa} MPa</span> · {r.verdict}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setViewIdx(i)} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:text-sky-300">{t('reprint')}</button>
                  <button onClick={() => doExcel(r.payload)} className="bg-yellow-500/10 text-yellow-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-yellow-500/40">{t('excel')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
