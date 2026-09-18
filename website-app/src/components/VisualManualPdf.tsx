/**
 * الدليل المصوّر — لقطات شاشات حقيقية من التطبيق مع خرائط ذهنية ومخططات تشغيل
 * وخوارزميات، مجمعة في PDF عربي بنفس أسلوب الدليل النصي.
 */
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import html2canvas from 'html2canvas';
import logoUrl from '../assets/logos/logo.png';

const INK = '#0b111e';
const SKY = '#0284c7';
const CYAN = '#06b6d4';
const SLATE = '#334155';
const LIGHT = '#f1f5f9';
const BORDER = '#e2e8f0';
const PAGE_W = 794;
const PAGE_H = 1123;

type FrameKind = 'phone' | 'browser';
type Shot = { src: string; cap: string; frame?: FrameKind };
type VSec = {
  no: string;
  icon: string;
  title: string;
  intro: string;
  diagram?: string;
  extraAlgo?: string;
  extraChain?: string;
  shots: Shot[];
  bullets: string[];
};

const IM = (n: string) => '/manual-images/' + n;

/* ═══ مبانٍ للمخططات (HTML / SVG مضمّن) ═══ */

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild as HTMLElement;
}

/** خريطة ذهنية دائرية */
function mindMap(cen: string, parts: { t: string; c: string }[], w = 698, h = 360): string {
  const cx = w / 2;
  const cy = h / 2 + 6;
  const R = 50;
  const LEN = 102;
  const N = parts.length;
  let inner =
    `<defs><radialGradient id="mmg" cx="38%" cy="38%" r="80%">` +
    `<stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0b111e"/></radialGradient></defs>`;
  inner += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#mmg)"/>`;
  const lines = cen.split('\n');
  lines.forEach((ln, li) => {
    inner += `<text x="${cx}" y="${cy - (lines.length - 1) * 9 + li * 18}" fill="#7dd3fc" font-size="${lines.length > 1 ? 13 : 16}" font-weight="900" text-anchor="middle" font-family="Tahoma, Arial, sans-serif">${ln}</text>`;
  });
  parts.forEach((p, i) => {
    const a = (-90 + (360 / N) * i) * (Math.PI / 180);
    const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a);
    const x2 = cx + (R + LEN - 10) * Math.cos(a), y2 = cy + (R + LEN - 10) * Math.sin(a);
    const tx = cx + (R + LEN + 20) * Math.cos(a), ty = cy + (R + LEN + 16) * Math.sin(a);
    inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.c}" stroke-width="3.5" stroke-linecap="round" opacity=".85"/>` +
      `<circle cx="${x2}" cy="${y2}" r="7" fill="${p.c}"/>` +
      `<text x="${tx}" y="${ty}" fill="${INK}" font-size="13.5" font-weight="800" text-anchor="middle" font-family="Tahoma, Arial, sans-serif">${p.t}</text>`;
  });
  return `<div style="border:1px solid ${BORDER};border-radius:16px;background:linear-gradient(180deg,#f8fafc,#fff);padding:12px;box-shadow:0 2px 6px rgba(2,8,23,.05)">` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;direction:ltr">${inner}</svg></div>`;
}

/** مخطط انسيابي أفقي */
function flow(steps: { i: string; t: string }[], note?: string): string {
  return `<div style="border:1px solid ${BORDER};border-radius:14px;background:#fff;padding:16px 14px;box-shadow:0 1px 2px rgba(2,8,23,.05)">` +
    `<div style="display:flex;align-items:stretch;gap:6px">` +
    steps.map((s, ix) => (
      (ix > 0 ? `<div style="display:flex;align-items:center;font-size:18px;color:#94a3b8;font-weight:900">←</div>` : '') +
      `<div style="flex:1;min-width:86px;background:linear-gradient(180deg,#0b111e,#0e3a5c);color:#fff;border-radius:12px;padding:11px 8px;text-align:center">` +
      `<div style="font-size:20px">${s.i}</div>` +
      `<div style="font-size:11.5px;font-weight:800;margin-top:6px;line-height:1.85">${s.t}</div></div>`
    )).join('') +
    `</div>` +
    (note ? `<div style="margin-top:12px;background:#f0f9ff;border:1px solid #bae6fd;color:#075985;font-size:12px;line-height:2;padding:9px 14px;border-radius:10px;font-weight:700">📌 ${note}</div>` : '') +
    `</div>`;
}

/** مخطط خطوات خوارزمية */
function algo(title: string, steps: string[], out: string): string {
  return `<div style="border:1px solid ${BORDER};border-radius:14px;background:#fff;padding:15px 16px 13px;box-shadow:0 1px 2px rgba(2,8,23,.05)">` +
    `<div style="font-size:13px;font-weight:900;color:#0e3a5c;margin-bottom:11px">⚙️ ${title}</div>` +
    `<div style="display:flex;flex-direction:column;gap:7px">` +
    steps.map((s, ix) =>
      `<div style="display:flex;align-items:center;gap:10px;background:${ix % 2 ? '#f8fafc' : '#f0f9ff'};border:1px solid ${BORDER};border-radius:10px;padding:8px 12px">` +
      `<span style="flex:0 0 26px;height:26px;border-radius:8px;background:linear-gradient(135deg,${SKY},${CYAN});color:#fff;font-weight:900;font-size:12px;display:inline-flex;align-items:center;justify-content:center"><bdi>${ix + 1}</bdi></span>` +
      `<span style="font-size:12.5px;color:${SLATE};line-height:1.8;font-weight:700">${s}</span></div>`
    ).join('') +
    `<div style="display:flex;align-items:center;gap:10px;background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:8px 12px">` +
    `<span style="flex:0 0 26px;height:26px;border-radius:8px;background:#16a34a;color:#fff;font-weight:900;font-size:12px;display:inline-flex;align-items:center;justify-content:center">✓</span>` +
    `<span style="font-size:12.5px;color:#166534;line-height:1.8;font-weight:800">${out}</span></div>` +
    `</div></div>`;
}

/** سلسلة البصمات (SHA-256) */
function chain(boxes: { n: string; h: string }[], last: boolean): string {
  return `<div style="border:1px solid ${BORDER};border-radius:14px;background:#fff;padding:15px 16px;box-shadow:0 1px 2px rgba(2,8,23,.05)">` +
    `<div style="font-size:13px;font-weight:900;color:#0e3a5c;margin-bottom:11px">🔗 سلسلة البصمات: أي تعديل يكسر السلسلة ويكشف نفسه</div>` +
    `<div style="display:flex;gap:6px;align-items:center">` +
    boxes.map((b, i) =>
      (i > 0 ? `<div style="font-size:15px;color:#64748b;font-weight:900">🔗</div>` : '') +
      `<div style="flex:1;background:#fff;border:1.5px solid ${i === boxes.length - 1 ? '#22c55e' : BORDER};border-radius:11px;padding:8px;text-align:center">` +
      `<div style="font-size:14px;font-weight:900;color:${INK}" dir="ltr"><bdi>${b.n}</bdi></div>` +
      `<div dir="ltr" style="font-size:9px;color:#64748b;margin-top:2px"><bdi>${b.h}</bdi></div></div>`
    ).join('') +
    (last ? `<div style="font-size:15px;color:#16a34a;font-weight:900">✓</div>` : '') +
    `</div></div>`;
}

/* ═══ بيانات الأقسام ═══ */

const MODULE_COLORS = ['#0284c7', '#06b6d4', '#0891b2', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#9333ea'];

const VSECTIONS: VSec[] = [
  {
    no: '1', icon: '🏗️', title: 'ما هو نظام فيمتو؟ بوابة واحدة لمصنعك',
    intro: 'نظام واحد يدير الخرسانة الجاهزة والبلوك على المتصفح والتطبيق وبورتال العملاء بنفس البيانات لحظياً — الواجهات التالية هي مدخلك لكل الوحدات، ونطاقك يحدده دورك في الشجرة.',
    diagram: mindMap('فيمتو\nللخرسانة', [
      { t: 'الطلبات', c: MODULE_COLORS[0] }, { t: 'الجدول', c: MODULE_COLORS[1] },
      { t: 'التشغيل', c: MODULE_COLORS[2] }, { t: 'المحطات', c: MODULE_COLORS[3] },
      { t: 'المختبر', c: MODULE_COLORS[4] }, { t: 'الورشة', c: MODULE_COLORS[5] },
      { t: 'المالية', c: MODULE_COLORS[6] }, { t: 'الحوكمة', c: MODULE_COLORS[7] },
      { t: 'التقييم', c: MODULE_COLORS[8] }, { t: 'العملاء', c: MODULE_COLORS[9] },
    ]),
    shots: [
      { src: IM('m01-welcome.jpeg'), cap: 'شاشة البداية: تسجيل الدخول، إنشاء حساب جديد، أو الدخول كضيف' },
      { src: IM('m02-home.jpeg'), cap: 'الشاشة الرئيسية: كل وحداتك في لوحة واحدة' },
      { src: IM('m03-languages.jpeg'), cap: 'تبديل اللغة فوري من الشريط أعلى الشاشة' },
      { src: IM('m04-desktop.jpeg'), cap: 'نفس التطبيق يعمل على سطح المكتب كمتصفح كامل', frame: 'browser' },
      { src: IM('m05-website.png'), cap: 'بورتال المصنع: صفحة تعريفية ومدخل للدخول', frame: 'browser' },
    ],
    bullets: [
      'من أي جهاز: افتح concrete.fimtosoft.com وسجّل دخولك — لا تثبيت ولا سيرفر داخلي.',
      'دورك يحدد وحداتك فقط: لن ترى غير ما يخص منصبك، وكل شاشة بكامل لغتها العربية.',
      'نفس البيانات اللحظية على الجوال والكمبيوتر — ما يحدث في الميدان تشاهده في المكتب فوراً.',
    ],
  },
  {
    no: '2', icon: '🌳', title: 'شجرة المؤسسة والأدوار',
    intro: 'تُبنى الشركة كشجرة: شركات ← محطات ← فروع ← أقسام، وكل موظف يُمنح دوره ونطاق صلاحياته داخل الشجرة — ترقية الموظف تغيّر وحداته ولوحته تلقائياً.',
    diagram: mindMap('الشجرة\nوالأدوار', [
      { t: 'صاحب المصنع', c: '#b45309' }, { t: 'مدير النظام', c: '#0369a1' },
      { t: 'مدير التشغيل', c: '#0e7490' }, { t: 'مسئول الجدول', c: '#15803d' },
      { t: 'المحاسب', c: '#4d7c0f' }, { t: 'المختبر', c: '#a16207' },
      { t: 'الورشة', c: '#c2410c' }, { t: 'المندوب', c: '#be185d' },
      { t: 'السائق', c: '#7c3aed' }, { t: 'الموظف', c: '#334155' },
    ]),
    shots: [
      { src: IM('m06-tree.png'), cap: 'مثال على الشجرة: توضح المستويات والكود المرتبط بكل مستخدم' },
      { src: IM('m07-roles.png'), cap: 'أنواع العمالة التي يمكن إضافتها في النظام' },
      { src: IM('m08-accounts.jpeg'), cap: 'إدارة حسابات التطبيق: تفعيل وحظر الحسابات' },
    ],
    bullets: [
      'معرّف المستخدم = موقعه في الشجرة: يتغير نطاقه والوحدات المتاحة له بتغيير المنصب.',
      'نوع العمالة يحدد صلاحيات الوحدة مسبقاً، فالإضافة أسرع وأدق.',
      'من لوحة الحسابات يجمد المؤسس أو مدير النظام أي حساب أو يفك تجميده فوراً.',
    ],
  },
  {
    no: '3', icon: '📦', title: 'العميل وطلباته — من الطلب إلى التقييم',
    intro: 'رحلة الطلب كاملة: سجل عملاء، طلبات بالمواصفات، اعتماد من الحسابات، إشعار للعميل، إنجاز بمستند توريد رقمي، ثم تقييم — وكل خطوة موثقة بزمن من الخادم ضد التلاعب.',
    diagram: flow(
      [
        { i: '🛒', t: 'طلب بالمواصفات' },
        { i: '✅', t: 'اعتماد الحسابات' },
        { i: '🗓️', t: 'جدولة آمنة' },
        { i: '🚚', t: 'صب وتوريد' },
        { i: '🖊️', t: 'مستند توريد رقمي (Digital Challan)' },
        { i: '⭐', t: 'تحصيل وتقييم' },
      ],
      'العميل المدين يتجمد آلياً ويُمنع جدولة طلباته؛ واعتماد المحاسب يُسجَّل باسمه من الخادم.',
    ),
    shots: [],
    bullets: [
      'مدير العملاء: سجل كامل بكود واتفاقية سعر وحالة ائتمان لكل عميل.',
      'لكل طلب: نوع (خرسانة/بلوك)، خلطة، هبوط، كمية، موقع المشروع، ومندوب.',
      'مع كل تغيير حالة يصل العميل إشعار بريد، وزر واتساب برسالة جاهزة بلمسة.',
      'بعد الإنجاز: فاتورة إلكترونية قابلة للطباعة + تقييم نجوم للصبة كلها.',
    ],
  },
  {
    no: '4', icon: '🚚', title: 'منظومة التشغيل والرحلات',
    intro: 'من طلب مجدول إلى شاحنة تنطلق وتمر بخمس مراحل موثقة بالوقت والموقع، حتى مستند توريد رقمي (Digital Challan) موقّع من المستلم — كل لحظة محسوبة.',
    diagram: flow(
      [
        { i: '🚀', t: 'انطلاق' },
        { i: '📍', t: 'وصول الموقع' },
        { i: '🏗️', t: 'بدء/نهاية الصب' },
        { i: '💧', t: 'إضافة مياه موثقة' },
        { i: '🔙', t: 'عودة للمحطة' },
        { i: '🧾', t: 'مستند توريد رقمي' },
      ],
      'المراحل الخمس تُحتسب منها زمن الدورة آلياً، بينما تُحسب المسافة من الإحداثيات (Haversine).',
    ),
    shots: [
      { src: IM('m11-addtrip.jpeg'), cap: 'إضافة رحلة: الخلاطة، السائق، المشروع، الكمية، الخلطة، وإحداثيات الموقع' },
      { src: IM('m09-operations.jpeg'), cap: 'لوحة التشغيل: الرحلات وأوقات مراحلها ومسببات التأخير' },
      { src: IM('m10-opsmanage.jpeg'), cap: 'إدارة التشغيل والجدول: استيراد طلبات اليوم دفعة واحدة' },
      { src: IM('m12-trip-rating.jpeg'), cap: 'تقييم الرحلات: زمن الدورة والالتزام بالأوقات أمام كل رحلة' },
    ],
    bullets: [
      'المسافة تظهر فور إدخال الإحداثيات، ووقت الوصول المتوقع ETA يتجدد مع تقدم الشاحنة.',
      'مستند التوريد الرقمي (Digital Challan): رقم + QR للتحقق + توقيع المستلم + سجل كل ما أُضيف من ماء.',
      'مع تطبيق الأندرويد يبث السائق موقعه لحظياً على خريطة العمليات.',
    ],
    extraAlgo: algo(
      'قفل الكمية المسلّمة — منع التحميل الزائد',
      [
        'يُقترح تسليم الرحلة = المتبقي من الطلب + هامش أمان محسوب تلقائياً.',
        'لن تنطلق رحلة جديدة تفوق الحد الأقصى المسموح للطلب.',
        'رفض المندوب للاقتراح يفتح تحقيقاً آلياً ويوثق السبب.',
        'الكمية التي ترتفع بأكثر من الحد الأعلى تُرفض آلياً وتنبّه الإدارة.',
      ],
      'تسليم محسوب بدقة، وكل انحراف يُسجَّل ويسأل عليه أحد.',
    ),
  },
  {
    no: '5', icon: '🗓️', title: 'الجدول ومتابعة الحسابات',
    intro: 'توزيع خطوط الإنتاج والرحلات آلياً أو يدوياً، مع خريطة الطرق وإشعار السائقين، ونظر المحاسب على كل حركة مالية وائتمانية.',
    diagram: flow(
      [
        { i: '✅', t: 'طلب معتمد' },
        { i: '🔄', t: 'جدولة يدوية/توازن' },
        { i: '🗺️', t: 'خريطة المسارات' },
        { i: '🔔', t: 'إشعار السائق' },
        { i: '🚚', t: 'تنفيذ الرحلات' },
      ],
      'التوازن الآلي يوزّع العمل على خطوط الإنتاج والمواقع المتاحة بضغطة زر، مع تأكيد الأوقات.',
    ),
    shots: [
      { src: IM('m13-schedule.jpeg'), cap: 'الجدول: توزيع دورات الرحلات حسب الأولوية والجار والمكان' },
      { src: IM('m34-scheduler.jpeg'), cap: 'شاشة مسئول الجدول: أولويات اليوم وتوزيع المهام' },
      { src: IM('m33-scheduler-page.jpeg'), cap: 'صفحة مسئول الجدول: تفاصيل كل رحلة وتعديلها' },
      { src: IM('m14-accountant-sched.jpeg'), cap: 'شاشة المحاسب للجدول: الالتزامات المالية أمام كل رحلة' },
      { src: IM('m15-accountant-page.jpeg'), cap: 'صفحة المحاسب: تعميق وتفصيل لكل بند' },
      { src: IM('m16-accountant-follow.jpeg'), cap: 'متابعة المحاسب: تحصيل وديون ومستحقات يومية' },
    ],
    bullets: [
      'كل رحلة مُجدولة تظهر للمنفذ فوراً، ونقلها لتوقيت آخر يوثق التعديل والمسؤول.',
      'خريطة الجدول تجمع محطات التشغيل ومواقع الصب وتقترح الأدوار الأنسب.',
      'المحاسب يرى الحكاية كلها: المتَّفق عليه، المدفوع، والمدين — قبل اعتماد أي شيء.',
    ],
  },
  {
    no: '6', icon: '🎛️', title: 'المختبر والجودة والمعايرة',
    intro: 'عالم المختبر في شاشة واحدة: خلطات، مقاومة، معايرة، ونسب إضافات — كل رقم معايرة موثق في سلسلة لا يمكن كسرها دون كشف.',
    diagram: algo(
      'متنبئ المقاومة — من 7 أيام إلى 28',
      [
        'تُسجَّل قراءة المقاومة بعد 7 أيام من الصب.',
        'النموذج الإحصائي المضمَّن يقدر مقاومة اليوم 28.',
        'يُقارن بالتقدير الهدف لاتخاذ قرار الإفراج مبكراً.',
        'كل قراءة وتوقع تُختم في سلسلة البصمات.',
      ],
      'قرار الجودة قبل الموعد، برقم يُحتج به عند العميل.',
    ),
    shots: [
      { src: IM('m17-lab.jpeg'), cap: 'المختبر والجودة: الخلطات، المقاومة، والمعايرة في شاشة واحدة' },
    ],
    bullets: [
      'خلطات لكل مقاومة بتعديلاتها ونسب إضافاتها تُحفظ سحابياً وتُحتسب تلقائياً.',
      'معايرة القبان والخلاطات مربوطة بلوحة الحوكمة وتواريخها لا تقبل التلاعب.',
    ],
    extraChain: chain([{ n: 'معايرة', h: 'a91f…c4' }, { n: 'قراءة', h: '7be2…09f' }, { n: 'توقع', h: 'd04a…77e' }, { n: 'إفراج', h: 'e9c3…b12' }], true),
  },
  {
    no: '7', icon: '🔧', title: 'الورشة وإدارة الصيانة',
    intro: 'أعطال وفنيون وقطع غيار: كل ما يخص الورشة يسير في مسار واضح من تسجيل العطل حتى غلق أمر الشغل وتوثيق التكلفة.',
    diagram: flow(
      [
        { i: '🛠️', t: 'تسجيل عطل' },
        { i: '🏷️', t: 'تصنيف: عادي/طوارئ' },
        { i: '👨‍🔧', t: 'تعيين الفني' },
        { i: '🧰', t: 'قطع غيار' },
        { i: '✔️', t: 'تنفيذ وإغلاق' },
        { i: '📄', t: 'توثيق وتكلفة' },
      ],
      'طلب شراء لا يُنشأ آلياً إذا توفرت القطعة في المخزن — والرفض والسبب يوثقان.',
    ),
    shots: [
      { src: IM('m18-workshop.jpeg'), cap: 'الورشة الرئيسية: المعدات وصحتها العامة' },
      { src: IM('m19-workshop1.jpeg'), cap: 'قائمة المعدات والأعطال المرتبطة بكل معدة' },
      { src: IM('m20-workshop-maint.jpeg'), cap: 'إدارة الصيانة: أمر الشغل وآلية تشغيله' },
      { src: IM('m21-workshop-maint2.jpeg'), cap: 'إدارة الصيانة: خطوات تنفيذ واعتماد' },
      { src: IM('m22-workshop-open.jpeg'), cap: 'الصيانات المفتوحة: متابعة الأعطال الجارية' },
      { src: IM('m23-workshop-home.jpeg'), cap: 'قوائم الصيانات الرئيسية وتواريخها وحالتها' },
    ],
    bullets: [
      'زمن التعطل يُحتسب من لحظة التسجيل حتى الإغلاق — يكشف أبطأ نقاط الميدان.',
      'كل أمر شغل يوثق الفني والأجزاء والتكلفة ويُغلَق بإذن المسؤول.',
    ],
  },
  {
    no: '8', icon: '🏭', title: 'صيانة المحطات',
    intro: 'لكل محطة صيانتها الدورية: تسجيل، قطع متوافرة، تنفيذ ميداني، وخطة شهرية تُبنى من تواريخ آخر صيانة — وتظهر على خريطة المعدات.',
    diagram: flow(
      [
        { i: '📝', t: 'تسجيل صيانة المحطة' },
        { i: '🧰', t: 'قطع غيار حسب المتوفر' },
        { i: '👷', t: 'تنفيذ ميداني' },
        { i: '✔️', t: 'إغلاق وتوثيق' },
        { i: '🗺️', t: 'تحديث الخريطة والحالة' },
      ],
      'مؤشر توقف المحطة يظهر مباشرة على خريطة المعدات الحية للتقييم الشامل.',
    ),
    shots: [
      { src: IM('m24-station.jpeg'), cap: 'صيانة المحطات: سجل الصيانة والخطة الدورية' },
      { src: IM('m25-station2.jpeg'), cap: 'تفاصيل الصيانة لكل محطة وقطع الغيار المقابلة' },
      { src: IM('m26-station3.jpeg'), cap: 'متابعة تنفيذ صيانة المحطات عبر المراحل' },
    ],
    bullets: [
      'خطة كل محطة تُقترح آلياً بحسب زمن آخر صيانة ونوعها.',
      'أي محطة متوقفة تظهر فوراً بلون مميز على خريطة معدات التقييم الشامل.',
    ],
  },
  {
    no: '9', icon: '📊', title: 'التقييم الشامل والمؤشرات',
    intro: 'كل الأداء في شاشة واحدة: تقييم نجوم لكل صبة، تحليل دورات الرحلات، وخريطة حية للمعدات تشمل مواقع المحطات والرحلات لحظة بلحظة.',
    diagram: mindMap('المؤشرات', [
      { t: 'الرحلات', c: '#0369a1' }, { t: 'الدورات', c: '#0e7490' },
      { t: 'التوقيت', c: '#15803d' }, { t: 'رضا العملاء', c: '#a16207' },
      { t: 'الوقود', c: '#c2410c' }, { t: 'الضياع', c: '#be185d' },
      { t: 'الأعطال', c: '#dc2626' }, { t: 'الإنتاجية', c: '#7c3aed' },
    ]),
    shots: [
      { src: IM('m27-evaluation.jpeg'), cap: 'التقييم الشامل: مؤشرات الأداء اليومية لكل وحدة' },
      { src: IM('m28-evaluation-map.jpeg'), cap: 'الخريطة الحية للمعدات: مواقع المحطات والرحلات' },
    ],
    bullets: [
      'التقييم من 15 نجمة (المحطة، السيارة، العمالة) يغذي تقارير الأداء ويحدد الأفضل.',
      'تحليل دورات الرحلات يكشف أبطأ مسار وأقصره لاتخاذ قرارات الميدان.',
      'مؤشر الإنتاجية والتشغيل يتجدد لحظياً لكل ورشة ومعدة ومنطقة.',
    ],
  },
  {
    no: '10', icon: '👥', title: 'الواجهات حسب الأدوار',
    intro: 'نفس النظام، أنظار مختلفة: كل دور يرى لوحته ووحداته فقط — وهذه أهم شاشاتها كما يستخدمها الفريق فعلياً.',
    shots: [
      { src: IM('m29-owner.jpeg'), cap: 'واجهة صاحب المصنع: القرار في أعلى سلم الشجرة' },
      { src: IM('m30-owner-home.jpeg'), cap: 'شاشة صاحب المصنع: المؤشرات الكلية للمصنع' },
      { src: IM('m31-sysadmin.jpeg'), cap: 'صفحة مدير النظام: أدوات الإدارة والتحكم' },
      { src: IM('m32-opsmgr.jpeg'), cap: 'لوحة مدير التشغيل: متابعة الميدان لحظياً' },
      { src: IM('m35-sales.jpeg'), cap: 'صفحة المندوب: عمله اليومي على الأرض' },
    ],
    bullets: [
      'صاحب المصنع يرى الكل بالقرار، والمندوب يرى عمله فقط — صلاحيات دقيقة لكل دور.',
      'تغيير منصب أي موظف يغيّر واجهته ووحداته تلقائياً دون إعادة تثبيت.',
    ],
  },
];

/* ═══ صفحات ═══ */

function headerBar(sec: VSec, cont: boolean): string {
  const label = cont ? `القسم <bdi>${sec.no}</bdi> ــ تابع` : `القسم <bdi>${sec.no}</bdi>`;
  return `<div style="display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,#0b111e,#0e3a5c);color:#fff;padding:18px 26px;border-radius:16px">
    <div style="font-size:30px">${sec.icon}</div>
    <div>
      <div style="font-size:12px;color:#7dd3fc;font-weight:800">${label}</div>
      <div style="font-size:22px;font-weight:900;line-height:1.5">${sec.title}</div>
    </div>
    <div style="margin-inline-start:auto;font-size:11px;color:#94a3b8;font-weight:700" dir="ltr"><bdi>FIMTO CONCRETE ERP</bdi></div>
  </div>`;
}

function newPage(sec: VSec, cont: boolean) {
  const page = el(`<div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(180deg,#f8fafc 0%,#fff 30%);box-sizing:border-box;padding:48px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;overflow:hidden">
    ${headerBar(sec, cont)}
  </div>`);
  const cnt = el(`<div style="margin-top:18px"></div>`);
  page.appendChild(cnt);
  return { page, cnt };
}

function introEl(txt: string): HTMLElement {
  return el(`<p style="margin:0 0 14px;color:#475569;font-size:13.5px;line-height:2">${txt}</p>`);
}

/** إطار موبايل: الصورة كاملة بالداخل دون قص */
function phoneFrame(shot: Shot): HTMLElement {
  return el(`<div style="width:286px;display:inline-block;vertical-align:top">
    <div style="position:relative;width:286px;background:linear-gradient(165deg,#334155,#0b0f19);border:2px solid #0f172a;border-radius:34px;padding:12px 14px;box-shadow:0 12px 26px rgba(2,8,23,.3)">
      <div style="position:absolute;right:-3px;top:102px;width:3px;height:32px;background:#334155;border-radius:2px"></div>
      <div style="position:absolute;left:-3px;top:94px;width:3px;height:22px;background:#334155;border-radius:2px"></div>
      <div style="position:relative;width:258px;height:516px;border-radius:24px;overflow:hidden;background:#0b0f19">
        <img src="${shot.src}" style="width:258px;height:516px;object-fit:contain;display:block;background:linear-gradient(180deg,#0d2136,#0b111e)"/>
        <div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);width:82px;height:18px;background:#05070c;border-radius:12px;z-index:3">
          <div style="width:26px;height:5px;border-radius:99px;background:#1e293b;margin:5px auto 0"></div>
        </div>
        <div style="position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:92px;height:4px;border-radius:99px;background:rgba(226,232,240,.85);z-index:3"></div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;font-weight:800;color:#0e3a5c;line-height:1.7;margin-top:8px;padding-inline:4px">📱 ${shot.cap}</div>
  </div>`);
}

/** إطار متصفح للواجهات التي تعمل على الويب */
function browserFrame(shot: Shot): HTMLElement {
  return el(`<div style="width:560px;margin-top:14px" dir="ltr">
    <div style="background:#1e293b;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:8px;padding:9px 14px">
      <span style="width:11px;height:11px;border-radius:99px;background:#f87171;display:inline-block"></span>
      <span style="width:11px;height:11px;border-radius:99px;background:#fbbf24;display:inline-block"></span>
      <span style="width:11px;height:11px;border-radius:99px;background:#34d399;display:inline-block"></span>
      <span style="flex:1;background:#0f172a;color:#94a3b8;font-size:11px;font-weight:700;padding:5px 12px;border-radius:99px;text-align:center"><bdi>concrete.fimtosoft.com</bdi></span>
    </div>
    <div style="width:560px;height:378px;background:#0b0f19;border-radius:0 0 12px 12px;overflow:hidden;border:1px solid #0f172a;border-top:none">
      <img src="${shot.src}" style="width:560px;height:378px;object-fit:contain;display:block"/>
    </div>
    <div style="text-align:center;font-size:11px;font-weight:800;color:#0e3a5c;line-height:1.7;margin-top:8px" dir="rtl">💻 ${shot.cap}</div>
  </div>`);
}

function shotEl(shot: Shot): HTMLElement {
  return (shot.frame === 'browser' ? browserFrame(shot) : phoneFrame(shot));
}

function bulletEl(t: string): HTMLElement {
  return el(`<div style="display:flex;gap:9px;align-items:flex-start;margin-top:9px;background:#fff;border:1px solid ${BORDER};border-radius:10px;padding:9px 13px">
    <span style="flex:0 0 7px;height:7px;border-radius:99px;background:${SKY};margin-top:7px"></span>
    <span style="font-size:12.5px;color:${SLATE};line-height:1.85;font-weight:700">${t}</span>
  </div>`);
}

function buildCoverVisual(): HTMLElement {
  return el(`<div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(160deg,#080c14 0%,#0b111e 55%,#0d2136 100%);color:#fff;box-sizing:border-box;padding:70px 60px;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:6px 14px">FIMTO SOFT</div>
      <div style="font-size:12px;color:#64748b"><bdi>دليل مصوّر v1.0</bdi></div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
      <img src="${logoUrl}" alt="Fimto" style="width:140px;height:138px;object-fit:contain;margin:0 auto 20px;display:block;border-radius:24px;background:#fff;padding:8px;align-self:center"/>
      <h1 style="font-size:42px;margin:0;font-weight:900;line-height:1.6">الدليل المصوّر<br/><span style="color:#38bdf8">نظام فيمتو للخرسانة</span></h1>
      <p style="color:#94a3b8;font-size:15.5px;margin-top:16px;line-height:1.9">35 شاشة حقيقية من التطبيق بإطار الموبايل، مع خرائط ذهنية ومخططات تشغيل وخوارزميات<br/>ويب · أندرويد · بورتال العملاء</p>
      <div style="margin-top:26px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${['🖼️ شاشات بإطار موبايل', '🧠 3 خرائط ذهنية', '🔀 6 مخططات تشغيل', '⚙️ خوارزميات', '🔗 سلسلة بصمات'].map(x =>
          `<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#7dd3fc;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px">${x}</span>`).join('')}
      </div>
    </div>
    <div style="text-align:center;color:#475569;font-size:12px"><bdi>concrete.fimtosoft.com</bdi> — Designed by Dr. Ahmad Abdo Alyan</div>
  </div>`);
}

function buildBackVisual(): HTMLElement {
  return el(`<div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#080c14,#0d2136);color:#fff;box-sizing:border-box;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
    <div style="font-size:52px;margin-bottom:18px">📖</div>
    <h2 style="font-size:32px;font-weight:900;margin:0">حان وقت الاستخدام</h2>
    <p style="color:#94a3b8;font-size:15px;line-height:2;margin-top:14px">كل شاشة في هذا الدليل موجودة أمامك الآن في النظام.<br/>إذا لم تجدها في واجهتك، فدورك مختلف — هذا طبيعي ومقصود.</p>
    <div style="margin-top:32px;background:rgba(56,189,248,.08);border:1px solid #164e63;border-radius:14px;padding:20px 30px;font-size:14px;color:#7dd3fc;line-height:2.2" dir="ltr">
      concrete.fimtosoft.com<br/>downloads/fimto-android.apk<br/>concrete.fimtosoft.com/#/portal
    </div>
    <div style="margin-top:38px;color:#475569;font-size:12px">© Fimto Soft — جميع الحقوق محفوظة</div>
  </div>`);
}

/* ═══ التوليد ═══ */

/** تجميع الشاشات في صفوف: موبايلات اثنان في الصف، والمتصفح وحده */
function groupShots(shots: Shot[]): Shot[][] {
  const groups: Shot[][] = [];
  let cur: Shot[] = [];
  const flush = () => { if (cur.length) { groups.push(cur); cur = []; } };
  for (const s of shots) {
    if (s.frame === 'browser') { flush(); groups.push([s]); continue; }
    cur.push(s);
    if (cur.length === 2) flush();
  }
  flush();
  return groups;
}

function rowElOf(shots: Shot[]): HTMLElement {
  const row = el(`<div style="display:flex;justify-content:center;align-items:center;gap:26px;margin:0"></div>`);
  shots.forEach(s => row.appendChild(shotEl(s)));
  return row;
}

export async function generateVisualManualPdf(onProgress?: (done: number, total: number) => void): Promise<number> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(holder);

  try {
    const allShots = VSECTIONS.flatMap(s => s.shots);
    await Promise.all(allShots.map(s =>
      new Promise<void>(res => {
        const i = new Image();
        i.onload = () => res();
        i.onerror = () => res();
        i.src = s.src;
      })
    ));

    const contentPages: HTMLElement[] = [];
    const secFirstIdx: Record<string, number> = {};

    holder.appendChild(buildCoverVisual());

    for (const sec of VSECTIONS) {
      secFirstIdx[sec.no] = holder.children.length;

      /* صفحة المخطط والنقاط القصيرة (قياس حي للنصوص فقط) */
      let { page, cnt } = newPage(sec, false);
      holder.appendChild(page);
      const headerH = () => (page.firstElementChild as HTMLElement).offsetHeight;
      const avail = () => PAGE_H - 48 * 2 - headerH() - 18;

      const textItems: HTMLElement[] = [];
      textItems.push(introEl(sec.intro));
      if (sec.diagram) textItems.push(el(sec.diagram));
      if (sec.extraAlgo) textItems.push(el(sec.extraAlgo));
      if (sec.extraChain) textItems.push(el(sec.extraChain));
      sec.bullets.forEach(b => textItems.push(bulletEl(b)));

      for (const it of textItems) {
        cnt.appendChild(it);
        if (cnt.scrollHeight > avail()) {
          cnt.removeChild(it);
          contentPages.push(page);
          ({ page, cnt } = newPage(sec, true));
          holder.appendChild(page);
          cnt.appendChild(it);
        }
      }
      contentPages.push(page);

      /* صفحات الشاشات: صورتان في كل صفحة بالضبط، موسوطتان في منتصف الصفحة */
      for (const row of groupShots(sec.shots)) {
        const { page: sp, cnt: sc } = newPage(sec, sec.shots.length > 0);
        holder.appendChild(sp);
        const hh = (sp.firstElementChild as HTMLElement).offsetHeight;
        sc.style.cssText += ';display:flex;align-items:center;justify-content:center;margin-top:0;height:' + (PAGE_H - 96 - hh - 14) + 'px;';
        sc.appendChild(rowElOf(row));
        contentPages.push(sp);
      }
    }

    const tocRows = VSECTIONS.map(s => `
      <tr>
        <td style="padding:7px 6px;border-bottom:1px solid ${BORDER};width:46px"><span style="display:inline-flex;width:26px;height:26px;border-radius:8px;background:${INK};color:#fff;align-items:center;justify-content:center;font-weight:800;font-size:12px"><bdi>${s.no}</bdi></span></td>
        <td style="padding:7px 6px;border-bottom:1px solid ${BORDER};font-weight:800;color:${INK};font-size:13.5px">${s.icon} ${s.title}</td>
        <td style="padding:7px 6px;border-bottom:1px solid ${BORDER};color:${SKY};font-size:12px;font-weight:700;white-space:nowrap">ص <bdi>${secFirstIdx[s.no] + 2}</bdi></td>
      </tr>`).join('');
    const toc = el(`
      <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;box-sizing:border-box;padding:55px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
        <div style="border-radius:16px;background:${LIGHT};border:1px solid ${BORDER};padding:22px 26px;margin-bottom:20px">
          <div style="font-size:13px;color:${SKY};font-weight:800"><bdi>VISUAL CONTENTS</bdi></div>
          <div style="font-size:30px;font-weight:900;color:${INK}">📖 فهرس الدليل المصوّر</div>
        </div>
        <table style="width:100%;border-collapse:collapse">${tocRows}</table>
        <div style="margin-top:22px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:13px 17px;color:#0369a1;font-size:12.5px;line-height:1.9">
          💡 ${VSECTIONS.length} أقسام تغطي 35 شاشة حقيقية + خرائط ذهنية وخرائط تشغيل وخوارزميات — كل قسم يبدأ بمخطط ثم يعرض الشاشات وتعليقاتها.
        </div>
      </div>`);

    holder.insertBefore(toc, holder.children[1]);
    holder.appendChild(buildBackVisual());

    const pages = Array.from(holder.children) as HTMLElement[];
    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      let canvas: HTMLCanvasElement;
      try {
        canvas = await toCanvas(pages[i], { pixelRatio: 1.5, backgroundColor: '#ffffff', cacheBust: true });
      } catch {
        canvas = await html2canvas(pages[i], { scale: 1.3, backgroundColor: '#ffffff', logging: false, useCORS: true });
      }
      const img = canvas.toDataURL('image/jpeg', 0.86);
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, PAGE_W, PAGE_H);
    }
    onProgress?.(pages.length, pages.length);
    pdf.save(`Fimto-Visual-Manual-${new Date().toISOString().slice(0, 10)}.pdf`);
    return pages.length;
  } finally {
    holder.remove();
  }
}