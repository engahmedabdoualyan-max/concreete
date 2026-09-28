/**
 * دليل الاستخدام الرسمي الموسّع — كل خاصية لها اسم وشرح تحت بعض.
 * يُبنى كـ PDF عربي (غلاف + فهرس بأرقام صفحات حقيقية + أقسام موزعة آلياً).
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

type Feature = { n: string; d: string };
type Section = { no: string; icon: string; title: string; features: Feature[] };

const S = (no: string, icon: string, title: string, features: [string, string][]): Section => ({
  no, icon, title,
  features: features.map(([n, d]) => ({ n, d })),
});

export const MANUAL_SECTIONS: Section[] = [
  S('1', '🏗️', 'ما هو نظام فيمتو للخرسانة؟', [
    ['نظام متكامل واحد', 'منصة واحدة تدير مصنع الخرسانة الجاهزة والبلوك: طلبات، تشغيل، إنتاج، جودة، ورشة، مالية — على الويب والتطبيق وبورتال العملاء بنفس البيانات لحظياً.'],
    ['يعمل من المتصفح مباشرة', 'لا يحتاج تثبيت ولا سيرفر داخلي؛ افتح concrete.fimtosoft.com من أي جهاز وسجّل دخولك.'],
    ['صلاحيات دقيقة لكل دور', 'أكثر من 16 دوراً (مالك، مدير، محاسب، مشغل، مختبر، ورشة، سائق، مندوب…) ولكل مستخدم صلاحيات وحدات محددة يراها فقط.'],
    ['فلسفة الأجهزة الطرفية', 'النظام يعمل كاملاً بدون أي أجهزة؛ المتحكم والكاميرات ومتتبعات GPS والمحاسبة إضافات اختيارية توصل من لوحة الإدارة وتتفعل تلقائياً.'],
    ['بياناتك محمية', 'كلمات مرور مشفّرة <bdi>SHA-256</bdi>، رموز دخول للعملاء من الخادم، وقواعد بيانات مقفولة بحيث لا يقرأ بياناتك إلا تطبيقك.'],
  ]),
  S('2', '🚀', 'البداية السريعة', [
    ['إنشاء حساب شركة', 'من شاشة الدخول اختر «تسجيل جديد» وأدخل: اسم المستخدم، كلمة المرور، الدولة والمدينة، اسم المحطة، الهاتف والبريد — ثم فعّل الحساب بكود يصلك على بريدك.'],
    ['تسجيل الدخول', 'ادخل باسم المستخدم وكلمة المرور؛ تُحفظ جلستك بشكل آمن (بدون كلمة المرور) حتى آخر زيارة على نفس الجهاز.'],
    ['الدخول كضيف', 'زر «دخول ضيف» لتجربة النظام بسرعة بصلاحيات محدودة دون حساب.'],
    ['تغيير اللغة', 'زر اللغة أعلى كل صفحة يبدّل الواجهة بين العربية والإنجليزية فوراً.'],
    ['القفز السريع', 'زر «Quick Jump» أعلى كل صفحة ينقلك لأي وحدة مسموح لدورك بضغطة واحدة.'],
    ['شريط المؤشرات بعد الدخول', 'أسفل الهيدر يظهر ملخص فوري: طلبات نشطة، مكتملة اليوم، إجمالي الشحنات واسم محطتك.'],
  ]),
  S('3', '📦', 'الطلبات', [
    ['طلب جديد — الحقول كاملة', 'العميل (اختيار محفوظ أو جديد)، المشروع وموقعه، نوع الطلب (خرسانة/بلوك)، نوع الخلطة، الهبوط، الكمية، المندوب وبريد العميل للإشعارات.'],
    ['مدير العملاء', 'سجل عملاء كامل مع كود واتفاقية سعر وحالة ائتمان؛ يمكن تجميد عميل مدين فيمنع جدولة طلباته حتى فك التجميد.'],
    ['فلتر الحالة', 'أعلى القائمة: الكل / انتظار / مجدول / مكتمل — لتصفية الطلبات فوراً.'],
    ['اعتماد الحسابات', 'المحاسب يعتمد أو يرفض؛ يُسجَّل اسم المعتمِد وطابع زمني من الخادم ضد التلاعب.'],
    ['الجدولة الآمنة', 'بعد الاعتماد يظهر زر «جدولة»؛ يُمنع تلقائياً إذا كان العميل مجمَّداً ائتمانياً.'],
    ['إتمام الطلب', 'زر «تم» يحوّل الطلب لمكتمل ويفتح خصائص ما بعد التسليم.'],
    ['الفاتورة الإلكترونية 🧾', 'لكل طلب مكتمل: فاتورة احترافية برقم وتاريخ وأصناف يمكن طباعتها أو حفظها PDF.'],
    ['⭐ التقييم اليومي', 'قيّم كل صبة: المحطة، السيارة، العمالة (نجوم 1–5) + ملاحظات؛ الإجمالي من 15 يظهر على الزر ويغذي تقارير الأداء.'],
    ['إشعارات تلقائية للعميل', 'عند كل تغيير حالة يُرسل بريد إلكتروني، وزر واتساب برسالة جاهزة تعرض على الموظف لإرسالها بلمسة.'],
    ['حماية من التلاعب', 'أوقات الإنشاء والاعتماد والتعديل تُختم من خادم Firestore نفسه ولا يمكن للمستخدم تزويرها.'],
  ]),
  S('4', '🚚', 'منظومة التشغيل والرحلات', [
    ['إضافة رحلة', 'نموذج كامل: التاريخ، الخلاطة، السائق، المشروع، الكمية، الخلطة، وموقع الصبة بإحداثيات GPS.'],
    ['استيراد الطلبات المجدولة', 'زر واحد يحوّل طلبات اليوم المجدولة إلى رحلات جاهزة للتشغيل.'],
    ['أوقات المراحل الخمس', 'انطلاق المحطة، وصول الموقع، بداية ونهاية الصب، العودة — ويُحسب زمن الدورة آلياً بالمقارنة بينهما.'],
    ['GPS وحساب المسافات', 'عند إدخال إحداثيات الموقع يُحسب البعد عن المحطة (Haversine) ويظهر ضمن بيانات الرحلة.'],
    ['توثيق أسباب التأخير', 'قائمة أسباب جاهزة (جاهزية الموقع، عطل، طوارئ…) مع ملاحظات حرة.'],
    ['متابعة المضخة', 'أوقات مغادرة ووصول المضخة وبداية الصب، واحتساب الكميات المتتالية لنفس الموقع في نفس اليوم.'],
    ['مستند التوريد الرقمي 🧾', 'لكل رحلة مستند توريد رقمي (Digital Challan) برقم وQR للتحقق، يفتح للعرض والطباعة بتنسيق مطبعي رسمي.'],
    ['✍️ توقيع المستلم', 'لوحة توقيع على التابلت داخل المستند — العميل يمسح بإصبعه ويُحفظ التوقيع مع المستند.'],
    ['💧 سجل إضافة المياه', 'توثيق أي ماء يُضاف أثناء النقل: الكمية بالليتر، الوقت، والسبب — ويظهر في المستند المطبوع.'],
    ['📡 البث المباشر للسائق', 'مع تطبيق الأندرويد يبثّ السائق موقعه لحظياً ليظهر في خريطة العمليات.'],
    ['سجل الرحلات والتقارير', 'فلترة بتاريخ من/إلى، عرض تفصيلي، وتصدير Excel وطباعة رسمية.'],
  ]),
  S('5', '🏭', 'الإنتاج والمخزون', [
    ['السيلوهات المرئية', 'أربع خزانات (أسمنت، رمل، زلط، إضافات) بمؤشر امتلاء متحرك ونسبة مئوية وتنبيه عند انخفاض أي صومعة عن 25%.'],
    ['تسجيل توريد خامات', 'أضف كميات واردة بالنوع والفاتورة — يُحدَّث المخزون فوراً ويظهر في سجل التوريدات.'],
    ['تنفيذ دفعة يدوية', 'اختر الوصفة والحجم واربطها بطلب (اختياري)؛ يُخصم الخام آلياً ويُحدَّث المُسلَّم من الطلب وعند الاكتمال يُغلق تلقائياً.'],
    ['🧱 إنتاج البلوك', 'اختر صنف البلوك والكمية؛ يُخصم الأسمنت والرمل بمعدلات خلطة الصنف ويضاف للمخزون الجاهز.'],
    ['🧪 الإضافات الكيماوية', 'إدارة كاملة: إضافة/تعديل/حذف مضاف مع جرعته لكل متر، مخزونه وحدّه الأدنى (يتلون أحمر)، ويتم حفظ المورد والتكلفة سحابياً.'],
    ['📊 المخزون مقابل الطلبات', 'مقارنة فورية بين المتاح والمطلوب للطلبات المؤكدة: نقص بالأحمر أو «كل الخامات كافية» بالأخضر.'],
    ['سجل المطابقة', 'جداول آخر التوريدات والدفعات وإنتاج البلوك مع فلترة تاريخ.'],
    ['تصدير وطباعة', 'زر Excel يصدّر دفعات الإنتاج CSV، وزر طباعة لتقرير جاهز.'],
  ]),
  S('6', '🕒', 'الجدولة', [
    ['وضع يدوي أو تلقائي', 'بدّل بين ترتيب الصبات يدوياً أو ترك النظام يقترح التوزيع.'],
    ['استيراد من الطلبات', 'اسحب الطلبات المعتمدة إلى الجدول بترتيب أولويتها.'],
    ['الخريطة التفاعلية', 'مواقع الصبات على خريطة Leaflet مع بحث بالعنوان وتحديد يدوي.'],
    ['خطط المسارات', 'مسافة وزمن تقديري من المحطة لكل موقع لترتيب الرحلات بذكاء.'],
  ]),
  S('7', '🔧', 'الورشة', [
    ['الرئيسية — بلاغات السائقين', 'أوامر صيانة واردة من تطبيق السائق (صورة + صوت + خطورة CRITICAL/HIGH/MEDIUM/LOW) تتحول لأعمال ورشة.'],
    ['مؤشر مدة التوقف', 'كل عطل مفتوح يُحسب له عمر بالورشة: تنبيه أصفر بعد 12 ساعة وأحمر نابض بعد 24 ساعة مع عدّاد بلوكات.'],
    ['سجل الوقود', 'تعبئة لكل مركبة: لترات، وسعر، وعدّاد، ومحطة، وفاتورة — وتغذي تكاليف المركبة والتقارير.'],
    ['الزيوت والسوائل', 'تغييرات الزيوت بالنوع والعلامة والكمية وعداد التغيير القادم.'],
    ['قطع الغيار', 'استهلاك القطع بالرقم والمورد والضمان والتكلفة لكل مركبة.'],
    ['الأعطال', 'سجل كامل: مَن بلّغ، العرض، الخطورة، الميكانيكي المسؤول، بداية/نهاية الإصلاح، الوصف والقطع والتكلفة — مع تعديل وحذف.'],
    ['المخزن', 'أصناف بحد أدنى وحد أمان؛ أي صنف تحت الحد يتوهّج بتنبيه فوري.'],
    ['طلبات الشراء', 'طلب ذكي يُرفض آلياً إذا كان المخزن يغطي الحد الآمن، مع دورة اعتماد وأولويات.'],
    ['تقرير مركبة', 'اختر لوحة ومدى تاريخ: كل رحلاتها وصيانتها وتكاليفها في تقرير واحد.'],
    ['محطات الخلط', 'سجل المحطات (خرسانة/بلوك/مختلط) بالمشغل والسعة التصميمية والفعلية والحالة.'],
    ['الصيانة الدورية', 'مهام مجدولة (سيور، تشحيم، تنظيف حلة كهرباء…) بتاريخ الاستحقاق القادم وحالة Done/Scheduled/Overdue.'],
    ['📍 خريطة الأسطول', 'داخل الورشة نفسها: مواقع المركبات ذات المتتبعات — تظهر تلقائياً عند توصيل GPS من مركز الأجهزة.'],
    ['الإعدادات والتقارير', 'ميزانية الصيانة، وتقارير الوقود والأعطال للفترة.'],
  ]),
  S('8', '🎛️', 'المختبر والجودة', [
    ['وصفات الخلط', 'إنشاء وتعديل الوصفات C25–C40 بمكوناتها لكل متر مكعب — وهي التي تظهر في قائمة التنفيذ بالإنتاج.'],
    ['معايرة الموازين', 'توثيق كل معايرة بتاريخها وجهة الاعتماد ورفع ملف شهادة PDF للحفظ والمراجعة.'],
    ['مصمم الخلطة الذكي', 'أدخل الهدف والهبوط وظروف الجو (حرارة/رطوبة) فيحسب النسب وماء الخلط المعوَّض — ثم «حفظ كوصفة» بضغطة.'],
    ['سجل فحوصات QC', 'لكل عينة: هبوط، كسر 7 و28 يوم، رقم البلطة، وربط تلقائي بطلب العميل وكود عينة فريد.'],
    ['فلترة النتائج', 'فلترة بتاريخ ومن/إلى وبالشاحنة لمتابعة أداء أي خلاطة.'],
    ['🤖 متنبئ المقاومة AI', 'من نتائج 7 أيام يتنبأ بمقاومة 28 يوم مع درجة ثقة وهاغير خطأ — يساعدك تعديل الخلطة قبل فوات الأوان.'],
  ]),
  S('9', '🛡️', 'الحاكمية', [
    ['قبّان الوزن (ميزان البسكول) بسلسلة Hash', 'كل كشف وزن يُبصم ببصمة <bdi>SHA-256</bdi> مرتبطة بسابقه — أي تعديل لاحق يكسر السلسلة ويكشف نفسه (Blockchain-style).'],
    ['مصدر القراءة', 'يدوي أو آلي من الجهاز عند توصيل الكابريز الطرفي من مركز الأجهزة.'],
    ['كشف التعارض', 'مقارنة الوزن بالمطلوب: مطابق ✅ / تعارض ⚠️ مُعلَّم للمراجعة / معلق.'],
    ['الخرسانة الراجعة', 'توثيق المرتجعات وتصريفها: إعادة تدوير / تحويل لبلوك (بحساب عدد البلوك من الحجم) / إتلاف.'],
    ['مؤشرات الهدر', 'KPIs فورية: نسبة المُدوَّر والمُحوَّل والمهدر من إجمالي المرتجع.'],
  ]),
  S('10', '💼', 'المالية ونظام ERP', [
    ['تسجيل تحصيلة', 'دفعة للعميل بالطريقة (شبكة/فيزا/نقد/شيك) وحالة السداد (مدفوعة/جزئية/معلقة) وملاحظات.'],
    ['🔗 QR للدفع', 'توليد رمز QR ورابط دفع للفاتورة يُرسل للعميل، مع تأكيد استلام البوابة.'],
    ['📦 إعادة الطلب الآلي', 'تحسب تغطية طلب الغد من المخزون + أوامر الشراء المفتوحة، وتقترح أوامر توريد بالنقص وتعلّمها مسلَّمة عند وصولها.'],
    ['🤖 توقع الطلب AI', 'تحليل 90 يوماً (متوسط مرجح + موسمية أيام الأسبوع + اتجاه) لتوقع 7 أو 30 يوم، مع الخامات المطلوبة وأعلى يوم طلب ودقة التوقع.'],
    ['ERP — نظرة مالية', 'ملخص مالي شامل بصلاحيات المحاسب/المالك: أرصدة وحركة وأداء.'],
    ['ERP — دفتر الأستاذ', 'حركة حساب أي عميل: فواتير وتحصيلات ورصيد جارٍ.'],
    ['ERP — الالتزامات والمصروفات', 'متابعة الالتزامات المستحقة وتسجيل المصروفات التشغيلية ببنودها.'],
    ['ERP — الموردون', 'سجل الموردين وأرصدتهم وأوامر الشراء عليهم.'],
    ['🔗 ربط المحاسبة (اختياري)', 'منصة QuickBooks وSage: اختر أنواع البيانات (فواتير/مدفوعات/أوامر/مصروفات) وزامن يدوياً أو بتردد تلقائي، وصدّر CSV أو ملف QBO جاهز للاستيراد.'],
  ]),
  S('11', '🧪', 'البحث والتطوير والمصانع المتعددة', [
    ['مشروعات البحث', 'مشروعات بتصنيف (خرسانة/استدامة/أتمتة/مواد) وميزانية وفريق ومدة ونتائج — محفوظة سحابياً.'],
    ['سجل الابتكارات', 'أفكار بتتبع الحالة: فكرة → تطوير → منفذة، مع تقدير الأثر (عالي/متوسط/منخفض).'],
    ['إدارة التدريب', 'دورات بفئة (فني/سلامة/جودة/إدارة) وجمهور مستهدف ومدة وحالة.'],
    ['🏢 مركز المصانع المتعددة', 'للمالك فقط: لوحة موحدة لكل المحطات مع تبديل عرض التكاليف (موحد / منفصل لكل مصنع).'],
  ]),
  S('12', '📊', 'التقييم والأداء', [
    ['OEE الفعالية الكلية', 'مؤشر مركب (التوفر × الأداء × الجودة) لأداء المحطة.'],
    ['مؤشرات المحطات', 'لكل محطة خلط: السعة التصميمية مقابل الفعلية ونسبة الاستغلال.'],
    ['تحليل الرحلات', 'أداء التسليم والزمن الدورة والتأخيرات مأخوذة من بيانات التشغيل الفعلية.'],
    ['تكامل مع التقييم اليومي', 'نجوم العملاء ⭐ من صفحة الطلبات تتغذى هنا لمتابعة رضا العملاء.'],
  ]),
  S('13', '⚙️', 'لوحة الإدارة', [
    ['نظرة عامة', 'ملخص المحطة: عدد المستخدمين والمصانع ومؤشرات رئيسية.'],
    ['بيانات المصنع', 'ملف المحطة الكامل بتبويبات فرعية: بيانات، أسطول، مخزون، إعدادات، متتبعات GPS — مع شعار المحطة.'],
    ['المستخدمون والأدوار', 'إدارة كل المستخدمين: تعيين دور من 16 دوراً، وتفعيل/تعطيل وصول كل وحدة لكل مستخدم.'],
    ['الأقسام', 'تجمعات حية من قواعد كل شركة (رحلات/جودة/طلبات/مدفوعات…).'],
    ['🗺️ خريطة الأسطول', 'خريطة عامة لمواقع جميع المركبات ذات المتتبعات.'],
    ['📹 الداش كام', 'قائمة كاميرات الشاحنات وحالتها: بث مباشر بمحاكاة طريق، جودة <bdi>1080p/720p/480p</bdi>، تسجيل حلقي، كشف أحداث AI (فرملة/انحراف)، وحفظ وتحميل المقاطع.'],
    ['🔌 مركز الأجهزة الطرفية', 'قلب فلسفة «الأجهزة اختيارية»: خمسة أجهزة (متحكم، كاميرات، محاسبة، GPS، كابريز) بزر توصيل/فصل لكل منها؛ الحالة تنعكس فوراً داخل كل شاشة بشارة «متصل بالجهاز / يعمل بدون جهاز».'],
  ]),
  S('14', '👥', 'بورتال العملاء', [
    ['دخول آمن بـ OTP', 'العميل يدخل رقم موبايله أو رقم فاتورة؛ يصله رمز من الخادم (صالح 5 دقائق، 5 محاولات كحد أقصى، وحماية إرسال متكرر).'],
    ['متابعة الطلبات', 'كل طلب بشريط تقدم (انتظار → اعتماد → جدولة → تنفيذ → تسليم) وتفاصيل موسّعة بضغطة.'],
    ['📍 التتبع المباشر', 'أثناء التنفيذ: خريطة بموقع الشاحنة ووقت وصول متوقع يتحدث كل 15 ثانية وخط المسار من المحطة.'],
    ['الفواتير', 'حالة كل فاتورة (مدفوعة / جزئية / غير مدفوعة) وعرض إجمالي المستحق.'],
    ['🏷️ هوية مصنعك (White-label)', 'يظهر للعميل اسم ولوجو المصنع الذي يخدمه تلقائياً في رأس البورتال.'],
    ['بحث سريع', 'بحث بالرقم أو المشروع أو نوع الخرسانة داخل طلباته وفواتيره.'],
  ]),
  S('15', '📱', 'تطبيق الأندرويد', [
    ['شاشة السائق', 'رحلاتي بخطوات موثقة (انطلاق/وصول/صب/عودة)، مستند توريد رقمي بتوقيع العميل، وبث الموقع، وبلاغ عطل بصورة وصوت.'],
    ['شاشة المندوب', 'عملاؤه وطلباته ومتابعة تنفيذها.'],
    ['شاشة المختبر والمشغل', 'تسجيل فحوصات ومتابعة الدفعات من الجوال.'],
    ['شاشات الإدارة الميدانية', 'مدير تشغيل، مدير ورشة، ومدير مناديب (تتبع خط سير المناديب وإسناد المهام).'],
    ['مراقبة المالك', 'نظرة مختصرة على مؤشرات المحطة من أي مكان.'],
    ['عمل بدون إنترنت', 'وضع Offline يخزّن العمليات ويزامنها تلقائياً عند رجوع الشبكة.'],
    ['التحميل والتحديث', 'concrete.fimtosoft.comhttps://fimto-downloads.vercel.app/downloads/fimto-android.apk — ثبّته واسمح بالتثبيت من مصادر غير معروفة.'],
  ]),
  S('16', '🔌', 'الأجهزة الطرفية (اختيارية)', [
    ['🏭 متحكم المحطة', 'عند التوصيل (<bdi>Command Alkon/Liebherr/Sicom/Simmons</bdi> عبر <bdi>OPC-UA/Modbus/REST/MQTT</bdi>): بث مباشر للدفعات وأوزان الخام، استيراد الوصفات والإنتاج والمعايرة، وخريطة ربط الأكواد.'],
    ['📹 نظام الكاميرات', 'عند التوصيل: مشاهدة بث الشاحنات وحفظ مقاطع — قبل التوصيل تعمل الواجهة بوضع معاينة واضح.'],
    ['🔗 البرنامج المحاسبي', 'عند الاتصال بـ <bdi>QuickBooks/Sage</bdi>: مزامنة فورية بدل التصدير اليدوي — وبدونه <bdi>CSV/QBO</bdi> متاح دائماً.'],
    ['📡 متتبعات GPS', 'عند توصيلها وتحديد الإحداثيات للأصول: خرائط الورشة والأسطول والتتبع المباشر للعملاء تتفعل تلقائياً.'],
    ['⚖️ كابريز الوزن', 'عند الربط: قراءة آلية لكشوف البسكول بدل الإدخال اليدوي — واليدوي يبقى متاحاً دائماً.'],
    ['قاعدة ذهبية', 'فصل أي جهاز في أي وقت لا يوقف شيئاً — كل الشاشات تعمل وتتحول للوضع اليدوي بسلاسة.'],
  ]),
  S('17', '🔐', 'الأمان والخصوصية', [
    ['قاعدة بيانات مقفولة', 'لا قراءة ولا كتابة بدون توكن من تطبيقك — تم إغلاق الوصول المباشر بالكامل.'],
    ['تشفير كلمات المرور', '<bdi>SHA-256</bdi> بمواصفة موحدة على الويب والخادم والتطبيق؛ أي كلمة قديمة تترقّى تلقائياً عند أول دخول.'],
    ['رموز OTP من الخادم', 'رموز العملاء والكونسول تولد وتتحقق في الخادم (صلاحية 5 دقائق، حد محاولات).'],
    ['كونسول بدون أسرار', 'بيانات دخول لوحة التحكم لا توجد في كود الموقع إطلاقاً — تحقق خادمي بالكامل مع كود تحقق ثانٍ.'],
    ['جلسات نظيفة', 'لا تُخزَّن كلمات المرور في متصفح المستخدم نهائياً.'],
  ]),
];

function el(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as HTMLDivElement;
}

const PAGE_W = 794, PAGE_H = 1123;

/* ─────────── رسومات ورسوم بيانية SVG ─────────── */
function visualFor(no: string): string {
  const cap = (t: string) => `<div style="font-size:11px;color:#64748b;font-weight:800;margin-bottom:6px">${t}</div>`;
  if (no === '3') {
    const steps = [['📝','طلب'],['💰','اعتماد'],['🕒','جدولة'],['🚚','تنفيذ'],['✅','تسليم']];
    return `<div style="margin-top:18px">${cap('دورة حياة الطلب')}
      <div style="display:flex;gap:4px">
      ${steps.map(([ic,t],i)=>`<div style="flex:1;text-align:center">
        <div style="background:${INK};border-radius:12px;color:#fff;padding:11px 4px"><div style="font-size:19px">${ic}</div><div style="font-size:11px;font-weight:800;margin-top:3px">${t}</div></div>
        ${i<steps.length-1?'<div style="color:#94a3b8;font-size:15px;line-height:1.1">←</div>':'<div style="height:17px"></div>'}
      </div>`).join('')}</div></div>`;
  }
  if (no === '5') {
    const rows = [['أسمنت',85,'#38bdf8'],['رمل',62,'#fbbf24'],['زلط',74,'#94a3b8'],['إضافات',41,'#22d3ee']];
    return `<div style="margin-top:18px">${cap('مثال حي: مستوى السيلوهات (%)')}
      <div style="background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:12px 14px">
      ${rows.map(([n,v,c])=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="width:54px;font-size:11px;font-weight:800;color:${INK}">${n}</span>
        <div style="flex:1;height:14px;background:${LIGHT};border-radius:999px;overflow:hidden"><div style="width:${v}%;height:100%;background:${c};border-radius:999px"></div></div>
        <bdi><span style="width:36px;font-size:11px;font-weight:900;color:${INK}">${v}%</span></bdi>
      </div>`).join('')}</div></div>`;
  }
  if (no === '7') {
    const pts = '10,86 60,72 110,80 160,52 210,60 260,34 330,44';
    const dots = pts.split(' ').map(pt=>{const[x,y]=pt.split(',');return `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="#0ea5e9" stroke-width="2"/>`}).join('');
    return `<div style="margin-top:18px">${cap('مثال: تكاليف الصيانة الشهرية — اتجاه تنازلي بعد المتابعة')}
      <svg viewBox="0 0 340 100" preserveAspectRatio="none" style="width:100%;height:106px;background:#fff;border:1px solid ${BORDER};border-radius:12px">
        <defs><linearGradient id="g7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8" stop-opacity=".45"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></linearGradient></defs>
        <polygon points="${pts} 330,100 10,100" fill="url(#g7)"/>
        <polyline points="${pts}" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round"/>
        ${dots}
      </svg></div>`;
  }
  if (no === '8') {
    // منحنى المقاومة: كسور فعلية حتى 7 أيام ثم تنبؤ AI بمنطقة ثقة
    return `<div style="margin-top:18px">${cap('منحنى المقاومة: قياس فعلي + تنبؤ AI لـ 28 يوم')}
      <svg viewBox="0 0 340 110" preserveAspectRatio="none" style="width:100%;height:112px;background:#fff;border:1px solid ${BORDER};border-radius:12px">
        <rect x="150" y="18" width="180" height="52" rx="8" fill="#22c55e" opacity=".12"/>
        <polyline points="20,92 85,74 150,58" fill="none" stroke="#0284c7" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="150" y1="58" x2="320" y2="30" stroke="#16a34a" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round"/>
        <circle cx="20" cy="92" r="4" fill="#fff" stroke="#0284c7" stroke-width="2.5"/>
        <circle cx="85" cy="74" r="4" fill="#fff" stroke="#0284c7" stroke-width="2.5"/>
        <circle cx="150" cy="58" r="5" fill="#0284c7"/>
        <circle cx="320" cy="30" r="5.5" fill="#16a34a"/>
        <text x="24" y="106" font-size="10" fill="#64748b" font-weight="700">3 أيام</text>
        <text x="88" y="66" font-size="10" fill="#64748b" font-weight="700">7 أيام</text>
        <text x="196" y="16" font-size="11" fill="#15803d" font-weight="800">تنبؤ 28 يوم ≈ 42 MPa</text>
      </svg></div>`;
  }
  if (no === '10') {
    const bars: Array<[number, string]> = [[62,'سبت'],[78,'أحد'],[55,'اثنين'],[92,'ثلاثاء'],[70,'أربعاء'],[84,'خميس']];
    const bw = 34, gap = 14, base = 92, x0 = 18;
    return `<div style="margin-top:18px">${cap('توقع الطلب الأسبوعي (م³/يوم) — أعلى يوم: ثلاثاء')}
      <svg viewBox="0 0 340 110" preserveAspectRatio="none" style="width:100%;height:112px;background:#fff;border:1px solid ${BORDER};border-radius:12px">
        ${bars.map(([v,l],i)=>`<rect x="${x0+i*(bw+gap)}" y="${base-v*0.82}" width="${bw}" height="${v*0.82}" rx="6" fill="${v===92?'#16a34a':'#0ea5e9'}" opacity="${v===92?1:.85}"/>
        <text x="${x0+i*(bw+gap)+bw/2}" y="${base-v*0.82-6}" font-size="10.5" font-weight="800" fill="${INK}" text-anchor="middle"><tspan>${Math.round(v*1.6)}</tspan></text>
        <text x="${x0+i*(bw+gap)+bw/2}" y="${base+16}" font-size="10" fill="#64748b" font-weight="700" text-anchor="middle">${l}</text>`).join('')}
        <line x1="10" y1="${base}" x2="330" y2="${base}" stroke="#cbd5e1" stroke-width="2"/>
      </svg></div>`;
  }
  if (no === '12') {
    // عداد OEE نصف دائري 78%
    const R = 70, CX = 170, CY = 96, CIRC = Math.PI * R;
    return `<div style="margin-top:18px">${cap('مثال: مؤشر OEE الكلي للمحطة')}
      <div style="display:flex;gap:14px;align-items:center;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:12px 16px">
        <svg viewBox="0 0 340 120" style="width:220px;height:78px">
          <path d="M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}" fill="none" stroke="${LIGHT}" stroke-width="16" stroke-linecap="round"/>
          <path d="M ${CX-R} ${CY} A ${R} ${R} 0 0 1 ${CX+R} ${CY}" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(CIRC*0.78).toFixed(1)} ${CIRC.toFixed(1)}"/>
          <text x="${CX}" y="${CY-14}" font-size="26" font-weight="900" fill="${INK}" text-anchor="middle"><tspan>78%</tspan></text>
        </svg>
        <div style="font-size:11px;color:${SLATE};line-height:2;font-weight:600">
          التوفر <bdi>92%</bdi> × الأداء <bdi>89%</bdi> × الجودة <bdi>95%</bdi><br/>
          <span style="color:#16a34a;font-weight:800">ممتاز — فوق مستوى الهدف 75%</span>
        </div>
      </div></div>`;
  }
  if (no === '13') {
    const devs = [['🏭','متحكم'],['📹','كاميرات'],['🔗','محاسبة'],['📡','GPS'],['⚖️','بسكول']];
    return `<div style="margin-top:18px;border:2px dashed #164e63;border-radius:14px;padding:13px;text-align:center">
      <div style="font-size:11.5px;color:#7dd3fc;font-weight:800;margin-bottom:9px">مركز الأجهزة الطرفية — توصيل اختياري، والنظام يعمل بدونه</div>
      <div style="display:flex;gap:6px;justify-content:center">${devs.map(([ic,t])=>`
        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;min-width:68px">
          <div style="font-size:18px">${ic}</div><div style="font-size:10.5px;font-weight:800;color:${INK}">${t}</div>
          <div style="font-size:9px;color:#16a34a;font-weight:700">اختياري</div>
        </div>`).join('')}</div>
    </div>`;
  }
  if (no === '15') {
    const roles = [['🚚','سائق'],['💼','مندوب'],['🧪','مختبر'],['🎛️','مشغل'],['🔧','ورشة'],['📊','مالك']];
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px">
      ${roles.map(([ic,t])=>`<div style="background:${INK};color:#fff;border-radius:10px;padding:10px;text-align:center"><div style="font-size:18px">${ic}</div><div style="font-size:11px;font-weight:800;margin-top:3px">${t}</div></div>`).join('')}
    </div>`;
  }
  if (no === '4') {
    const stages = [['🏭','انطلاق'],['📍','وصول'],['🚧','صب'],['↩️','عودة'],['⏱️','الدورة']];
    return `<div style="margin-top:18px">${cap('خط زمني للرحلة — كل مرحلة موثقة بوقتها')}
      <div style="background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:14px 10px;display:flex;align-items:center;justify-content:space-between;position:relative">
        <div style="position:absolute;top:50%;right:24px;left:24px;height:3px;background:${BORDER}"></div>
        ${stages.map(([ic,t])=>`<div style="text-align:center;position:relative;z-index:1">
          <div style="width:38px;height:38px;border-radius:999px;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;margin:0 auto;border:3px solid #fff;box-shadow:0 0 0 2px ${BORDER}">${ic}</div>
          <div style="font-size:10.5px;font-weight:800;color:${INK};margin-top:5px">${t}</div>
        </div>`).join('')}
      </div></div>`;
  }
  if (no === '9') {
    const blocks = [['#', 'a91f…c4'],['#1','7be2…09f'],['#2','d04a…77e'],['#3','e9c3…b12']];
    return `<div style="margin-top:18px">${cap('سلسلة البصمات: أي تعديل يكسر السلسلة ويكشف نفسه')}
      <div style="display:flex;gap:6px;align-items:center">
        ${blocks.map(([n,h],i)=>`${i>0?'<div style="font-size:15px;color:#64748b">🔗</div>':''}
        <div style="flex:1;background:#fff;border:1.5px solid ${i===3?'#22c55e':BORDER};border-radius:11px;padding:9px 8px;text-align:center">
          <div style="font-size:15px;font-weight:900;color:${INK}" dir="ltr"><bdi>${n}</bdi></div>
          <div dir="ltr" style="font-size:9.5px;color:#64748b;margin-top:2px"><bdi>${h}</bdi></div>
        </div>`).join('')}
        <div style="font-size:15px;color:#16a34a;font-weight:900">✓</div>
      </div></div>`;
  }
  if (no === '14') {
    return `<div style="margin-top:18px;display:flex;gap:12px;align-items:center">
      <div style="width:150px;background:${INK};border-radius:20px;padding:10px 8px;box-shadow:0 8px 20px rgba(2,8,23,.25)">
        <div style="background:#fff;border-radius:13px;padding:10px 9px">
          <div style="display:flex;gap:4px"><span style="flex:1;height:7px;background:${LIGHT};border-radius:99px"></span><span style="width:26px;height:7px;background:#38bdf8;border-radius:99px"></span></div>
          <div style="height:8px;background:${LIGHT};border-radius:99px;margin-top:8px"></div>
          <div style="margin-top:10px;font-size:9px;color:#0369a1;font-weight:800">طلب ORD-1024</div>
          <div style="margin-top:5px;display:flex;gap:3px">${[1,2,3,4].map(i=>`<span style="flex:1;height:6px;border-radius:99px;background:${i<=3?'#38bdf8':'#e2e8f0'}"></span>`).join('')}</div>
          <div style="margin-top:9px;background:#dcfce7;color:#15803d;font-weight:800;font-size:9px;border-radius:8px;padding:5px;text-align:center" dir="ltr"><bdi>ETA 18 min</bdi></div>
        </div>
      </div>
      <div style="flex:1;font-size:12.5px;color:${SLATE};line-height:1.95">
        هكذا يتابع عميلك طلبه على هاتفه:<br/>
        شريط تقدم حي + موقع الشاحنة + وقت الوصول المتوقع —<br/>
        <strong style="color:${INK}">قبل أن يرفع الهاتف ليسأل: «أين الشاحنة؟»</strong>
      </div>
    </div>`;
  }

  return '';
}

function headerBar(sec: Section, cont: boolean) {
  const label = cont ? `القسم <bdi>${sec.no}</bdi> ــ تابع` : `القسم <bdi>${sec.no}</bdi>`;
  return `
    <div lang="ar" style="display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,#0b111e,#0e3a5c);color:#fff;padding:20px 28px;border-radius:16px;">
      <div style="font-size:32px">${sec.icon}</div>
      <div>
        <div style="font-size:12px;color:#7dd3fc;font-weight:800">${label}</div>
        <div style="font-size:24px;font-weight:900;line-height:1.5">${sec.title}</div>
      </div>
      <div style="margin-inline-start:auto;font-size:11px;color:#94a3b8;font-weight:700" dir="ltr"><bdi>FIMTO CONCRETE ERP</bdi></div>
    </div>`;
}

function featureEl(f: Feature, idx: number): HTMLElement {
  return el(`
    <li style="list-style:none;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:13px 16px;margin-bottom:10px;box-shadow:0 1px 2px rgba(2,8,23,.04)">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <span style="flex-shrink:0;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,${SKY},${CYAN});color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:12px">${idx}</span>
        <strong style="color:${INK};font-size:15px;line-height:1.6">${f.n}</strong>
      </div>
      <p style="margin:7px 4px 0 36px;color:${SLATE};font-size:13.5px;line-height:1.95">${f.d}</p>
    </li>`);
}

/** صفحة محتوى جديدة؛ ترجع عناصر الصفحة ومنطقة المحتوى للقياس الحي. */
function newContentPage(sec: Section, cont: boolean) {
  const page = el(`
    <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(180deg,#f8fafc 0%,#fff 30%);box-sizing:border-box;padding:48px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;overflow:hidden;">
      ${headerBar(sec, cont)}
    </div>`);
  const cnt = el(`<div style="margin-top:20px"></div>`);
  page.appendChild(cnt);
  return { page, cnt };
}

function buildCover(): HTMLElement {
  return el(`
    <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(160deg,#080c14 0%,#0b111e 55%,#0d2136 100%);color:#fff;box-sizing:border-box;padding:70px 60px;display:flex;flex-direction:column;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:6px 14px">FIMTO SOFT</div>
        <div style="font-size:12px;color:#64748b"><bdi>v3.0 · ${new Date().toLocaleDateString('en-GB')}</bdi></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center">
        <img src="${logoUrl}" alt="Fimto" style="width:150px;height:148px;object-fit:contain;margin:0 auto 22px;display:block;border-radius:24px;background:#fff;padding:8px;align-self:center"/>
        <h1 style="font-size:48px;margin:0;font-weight:900;line-height:1.6">دليل الاستخدام الكامل<br/><span style="color:#38bdf8;text-shadow:0 0 26px rgba(56,189,248,.45)">نظام فيمتو للخرسانة</span></h1>
        <p style="color:#94a3b8;font-size:17px;margin-top:18px;line-height:1.9">شرح تفصيلي لكل خاصية ووظيفة في النظام<br/>الويب · تطبيق الأندرويد · بورتال العملاء · الأجهزة الطرفية · الأمان</p>
        <div style="margin-top:28px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          ${['📦 طلبات','🚚 تشغيل','🏭 إنتاج','🔧 ورشة','🎛️ جودة','💼 مالية','👥 عملاء','📱 موبايل'].map(x =>
            `<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#7dd3fc;font-size:13px;font-weight:700;padding:8px 14px;border-radius:10px">${x}</span>`).join('')}
        </div>
      </div>
      <div style="text-align:center;color:#475569;font-size:12px"><bdi>concrete.fimtosoft.com</bdi> — Designed by Dr. Ahmad Abdo Alyan</div>
    </div>`);
}

function buildBack(): HTMLElement {
  return el(`
    <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#080c14,#0d2136);color:#fff;box-sizing:border-box;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
      <div style="font-size:54px;margin-bottom:20px">💪</div>
      <h2 style="font-size:34px;font-weight:900;margin:0">حان وقت القرار</h2>
      <p style="color:#94a3b8;font-size:16px;line-height:2;margin-top:14px">افتح النظام الآن، واحتفظ بهذا الدليل قريباً منك.<br/>كل زرٍّ في النظام يشرح نفسه، وهذا الدليل مرجعك عند الحاجة إلى التفاصيل.</p>
      <div style="margin-top:34px;background:rgba(56,189,248,.08);border:1px solid #164e63;border-radius:14px;padding:20px 30px;font-size:14px;color:#7dd3fc;line-height:2.2" dir="ltr">
        concrete.fimtosoft.com<br/>downloads/fimto-android.apk<br/>concrete.fimtosoft.com/#/portal
      </div>
      <div style="margin-top:40px;color:#475569;font-size:12px">© Fimto Soft — جميع الحقوق محفوظة</div>
    </div>`);
}

/* ═══ صفحات الرسالة البيعية لصاحب المصنع ═══ */
const LETTER_FONT = "'Segoe UI',Tahoma,Arial,sans-serif";

function buildOwnerLetter1(): HTMLElement {
  const pains = [
    ['🧱', 'تبدُّد المواد الخام', 'لا يوجد حساب دقيق: الخام يدخل والمُنتَج أقل منه… فأين ذهب الفارق؟'],
    ['🚚', 'دورات لا تُحتسب', 'هل أنجزت الشاحنة ثماني دورات أم ستّاً؟ الفارق خسارة صافية كل يوم.'],
    ['⛽', 'وقود خارج السجل', 'اللترات المسجلة لا تطابق المسافات المقطوعة — ولا أحد يطرح السؤال.'],
    ['⏰', 'تأخير الصبات', 'عميل منتظر ومقاولون غاضبون — غرامات وسمعة تتراجع.'],
  ];
  return el(`
    <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(165deg,#080c14,#0b111e 60%,#132a44);color:#fff;box-sizing:border-box;padding:56px 58px;font-family:${LETTER_FONT};direction:rtl;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:13px;color:#38bdf8;font-weight:800;border:1px solid #155e75;border-radius:999px;padding:5px 13px">لماذا فيمتو</div>
        <div style="font-size:11px;color:#64748b;margin-inline-start:auto" dir="ltr"><bdi>FIMTO CONCRETE ERP</bdi></div>
      </div>

      <h1 style="font-size:34px;font-weight:900;margin:26px 0 0;line-height:1.5">📩 لماذا فيمتو؟<br/><span style="color:#38bdf8">الفجوة التي لا تظهر في الدفاتر</span></h1>
      <p style="color:#cbd5e1;font-size:16px;line-height:2;margin-top:14px">
        معظم خسائر مصانع الخرسانة ليست في المعدات… بل في <strong style="color:#fff">ما لا تراه الإدارة</strong>.
        الأنظمة التقليدية تخبرك بما حدث أمس؛ <strong style="color:#38bdf8">أما فيمتو فيكشف الهدر لحظة حدوثه، ويبيّن سببه، ويقدّم الحل لغلقه</strong>.
      </p>

      <div style="font-size:13px;font-weight:900;color:#fca5a5;margin:22px 0 10px">🔥 أربع نزيفات بتحدد مصير أرباحك كل شهر:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${pains.map(([ic,t,d])=>`
        <div style="background:#fff;border-radius:14px;padding:14px 16px;border-inline-start:4px solid #ef4444">
          <div style="display:flex;align-items:center;gap:8px"><span style="font-size:19px">${ic}</span><strong style="color:${INK};font-size:14.5px">${t}</strong></div>
          <p style="margin:7px 0 0;color:${SLATE};font-size:12.5px;line-height:1.85">${d}</p>
        </div>`).join('')}
      </div>

      <div style="margin-top:auto;background:linear-gradient(90deg,rgba(56,189,248,.12),rgba(34,211,238,.05));border:1px solid #164e63;border-radius:16px;padding:18px 22px">
        <div style="font-size:15px;font-weight:900;color:#7dd3fc">👁️ تخيَّل أن ترى كل ذلك الآن من هاتفك:</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${['📦 السيلوهات لحظة بلحظة','🚚 كل شاحنة: موقعها ومهمتها الآن','💰 كل جنيه دخل وخرج','⭐ رضا كل عميل بعد كل صبة','🔧 العطل قبل ما يوقف الإنتاج'].map(x=>`<span style="background:rgba(56,189,248,.08);border:1px solid #164e63;color:#bae6fd;font-size:12px;font-weight:700;padding:7px 12px;border-radius:9px">${x}</span>`).join('')}
        </div>
        <div style="color:#94a3b8;font-size:12px;margin-top:11px">ليست مجرد متابعة — <strong style="color:#fff">بل رؤية مباشرة لمصنعك بالأرقام، والحل جاهز أمام كل مشكلة.</strong></div>
      </div>
    </div>`);
}

function buildOwnerLetter2(): HTMLElement {
  const rows = [
    ['الأنظمة التقليدية', 'تؤرشف ما حدث… بعد أن رحلت الخسارة', 'يكشف الانحراف لحظة وقوعه، ويسد سببه'],
    ['برامج المحاسبة', 'أوراق منظمة نهاية الشهر', 'قرارات فورية مبنية على أرقام حيّة: سيلو، ودورة، وتحصيل'],
    ['أنظمة التتبع العالمية', 'تتبع مكلف يخبرك بالموقع فقط', 'GPS + جودة + صيانة + مالية + عملاء… في شاشة واحدة عربية'],
  ];
  const save = [['🧱','هدر الخام','-5↔10%'],['⛽','وقود خارج السجل','-15%'],['🕒','تأخيرات وصبات فاسدة','≈ صفر'],['🔧','عطل مفاجئ','صيانة مجدولة']];
  return el(`
    <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:linear-gradient(200deg,#0d2136,#080c14);color:#fff;box-sizing:border-box;padding:56px 58px;font-family:${LETTER_FONT};direction:rtl;display:flex;flex-direction:column;">
      <h2 style="font-size:30px;font-weight:900;margin:0">⚖️ الفرق بيننا وبين أي برنامج تاني</h2>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px">
        ${rows.map(([a,b,c])=>`
        <div style="display:grid;grid-template-columns:170px 1fr 1.15fr;gap:0;border-radius:14px;overflow:hidden;border:1px solid #1e3a5f">
          <div style="background:#132a44;padding:13px 14px;font-weight:800;font-size:12.5px;color:#93c5fd">${a}</div>
          <div style="background:rgba(255,255,255,.04);padding:13px 14px;font-size:12.5px;color:#f1a8a8;line-height:1.8">${b}</div>
          <div style="background:rgba(34,197,94,.09);padding:13px 14px;font-size:12.5px;color:#bbf7d0;line-height:1.8"><strong style="color:#4ade80">فيمتو:</strong> ${c}</div>
        </div>`).join('')}
      </div>

      <h2 style="font-size:26px;font-weight:900;margin:26px 0 4px">💰 أين ستوفّر؟ أرقام تقديرية من الميدان</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px">
        ${save.map(([ic,t,v])=>`
        <div style="background:#fff;border-radius:14px;padding:13px 10px;text-align:center">
          <div style="font-size:21px">${ic}</div>
          <div style="color:${INK};font-weight:800;font-size:12px;margin-top:5px">${t}</div>
          <div dir="ltr" style="color:#16a34a;font-weight:900;font-size:17px;margin-top:3px"><bdi>${v}</bdi></div>
        </div>`).join('')}
      </div>
      <p style="color:#94a3b8;font-size:12.5px;line-height:1.9;margin-top:10px">* نسب استرجاع نمطية عند الالتزام بالنظام أول ٣ شهور — أكبر توفير حقيقي: <strong style="color:#e2e8f0">قرارات صح في وقتها</strong>.</p>

      <div style="margin-top:auto;text-align:center;background:linear-gradient(135deg,#0369a1,#0e7490);border-radius:18px;padding:20px 24px">
        <div style="font-size:17px;font-weight:900">🎯 القرار بسيط: استمر بالإدارة التقليدية… أو دَع الأرقام تتحدث</div>
        <div style="font-size:13px;color:#cffafe;margin-top:8px">افتح النظام الآن — أول طلب تنشئه سيُريك الفرق بنفسك</div>
        <div dir="ltr" style="font-size:13px;color:#fff;font-weight:800;margin-top:9px"><bdi>concrete.fimtosoft.com</bdi></div>
      </div>
    </div>`);
}

/**
 * التوليد الكامل:
 * 1) يبني صفحات الأقسام بحشو ذكي بالقياس الفعلي (لا "تابع" إلا عند امتلاء الصفحة حقاً)
 * 2) يحسب رقم صفحة بداية كل قسم → يبني الفهرس
 * 3) يجمع: غلاف + فهرس + أقسام + غلاف خلفي، ويرندرها PDF
 */
export async function generateManualPdf(onProgress?: (done: number, total: number) => void): Promise<number> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(holder);

  try {
    /* ── 1) صفحات الأقسام بالقياس الحي ── */
    const contentPages: HTMLElement[] = [];
    const startPage: Record<string, number> = {};
    let pageNo = 5; // 1 غلاف، 2-3 رسالة صاحب المصنع، 4 فهرس

    for (const sec of MANUAL_SECTIONS) {
      startPage[sec.no] = pageNo;
      let first = true;
      let idx = 0;
      let { page, cnt } = newContentPage(sec, false);
      const headerH = () => (page.firstElementChild as HTMLElement).offsetHeight;
      const avail = () => PAGE_H - 48 * 2 - headerH() - 20 - (cnt.children.length === 0 && visualFor(sec.no) ? 0 : 0);

      // الرسمة التوضيحية/البيانية في أول صفحة القسم فقط
      const vis = visualFor(sec.no);
      if (vis) cnt.appendChild(el(vis));

      const flushTo = (arr: HTMLElement[]) => arr.push(page);

      for (const f of sec.features) {
        idx++;
        const li = featureEl(f, idx);
        cnt.appendChild(li);
        if (cnt.scrollHeight > avail()) {
          cnt.removeChild(li);
          flushTo(contentPages);
          pageNo++;
          ({ page, cnt } = newContentPage(sec, true));
          cnt.appendChild(li);
        }
      }
      flushTo(contentPages);
      pageNo++;
      void avail; void first;
    }

    /* ── 2) الفهرس بأرقام حقيقية ── */
    const tocRows = MANUAL_SECTIONS.map(s => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid ${BORDER};width:52px"><span style="display:inline-flex;width:28px;height:28px;border-radius:8px;background:${INK};color:#fff;align-items:center;justify-content:center;font-weight:800;font-size:12px"><bdi>${s.no}</bdi></span></td>
        <td style="padding:8px 6px;border-bottom:1px solid ${BORDER};font-weight:800;color:${INK};font-size:14px">${s.icon} ${s.title}</td>
        <td style="padding:8px 6px;border-bottom:1px solid ${BORDER};color:${SKY};font-size:12.5px;font-weight:700;white-space:nowrap">ص <bdi>${startPage[s.no]}</bdi></td>
      </tr>`).join('');
    const toc = el(`
      <div lang="ar" style="width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;box-sizing:border-box;padding:55px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
        <div style="border-radius:16px;background:${LIGHT};border:1px solid ${BORDER};padding:24px 28px;margin-bottom:22px">
          <div style="font-size:13px;color:${SKY};font-weight:800"><bdi>CONTENTS</bdi></div>
          <div style="font-size:30px;font-weight:900;color:${INK}">📖 فهرس المحتويات</div>
        </div>
        <table style="width:100%;border-collapse:collapse">${tocRows}</table>
        <div style="margin-top:24px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 18px;color:#0369a1;font-size:12.5px;line-height:1.9">
          💡 ${MANUAL_SECTIONS.length} قسماً تغطي أكثر من ${MANUAL_SECTIONS.reduce((a, s) => a + s.features.length, 0)} خاصية ووظيفة — كل خاصية مشروحة باسمها وطريقة استخدامها، مع رسوم توضيحية داخل الأقسام.
        </div>
      </div>`);

    /* ── 3) التجميع ── */
    holder.appendChild(buildCover());
    holder.appendChild(buildOwnerLetter1());
    holder.appendChild(buildOwnerLetter2());
    holder.appendChild(toc);
    contentPages.forEach(p => holder.appendChild(p));
    holder.appendChild(buildBack());

    /* ── 4) الرندر ── */
    const pages = Array.from(holder.children) as HTMLElement[];
    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      let canvas: HTMLCanvasElement;
      try {
        canvas = await toCanvas(pages[i], { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      } catch {
        canvas = await html2canvas(pages[i], { scale: 1.6, backgroundColor: '#ffffff', logging: false, useCORS: true });
      }
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
