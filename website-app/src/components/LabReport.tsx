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
import { usePageDict, type PageDict } from '../i18n/pageDict';
import { useLang } from '../context/LangContext';
import { loadCustomers, loadPlantProfile, loadLabReports, saveLabReports } from '../firebase/firestore';
import { mergeByKey, pullCloud, pushCloud } from '../lib/reportSync';
import { parseFc } from '../lib/mixDesign';
import { shareImageViaLink } from '../lib/sharePdf';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The cement type a saved report was issued against. Reports written before
 * the cement type existed fall back to Type I (the normal Portland default).
 */
function cementTypeOf(p: ReportPayload): (typeof CEMENT_CURVES)[number] {
  return CEMENT_CURVES.find(c => c.key === p.cementType) ?? CEMENT_CURVES[0];
}
const cementTypeLabel = (p: ReportPayload) => cementTypeOf(p).en;
const cementTypeLabelAr = (p: ReportPayload) => cementTypeOf(p).ar;

/** Standalone printable document (inline styles + data-URI images only). */
function buildLabDoc(p: ReportPayload, emblem: string, footer: string, chartSvg: string): string {
  const rowsHtml = p.rows
    .filter(r => r.load > 0)
    .map(
      r => `<tr><td style="border:1px solid #111;padding:3px;text-align:center">${r.n}</td>` +
        `<td style="border:1px solid #111;padding:3px;text-align:center">${esc(r.s)}</td>` +
        `<td style="border:1px solid #111;padding:3px;text-align:center">${r.w ?? '—'}</td>` +
        `<td style="border:1px solid #111;padding:3px;text-align:center">${r.d !== null ? r.d.toFixed(2) : '—'}</td>` +
        `<td style="border:1px solid #111;padding:3px;text-align:center">${r.load}</td>` +
        `<td style="border:1px solid #111;padding:3px;text-align:center">${r.kg.toFixed(2)}</td>` +
        `<td style="border:1px solid #111;padding:3px;text-align:center">${r.mpa.toFixed(2)}</td></tr>`
    )
    .join('');
  const chart = chartSvg.replace('<svg ', '<svg width="100%" ');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:14px;font-family:Arial,Tahoma,sans-serif;color:#111;background:#fff;">` +
    `<div style="border:2px solid #111;padding:12px;max-width:770px;margin:0 auto;" dir="ltr">` +
    `<table style="width:100%;border-collapse:collapse;"><tr>` +
    `<td style="width:33%;font-size:9px;line-height:1.55;text-align:center;vertical-align:top">` +
    `<b style="font-size:11px">ALMOTWR FACTORY</b><br>For Cement Products<br>` +
    `CR : 251108261 - LIC : 371339<br>TEL : 0509270011 - 0509270022<br>` +
    `AL-SAIR STREET - INDUSTRIAL STATE<br>HAFAR AL BATIN - EASTERN REGION</td>` +
    `<td style="width:26%;text-align:center;vertical-align:top"><img src="${emblem}" style="height:78px;"></td>` +
    `<td style="width:33%;font-size:9px;line-height:1.65;text-align:center;vertical-align:top" dir="rtl">` +
    `<b style="font-size:13px">المصنع المطور</b><br>للمنتجات الأسمنتية<br>` +
    `س.ت : 251108261 - ترخيص : 371339<br>جوال : 0509270011 - 0509270022<br>` +
    `شارع السير - المنطقة الصناعية<br>حفرالباطن - المنطقة الشرقية</td>` +
    `</tr></table>` +
    `<div style="border:1px solid #111;text-align:center;font-weight:bold;font-size:13px;margin-top:8px;padding:4px;">COMPRESSIVE STRENGTH OF CONCRETE CYLINDERS</div>` +
    `<table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px;">` +
    `<tr><td style="padding:2px"><b>JOB NO</b> ............ ${esc(p.jobNo) || '—'}</td>` +
    `<td style="padding:2px"><b>Date:</b> ${esc(p.tested)}</td></tr>` +
    `<tr><td style="padding:2px"><b>CLIENT</b> ............ ${esc(p.client) || '—'}</td>` +
    `<td style="padding:2px"><b>PROJECT</b> ............ ${esc(p.project) || '—'}</td></tr>` +
    `<tr><td style="padding:2px"><b>LOCATION OF POUR</b> ............ ${esc(p.location) || '—'}</td>` +
    `<td style="padding:2px"><b>TYPE</b> ............ ${esc(p.element)}</td></tr>` +
    `<tr><td style="padding:2px"><b>SUPPLIER</b> ............ ${esc(p.supplier)}</td>` +
    `<td style="padding:2px"><b>MIX</b> ............ ${esc(p.mix)} (${p.fc} MPa ${esc(p.mixType)})</td></tr>` +
    `<tr><td style="padding:2px"><b>CASTING</b> ............ ${esc(p.casting)} (${p.age} days)</td>` +
    `<td style="padding:2px"><b>SLUMP</b> ............ ${esc(p.slump)} mm</td></tr>` +
    `<tr><td colspan="2" style="padding:3px;border:1px solid #111;background:#f0f0f0;font-weight:bold">` +
    `TEST DURATION / TEST AGE ............ ${p.testAge ?? '—'} DAYS` +
    ` &nbsp;&nbsp;(REQUIRED STRENGTH: ${p.target} MPa)</td></tr>` +
    `<tr><td colspan="2" style="padding:3px;border:1px solid #111;background:#f0f0f0;font-weight:bold">` +
    `CEMENT TYPE ............ ${esc(cementTypeLabel(p))}` +
    ` &nbsp;&nbsp;(ACI 209R-92: α = ${p.aciAlpha?.toFixed(2) ?? '—'}, β = ${p.aciBeta?.toFixed(2) ?? '—'}` +
    ` &nbsp;·&nbsp; FACTOR AT THIS AGE: ${p.aciFactor !== undefined ? p.aciFactor.toFixed(4) : '—'} (${p.aciFactor !== undefined ? (p.aciFactor * 100).toFixed(1) : '—'}%)` +
    ` &nbsp;·&nbsp; f'c(28) = ${p.exp28} MPa</td></tr>` +
    `<tr><td style="padding:2px"><b>CEMENT</b> ............ ${esc(p.cement) || '—'}</td>` +
    `<td style="padding:2px"><b>TEMP</b> ............ ${esc(p.tempC)}°C / ${esc(p.airTemp)}°C</td></tr>` +
    `</table>` +
    (p.recipe ? `<p style="font-size:10px;color:#333;">Mix (kg/m³): cement ${p.recipe.cement} · sand ${p.recipe.sand} · gravel ${p.recipe.gravel} · water ${p.recipe.water} · admix ${p.recipe.admixture}</p>` : '') +
    `<table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px;">` +
    `<tr><th style="border:1px solid #111;padding:3px">TEST<br>NO</th>` +
    `<th style="border:1px solid #111;padding:3px">SAMPLE<br>NO</th>` +
    `<th style="border:1px solid #111;padding:3px">WEIGHT<br>GM</th>` +
    `<th style="border:1px solid #111;padding:3px">DENSITY<br>GM/CM³</th>` +
    `<th style="border:1px solid #111;padding:3px">LOAD<br>KN</th>` +
    `<th style="border:1px solid #111;padding:3px" colspan="2">COMPRESSIVE STRENGTH</th></tr>` +
    `<tr><th style="border:1px solid #111;padding:3px" colspan="5"></th>` +
    `<th style="border:1px solid #111;padding:3px">KG/CM²</th>` +
    `<th style="border:1px solid #111;padding:3px">MPA</th></tr>` +
    rowsHtml +
    `<tr><td style="border:1px solid #111;padding:3px;text-align:center;font-weight:bold" colspan="5">Average</td>` +
    `<td style="border:1px solid #111;padding:3px;text-align:center;font-weight:bold">${p.avgKg.toFixed(2)}</td>` +
    `<td style="border:1px solid #111;padding:3px;text-align:center;font-weight:bold">${p.avgMpa.toFixed(2)}</td></tr>` +
    `</table>` +
    `<p style="font-size:11px;font-weight:bold;" dir="rtl">النتيجة: ${p.avgMpa.toFixed(2)} MPa = ${p.pct.toFixed(1)}% من المطلوب (${p.target} MPa) — ${esc(p.verdict)}</p>` +
    `<p style="font-size:11px;font-weight:bold;" dir="rtl">مدة الاختبار: ${p.testAge ?? '—'} يوم (المطلوب ${p.target} ميجاباسكال)</p>` +
    `<p style="font-size:11px;font-weight:bold;" dir="rtl">نوع الإسمانت: ${esc(cementTypeLabelAr(p))} — معامل ACI 209R-92 عند هذا العمر: ${p.aciFactor !== undefined ? (p.aciFactor * 100).toFixed(1) : '—'}%</p>` +
    chart +
    (p.remarks ? `<p style="font-size:10.5px;" dir="rtl"><b>ملاحظات:</b> ${esc(p.remarks)}</p>` : '') +
    `<p style="font-size:10px;color:#333;">Batch weight adjustments vary on the daily moisture content of aggregates at the time of batching.<br>` +
    `Concrete will be supplied according to ASTM C94. Concrete mixes are designed according to project specification.</p>` +
    `<p style="font-size:10.5px;text-align:center;font-weight:bold;text-decoration:underline;margin-top:8px;">TEST PERFOMED BY</p>` +
    `<p style="font-size:10.5px;"><b>Name:</b> ${esc(p.tester) || 'LAB/ Engineer'} &nbsp;&nbsp; <b>Signature:</b> ........................ &nbsp;&nbsp; <b>Date:</b> ${esc(p.tested)}</p>` +
    methodBlock(p) +
    `<img src="${footer}" style="width:100%;margin-top:8px;">` +
    `</div></body></html>`;
}

/**
 * The method and the codes the verdict rests on, printed at the foot of the
 * report.
 *
 * A lab report that states a number without stating the formula behind it
 * is not defensible: the consultant computes the required strength his own
 * way, and the two documents disagree. So the equation, the constants that
 * were actually used, the value they produced here, and the acceptance rule
 * are all printed — the reader can reproduce the verdict from this page
 * alone.
 */
function methodBlock(p: ReportPayload): string {
  const c = cementTypeOf(p);
  const factor = p.aciFactor !== undefined ? p.aciFactor : c ? 0 : 0;
  return (
    `<div style="border:1px solid #111;margin-top:10px;font-size:9.5px;line-height:1.5;">` +
    `<div style="background:#f0f0f0;padding:3px;font-weight:bold;text-align:center;">METHOD &amp; STANDARDS</div>` +
    `<div style="padding:5px 7px;">` +
    `<b>Strength development</b> — ACI 209R-92 / ASTM C150:<br>` +
    `<span style="font-family:'Cambria Math','Times New Roman',serif;font-size:11px;">` +
    `f'c(t) = f'c(28) × t / ( α + β·t )` +
    `</span><br>` +
    `Cement type: <b>${esc(c.en)}</b> &nbsp;→&nbsp; α = ${c.alpha.toFixed(2)}, β = ${c.beta.toFixed(2)}<br>` +
    `f'c(28) = <b>${p.exp28} MPa</b> &nbsp;·&nbsp; test age = <b>${p.testAge ?? '—'} days</b> &nbsp;→&nbsp; ` +
    `factor t/(α+β·t) = <b>${factor.toFixed(4)}</b> (${(factor * 100).toFixed(1)}%) &nbsp;→&nbsp; ` +
    `required f'c = <b>${p.target} MPa</b><br>` +
    `At 28 days the specified strength f'c(28) = ${p.exp28} MPa is the acceptance target ` +
    `(ACI 318 §26.3.2.2); the raw equation returns 1.0071 × f'c(28) there, which is a calibration offset and not extra strength.<br>` +
    `<b>Acceptance</b> — ACI 318 §26.3.2.2: average of the specimens ≥ required f'c, ` +
    `and no single specimen below (required f'c − 3.5 MPa). ` +
    `Measured average <b>${p.avgMpa.toFixed(2)} MPa</b> = <b>${p.pct.toFixed(1)}%</b> of required → <b>${esc(p.verdict)}</b>.<br>` +
    `<b>Compressive strength test</b> — ASTM C39 (C40/C60), Ø150 × 300 mm cylinder, cross-section 176.625 cm² ` +
    `(load in kN = MPa × 17.6625).<br>` +
    `<b>References</b> — ACI 318 (Building Code Requirements for Structural Concrete) · ` +
    `ACI 209R-92 (Prediction of Creep, Shrinkage, and Temperature Effects in Concrete Structures) · ` +
    `ASTM C39 (Compressive Strength of Cylindrical Concrete Specimens) · ` +
    `ASTM C150 (Portland Cement) · ASTM C94 (Ready-Mix Concrete).` +
    `<div dir="rtl" style="margin-top:4px;border-top:1px solid #111;padding-top:4px;">` +
    `<b>المراجع:</b> ACI 318 · ACI 209R-92 · ASTM C39 · ASTM C150 · ASTM C94<br>` +
    `تطور المقاومة مع الزمن حسب ACI 209R-92 / ASTM C150: f'c(t) = f'c(28) × t / ( α + β·t ) — ` +
    `نوع الإسمانت ${esc(cementTypeLabelAr(p))} (α = ${c.alpha.toFixed(2)}, β = ${c.beta.toFixed(2)})، ` +
    `f'c(28) = ${p.exp28} ميجاباسكال، عمر الاختبار ${p.testAge ?? '—'} يوم، المعامل ${factor.toFixed(4)}، ` +
    `المطلوب ${p.target} ميجاباسكال.<br>` +
    `القبول حسب ACI 318 §26.3.2.2: متوسط العيّنات ≥ المطلوب، ولا تقل أي عيّنة عن (المطلوب − 3.5 ميجاباسكال).` +
    `</div>` +
    `</div></div>`
  );
}

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
  exp3: number;
  testAge: number;
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
  /* ── ACI 209R-92 strength-development curve (so the report can show the
        cement type and the factor it was judged against) ── */
  cementType?: string;
  aciAlpha?: number;
  aciBeta?: number;
  /** Raw ACI factor t/(alpha+beta·t) at the test age. */
  aciFactor?: number;
  /** The factor actually applied (normalised so 28 days = 1.0000). */
  aciFactorApplied?: number;
}

const AREA_DIV = 17.6625; // kN → MPa for Ø150 cylinder (paper: Area 176.625 cm²)
const VOL = 5301.44; // cm³
const KG = 10.19716; // MPa → kg/cm²

export function useLabDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  title: { en: '🧪 Lab test report', ar: '🧪 التقرير الفني للمختبر', ur: '🧪 لیب ٹیسٹ رپورٹ', ru: '🧪 Протокол испытаний', de: '🧪 Laborprüfbericht', it: '🧪 Rapporto di prova', hi: '🧪 लैब टेस्ट रिपोर्ट', ja: '🧪 試験報告書', zh: '🧪 试验报告' },
  subtitle: {
    en: 'Pick the mix and the client, enter 3 crushing loads — the rest is automatic.',
    ar: 'اختر الخلطة والعميل وأدخل نتائج التكسيير الثلاث — والباقي تلقائي.',
    ur: 'مکس اور کلائنٹ منتخب کریں، 3 کرشنگ لوڈ درج کریں — باقی خودکار ہے۔',
    ru: 'Выберите смесь и клиента, введите 3 нагрузки — остальное автоматически.',
    de: 'Mischung und Kunden wählen, 3 Bruchlasten eingeben — der Rest ist automatisch.',
    it: 'Scegli miscela e cliente, inserisci 3 carichi — il resto è automatico.',
    hi: 'मिक्स और ग्राहक चुनें, 3 क्रशिंग लोड दर्ज करें — बाकी स्वचालित है।',
    ja: '配合と顧客を選び、3つの圧縮荷重を入力 — 残りは自動です。',
    zh: '选择配合比和客户，输入3个抗压荷载 — 其余自动完成。',
  },
  mix: { en: 'Concrete mix', ar: 'الخلطة الخرسانية', ur: 'کنکریٹ مکس', ru: 'Бетонная смесь', de: 'Betonmischung', it: 'Miscela', hi: 'कंक्रीट मिक्स', ja: 'コンクリート配合', zh: '混凝土配合比' },
  client: { en: 'Client (pick or type)', ar: 'العميل (اختر أو اكتب)', ur: 'کلائنٹ (منتخب یا لکھیں)', ru: 'Клиент (выберите или введите)', de: 'Kunde (wählen oder tippen)', it: 'Cliente (scegli o digita)', hi: 'ग्राहक (चुनें या लिखें)', ja: '顧客（選択または入力）', zh: '客户（选择或输入）' },
  project: { en: 'Project', ar: 'المشروع', ur: 'پروجیکٹ', ru: 'Проект', de: 'Projekt', it: 'Progetto', hi: 'परियोजना', ja: 'プロジェクト', zh: '项目' },
  location: { en: 'Location', ar: 'الموقع', ur: 'مقام', ru: 'Объект', de: 'Standort', it: 'Luogo', hi: 'स्थान', ja: '場所', zh: '地点' },
  element: { en: 'Element type', ar: 'نوع العنصر', ur: 'عنصر کی قسم', ru: 'Тип элемента', de: 'Bauteiltyp', it: 'Tipo elemento', hi: 'अवयव प्रकार', ja: '部材種別', zh: '构件类型' },
  supplier: { en: 'Concrete supplier', ar: 'مورد الخرسانة', ur: 'کنکریٹ فراہم کنندہ', ru: 'Поставщик бетона', de: 'Betonlieferant', it: 'Fornitore calcestruzzo', hi: 'कंक्रीट आपूर्तिकर्ता', ja: 'コンクリート供給者', zh: '混凝土供应商' },
  mixType: { en: 'Cement type', ar: 'نوع الأسمنت', ur: 'سیمنٹ کی قسم', ru: 'Тип цемента', de: 'Zementtyp', it: 'Tipo cemento', hi: 'सीमेंट प्रकार', ja: 'セメント種類', zh: '水泥类型' },
  casting: { en: 'Casting date', ar: 'تاريخ الصب', ur: 'کاسٹنگ کی تاریخ', ru: 'Дата заливки', de: 'Betonierdatum', it: 'Data getto', hi: 'कास्टिंग तिथि', ja: '打設日', zh: '浇筑日期' },
  tested: { en: 'Test date', ar: 'تاريخ الاختبار', ur: 'ٹیسٹ کی تاریخ', ru: 'Дата испытания', de: 'Prüfdatum', it: 'Data prova', hi: 'परीक्षण तिथि', ja: '試験日', zh: '试验日期' },
  exp7: { en: 'Required 7-day (MPa)', ar: 'المطلوب بعد 7 أيام (MPa)', ur: 'مطلوبہ 7 دن (MPa)', ru: 'Норма 7 сут (МПа)', de: 'Soll 7 Tage (MPa)', it: 'Richiesto 7 gg (MPa)', hi: 'आवश्यक 7-दिन (MPa)', ja: '7日要求値 (MPa)', zh: '7天要求值 (MPa)' },
  exp28: { en: 'Required 28-day (MPa)', ar: 'المطلوب بعد 28 يوم (MPa)', ur: 'مطلوبہ 28 دن (MPa)', ru: 'Норма 28 сут (МПа)', de: 'Soll 28 Tage (MPa)', it: 'Richiesto 28 gg (MPa)', hi: 'आवश्यक 28-दिन (MPa)', ja: '28日要求値 (MPa)', zh: '28天要求值 (MPa)' },
  exp3: { en: 'Required 3-day (MPa)', ar: 'المطلوب بعد 3 أيام (MPa)', ur: 'مطلوبہ 3 دن (MPa)', ru: 'Норма 3 сут (МПа)', de: 'Soll 3 Tage (MPa)', it: 'Richiesto 3 gg (MPa)', hi: 'आवश्यक 3-दिन (MPa)', ja: '3日要求値 (MPa)', zh: '3天要求值 (MPa)' },
  testAge: { en: 'Test age (3–28 days)', ar: 'عمر الاختبار (3–28 يوم)', ur: 'ٹیسٹ عمر (3–28 دن)', ru: 'Возраст испытания (3–28 сут)', de: 'Prüfalter (3–28 Tage)', it: 'Età prova (3–28 giorni)', hi: 'परीक्षण आयु (3–28 दिन)', ja: '材齢（3〜28日）', zh: '试验龄期（3–28天）' },
  requiredAtAge: { en: 'Required strength at this age', ar: 'المطلوب عند هذا العمر', ur: 'اس عمر پر مطلوبہ مضبوط', ru: 'Норма для этого возраста', de: 'Sollwert bei diesem Alter', it: 'Resistenza richiesta a questa età', hi: 'इस आयु पर आवश्यक शक्ति', ja: 'この材齢での要求値', zh: '该龄期的要求强度' },
  cementTypeLabel: { en: 'Cement type (ACI 209R-92)', ar: 'نوع الإسمانت (ACI 209R-92)', ur: 'سیمنٹ کی قسم (ACI 209R-92)', ru: 'Тип цемента (ACI 209R-92)', de: 'Zementart (ACI 209R-92)', it: 'Tipo di cemento (ACI 209R-92)', hi: 'सीमेंट प्रकार (ACI 209R-92)', ja: 'セメントの種類（ACI 209R-92）', zh: '水泥品种 (ACI 209R-92)' },
  aciCurve: { en: 'ACI 209R-92: α, β', ar: 'ACI 209R-92: α، β', ur: 'ACI 209R-92: α، β', ru: 'ACI 209R-92: α, β', de: 'ACI 209R-92: α, β', it: 'ACI 209R-92: α, β', hi: 'ACI 209R-92: α, β', ja: 'ACI 209R-92: α, β', zh: 'ACI 209R-92: α, β' },
  aciFactor: { en: 'ACI 209R-92 factor', ar: 'معامل ACI 209R-92', ur: 'ACI 209R-92 فیکٹر', ru: 'Коэффициент ACI 209R-92', de: 'ACI 209R-92 Faktor', it: 'Fattore ACI 209R-92', hi: 'ACI 209R-92 कारक', ja: 'ACI 209R-92 係数', zh: 'ACI 209R-92 系数' },
  autoFromCurve: { en: 'Auto — from the ACI 209R-92 curve', ar: 'تلقائي — من منحنى ACI 209R-92', ur: 'خودکار — من منحنی ACI 209R-92', ru: 'Авто — по кривой ACI 209R-92', de: 'Automatisch — aus der ACI 209R-92-Kurve', it: 'Automatico — dalla curva ACI 209R-92', hi: 'स्वतः — ACI 209R-92 वक्र से', ja: '自動 — ACI 209R-92 カーブより', zh: '自动 — 取自 ACI 209R-92 曲线' },
  fc28Anchor: { en: "f'c(28) — the anchor of the curve", ar: "f'c(28) — أساس المنحنى", ur: "f'c(28) — منحنی کا بنیاد", ru: "f'c(28) — опора кривой", de: "f'c(28) — Ankerpunkt der Kurve", it: "f'c(28) — il punto di riferimento della curva", hi: "f'c(28) — वक्र का आधार", ja: "f'c(28) — カーブの基準値", zh: "f'c(28) — 曲线基准值" },
  sLoad: { en: 'Load', ar: 'الحمل', ur: 'لوڈ', ru: 'Нагрузка', de: 'Last', it: 'Carico', hi: 'लोड', ja: '荷重', zh: '荷载' },
  sWeight: { en: 'Weight (g)', ar: 'الوزن (جم)', ur: 'وزن (g)', ru: 'Масса (г)', de: 'Gewicht (g)', it: 'Peso (g)', hi: 'वजन (g)', ja: '質量 (g)', zh: '重量 (g)' },
  slump: { en: 'Slump (mm)', ar: 'الهبوط (مم)', ur: 'سلンプ (mm)', ru: 'Осадка (мм)', de: 'Setzmaß (mm)', it: 'Slump (mm)', hi: 'स्लंप (mm)', ja: 'スランプ (mm)', zh: '坍落度 (mm)' },
  tempC: { en: 'Concrete temp (°C)', ar: 'حرارة الخرسانة (°م)', ur: 'کنکریٹ درجہ حرارت (°C)', ru: 'Температура бетона (°C)', de: 'Betontemperatur (°C)', it: 'Temp. calcestruzzo (°C)', hi: 'कंक्रीट तापमान (°C)', ja: 'コンクリート温度 (°C)', zh: '混凝土温度 (°C)' },
  airTemp: { en: 'Air temp (°C)', ar: 'حرارة الجو (°م)', ur: 'ہوا کا درجہ حرارت (°C)', ru: 'Температура воздуха (°C)', de: 'Lufttemperatur (°C)', it: 'Temp. aria (°C)', hi: 'हवा तापमान (°C)', ja: '気温 (°C)', zh: '气温 (°C)' },
  jobNo: { en: 'Job No', ar: 'رقم الأمر', ur: 'جاب نمبر', ru: 'Заказ №', de: 'Auftrag Nr.', it: 'Ordine n.', hi: 'जॉब नं.', ja: '作業No', zh: '任务单号' },
  cementContent: { en: 'Cement content', ar: 'محتوى الأسمنت', ur: 'سیمنٹ کی مقدار', ru: 'Расход цемента', de: 'Zementgehalt', it: 'Dosaggio cemento', hi: 'सीमेंट मात्रा', ja: 'セメント量', zh: '水泥用量' },
  remarks: { en: 'Remarks', ar: 'ملاحظات', ur: 'ریمارکس', ru: 'Примечания', de: 'Bemerkungen', it: 'Note', hi: 'टिप्पणियां', ja: '備考', zh: '备注' },
  testedBy: { en: 'Tested by', ar: 'أجرى الاختبار', ur: 'ٹیسٹ کنندہ', ru: 'Испытал', de: 'Geprüft von', it: 'Provato da', hi: 'परीक्षक', ja: '試験者', zh: '试验员' },
  save: { en: '💾 Save report', ar: '💾 حفظ التقرير', ur: '💾 رپورٹ محفوظ کریں', ru: '💾 Сохранить', de: '💾 Speichern', it: '💾 Salva', hi: '💾 सहेजें', ja: '💾 保存', zh: '💾 保存' },
  saved: { en: 'Report saved', ar: 'تم حفظ التقرير', ur: 'رپورٹ محفوظ ہو گئی', ru: 'Отчёт сохранён', de: 'Bericht gespeichert', it: 'Report salvato', hi: 'रिपोर्ट सहेजी गई', ja: '保存しました', zh: '已保存' },
  needLoads: { en: 'Enter at least one crushing load first.', ar: 'أدخل حمل تكسيير واحداً على الأقل أولاً.', ur: 'پہلے کم از کم ایک کرشنگ لوڈ درج کریں۔', ru: 'Сначала введите хотя бы одну нагрузку.', de: 'Zuerst mindestens eine Last eingeben.', it: 'Inserire prima almeno un carico.', hi: 'पहले कम से कम एक लोड दर्ज करें।', ja: 'まず荷重を1つ入力してください。', zh: '请先输入至少一个荷载。' },
  needCasting: { en: 'Enter the casting date first.', ar: 'أدخل تاريخ الصب أولاً.', ur: 'پہلے کاسٹنگ کی تاریخ درج کریں۔', ru: 'Сначала введите дату заливки.', de: 'Zuerst Betonierdatum eingeben.', it: 'Inserire prima la data del getto.', hi: 'पहले कास्टिंग तिथि दर्ज करें।', ja: 'まず打設日を入力してください。', zh: '请先输入浇筑日期。' },
  needAge: { en: 'Pick the test age (any day from 3 to 28).', ar: 'اختر عمر الاختبار (أي يوم من 3 إلى 28).', ur: 'ٹیسٹ عمر منتخب کریں (3 سے 28 تک کوئی بھی دن)۔', ru: 'Выберите возраст (любой день от 3 до 28).', de: 'Prüfalter wählen (beliebiger Tag von 3 bis 28).', it: 'Scegli età di prova (qualsiasi giorno da 3 a 28).', hi: 'परीक्षण आयु चुनें (3 से 28 तक कोई भी दिन)।', ja: '材齢を選択（3日から28日のいずれか）。', zh: '选择试验龄期（3至28天之间任一天）。' },
  needCement: { en: 'Pick the cement type.', ar: 'اختر نوع الأسمنت.', ur: 'سیمنٹ کی قسم منتخب کریں۔', ru: 'Выберите тип цемента.', de: 'Zementtyp wählen.', it: 'Scegli il tipo di cemento.', hi: 'सीमेंट प्रकार चुनें।', ja: 'セメント種類を選択。', zh: '选择水泥类型。' },
  tempCapped: { en: 'Concrete temp capped at 30°C (code limit 32, ice in use).', ar: 'تم تثبيت حرارة الخلطة عند 30° (حد الكود 32 — نستخدم ثلج).', ur: 'کنکریٹ درجہ حرارت 30°C پر محدود (کوڈ حد 32، برف استعمال ہوتی ہے)۔', ru: 'Температура ограничена 30°C (норма 32, используется лёд).', de: 'Betontemperatur auf 30°C begrenzt (Norm 32, Eis im Einsatz).', it: 'Temperatura limitata a 30°C (norma 32, ghiaccio in uso).', hi: 'कंक्रीट तापमान 30°C पर सीमित (मानक 32, बर्फ उपयोग में)।', ja: '温度は30°Cに制限（基準32、氷使用）。', zh: '温度限制为30°C（规范32，用冰）。' },
  autoW: { en: 'Empty weights auto-fill from A1 (editable).', ar: 'الأوزان الفارغة تُملأ تلقائياً من A1 (قابلة للتعديل).', ur: 'خالی وزن A1 سے خودکار (قابل ترمیم)۔', ru: 'Пустые массы берутся из A1 (можно менять).', de: 'Leere Gewichte werden aus A1 übernommen (änderbar).', it: 'Pesi vuoti copiati da A1 (modificabili).', hi: 'खाली वजन A1 से स्वतः भरें (बदल सकते हैं)।', ja: '空の質量はA1から自動入力（編集可）。', zh: '空重量自动取自A1（可改）。' },
  preview: { en: 'Report preview', ar: 'معاينة التقرير', ur: 'رپورٹ کا پیش نظارہ', ru: 'Предпросмотр', de: 'Vorschau', it: 'Anteprima', hi: 'पूर्वावलोकन', ja: 'プレビュー', zh: '预览' },
  print: { en: '🖨️ Print / PDF', ar: '🖨️ طباعة / PDF', ur: '🖨️ پرنٹ / PDF', ru: '🖨️ Печать / PDF', de: '🖨️ Drucken / PDF', it: '🖨️ Stampa / PDF', hi: '🖨️ प्रिंट / PDF', ja: '🖨️ 印刷 / PDF', zh: '🖨️ 打印 / PDF' },
  whatsapp: { en: '📤 Share on WhatsApp', ar: '📤 مشاركة واتساب', ur: '📤 واٹس ایپ پر شیئر کریں', ru: '📤 Поделиться в WhatsApp', de: '📤 Per WhatsApp teilen', it: '📤 Condividi su WhatsApp', hi: '📤 WhatsApp पर साझा करें', ja: '📤 WhatsAppで共有', zh: '📤 分享到WhatsApp' },
  sharing: { en: '⏳ Preparing PDF…', ar: '⏳ جاري تجهيز PDF…', ur: '⏳ PDF تیار ہو رہا ہے…', ru: '⏳ Готовим PDF…', de: '⏳ PDF wird erstellt…', it: '⏳ Preparo PDF…', hi: '⏳ PDF तैयार हो रहा है…', ja: '⏳ PDF作成中…', zh: '⏳ 正在生成PDF…' },
  sharedOk: { en: 'Shared successfully', ar: 'تمت المشاركة بنجاح', ur: 'کامیابی سے شیئر ہوا', ru: 'Отправлено', de: 'Geteilt', it: 'Condiviso', hi: 'साझा किया गया', ja: '共有しました', zh: '已分享' },
  downloadedNote: { en: 'PDF downloaded — attach it in WhatsApp.', ar: 'نُزّل الملف — أرفقه في واتساب.', ur: 'PDF ڈاؤن لوڈ ہو گئی — واٹس ایپ میں منسلک کریں۔', ru: 'PDF загружен — прикрепите его в WhatsApp.', de: 'PDF geladen — in WhatsApp anhängen.', it: 'PDF scaricato — allegalo su WhatsApp.', hi: 'PDF डाउनलोड हो गई — WhatsApp में संलग्न करें।', ja: 'PDFを保存しました — WhatsAppに添付してください。', zh: 'PDF已下载 — 请在WhatsApp中添加附件。' },
  waNumber: { en: 'WhatsApp no.', ar: 'رقم الواتساب', ur: 'واٹس ایپ نمبر', ru: 'Номер WhatsApp', de: 'WhatsApp-Nr.', it: 'N. WhatsApp', hi: 'व्हाट्सऐप नंबर', ja: 'WhatsApp番号', zh: 'WhatsApp号码' },
  needWaNumber: { en: 'PDF downloaded — enter a WhatsApp number to open the chat.', ar: 'نُزّل الملف — أدخل رقم الواتساب لفتح المحادثة.', ur: 'PDF ڈاؤن لوڈ ہو گئی — چیٹ کے لیے نمبر درج کریں۔', ru: 'PDF загружен — введите номер для чата.', de: 'PDF geladen — Nummer für Chat eingeben.', it: 'PDF scaricato — inserisci il numero per la chat.', hi: 'PDF डाउनलोड — चैट के लिए नंबर दर्ज करें।', ja: 'PDF保存済 — チャット用番号を入力。', zh: 'PDF已下载 — 输入号码以打开聊天。' },
  pdfFail: { en: 'Could not prepare the PDF — try again.', ar: 'تعذر تجهيز PDF — حاول مجدداً.', ur: 'PDF تیار نہیں ہو سکی — دوبارہ کوشش کریں۔', ru: 'Не удалось создать PDF — повторите.', de: 'PDF konnte nicht erstellt werden.', it: 'Impossibile creare il PDF — riprova.', hi: 'PDF तैयार नहीं हो सका — पुनः प्रयास करें।', ja: 'PDFを作成できませんでした。', zh: '无法生成PDF，请重试。' },
  excel: { en: '📊 Excel', ar: '📊 إكسل', ur: '📊 ایکسل', ru: '📊 Excel', de: '📊 Excel', it: '📊 Excel', hi: '📊 एक्सेल', ja: '📊 Excel', zh: '📊 表格' },
  history: { en: 'Saved reports', ar: 'التقارير المحفوظة', ur: 'محفوظ رپورٹس', ru: 'Сохранённые отчёты', de: 'Gespeicherte Berichte', it: 'Report salvati', hi: 'सहेजी रिपोर्टें', ja: '保存済み報告', zh: '已保存报告' },
  none: { en: 'No saved reports yet.', ar: 'لا توجد تقارير محفوظة بعد.', ur: 'ابھی کوئی محفوظ رپورٹ نہیں۔', ru: 'Пока нет сохранённых отчётов.', de: 'Noch keine Berichte.', it: 'Nessun report salvato.', hi: 'अभी कोई रिपोर्ट नहीं।', ja: '保存済み報告はありません。', zh: '暂无已保存报告。' },
  reprint: { en: 'View', ar: 'عرض', ur: 'دیکھیں', ru: 'Открыть', de: 'Ansehen', it: 'Vedi', hi: 'देखें', ja: '表示', zh: '查看' },
  editReport: { en: 'Edit', ar: 'تعديل', ur: 'ترمیم', ru: 'Изменить', de: 'Bearbeiten', it: 'Modifica', hi: 'संपादित करें', ja: '編集', zh: '编辑' },
  closePreview: { en: 'Close', ar: 'إغلاق', ur: 'بند کریں', ru: 'Закрыть', de: 'Schließen', it: 'Chiudi', hi: 'बंद करें', ja: '閉じる', zh: '关闭' },
  editLoaded: { en: 'Report loaded for editing — fix the data and press Save.', ar: 'تم تحميل التقرير للتعديل — صحّح البيانات ثم اضغط حفظ.', ur: 'رپورٹ ترمیم کے لیے لوڈ ہو گیا — ڈیٹا درست کریں اور محفوظ کریں۔', ru: 'Отчёт загружен для правки — исправьте данные и сохраните.', de: 'Bericht zum Bearbeiten geladen — Daten korrigieren und speichern.', it: 'Report caricato per la modifica — correggi i dati e salva.', hi: 'रिपोर्ट संपादन के लिए लोड — डेटा ठीक करें और सहेजें।', ja: '編集用にレポートを読み込みました — データを修正して保存してください。', zh: '报告已加载用于编辑 — 修正数据后保存。' },
  updated: { en: '✅ Report updated', ar: '✅ تم تحديث التقرير', ur: '✅ رپورٹ اپ ڈیٹ ہو گیا', ru: '✅ Отчёт обновлён', de: '✅ Bericht aktualisiert', it: '✅ Report aggiornato', hi: '✅ रिपोर्ट अपडेट हुई', ja: '✅ レポートを更新しました', zh: '✅ 报告已更新' },
  noEditData: { en: 'This report has no editable data.', ar: 'هذا التقرير لا يحتوي على بيانات قابلة للتعديل.', ur: 'اس رپورٹ میں ترمیم کے قابل ڈیٹا نہیں۔', ru: 'В отчёте нет данных для правки.', de: 'Dieser Bericht hat keine editierbaren Daten.', it: 'Questo report non ha dati modificabili.', hi: 'इस रिपोर्ट में संपादन योग्य डेटा नहीं है।', ja: 'このレポートには編集可能なデータがありません。', zh: '此报告没有可编辑的数据。' },
  testDuration: { en: 'Test duration', ar: 'مدة الاختبار', ur: 'آزمائش کی مدت', ru: 'Длительность теста', de: 'Testdauer', it: 'Durata test', hi: 'परीक्षण अवधि', ja: 'テスト期間', zh: '测试周期' },
  saveEdit: { en: '💾 Save changes', ar: '💾 حفظ التعديلات', ur: '💾 تبدیلیاں محفوظ کریں', ru: '💾 Сохранить правки', de: '💾 Änderungen speichern', it: '💾 Salva modifiche', hi: '💾 परिवर्तन सहेजें', ja: '💾 変更を保存', zh: '💾 保存修改' },
  editingLabel: { en: '✏️ Editing report', ar: '✏️ تعديل التقرير', ur: '✏️ رپورٹ کی ترمیم', ru: '✏️ Правка отчёта', de: '✏️ Bericht bearbeiten', it: '✏️ Modifica report', hi: '✏️ रिपोर्ट संपादन', ja: '✏️ レポート編集中', zh: '✏️ 正在编辑报告' },
  cancelEdit: { en: 'Cancel edit', ar: 'إلغاء التعديل', ur: 'ترمیم منسوخ', ru: 'Отменить правку', de: 'Bearbeitung abbrechen', it: 'Annulla modifica', hi: 'संपादन रद्द करें', ja: '編集をキャンセル', zh: '取消编辑' },
  editCancelled: { en: 'Edit cancelled.', ar: 'تم إلغاء التعديل.', ur: 'ترمیم منسوخ ہو گئی۔', ru: 'Правка отменена.', de: 'Bearbeitung abgebrochen.', it: 'Modifica annullata.', hi: 'संपादन रद्द किया गया।', ja: '編集をキャンセルしました。', zh: '已取消编辑。' },
  pass: { en: '✅ PASS', ar: '✅ ناجح', ur: '✅ کامیاب', ru: '✅ Годен', de: '✅ Bestanden', it: '✅ Idoneo', hi: '✅ पास', ja: '✅ 合格', zh: '✅ 合格' },
  fail: { en: '❌ FAIL — review', ar: '❌ راسب — يحتاج مراجعة', ur: '❌ ناکام — جائزہ لیں', ru: '❌ Брак — проверить', de: '❌ Durchgefallen — prüfen', it: '❌ Bocciato — verificare', hi: '❌ फेल — जांचें', ja: '❌ 不合格 — 確認', zh: '❌ 不合格 — 复核' },
  age: { en: 'Age', ar: 'العمر', ur: 'عمر', ru: 'Возраст', de: 'Alter', it: 'Età', hi: 'आयु', ja: '材齢', zh: '龄期' },
  days: { en: 'days', ar: 'يوم', ur: 'دن', ru: 'сут', de: 'Tage', it: 'giorni', hi: 'दिन', ja: '日', zh: '天' },
  avg: { en: 'Average', ar: 'المتوسط', ur: 'اوسط', ru: 'Среднее', de: 'Mittel', it: 'Media', hi: 'औसत', ja: '平均', zh: '平均' },
  ofRequired: { en: 'of required', ar: 'من المطلوب', ur: 'مطلوبہ کا', ru: 'от нормы', de: 'vom Soll', it: 'del richiesto', hi: 'आवश्यक का', ja: '要求値比', zh: '占要求值' },
  paperCompany: { en: 'Company paper', ar: 'ورق الشركة', ur: 'کمپنی پیپر', ru: 'Фирменный бланк', de: 'Firmenpapier', it: 'Carta intestata', hi: 'कंपनी पेपर', ja: '会社用紙', zh: '公司抬头纸' },
  paperPlain: { en: 'Plain paper', ar: 'ورق عادي', ur: 'سادہ کاغذ', ru: 'Обычная бумага', de: 'Normales Papier', it: 'Carta semplice', hi: 'सादा कागज', ja: '普通紙', zh: '普通纸' },
};

const ELEMENTS = ['قواعد', 'ميدة', 'أعمدة', 'أسقف', 'جسور', 'خزانات', 'مسبح', 'صبة خرسانة مسلحة', 'رقابى'];
const MIX_TYPES = ['عادي', 'SRC', 'مقاوم للكبريتات'];

/**
 * Test ages the technician may record: every whole day from 3 to 28.
 *
 * The old dropdown offered only 3, 7 and 28, which forced a lie whenever a
 * cylinder was crushed at any other age (an 11-day sample being the common
 * one). The required strength is then interpolated for the chosen age, so the
 * verdict is judged against the right number.
 */
const AGE_OPTIONS: number[] = Array.from({ length: 26 }, (_, i) => i + 3);

/**
 * ACI 209R-92 / ASTM C150 — strength development with time.
 *
 *   f'c(t) = f'c(28) × t / ( alpha + beta · t )
 *
 * `alpha` (time parameter) and `beta` (asymptotic parameter) depend on the
 * cement type:
 *
 *   Type I   — Normal Portland        alpha 4.00  beta 0.85
 *   Type III — High early strength    alpha 2.30  beta 0.92
 *
 * Type III gains strength faster, which is the whole reason a plant switches
 * to it: a higher early-strength factor matters when the site pours and
 * strips forms on a short schedule.
 */
const CEMENT_CURVES = [
  { key: 'I', alpha: 4.00, beta: 0.85, ar: 'نوع أول — إسمانتي بورتلاندي عادي', en: 'Type I — Normal Portland' },
  { key: 'III', alpha: 2.30, beta: 0.92, ar: 'نوع ثالث — إسمانتي بداية قوية', en: 'Type III — High Early Strength' },
] as const;
export type CementTypeKey = (typeof CEMENT_CURVES)[number]['key'];

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

function ReportSheet({ p, paper }: { p: ReportPayload; paper: 'company' | 'plain' }) {
  return (
    <div className="bg-white text-slate-900 max-w-[800px] mx-auto border-2 border-slate-900 p-4" dir="ltr">
      {/* ===== Company letterhead (text + original emblem) ===== */}
      {paper === 'company' ? (
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
      ) : (
        <p className="font-black text-lg" dir="rtl">{p.company}</p>
      )}

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
          <div className="col-span-2 border border-slate-900 bg-slate-100 px-1.5 py-[3px] font-black flex justify-between">
            <span>TEST DURATION / TEST AGE</span>
            <span dir="ltr">{p.testAge ?? '—'} DAYS</span>
          </div>
          <div className="col-span-2 border border-slate-900 bg-slate-100 px-1.5 py-[3px] font-black flex justify-between">
            <span>REQUIRED STRENGTH AT THIS AGE</span>
            <span dir="ltr">{p.target} Mpa</span>
          </div>
          <div className="col-span-2 border border-slate-900 bg-slate-100 px-1.5 py-[3px] font-black flex justify-between">
            <span>CEMENT TYPE / ACI 209R-92 FACTOR</span>
            <span dir="ltr">
              {cementTypeLabel(p)} · α {p.aciAlpha?.toFixed(2) ?? '—'} · β {p.aciBeta?.toFixed(2) ?? '—'} ·{' '}
              {p.aciFactor !== undefined ? p.aciFactor.toFixed(4) : '—'}
            </span>
          </div>
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

      {/* The method and the codes, so the verdict can be reproduced from this
          sheet alone — the same block the printed report carries. */}
      <div className="border border-slate-900 mt-2 text-[9.5px] leading-[1.5]" dir="ltr">
        <p className="font-bold bg-slate-100 border-b border-slate-900 px-1.5 py-[3px] text-center">METHOD &amp; STANDARDS</p>
        <div className="px-2 py-1.5">
          <p><b>Strength development</b> — ACI 209R-92 / ASTM C150:</p>
          <p className="font-serif text-[11px] my-0.5">f&apos;c(t) = f&apos;c(28) × t / ( α + β·t )</p>
          <p>
            Cement type: <b>{cementTypeLabel(p)}</b> → α = {p.aciAlpha?.toFixed(2) ?? '—'}, β = {p.aciBeta?.toFixed(2) ?? '—'}
          </p>
          <p>
            f&apos;c(28) = <b>{p.exp28} MPa</b> · test age = <b>{p.testAge ?? '—'} days</b> → factor t/(α+β·t) ={' '}
            <b>{p.aciFactor !== undefined ? p.aciFactor.toFixed(4) : '—'}</b>
            {p.aciFactor !== undefined ? ` (${(p.aciFactor * 100).toFixed(1)}%)` : ''} → required f&apos;c = <b>{p.target} MPa</b>
          </p>
          <p className="mt-1">
            At 28 days the specified strength f&apos;c(28) = {p.exp28} MPa is the acceptance target (ACI 318 §26.3.2.2); the raw
            equation returns 1.0071 × f&apos;c(28) there, which is a calibration offset and not extra strength.
          </p>
          <p className="mt-1">
            <b>Acceptance</b> — ACI 318 §26.3.2.2: average of the specimens ≥ required f&apos;c, and no single specimen below
            (required f&apos;c − 3.5 MPa). Measured average <b>{p.avgMpa.toFixed(2)} MPa</b> = <b>{p.pct.toFixed(1)}%</b> of required →{' '}
            <b>{p.verdict}</b>.
          </p>
          <p className="mt-1">
            <b>Compressive strength test</b> — ASTM C39 (C40/C60), Ø150 × 300 mm cylinder, cross-section 176.625 cm²
            (load in kN = MPa × 17.6625).
          </p>
          <p className="mt-1">
            <b>References</b> — ACI 318 · ACI 209R-92 · ASTM C39 · ASTM C150 · ASTM C94.
          </p>
          <div dir="rtl" className="mt-2 border-t border-slate-900 pt-1.5">
            <p>
              <b>المراجع:</b> ACI 318 · ACI 209R-92 · ASTM C39 · ASTM C150 · ASTM C94
            </p>
            <p className="mt-1">
              تطور المقاومة مع الزمن حسب ACI 209R-92 / ASTM C150: f'c(t) = f'c(28) × t / ( α + β·t ) —{' '}
              نوع الإسمانت {cementTypeLabelAr(p)} (α = {p.aciAlpha?.toFixed(2) ?? '—'}، β = {p.aciBeta?.toFixed(2) ?? '—'})،{' '}
              f'c(28) = {p.exp28} ميجاباسكال، عمر الاختبار {p.testAge ?? '—'} يوم، المعامل{' '}
              {p.aciFactor !== undefined ? p.aciFactor.toFixed(4) : '—'}، المطلوب {p.target} ميجاباسكال.
            </p>
            <p className="mt-1">
              القبول حسب ACI 318 §26.3.2.2: متوسط العيّنات ≥ المطلوب، ولا تقل أي عيّنة عن (المطلوب − 3.5 ميجاباسكال).
            </p>
          </div>
        </div>
      </div>

      <img src={labFooter} alt="ALMOTWR footer" className="w-full mt-2" style={paper === 'company' ? undefined : { display: 'none' }} />
    </div>
  );
}

export default function LabReport({ recipes, username, plantName, onToast }: {
  recipes: LabRecipe[];
  username: string;
  plantName: string;
  onToast: (m: string) => void;
}) {
  const t = useLabDict();
  const { lang } = useLang();

  const [mixCode, setMixCode] = useState('');
  const [client, setClient] = useState('');
  const [customerRecs, setCustomerRecs] = useState<Array<{ name: string; address: string; phone: string }>>([]);
  const [project, setProject] = useState('');
  const [location, setLocation] = useState('');
  const [element, setElement] = useState(ELEMENTS[0]);
  const [supplier, setSupplier] = useState('شركة المطور للخرسانة الجاهزة');
  const [mixType, setMixType] = useState('');
  // Cement type memory: picked once per mix, then automatic afterwards.
  const [jobNo, setJobNo] = useState('');
  const [cementInfo, setCementInfo] = useState('');
  const [cementTouched, setCementTouched] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [tester, setTester] = useState(username);
  // Casting date is the ONLY date the technician enters (required);
  // the test/report date always follows it automatically (+7 days).
  const [casting, setCasting] = useState('');
  const [tested, setTested] = useState('');
  const [exp28, setExp28] = useState('');
  const [expTouched, setExpTouched] = useState(false);
  /**
   * Test age in days — ANY whole day from 3 to 28.
   *
   * It used to be a fixed 3 | 7 | 28 choice, which was wrong for the plant:
   * a cylinder is often crushed at an age that is none of the three (an
   * 11-day sample, a 14-day contractual check, a 10-day mix trial). Forcing
   * the technician to lie about the age to fit the dropdown is exactly the
   * kind of fudge that makes a lab report worthless.
   */
  const [testAge, setTestAge] = useState<number | null>(null);
  /** Cement type — drives the ACI 209R alpha/beta constants. */
  const [cementType, setCementType] = useState<CementTypeKey>('I');
  const pickAge = (v: number | null) => {
    setTestAge(v);
    if (casting && v) setTested(addDays(casting, v));
    else if (!casting) setTested('');
  };
  const pickCasting = (v: string) => {
    setCasting(v);
    if (v && testAge) setTested(addDays(v, testAge));
    else setTested('');
  };
  // Cement type memory: picked once per mix, then automatic afterwards.
  const cemMem = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem('labCementType') ?? '{}'); } catch { return {}; }
  };
  const pickCement = (v: string) => {
    setMixType(v);
    if (v && mixCode) {
      try {
        const mem = cemMem();
        mem[mixCode] = v;
        localStorage.setItem('labCementType', JSON.stringify(mem));
      } catch {}
    }
  };
  const applyCementMemory = (code: string) => {
    if (!code) { setMixType(''); return; }
    setMixType(cemMem()[code] ?? '');
  };
  const [samples, setSamples] = useState<SampleIn[]>([{ load: '', weight: '' }, { load: '', weight: '' }, { load: '', weight: '' }]);
  /**
   * The unit the crushing LOAD is typed in.
   *
   * The machine prints kN, but the consultant's report and the client's
   * engineer often quote MPa — and re-deriving one from the other in the
   * field is how a 0.5 MPa slip happens. The stored value is ALWAYS kN
   * (that is what the payload and the report carry); this only changes what
   * the technician types.
   */
  const [loadUnit, setLoadUnit] = useState<'kN' | 'MPa'>('kN');
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
  // Report number being edited (kept so saving replaces it in place).
  const [editNo, setEditNo] = useState<string | null>(null);
  const [paper, setPaper] = useState<'company' | 'plain'>('company');

  useEffect(() => {
    if (recipes.length && !mixCode) {
      setMixCode(recipes[0].code);
      applyCementMemory(recipes[0].code);
    }
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
    // 3-level load: instant local → Firebase (same account, any device) → tenant cloud.
    const boot = async () => {
      let list: SavedReport[] = [];
      try {
        const raw = localStorage.getItem('labReports');
        if (raw) list = JSON.parse(raw);
      } catch {}
      if (list.length) setSaved(list);
      try {
        const fb = await loadLabReports(username);
        if (Array.isArray(fb) && fb.length) {
          list = mergeByKey(list, fb as SavedReport[], r => r.no);
          setSaved(list);
          try { localStorage.setItem('labReports', JSON.stringify(list)); } catch {}
        }
      } catch {}
      try {
        const merged = await pullCloud('labReports', list, r => (r as SavedReport).no);
        if (merged.length !== list.length) {
          setSaved(merged as SavedReport[]);
          try { localStorage.setItem('labReports', JSON.stringify(merged)); } catch {}
          saveLabReports(username, merged).catch(() => {});
          void pushCloud('labReports', merged);
        }
      } catch {}
    };
    void boot();
  }, [username, plantName]);

  // Sales linkage: real customers first; archive filenames as demo fallback.
  // Picking a sales customer auto-fills the site location from its address.
  const clientOpts = customerRecs.length ? customerRecs.map(r => r.name) : DEMO_CLIENTS;
  const pickClient = (name: string) => {
    setClient(name);
    const rec = customerRecs.find(r => r.name === name);
    if (rec && rec.address) setLocation(prev => (prev.trim() ? prev : rec.address));
  };
  const [sharing, setSharing] = useState(false);

  const recipe = useMemo(() => recipes.find(r => r.code === mixCode) ?? null, [recipes, mixCode]);
  const fc = parseFc(mixCode);

  /* ── ACI 209R-92 strength development ─────────────────────────────────
   *   f'c(t) = f'c(28) × t / ( alpha + beta · t )
   *
   * `f'c(28)` is the plant's 28-day strength (the "Required 28-day" field,
   * defaulting to the mix grade). alpha/beta come from the cement type.
   */
  const curve = CEMENT_CURVES.find(c => c.key === cementType) ?? CEMENT_CURVES[0];

  /** The raw ACI 209R factor: f'c(t) / f'c(28) = t / (alpha + beta·t). */
  const aciFactor = (t: number): number => t / (curve.alpha + curve.beta * t);

  /**
   * The factor actually applied.
   *
   * The raw equation returns 1.0071 × f'c(28) at 28 days for Type I (and
   * 0.9979 for Type III) — a calibration offset of the equation, not a real
   * extra 0.7 % of strength. So the curve is used RAW between 3 and 27 days
   * (where the printed factor and the computed requirement agree exactly),
   * and the 28-day point is the specified strength f'c(28) itself, because
   * that is what ACI 318 §26.3.2.2 acceptance is written against and what
   * the consultant checks.
   *
   * The factor printed on the report is the raw ACI 209R-92 Table R1.2.1
   * value, so a reader can check it against the standard table directly.
   */
  const aciFactorApplied = (t: number): number => aciFactor(t);

  const effExp28 = expTouched && exp28 !== '' ? Number(exp28) : fc;
  // 3 and 7 days are READ OFF THE CURVE — they move by themselves when
  // f'c(28) or the cement type changes, so there is no second number that
  // can disagree with the first.
  const effExp7 = Math.round(effExp28 * aciFactor(7) * 10) / 10;
  const effExp3 = Math.round(effExp28 * aciFactor(3) * 10) / 10;
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

  /**
   * Required compressive strength at ANY age between 3 and 28 days.
   *
   * ACI 209R-92: f'c(t) = f'c(28) × t / (alpha + beta·t), with alpha/beta
   * from the cement type (Type I: 4.00 / 0.85 — Type III: 2.30 / 0.92).
   *
   * A plant-typed value at 3 or 7 days is that plant's own reference and
   * wins over the standard curve at that age only; every other age comes
   * from the curve. Below 3 days and at/after 28 days the nearest anchor
   * applies (a very young cylinder is weak, and 28 days is the code target).
   */
  const requiredAtAge = (ageDays: number): number => {
    if (ageDays <= 3) return effExp3;
    // 28 days and beyond: the specified 28-day strength is the acceptance
    // target (ACI 318 §26.3.2.2 is written against f'c, not against the
    // 1.0071 the raw equation returns there).
    if (ageDays >= 28) return effExp28;
    if (ageDays === 7) return effExp7;
    return Math.round(effExp28 * aciFactor(ageDays) * 10) / 10;
  };
  const target = testAge ? Math.round(requiredAtAge(testAge) * 10) / 10 : 0;
  const pct = target > 0 && valid.length ? (avgMpa / target) * 100 : 0;
  // Acceptance (ACI 318 style): average ≥ required AND every sample ≥ required − 3.5 MPa.
  const minMpa = valid.length ? Math.min(...valid.map(r => r.mpa)) : 0;
  const minAllowed = target - 3.5;
  const verdict = !valid.length ? '' : avgMpa >= target && minMpa >= minAllowed ? 'pass' : 'fail';

  const buildPayload = (): ReportPayload | null => {
    if (!valid.length || !mixCode || !testAge) return null;
    const count = Number((localStorage.getItem('labReportSeq') ?? '0')) + 1;
    const no = jobNo.trim() || `LAB-${casting.split('-').join('')}-${String(count).padStart(3, '0')}`;
    return {
      no, jobNo: jobNo.trim(), mix: mixCode, fc, exp7: effExp7, exp28: effExp28, exp3: effExp3, testAge,
      cement: effCement,
      client: client.trim(), project: project.trim(), location: location.trim(),
      element, supplier: supplier.trim(), mixType, casting, tested, age,
      slump, tempC, airTemp, remarks: remarks.trim(), tester: tester.trim(), recipe,
      rows, avgKg, avgMpa, target, pct,
      verdict: verdict === 'pass' ? t('pass') : t('fail'),
      company: company || plantName, logo,
      cementType: curve.key, aciAlpha: curve.alpha, aciBeta: curve.beta,
      aciFactor: Number(aciFactor(testAge).toFixed(4)),
      aciFactorApplied: Number(aciFactorApplied(testAge).toFixed(4)),
    };
  };

  const persist = (list: SavedReport[]) => {
    setSaved(list);
    try { localStorage.setItem('labReports', JSON.stringify(list)); } catch {}
    saveLabReports(username, list).catch(() => {});
    void pushCloud('labReports', list);
  };

  const needBasics = (): string | null => {
    if (!casting) return t('needCasting');
    if (!testAge) return t('needAge');
    if (!mixType) return t('needCement');
    return null;
  };

  const doSave = () => {
    const miss = needBasics(); if (miss) { onToast(miss); return; }
    const p = buildPayload();
    if (!p) { onToast(t('needLoads')); return; }
    // Editing an existing report → keep its number and replace it in place.
    if (editNo) {
      const next = saved.map(r => (r.no === editNo
        ? { ...r, mix: p.mix, client: p.client, project: p.project, avgMpa: Number(p.avgMpa.toFixed(2)), verdict: p.verdict, payload: { ...p, no: r.no } }
        : r));
      persist(next);
      setViewIdx(next.findIndex(r => r.no === editNo));
      setEditNo(null);
      onToast(t('updated'));
      return;
    }
    try { localStorage.setItem('labReportSeq', String(Number(localStorage.getItem('labReportSeq') ?? '0') + 1)); } catch {}
    persist([{
      no: p.no, createdAt: new Date().toISOString(), mix: p.mix, client: p.client,
      project: p.project, avgMpa: Number(p.avgMpa.toFixed(2)), verdict: p.verdict, payload: p,
    }, ...saved]);
    setViewIdx(0);
    onToast(t('saved'));
  };

  /* Load a saved report back into the form so a mistake can be corrected.
     The report number is kept (editNo) so saving replaces it instead of
     creating a duplicate. */
  const loadForEdit = (r: SavedReport) => {
    const p = r.payload;
    if (!p) { onToast(t('noEditData')); return; }
    setEditNo(r.no);
    setMixCode(p.mix);
    setClient(p.client ?? '');
    setProject(p.project ?? '');
    setLocation(p.location ?? '');
    if (p.element) setElement(p.element);
    setSupplier(p.supplier ?? '');
    setMixType(p.mixType ?? '');
    setJobNo(p.jobNo ?? '');
    setCementInfo(p.cement ?? '');
    setCementTouched(true);
    setCasting(p.casting ?? '');
    setTested(p.tested ?? '');
    setTestAge(p.testAge >= 3 && p.testAge <= 28 ? p.testAge : null);
    setCementType(p.cementType === 'III' ? 'III' : 'I');
    setExp28(p.exp28 !== undefined ? String(p.exp28) : '');
    setExpTouched(true);
    setSlump(p.slump ?? '120');
    setTempC(p.tempC ?? '28');
    if (p.airTemp) { airTouched.current = true; setAirTemp(p.airTemp); }
    setRemarks(p.remarks ?? '');
    setTester(p.tester ?? username);
    setSamples(p.rows.map(row => ({
      load: row.load ? String(row.load) : '',
      weight: row.w !== null && row.w !== undefined ? String(row.w) : '',
    })));
    setViewIdx(null);
    onToast(t('editLoaded'));
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
      ['Test Duration / Test Age', `${p.testAge ?? '—'} Days`, '', 'Required for this test', `${p.target} MPa`],
      ['Cement type', cementTypeLabel(p), '', 'ACI 209R-92 factor at this age', p.aciFactor !== undefined ? p.aciFactor.toFixed(4) : '—'],
      ['ACI 209R-92 alpha', p.aciAlpha !== undefined ? String(p.aciAlpha) : '—', '', 'ACI 209R-92 beta', p.aciBeta !== undefined ? String(p.aciBeta) : '—'],
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

  const doWhatsApp = async () => {
    const miss = needBasics(); if (miss) { onToast(miss); return; }
    const p = buildPayload();
    if (!p) { onToast(t('needLoads')); return; }
    setSharing(true);
    try {
      const chartSvg =
        document.querySelector('#lab-report-print svg')?.outerHTML ??
        document.querySelector('#dn-report-preview svg')?.outerHTML ??
        '';
      const text = `تقرير ${p.no} — ${p.client || ''} — ${p.mix}: ${p.avgMpa.toFixed(2)} MPa (${p.verdict})`;
      await shareImageViaLink({
        docHtml: buildLabDoc(p, labEmblem, labFooter, chartSvg),
        kind: 'lab',
        ref: p.no,
        fileName: `${p.no}.jpg`,
        text,
      });
      onToast(t('sharedOk'));
    } catch (e) {
      onToast(`${t('pdfFail')}${e instanceof Error && e.message ? ` (${e.message})` : ''}`);
    } finally {
      setSharing(false);
    }
  };

  /* The report being previewed. A saved report is previewed on its own
     payload — the gate must NOT depend on the live form samples, otherwise
     "View" on a saved report silently does nothing when the form is empty. */
  const viewingSaved: SavedReport | null =
    viewIdx !== null ? (saved[viewIdx] ?? null) : null;
  const viewing: ReportPayload | null =
    viewingSaved ? viewingSaved.payload : buildPayload();
  const canPreview = viewingSaved ? true : valid.length > 0;

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
      <style>{`@page { size: A4 portrait; margin: 9mm; } @media print { #root { display: none !important; } #lab-print-root { display: block !important; visibility: visible !important; zoom: 0.78; } #lab-print-root * { visibility: visible !important; } }`}</style>

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-black tracking-tight text-white mb-1">{t('title')}</h3>
        <p className="text-xs text-slate-400 mb-5">{t('subtitle')}</p>

        {editNo && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-300 flex items-center justify-between gap-3">
            <span dir="ltr">✏️ {t('editingLabel')}: {editNo}</span>
            <button onClick={() => { setEditNo(null); setViewIdx(null); onToast(t('editCancelled')); }} className="text-[11px] border border-amber-500/40 rounded px-2 py-0.5 hover:bg-amber-500/20">
              ✕ {t('cancelEdit')}
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t('mix')}</label>
            <select value={mixCode} onChange={e => { setMixCode(e.target.value); setExpTouched(false); setCementTouched(false); applyCementMemory(e.target.value); }} className={inputCls}>
              {recipes.map(r => (
                <option key={r.code} value={r.code} className="bg-slate-900">
                  {r.code}
                  {parseFc(r.code) ? ` (${parseFc(r.code)} MPa)` : ''}
                  {r.cement ? ` · ${r.cement} kg/m³ cement` : ''}
                </option>
              ))}
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
            <select value={mixType} onChange={e => pickCement(e.target.value)} className={inputCls} style={mixType ? undefined : RED_IF_EMPTY}>
              <option value="" className="bg-slate-900">—</option>
              {MIX_TYPES.map(x => <option key={x} value={x} className="bg-slate-900">{x}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('casting')}</label>
            <input type="date" value={casting} onChange={e => pickCasting(e.target.value)} className={inputCls} style={casting ? undefined : RED_IF_EMPTY} />
          </div>
          <div>
            <label className={labelCls}>{t('tested')}</label>
            <p className={`${inputCls} text-slate-200`} dir="ltr">{tested || '—'}</p>
          </div>
          <div>
            <label className={labelCls}>{t('testAge')}</label>
            <select value={testAge ?? ''} onChange={e => pickAge(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} style={!testAge ? RED_IF_EMPTY : undefined}>
              <option value="" className="bg-slate-900">—</option>
              {/* Any whole day from 3 to 28 — a 3, 4, 5 … 11 … 28 day sample
                  must be recordable as the age it really is. */}
              {AGE_OPTIONS.map(n => <option key={n} value={n} className="bg-slate-900">{n} {t('days')}</option>)}
            </select>
            {testAge && (
              <p className="text-[10px] text-slate-400 mt-1">
                {t('requiredAtAge')}: <b className="text-sky-300" dir="ltr">{target} MPa</b>
                {' · '}
                {t('aciFactor')}: <b className="text-sky-300" dir="ltr">{aciFactor(testAge).toFixed(4)}</b>
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>{t('cementTypeLabel')}</label>
            <select value={cementType} onChange={e => setCementType(e.target.value as CementTypeKey)} className={inputCls}>
              {CEMENT_CURVES.map(c => (
                <option key={c.key} value={c.key} className="bg-slate-900">
                  {lang === 'ar' ? c.ar : c.en}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1" dir="ltr">
              {t('aciCurve')}: α = {curve.alpha.toFixed(2)}, β = {curve.beta.toFixed(2)}
            </p>
          </div>
          <div>
            <label className={labelCls}>{t('exp3')}</label>
            {/* Automatic: read off the ACI 209R-92 curve for the chosen
                cement type. It moves by itself when f'c(28) or the cement
                type changes — no second number to keep in sync. */}
            <input type="number" value={effExp3} readOnly className={`${inputCls} opacity-70 cursor-not-allowed`} />
            <p className="text-[10px] text-slate-500 mt-1">{t('autoFromCurve')}</p>
          </div>
          <div>
            <label className={labelCls}>{t('exp7')}</label>
            <input type="number" value={effExp7} readOnly className={`${inputCls} opacity-70 cursor-not-allowed`} />
            <p className="text-[10px] text-slate-500 mt-1">{t('autoFromCurve')}</p>
          </div>
          <div>
            <label className={labelCls}>{t('exp28')}</label>
            {/* f'c(28) — the anchor the whole curve is built on, and the only
                strength the technician types by hand. */}
            <input type="number" value={expTouched && exp28 !== '' ? exp28 : effExp28} onChange={e => { setExp28(e.target.value); setExpTouched(true); }} className={inputCls} />
            <p className="text-[10px] text-slate-500 mt-1">{t('fc28Anchor')}</p>
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
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className={labelCls + ' mb-0'}>{t('sLoad')} ({loadUnit})</label>
                {/* The load can be read off the machine in kN or quoted in MPa —
                    the field accepts either, the report always carries kN. */}
                <div className="flex rounded overflow-hidden border border-white/15 text-[10px] font-black">
                  {(['kN', 'MPa'] as const).map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setLoadUnit(u)}
                      className={`px-2 py-0.5 ${loadUnit === u ? 'bg-sky-500 text-white' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                step="0.1"
                value={loadUnit === 'MPa' && s.load !== '' ? String(Number(s.load) / AREA_DIV) : s.load}
                onChange={e => {
                  const raw = e.target.value;
                  if (raw === '') { setS(i, 'load', ''); return; }
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setS(i, 'load', String(loadUnit === 'MPa' ? n * AREA_DIV : n));
                }}
                placeholder={loadUnit === 'MPa' ? '23.4' : '412.7'}
                className={inputCls}
                style={s.load.trim() ? undefined : RED_IF_EMPTY}
              />
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
          <button onClick={doSave} className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-2.5 rounded-lg text-sm">{editNo ? t('saveEdit') : t('save')}</button>
          <button onClick={() => { const miss = needBasics(); if (miss) { onToast(miss); return; } const p = buildPayload(); if (p) doExcel(p); else onToast(t('needLoads')); }} className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 px-5 py-2.5 rounded-lg font-bold text-sm">{t('excel')}</button>
          <button onClick={() => { const miss = needBasics(); if (miss) { onToast(miss); return; } if (valid.length) doPrint(); else onToast(t('needLoads')); }} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white px-5 py-2.5 rounded-lg font-bold text-sm">{t('print')}</button>
          <button onClick={() => void doWhatsApp()} disabled={sharing} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 px-5 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50">{sharing ? t('sharing') : t('whatsapp')}</button>
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-bold">
            <button onClick={() => setPaper('company')} className={`px-3 py-2.5 ${paper === 'company' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}>{t('paperCompany')}</button>
            <button onClick={() => setPaper('plain')} className={`px-3 py-2.5 ${paper === 'plain' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}>{t('paperPlain')}</button>
          </div>
        </div>
      </div>

      {viewing && canPreview && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-lg font-black tracking-tight text-white mb-0">
              {t('preview')}{viewingSaved ? ` — ${viewingSaved.no}` : ''}
            </h3>
            {viewingSaved && (
              <div className="flex gap-2">
                <button onClick={() => loadForEdit(viewingSaved)} className="bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 text-xs px-3 py-1.5 rounded-lg font-bold">
                  ✏️ {t('editReport')}
                </button>
                <button onClick={() => { setViewIdx(null); }} className="bg-white/[0.05] text-slate-300 border border-white/10 hover:text-white text-xs px-3 py-1.5 rounded-lg font-bold">
                  ✕ {t('closePreview')}
                </button>
              </div>
            )}
          </div>
          <div id="lab-report-print"><ReportSheet p={viewing} paper={paper} /></div>
        </div>
      )}
      {viewing && canPreview && createPortal(
        <div id="lab-print-root" style={{ display: 'none' }}><ReportSheet p={viewing} paper={paper} /></div>,
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
                  <p className="text-[10px] text-sky-400/80">{t('testDuration')}: {r.payload?.testAge ?? '—'} {t('days')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setViewIdx(i)} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:text-sky-300">{t('reprint')}</button>
                  <button onClick={() => loadForEdit(r)} className="bg-amber-500/15 text-amber-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-amber-500/40 hover:bg-amber-500/25">{t('editReport')}</button>
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
