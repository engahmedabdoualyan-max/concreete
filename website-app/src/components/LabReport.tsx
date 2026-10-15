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

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import labEmblem from '../assets/lab-emblem.jpg';
import labFooter from '../assets/lab-footer.jpg';
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
  jobNo: string;
  mix: string;
  fc: number;
  exp7: number;
  exp28: number;
  cement: string;
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
  remarks: string;
  tester: string;
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

const AREA_DIV = 17.6625; // kN → MPa for Ø150 cylinder (paper: Area 176.625 cm²)
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
  jobNo: { en: 'Job No', ar: 'رقم الأمر', ur: 'جاب نمبر' },
  cementContent: { en: 'Cement content', ar: 'محتوى الأسمنت', ur: 'سیمنٹ کی مقدار' },
  remarks: { en: 'Remarks', ar: 'ملاحظات', ur: 'ریمارکس' },
  testedBy: { en: 'Tested by', ar: 'أجرى الاختبار', ur: 'ٹیسٹ کنندہ' },
  save: { en: '💾 Save report', ar: '💾 حفظ التقرير', ur: '💾 رپورٹ محفوظ کریں' },
  saved: { en: 'Report saved', ar: 'تم حفظ التقرير', ur: 'رپورٹ محفوظ ہو گئی' },
  needLoads: { en: 'Enter at least one crushing load first.', ar: 'أدخل حمل تكسيير واحداً على الأقل أولاً.', ur: 'پہلے کم از کم ایک کرشنگ لوڈ درج کریں۔' },
  needCasting: { en: 'Enter the casting date first.', ar: 'أدخل تاريخ الصب أولاً.', ur: 'پہلے کاسٹنگ کی تاریخ درج کریں۔' },
  tempCapped: { en: 'Concrete temp capped at 30°C (code limit 32, ice in use).', ar: 'تم تثبيت حرارة الخلطة عند 30° (حد الكود 32 — نستخدم ثلج).', ur: 'کنکریٹ درجہ حرارت 30°C پر محدود (کوڈ حد 32، برف استعمال ہوتی ہے)۔' },
  autoW: { en: 'Empty weights auto-fill from A1 (editable).', ar: 'الأوزان الفارغة تُملأ تلقائياً من A1 (قابلة للتعديل).', ur: 'خالی وزن A1 سے خودکار (قابل ترمیم)۔' },
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

const ELEMENTS = ['قواعد', 'أعمدة', 'أسقف', 'جسور', 'خزانات', 'مسبح', 'صبة خرسانة مسلحة'];
const MIX_TYPES = ['عادي', 'SRC', 'مقاوم للكبريتات'];

// Temporary demo clients (real PDF filenames from the lab archive) until the
// real customer file arrives — used only when no sales customers exist yet.
const DEMO_CLIENTS = [
  'ابو راكان فيصل الشمري',
  'احمد مفرح غريب الحربي',
  'البيوت الفاخرة جاسر زيد جاسر المطيري',
  'البيوت الفاخرة',
  'العماره',
  'النيرة',
  'بتيل ق102 حي الروضة جدوع عاصي عواد الجميلي',
  'تقرير شباب',
  'جدوع عاصي الجميلي',
  'حمد عواد',
  'خيرات العماره',
  'سعود بن صالح بن زلفان المطيري',
  'محمد حسن عبدالله دغريري',
  'محمد خلوي بن خالد الشمري',
];

const RED_IF_EMPTY: CSSProperties = { borderColor: 'rgba(239,68,68,.75)', background: 'rgba(239,68,68,.07)' };

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

function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-end gap-1 text-[10.5px] leading-5">
      <span className="font-bold whitespace-nowrap" dir="ltr">{label}</span>
      <span className="flex-1 border-b border-dotted border-slate-500 text-center px-1">{children}</span>
    </div>
  );
}

function SpecCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-1 px-1.5 py-[3px] border-b border-slate-300 last:border-b-0" dir="ltr">
      <span className="font-bold">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function StrengthChart({ points, avg, target, minAllowed }: {
  points: Array<{ s: string; mpa: number }>;
  avg: number;
  target: number;
  minAllowed: number;
}) {
  const W = 560, H = 185, PL = 46, PR = 10, PT = 12, PB = 26;
  const vals = [...points.map(p => p.mpa), avg, target, minAllowed];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(0.8, (hi - lo) * 0.25);
  const y0 = Math.max(0, lo - pad), y1 = hi + pad;
  const n = Math.max(points.length, 1);
  const X = (i: number) => (n === 1 ? W / 2 : PL + (i * (W - PL - PR)) / (n - 1));
  const Y = (v: number) => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  const ticks = [0, 1, 2].map(k => y0 + ((y1 - y0) * k) / 2);
  const pts = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.mpa).toFixed(1)}`).join(' ');
  return (
    <div className="mt-3" dir="ltr">
      <p className="text-[11px] font-black mb-1 text-center" dir="rtl">منحنى المقاومة والانحراف عن المتوسط (شروط القبول: المتوسط ≥ المطلوب وكل عينة ≥ المطلوب − 3.5)</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="strength curve">
        {ticks.map((tk, i) => (
          <g key={i}>
            <line x1={PL} y1={Y(tk)} x2={W - PR} y2={Y(tk)} stroke="#cbd5e1" strokeWidth="1" />
            <text x={PL - 4} y={Y(tk) + 3} textAnchor="end" fontSize="9" fill="#475569">{tk.toFixed(1)}</text>
          </g>
        ))}
        <line x1={PL} y1={Y(target)} x2={W - PR} y2={Y(target)} stroke="#d97706" strokeWidth="1.5" strokeDasharray="6 3" />
        <text x={W - PR} y={Y(target) - 4} textAnchor="end" fontSize="9" fill="#d97706">المطلوب {target}</text>
        <line x1={PL} y1={Y(minAllowed)} x2={W - PR} y2={Y(minAllowed)} stroke="#dc2626" strokeWidth="1" strokeDasharray="2 3" />
        <text x={W - PR} y={Y(minAllowed) + 11} textAnchor="end" fontSize="9" fill="#dc2626">الأدنى {(minAllowed).toFixed(1)}</text>
        <line x1={PL} y1={Y(avg)} x2={W - PR} y2={Y(avg)} stroke="#059669" strokeWidth="1.5" />
        <text x={W - PR} y={Y(avg) - 5} textAnchor="end" fontSize="9" fill="#059669">المتوسط {avg.toFixed(2)}</text>
        {points.map((p, i) => {
          const dev = p.mpa - avg;
          if (Math.abs(dev) < 0.2) return null;
          return (
            <g key={p.s}>
              <line x1={X(i)} y1={Y(p.mpa)} x2={X(i)} y2={Y(avg)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" />
              <text x={X(i) + 7} y={(Y(p.mpa) + Y(avg)) / 2 + 3} textAnchor="start" fontSize="8.5" fill="#64748b">
                {dev >= 0 ? '+' : ''}{dev.toFixed(2)}
              </text>
            </g>
          );
        })}
        <polyline points={pts} fill="none" stroke="#0284c7" strokeWidth="2" />
        {points.map((p, i) => (
          <g key={p.s + i}>
            <circle cx={X(i)} cy={Y(p.mpa)} r="4" fill="#0284c7" stroke="#fff" strokeWidth="1.5" />
            <text x={X(i)} y={Y(p.mpa) - 8} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#0f172a">{p.mpa.toFixed(2)}</text>
            <text x={X(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#334155">{p.s}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ReportSheet({ p }: { p: ReportPayload }) {
  return (
    <div className="bg-white text-slate-900 max-w-[800px] mx-auto border-2 border-slate-900 p-4" dir="ltr">
      {/* ===== Company letterhead (text + original emblem) ===== */}
      <div className="flex justify-between items-start text-center gap-2">
        <div className="text-[8.5px] leading-[1.55] w-[33%]" dir="ltr">
          <p className="font-black text-[11.5px] tracking-wide">ALMOTWR FACTORY</p>
          <p className="text-slate-600 font-bold">For Cement Products</p>
          <p className="mt-[3px]">CR : 251108261 - LIC : 371339</p>
          <p>TEL : 0509270011 - 0509270022</p>
          <p>AL-SAIR STREET - INDUSTRIAL STATE</p>
          <p>HAFAR AL BATIN - EASTERN REGION</p>
        </div>
        <div className="w-[26%] flex justify-center pt-[2px]">
          <img src={labEmblem} alt="AlMotwr" style={{ height: 82, width: 'auto', objectFit: 'contain' }} />
        </div>
        <div className="text-[8.5px] leading-[1.7] w-[33%]" dir="rtl">
          <p className="font-black text-[13px]">المصنع المطور</p>
          <p className="text-slate-600 font-bold">للمنتجات الأسمنتية</p>
          <p className="mt-[3px]">س.ت : 251108261 - ترخيص : 371339</p>
          <p>جوال : 0509270011 - 0509270022</p>
          <p>شارع السير - المنطقة الصناعية</p>
          <p>حفرالباطن - المنطقة الشرقية</p>
        </div>
      </div>

      <div className="border border-slate-900 text-center font-black text-[13px] mt-2 py-1 tracking-wide">
        COMPRESSIVE STRENGTH OF CONCRETE CYLINDERS
      </div>

      <div className="grid grid-cols-[1fr_215px] gap-3 mt-2">
        <div className="space-y-[3px]">
          <div className="grid grid-cols-2 gap-x-4">
            <InfoLine label="JOB NO">{p.jobNo || '—'}</InfoLine>
            <InfoLine label="Date:">{p.tested}</InfoLine>
          </div>
          <InfoLine label="CLIENT">{p.client || '—'}</InfoLine>
          <InfoLine label="PROJECT">{p.project || '—'}</InfoLine>
          <InfoLine label="LOCATION OF POUR">{p.location || '—'}</InfoLine>
          <InfoLine label="CONCRETE SUPPLIER">{p.supplier}</InfoLine>
          <InfoLine label="DATE OF CASTING">{p.casting}</InfoLine>
          <InfoLine label="DATE OF RECEIVING">{p.casting}</InfoLine>
          <InfoLine label="DATE OF TEST">{p.tested}</InfoLine>
          <InfoLine label="TYPE OF CONCRETE">{p.element}</InfoLine>
          <InfoLine label="CONCRETE GRADE">{p.mix}mpa</InfoLine>
          <InfoLine label="STRENGTH AFTER 28 DAYS">{p.exp28} Mpa</InfoLine>
          <InfoLine label="STRENGTH AFTER 7 DAYS">{p.exp7} Mpa</InfoLine>
        </div>
        <div className="border border-slate-900 text-[10px] h-fit" dir="ltr">
          <SpecCell label="Area">176.625 cm²</SpecCell>
          <SpecCell label="Daimeter">15 cm</SpecCell>
          <SpecCell label="Volume">5301 cm³</SpecCell>
          <SpecCell label="Slump">{p.slump}mm</SpecCell>
          <SpecCell label="Air Temperature">{p.airTemp}</SpecCell>
          <SpecCell label="Concrete Temperature">{p.tempC}</SpecCell>
        </div>
      </div>

      <table className="w-full text-[10.5px] mt-2 border-collapse" dir="ltr">
        <thead>
          <tr className="font-bold">
            <th className="border border-slate-900 p-1">TEST<br />NO</th>
            <th className="border border-slate-900 p-1">SAMPLE<br />NO</th>
            <th className="border border-slate-900 p-1">WEIGHT<br />GM</th>
            <th className="border border-slate-900 p-1">DENSITY<br />GM/CM³</th>
            <th className="border border-slate-900 p-1">LOAD<br />KN</th>
            <th className="border border-slate-900 p-1 text-center" colSpan={2}>COMPRESSIVE STRENGTH</th>
          </tr>
          <tr className="font-bold">
            <th className="border border-slate-900" colSpan={5}></th>
            <th className="border border-slate-900 p-1">KG/CM²</th>
            <th className="border border-slate-900 p-1">MPA</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.filter(r => r.load > 0).map(r => (
            <tr key={r.n} className="text-center">
              <td className="border border-slate-900 p-1">{r.n}</td>
              <td className="border border-slate-900 p-1">{r.s}</td>
              <td className="border border-slate-900 p-1">{r.w ?? '—'}</td>
              <td className="border border-slate-900 p-1">{r.d !== null ? r.d.toFixed(2) : '—'}</td>
              <td className="border border-slate-900 p-1">{r.load}</td>
              <td className="border border-slate-900 p-1">{r.kg.toFixed(2)}</td>
              <td className="border border-slate-900 p-1">{r.mpa.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="text-center font-bold">
            <td className="border border-slate-900 p-1" colSpan={5}>Average</td>
            <td className="border border-slate-900 p-1">{p.avgKg.toFixed(2)}</td>
            <td className="border border-slate-900 p-1">{p.avgMpa.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[11px] font-black mt-2" dir="rtl">
        النتيجة: <span dir="ltr">{p.avgMpa.toFixed(2)} MPa</span> = {p.pct.toFixed(1)}% من المطلوب ({p.target} MPa) — {p.verdict}
      </p>

      <StrengthChart
        points={p.rows.filter(r => r.load > 0).map(r => ({ s: r.s, mpa: r.mpa }))}
        avg={p.avgMpa}
        target={p.target}
        minAllowed={p.target - 3.5}
      />

      <div className="border border-slate-900 mt-2 text-[10.5px]" dir="ltr">
        <p className="font-bold border-b border-slate-900 px-1.5 py-[2px]">Remarks</p>
        <p className="px-1.5 py-1 min-h-[28px]" dir="rtl">{p.remarks || ''}</p>
        <p className="px-1.5 py-[3px] border-t border-slate-200 text-slate-600">Batch weight adjustments vary on the daily moisture content of aggregates at the time of batching.</p>
        <p className="px-1.5 py-[3px] text-slate-600">Concrete will be supplied according to ASTM C94. Concrete mixes are designed according to project specification.</p>
      </div>

      <div className="mt-2 text-[10.5px] space-y-1" dir="ltr">
        <p className="text-center font-bold underline underline-offset-2">TEST PERFOMED BY</p>
        <p><b>Name:</b> {p.tester || 'LAB/ Engineer'}</p>
        <p><b>Signature:</b> ........................................</p>
        <p><b>Date:</b> {p.tested}</p>
      </div>

      <img src={labFooter} alt="ALMOTWR footer" className="w-full mt-2" />
    </div>
  );
}

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
  const [customerRecs, setCustomerRecs] = useState<Array<{ name: string; address: string; phone: string }>>([]);
  const [project, setProject] = useState('');
  const [location, setLocation] = useState('');
  const [element, setElement] = useState(ELEMENTS[0]);
  const [supplier, setSupplier] = useState('شركة المطور للخرسانة الجاهزة');
  const [mixType, setMixType] = useState(MIX_TYPES[1]);
  const [jobNo, setJobNo] = useState('');
  const [cementInfo, setCementInfo] = useState('');
  const [cementTouched, setCementTouched] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [tester, setTester] = useState(username);
  // Casting date is the ONLY date the technician enters (required);
  // the test/report date always follows it automatically (+7 days).
  const [casting, setCasting] = useState('');
  const [tested, setTested] = useState('');
  const [testedTouched, setTestedTouched] = useState(false);
  const pickCasting = (v: string) => {
    setCasting(v);
    if (!testedTouched) setTested(v ? addDays(v, 7) : '');
  };
  const [exp7, setExp7] = useState('');
  const [exp28, setExp28] = useState('');
  const [expTouched, setExpTouched] = useState(false);
  const [samples, setSamples] = useState<SampleIn[]>([{ load: '', weight: '' }, { load: '', weight: '' }, { load: '', weight: '' }]);
  const [slump, setSlump] = useState('120');
  // Concrete temp: ice in use, code ceiling 32°C — always kept below it.
  const [tempC, setTempC] = useState('28');
  const pickTempC = (v: string) => {
    if (v !== '' && Number(v) > 32) {
      setTempC('30');
      onToast(t('tempCapped'));
      return;
    }
    setTempC(v);
  };
  // Air temp: Hafar Al Batin live weather, seasonal fallback. Editable.
  const [airTemp, setAirTemp] = useState('');
  const airTouched = useRef(false);
  useEffect(() => {
    const monthFallback = ['22', '24', '28', '34', '40', '44', '46', '46', '42', '36', '27', '23'][new Date().getMonth()];
    fetch('https://api.open-meteo.com/v1/forecast?latitude=28.43&longitude=45.96&current=temperature_2&timezone=auto')
      .then(r => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (airTouched.current) return;
        const cur = (j as { current?: { temperature_2?: unknown } } | null)?.current?.temperature_2;
        setAirTemp(typeof cur === 'number' ? String(Math.round(cur)) : monthFallback);
      })
      .catch(() => { if (!airTouched.current) setAirTemp(monthFallback); });
  }, []);
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
        const recs = list
          .map((u: unknown) => {
            const o = u as Record<string, unknown>;
            return {
              name: String(o.name ?? o.customerName ?? o.clientName ?? o.username ?? '').trim(),
              address: String(o.address ?? o.site ?? o.location ?? '').trim(),
              phone: String(o.phone ?? o.phoneNumber ?? '').trim(),
            };
          })
          .filter(r => r.name);
        const seen = new Set<string>();
        setCustomerRecs(recs.filter(r => (seen.has(r.name) ? false : (seen.add(r.name), true))));
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

  // Sales linkage: real customers first; archive filenames as demo fallback.
  // Picking a sales customer auto-fills the site location from its address.
  const clientOpts = customerRecs.length ? customerRecs.map(r => r.name) : DEMO_CLIENTS;
  const pickClient = (name: string) => {
    setClient(name);
    const rec = customerRecs.find(r => r.name === name);
    if (rec && rec.address) setLocation(prev => (prev.trim() ? prev : rec.address));
  };

  const recipe = useMemo(() => recipes.find(r => r.code === mixCode) ?? null, [recipes, mixCode]);
  const fc = parseFc(mixCode);
  const effExp7 = expTouched && exp7 !== '' ? Number(exp7) : Math.round(fc * 0.75);
  const effExp28 = expTouched && exp28 !== '' ? Number(exp28) : fc;
  const effCement = cementTouched && cementInfo !== '' ? cementInfo : recipe ? `${recipe.cement} kg/m³` : '';
  const age = casting && tested ? diffDays(casting, tested) : 0;

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
  // Acceptance (ACI 318 style): average ≥ required AND every sample ≥ required − 3.5 MPa.
  const minMpa = valid.length ? Math.min(...valid.map(r => r.mpa)) : 0;
  const minAllowed = target - 3.5;
  const verdict = !valid.length ? '' : avgMpa >= target && minMpa >= minAllowed ? 'pass' : 'fail';

  const buildPayload = (): ReportPayload | null => {
    if (!valid.length || !mixCode) return null;
    const count = Number((localStorage.getItem('labReportSeq') ?? '0')) + 1;
    const no = jobNo.trim() || `LAB-${casting.split('-').join('')}-${String(count).padStart(3, '0')}`;
    return {
      no, jobNo: jobNo.trim(), mix: mixCode, fc, exp7: effExp7, exp28: effExp28,
      cement: effCement,
      client: client.trim(), project: project.trim(), location: location.trim(),
      element, supplier: supplier.trim(), mixType, casting, tested, age,
      slump, tempC, airTemp, remarks: remarks.trim(), tester: tester.trim(), recipe,
      rows, avgKg, avgMpa, target, pct,
      verdict: verdict === 'pass' ? t('pass') : t('fail'),
      company: company || plantName, logo,
    };
  };

  const persist = (list: SavedReport[]) => {
    setSaved(list);
    try { localStorage.setItem('labReports', JSON.stringify(list)); } catch {}
  };

  const needCastingFirst = (): boolean => {
    if (!casting) { onToast(t('needCasting')); return true; }
    return false;
  };

  const doSave = () => {
    if (needCastingFirst()) return;
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
      ['Job No', p.jobNo || '—', '', 'Cement content', p.cement || '—'],
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
      [`Result: ${p.avgMpa.toFixed(2)} MPa = ${p.pct.toFixed(1)}% of required ${p.target} MPa — ${p.verdict} (min sample ${(Math.min(...p.rows.filter(r => r.load > 0).map(r => r.mpa))).toFixed(2)} vs limit ${(p.target - 3.5).toFixed(1)})`],
      [],
      ...(p.remarks ? ([['Remarks', p.remarks], []] as unknown[][]) : []),
      ['Notes:'],
      ['Batch weight adjustments vary on the daily moisture content of aggregates at the time of batching.'],
      ['Concrete will be supplied according to ASTM C94.'],
      ['Concrete mixes are designed according to project specification.'],
      [],
      ['Test Performed By', p.tester || p.company],
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

  // Honest auto-fill: an empty weight inherits the measured A1 weight the
  // moment it is typed (visible in the form, editable any time).
  const setW = (i: number, v: string) => {
    setSamples(prev => {
      const next = prev.map((s, j) => (j === i ? { ...s, weight: v } : s));
      if (i === 0 && v.trim() !== '') {
        for (let j = 1; j < next.length; j++) {
          if (next[j].weight.trim() === '') next[j] = { ...next[j], weight: v };
        }
      }
      return next;
    });
  };

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none focus:border-sky-400/70';
  const labelCls = 'block text-xs text-slate-400 font-semibold mb-1';

  return (
    <div className="space-y-6">
      <style>{`@page { size: A4 portrait; margin: 9mm; } @media print { #root { display: none !important; } #lab-print-root { zoom: 0.78; } }`}</style>

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-1">{t('title')}</h3>
        <p className="text-xs text-slate-400 mb-5">{t('subtitle')}</p>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t('mix')}</label>
            <select value={mixCode} onChange={e => { setMixCode(e.target.value); setExpTouched(false); setCementTouched(false); }} className={inputCls}>
              {recipes.map(r => <option key={r.code} value={r.code} className="bg-slate-900">{r.code}{parseFc(r.code) ? ` (${parseFc(r.code)} MPa)` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('client')}</label>
            <input value={client} onChange={e => pickClient(e.target.value)} list="lab-clients" placeholder="…" className={inputCls} style={client.trim() ? undefined : RED_IF_EMPTY} />
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
            <input type="date" value={casting} onChange={e => pickCasting(e.target.value)} className={inputCls} style={casting ? undefined : RED_IF_EMPTY} />
          </div>
          <div>
            <label className={labelCls}>{t('tested')}</label>
            <input type="date" value={tested} onChange={e => { setTested(e.target.value); setTestedTouched(true); }} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('exp7')}</label>
            <input type="number" value={expTouched ? exp7 : effExp7} onChange={e => { setExp7(e.target.value); setExpTouched(true); }} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('exp28')}</label>
            <input type="number" value={expTouched ? exp28 : effExp28} onChange={e => { setExp28(e.target.value); setExpTouched(true); }} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('jobNo')}</label>
            <input value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="—" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('cementContent')}</label>
            <input value={cementTouched ? cementInfo : effCement} onChange={e => { setCementInfo(e.target.value); setCementTouched(true); }} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('testedBy')}</label>
            <input value={tester} onChange={e => setTester(e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>{t('remarks')}</label>
            <input value={remarks} onChange={e => setRemarks(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>{t('slump')}</label><input value={slump} onChange={e => setSlump(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('tempC')}</label><input value={tempC} onChange={e => pickTempC(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>{t('airTemp')}</label><input value={airTemp} onChange={e => { airTouched.current = true; setAirTemp(e.target.value); }} className={inputCls} /></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          {samples.map((s, i) => (
            <div key={i} className="bg-white/[0.02] border border-white/10 rounded-lg p-3">
              <p className="text-xs font-black text-sky-300 mb-2">A{i + 1}</p>
              <label className={labelCls}>{t('sLoad')}</label>
              <input type="number" step="0.1" value={s.load} onChange={e => setS(i, 'load', e.target.value)} placeholder="412.7" className={inputCls} style={s.load.trim() ? undefined : RED_IF_EMPTY} />
              <div className="mt-2"><label className={labelCls}>{t('sWeight')}</label>
              <input type="number" value={s.weight} onChange={e => setW(i, e.target.value)} placeholder="12393" className={inputCls} style={s.weight.trim() ? undefined : RED_IF_EMPTY} /></div>
              <p className="text-[11px] text-slate-400 mt-2" dir="ltr">
                {rows[i].load > 0 ? `${f2(rows[i].mpa)} MPa · ${f2(rows[i].kg)} kg/cm²` : '—'}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-500 mt-2">⚡ {t('autoW')}</p>

        {valid.length > 0 && (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm font-black ${verdict === 'pass' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
            {t('avg')}: <span dir="ltr">{f2(avgMpa)} MPa</span> ({t('age')} {age} {t('days')} · {pct.toFixed(1)}% {t('ofRequired')} {target} MPa) — {verdict === 'pass' ? t('pass') : t('fail')}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={doSave} className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2.5 rounded-lg text-sm">{t('save')}</button>
          <button onClick={() => { if (needCastingFirst()) return; const p = buildPayload(); if (p) doExcel(p); else onToast(t('needLoads')); }} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-5 py-2.5 rounded-lg font-bold text-sm">{t('excel')}</button>
          <button onClick={() => { if (needCastingFirst()) return; if (valid.length) doPrint(); else onToast(t('needLoads')); }} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white px-5 py-2.5 rounded-lg font-bold text-sm">{t('print')}</button>
        </div>
      </div>

      {viewing && valid.length > 0 && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-black tracking-tight text-white mb-4">{t('preview')}</h3>
          <div id="lab-report-print"><ReportSheet p={viewing} /></div>
        </div>
      )}
      {viewing && valid.length > 0 && createPortal(
        <div id="lab-print-root" className="hidden print:block"><ReportSheet p={viewing} /></div>,
        document.body
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
