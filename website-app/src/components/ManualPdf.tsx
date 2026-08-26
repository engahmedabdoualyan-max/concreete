/**
 * دليل الاستخدام الرسمي — يُبنى كـ PDF عربي كامل (غلاف + فهرس + أقسام)
 * عبر html2canvas + jsPDF لضمان عرض العربية بدقة داخل الصفحات.
 */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const INK = '#0b111e';
const SKY = '#0284c7';
const CYAN = '#06b6d4';
const SLATE = '#334155';
const LIGHT = '#f1f5f9';
const BORDER = '#e2e8f0';

type Section = { no: string; title: string; icon: string; items: string[] };

export const MANUAL_SECTIONS: Section[] = [
  { no: '1', icon: '🏗️', title: 'ما هو نظام فيمتو للخرسانة؟', items: [
    'نظام متكامل لإدارة مصانع الخرسانة الجاهزة ومصانع البلوك: ويب + تطبيق أندرويد + بورتال عملاء.',
    'يعمل بالكامل من المتصفح بدون تثبيت، ويتزامن لحظياً بين جميع الأجهزة والمستخدمين.',
    'صلاحيات دقيقة لكل دور: مدير، محاسب، مشغل، مختبر، ورشة، سائق، مندوب… وأكثر من 16 دوراً.',
    'يعمل حتى بدون أي أجهزة طرفية؛ والأجهزة (متحكم/كاميرات/GPS) إضافات اختيارية تتفعل عند توصيلها.',
  ]},
  { no: '2', icon: '🚀', title: 'البداية السريعة', items: [
    'أنشئ حساب شركتك من صفحة الدخول (اسم مستخدم + بريد + بيانات المحطة).',
    'فعّل الحساب بكود التحقق المرسل على بريدك الإلكتروني.',
    'من لوحة التحكم الرئيسية افتح أي قسم من الوحدات الاثنتي عشرة.',
    'استخدم زر «القفز السريع» أعلى كل صفحة للتنقل الفوري بين الأقسام.',
  ]},
  { no: '3', icon: '📦', title: 'الطلبات', items: [
    'تسجيل طلب خرسانة أو بلوك كامل: عميل، مشروع، نوع الخلطة، الهبوط، الكمية والمندوب.',
    'دورة اعتماد مالية: انتظار → موافقة/رفض الحسابات مع تسجيل اسم المعتمِد وزمنه ضد التلاعب.',
    'حالة ائتمان العميل (واضح / ديون / محظور) تمنع جدولة أي طلب لعميل مجمّد.',
    'فاتورة إلكترونية احترافية قابلة للطباعة لكل طلب مكتمل.',
    '⭐ تقييم يومي لكل صبة: المحطة / السيارة / العمالة (من 15 نقطة) + ملاحظات.',
    'إشعارات البريد والواتساب تلقائياً للعميل عند كل تغيير حالة.',
  ]},
  { no: '4', icon: '🚚', title: 'التشغيل والرحلات', items: [
    'إدارة رحلات الخلاطات: انطلاق، وصول، صب، عودة، وزمن الدورة تلقائياً.',
    'إحداثيات GPS للمواقع وحساب المسافات، وأسباب التأخير موثقة.',
    'شيكارة توريد رقمية بـ QR وتوقيع المستلم على التابلت وسجل إضافة المياه.',
    'استيراد الطلبات المجدولة كرحلات بضغطة واحدة + مخطط زمني كانفس.',
    'بث مباشر لموقع السائق من تطبيق الأندرويد.',
  ]},
  { no: '5', icon: '🏭', title: 'الإنتاج والمخزون', items: [
    'سيلوهات مرئية: أسمنت / رمل / زلط / إضافات بنسب الامتلاء وتنبيهات النقص.',
    'تسجيل توريدات الخامات بالفواتير وتنفيذ الدفعات اليدوية وربطها بالطلبات.',
    'إنتاج البلوك بأنواعه وبخلطاته وخصم آلي من مخزون الخامات.',
    'مقارنة المخزون بالطلبات المؤكدة وكشف النقص قبل وقوعه.',
    '🧪 إدارة كاملة للإضافات الكيماوية: جرعات، مخزون أدنى، موردون وتكلفة.',
  ]},
  { no: '6', icon: '📅', title: 'الجدولة', items: [
    'جدولة يدوية أو تلقائية للصبات على خريطة تفاعلية.',
    'استيراد الطلبات المعتمدة وترتيبها حسب الأولوية والمسافة.',
    'خطط مسارات بزمن ومسافة تقديرية من المحطة للموقع.',
  ]},
  { no: '7', icon: '🔧', title: 'الورشة', items: [
    '11 تبويباً متكاملاً: وقود، زيوت، قطع غيار، أعطال، مخزن، طلبات شراء، محطات، صيانة دورية…',
    'أوامر صيانة واردة مباشرة من بلاغات السائقين (صورة + صوت) بتقييم خطورة.',
    'مؤشر مدة التوقف بالورشة: تنبيه 12 ساعة وخطر 24 ساعة بألوان تحذيرية.',
    'طلب شراء يُرفض آلياً إذا كان المخزن يغطي الحد الآمن.',
    '📍 خريطة مباشرة لمواقع الأسطول (تتفعل تلقائياً مع متتبعات GPS).',
  ]},
  { no: '8', icon: '🎛️', title: 'المختبر والجودة', items: [
    'وصفات الخلط C25–C40 بإدارة كاملة ومعايرة الموازين بشهادات الاعتماد.',
    'مصمم خلطة ذكي يعوّض الحرارة والرطوبة ويحسب النسب والماء.',
    'سجل فحوصات QC: هبوط، كسور 7 و28 يوم، مرتبط بالطلبات والعينات.',
    '🤖 متنبئ AI يتنبأ بمقاومة 28 يوم من نتائج 7 أيام بدرجة ثقة.',
  ]},
  { no: '9', icon: '🛡️', title: 'الحاكمية', items: [
    'كابريز وزن بسلسلة Hash مشفرة (Blockchain-style) ضد التلاعب.',
    'كشف تعارض الأوزان تلقائياً ووسمه بحالة mismatch.',
    'إدارة الخرسانة الراجعة: إعادة تدوير / تحويل بلوك / إتلاف بمؤشرات KPI.',
  ]},
  { no: '10', icon: '💼', title: 'المالية ونظام ERP', items: [
    'تحصيل مدفوعات (شبكة/فيزا/نقد/شيك) مع QR دفع وروابط تحصيل.',
    'إعادة طلب آلي: تغطية طلب الغد + أوامر توريد مقترحة بالنقص.',
    '🤖 توقع الطلب بالذكاء الاصطناعي لـ 7/30 يوم مع الخامات المطلوبة.',
    'دفتر أستاذ، التزامات، مصروفات، موردون — بصلاحيات محاسب فقط.',
    '🔗 مزامنة QuickBooks/Sage + تصدير CSV/QBO (اختياري).',
  ]},
  { no: '11', icon: '🧪', title: 'البحث والتطوير والمصانع المتعددة', items: [
    'مشروعات بحثية وابتكارات وتدريب — محفوظة سحابياً لكل شركة.',
    'مركز قيادة المصانع المتعددة للمالك: عرض موحد مقابل منفصل.',
  ]},
  { no: '12', icon: '⚙️', title: 'لوحة الإدارة والأمان', items: [
    'إدارة المستخدمين والأدوار وصلاحيات الوحدات لكل مستخدم.',
    'خريطة أسطول GPS عامة + داش كام ببث وكشف أحداث ذكي.',
    '🔌 مركز الأجهزة الطرفية: توصيل/فصل أي جهاز والحالة تنعكس فورياً.',
    'الأمان: تشفير كلمات المرور SHA-256، رموز OTP من الخادم، وقواعد بيانات مقفولة.',
  ]},
  { no: '13', icon: '👥', title: 'بورتال العملاء', items: [
    'دخول العميل برقم موبايله برمز تحقق OTP آمن من الخادم.',
    'متابعة الطلبات بشريط تقدم + 📍 تتبع الشاحنة المباشر مع وقت الوصول المتوقع.',
    'الفواتير وحالة السداد وإجمالي غير المدفوع.',
    '🏷️ يظهر للعميل باسم ولوجو مصنع هو (White-label تلقائي).',
  ]},
  { no: '14', icon: '📱', title: 'تطبيق الأندرويد', items: [
    'شاشات مخصصة: سائق، مندوب، مختبر، مشغل، ورشة، مدير تشغيل، مدير مناديب، مالك.',
    'رحلات السائق بخطوات موثقة وتوقيع العميل وتحميل الشيكارة.',
    'تزامن كامل مع الموقع نفسه — نفس البيانات لحظياً + وضع عدم الاتصال.',
    'التحميل: concrete.fimtosoft.com/downloads/fimto-android.apk',
  ]},
];

function el(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as HTMLDivElement;
}

const PAGE_W = 794, PAGE_H = 1123; // A4 @96dpi

function headerBar(sectionNo: string, title: string, icon: string) {
  return `
    <div style="display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,#0b111e,#0e3a5c);color:#fff;padding:22px 28px;border-radius:16px;">
      <div style="font-size:34px">${icon}</div>
      <div>
        <div style="font-size:12px;color:#7dd3fc;font-weight:700;letter-spacing:1px">القسم ${sectionNo}</div>
        <div style="font-size:26px;font-weight:900">${title}</div>
      </div>
      <div style="margin-inline-start:auto;font-size:11px;color:#94a3b8;font-weight:700">FIMTO CONCRETE ERP</div>
    </div>`;
}

function buildPages(root: HTMLElement) {
  const add = (node: HTMLElement) => root.appendChild(node);

  /* ── الغلاف ── */
  add(el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(160deg,#080c14 0%,#0b111e 55%,#0d2136 100%);color:#fff;box-sizing:border-box;padding:70px 60px;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:6px 14px">FIMTO SOFT</div>
        <div style="font-size:12px;color:#64748b">v3.0 · ${new Date().toLocaleDateString('ar-EG')}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
        <div style="font-size:64px;margin-bottom:18px">🏗️</div>
        <h1 style="font-size:52px;margin:0;font-weight:900;line-height:1.25">دليل استخدام<br/><span style="background:linear-gradient(90deg,#38bdf8,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent">نظام فيمتو للخرسانة</span></h1>
        <p style="color:#94a3b8;font-size:18px;margin-top:20px;line-height:1.9">
          الدليل الشامل لنظام إدارة مصانع الخرسانة الجاهزة والبلوك<br/>
          الويب · تطبيق الأندرويد · بورتال العملاء · الأجهزة الطرفية
        </p>
        <div style="margin-top:36px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          ${['📦 طلبات','🚚 تشغيل','🏭 إنتاج','🎛️ جودة','💼 مالية','🔧 ورشة','📱 موبايل'].map(x =>
            `<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#7dd3fc;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px">${x}</span>`).join('')}
        </div>
      </div>
      <div style="text-align:center;color:#475569;font-size:12px">concrete.fimtosoft.com — Designed by Dr. Ahmad Abdo Alyan</div>
    </div>`));

  /* ── الفهرس ── */
  const tocRows = MANUAL_SECTIONS.map(s => `
    <tr>
      <td style="padding:10px 6px;border-bottom:1px solid ${BORDER};width:52px"><span style="display:inline-flex;width:30px;height:30px;border-radius:8px;background:${INK};color:#fff;align-items:center;justify-content:center;font-weight:800;font-size:13px">${s.no}</span></td>
      <td style="padding:10px 6px;border-bottom:1px solid ${BORDER};font-weight:800;color:${INK};font-size:15px">${s.icon} ${s.title}</td>
      <td style="padding:10px 6px;border-bottom:1px solid ${BORDER};color:#94a3b8;font-size:12px;white-space:nowrap">صفحة ${Number(s.no) + 2}</td>
    </tr>`).join('');
  add(el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;box-sizing:border-box;padding:60px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
      <div style="border-radius:16px;background:${LIGHT};border:1px solid ${BORDER};padding:26px 28px;margin-bottom:26px">
        <div style="font-size:13px;color:${SKY};font-weight:800">CONTENTS</div>
        <div style="font-size:32px;font-weight:900;color:${INK}">📖 فهرس المحتويات</div>
      </div>
      <table style="width:100%;border-collapse:collapse">${tocRows}</table>
      <div style="margin-top:30px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px 20px;color:#0369a1;font-size:13px;line-height:1.9">
        💡 هذا الدليل يغطي النظام بالكامل: كل قسم يعمل مستقلاً، والأجهزة الطرفية (متحكم المحطة، الكاميرات، GPS، المحاسبة) اختيارية ويظهر أثرها تلقائياً عند توصيلها من لوحة الإدارة.
      </div>
    </div>`));

  /* ── صفحة لكل قسم ── */
  MANUAL_SECTIONS.forEach(s => {
    const rows = s.items.map((it, i) => `
      <li style="display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 2px rgba(2,8,23,.04)">
        <span style="flex-shrink:0;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,${SKY},${CYAN});color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:12px">${i + 1}</span>
        <span style="color:${SLATE};font-size:14.5px;line-height:1.9">${it}</span>
      </li>`).join('');
    add(el(`
      <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(180deg,#f8fafc 0%,#fff 30%);box-sizing:border-box;padding:50px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
        ${headerBar(s.no, s.title, s.icon)}
        <ul style="list-style:none;padding:0;margin:24px 0 0">${rows}</ul>
        <div style="position:absolute"></div>
        <div style="margin-top:auto"></div>
      </div>`));
  });

  /* ── الغلاف الخلفي ── */
  add(el(`
    <div style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#080c14,#0d2136);color:#fff;box-sizing:border-box;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
      <div style="font-size:54px;margin-bottom:20px">💪</div>
      <h2 style="font-size:34px;font-weight:900;margin:0">جاهز تبدأ؟</h2>
      <p style="color:#94a3b8;font-size:16px;line-height:2;margin-top:14px">
        افتح النظام الآن ودعّ هذه الصفحة جانباً.<br/>كل زر في النظام بيشرح نفسه، وده الدليل لما تحتاج تفاصيل.
      </p>
      <div style="margin-top:34px;background:rgba(56,189,248,.08);border:1px solid #164e63;border-radius:14px;padding:20px 30px;font-size:14px;color:#7dd3fc;line-height:2.2" dir="ltr">
        🌐 concrete.fimtosoft.com<br/>
        📱 downloads/fimto-android.apk<br/>
        👥 concrete.fimtosoft.com/#/portal
      </div>
      <div style="margin-top:40px;color:#475569;font-size:12px">© Fimto Soft — جميع الحقوق محفوظة</div>
    </div>`));
}

/** يولّد الـPDF ويحمّله — يرجع عدد الصفحات أو يرمي خطأ. */
export async function generateManualPdf(onProgress?: (done: number, total: number) => void): Promise<number> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(holder);
  try {
    buildPages(holder);
    const pages = Array.from(holder.children) as HTMLElement[];
    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const canvas = await html2canvas(pages[i], { scale: 1.6, backgroundColor: null, logging: false, useCORS: true });
      const img = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, PAGE_W, PAGE_H);
    }
    onProgress?.(pages.length, pages.length);
    pdf.save(`Fimto-ERP-Manual-${new Date().toISOString().slice(0, 10)}.pdf`);
    return pages.length;
  } finally {
    holder.remove();
  }
}
