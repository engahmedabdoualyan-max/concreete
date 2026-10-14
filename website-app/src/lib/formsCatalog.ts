/**
 * Forms library catalog (مكتبة النماذج) — MT-OP-01 … MT-CM-28.
 * Each entry declares its fields; the Forms page renders fill + print +
 * edit + delete + attach generically from this file. `link` entries reuse
 * the transactional screens instead of duplicating them.
 */
export type FieldType = "text" | "date" | "number" | "textarea" | "select" | "check";

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  preset?: string;
}

export interface FormTable {
  key: string;
  title: string;
  columns: string[];
  /** fixed rows (checklists/comparisons) — cells editable, rows not added */
  fixed?: string[][];
  addLabel?: string;
}

export interface FormDef {
  code: string;
  dept: string;
  title: string;
  link?: string;
  staticBody?: string[];
  fields?: FormField[];
  tables?: FormTable[];
  sigs?: string[];
  autofill?: "ops" | "production" | "finance" | "workshop" | "fuel";
}

export const FORMS: FormDef[] = [
  {
    code: "MT-OP-01", dept: "التشغيل", title: "التقرير اليومي — التشغيل",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "shift", label: "الوردية", type: "select", options: ["صباحية", "مسائية"] },
      { key: "supervisor", label: "مدير الوردية", type: "text" },
      { key: "present", label: "العمالة الحاضرة", type: "number" },
      { key: "absent", label: "الغائبة", type: "number" },
      { key: "stops", label: "التوقفات", type: "textarea" },
      { key: "notes", label: "ملاحظات مدير التشغيل", type: "textarea" },
    ],
    tables: [
      { key: "fleet", title: "حالة المعدات والمركبات (المعدة / السائق / الحالة / الساعات / ملاحظات)", columns: ["المعدة / السيارة", "السائق / المشغل", "الحالة", "ساعات التشغيل", "ملاحظات"] },
      { key: "orders", title: "سير العمل والطلبات", columns: ["رقم الطلب / العميل", "الموقع", "الكمية المطلوبة", "المنفذ", "المتبقي"] },
    ],
    sigs: ["مدير التشغيل"], autofill: "ops",
  },
  {
    code: "MT-PR-02", dept: "الإنتاج", title: "التقرير اليومي — الإنتاج",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "shift", label: "الوردية", type: "select", options: ["صباحية", "مسائية"] },
      { key: "supervisor", label: "مشرف الإنتاج", type: "text" },
      { key: "mix", label: "الخلطة المعتمدة / رقمها", type: "text" },
      { key: "notes", label: "ملاحظات مشرف الإنتاج", type: "textarea" },
    ],
    tables: [
      { key: "concrete", title: "إنتاج الخرسانة (م³)", columns: ["العميل / الموقع", "الرتبة", "الكمية", "عدد السيارات", "رقم الخلطة", "ملاحظات الجودة"] },
      { key: "blocks", title: "إنتاج البلك", columns: ["المقاس", "الكمية المنتجة", "التالف", "الصافي", "ملاحظات"] },
      { key: "materials", title: "استهلاك المواد الخام", columns: ["المادة", "الكمية", "الوحدة", "ملاحظات"] },
    ],
    sigs: ["مشرف الإنتاج"], autofill: "production",
  },
  {
    code: "MT-FN-03", dept: "المالية", title: "التقرير اليومي — المالية",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "preparedBy", label: "معد التقرير", type: "text" },
      { key: "openCash", label: "رصيد الصندوق أول اليوم", type: "number" },
      { key: "bank", label: "رصيد البنك", type: "number" },
      { key: "notes", label: "ملاحظات المحاسب", type: "textarea" },
    ],
    tables: [
      { key: "revenues", title: "الإيرادات", columns: ["العميل", "رقم الفاتورة", "المبلغ", "نقدي/آجل/شيك", "ملاحظات"] },
      { key: "expenses", title: "المصروفات", columns: ["البيان", "المبلغ", "جهة الصرف", "رقم السند", "ملاحظات"] },
    ],
    sigs: ["المحاسب"], autofill: "finance",
  },
  {
    code: "MT-WS-04", dept: "الورشة", title: "التقرير اليومي — الورشة",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "supervisor", label: "مشرف الورشة", type: "text" },
      { key: "techs", label: "عدد الفنيين الحاضرين", type: "number" },
      { key: "outCount", label: "إجمالي خارج الخدمة", type: "number" },
      { key: "needs", label: "احتياجات عاجلة", type: "textarea" },
    ],
    tables: [
      { key: "done", title: "أعمال الصيانة المنفذة", columns: ["المركبة", "النوع", "الوصف", "القطع", "الحالة"] },
      { key: "out", title: "خارج الخدمة", columns: ["المركبة", "العطل", "منذ", "المطلوب", "الموعد"] },
    ],
    sigs: ["مشرف الورشة"], autofill: "workshop",
  },
  { code: "MT-PU-05", dept: "المشتريات", title: "طلب شراء", link: "/procurement" },
  { code: "MT-PO-06", dept: "المشتريات", title: "أمر شراء", link: "/procurement" },
  {
    code: "MT-VI-07", dept: "الورشة", title: "فحص السيارات والمعدات",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "vtype", label: "النوع", type: "select", options: ["خلاطة", "مضخة", "بوم", "قلاب", "لودر"] },
      { key: "vehicle", label: "اللوحة / الرقم الداخلي (اختر من الأسطول)", type: "text" },
      { key: "driver", label: "السائق", type: "text" },
      { key: "odo", label: "العداد / الساعات", type: "number" },
      { key: "result", label: "النتيجة", type: "select", options: ["صالحة للتشغيل", "صالحة بملاحظات", "غير صالحة — للورشة"] },
    ],
    tables: [
      {
        key: "items", title: "بنود الفحص (سليم / يحتاج إصلاح / لا ينطبق)",
        columns: ["البند", "الحالة", "ملاحظات"],
        fixed: [
          ["زيت المحرك وماء الرديتر"], ["الفرامل وبلوفها"], ["الإطارات وضغط الهواء"],
          ["الأنوار والإشارات"], ["البطارية والدينامو"], ["الهيدروليك"],
          ["الخلاطة والحلة"], ["البوم والبستم"], ["المرايا والطفاية"],
          ["النظافة واللوحات"], ["الأوراق (استمارة/تأمين)"],
        ],
      },
    ],
    sigs: ["السائق / المشغل", "فني الفحص", "مشرف الورشة"],
  },
  {
    code: "MT-BR-08", dept: "الورشة", title: "بيان عطل",
    fields: [
      { key: "date", label: "التاريخ / الوقت", type: "text" },
      { key: "vehicle", label: "المركبة ورقمها", type: "text" },
      { key: "driver", label: "السائق", type: "text" },
      { key: "place", label: "مكان العطل", type: "text" },
      { key: "odo", label: "العداد", type: "number" },
      { key: "desc", label: "وصف العطل", type: "textarea" },
      { key: "diag", label: "تشخيص الورشة / القرار", type: "textarea" },
      { key: "eta", label: "الإصلاح المتوقع", type: "text" },
      { key: "tech", label: "الفني المسؤول", type: "text" },
    ],
    tables: [
      { key: "parts", title: "التشخيص والقطع", columns: ["التشخيص", "القطع المطلوبة", "الكمية", "متوفرة؟", "التكلفة"] },
    ],
    sigs: ["المبلغ بالعطل", "مشرف الورشة", "مدير المصنع"],
  },
  {
    code: "MT-MR-09", dept: "الورشة", title: "طلب صيانة",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "dept", label: "القسم الطالب", type: "text" },
      { key: "vehicle", label: "المعدة / المركبة", type: "text" },
      { key: "kind", label: "النوع", type: "select", options: ["وقائية", "علاجية", "فحص"] },
      { key: "priority", label: "الأولوية", type: "select", options: ["عادي (72 ساعة)", "عاجل (24 ساعة)", "حرج — توقف إنتاج"] },
      { key: "desc", label: "وصف الأعمال", type: "textarea" },
      { key: "received", label: "تاريخ الاستلام", type: "text" },
      { key: "doneAt", label: "تاريخ الإنجاز", type: "text" },
      { key: "tech", label: "الفني المنفذ", type: "text" },
      { key: "parts", label: "القطع المستخدمة", type: "text" },
      { key: "after", label: "الحالة بعد الصيانة", type: "text" },
    ],
    sigs: ["إعداد", "مراجعة", "مدير المصنع"],
  },
  {
    code: "MT-RC-10", dept: "المخزن", title: "محضر استلام مواد",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "supplier", label: "المورد", type: "text" },
      { key: "po", label: "رقم أمر الشراء", type: "text" },
      { key: "invoice", label: "فاتورة المورد", type: "text" },
      { key: "truck", label: "النقل / السيارة", type: "text" },
      { key: "verdict", label: "النتيجة", type: "select", options: ["مقبول كاملًا", "مقبول جزئيًا", "مرفوض"] },
      { key: "rejectReason", label: "سبب الرفض", type: "text" },
    ],
    tables: [
      { key: "items", title: "الأصناف المستلمة", columns: ["الصنف", "المطلوبة", "المستلمة", "الفرق", "مطابق؟", "ملاحظات"] },
    ],
    sigs: ["أمين المخزن", "الجودة / الإنتاج", "المشتريات"],
  },
  {
    code: "MT-IS-11", dept: "المخزن", title: "إذن صرف من المخزن",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "no", label: "رقم الإذن", type: "text" },
      { key: "dept", label: "القسم المستلم", type: "text" },
      { key: "receiver", label: "اسم المستلم", type: "text" },
      { key: "ref", label: "طلب الصيانة / العطل المرتبط", type: "text" },
    ],
    tables: [
      { key: "items", title: "الأصناف المنصرفة", columns: ["الصنف", "الكمية", "الوحدة", "المركبة / الغرض", "ملاحظات"] },
    ],
    sigs: ["أمين المخزن", "المستلم", "مشرف الورشة / المدير"],
  },
  {
    code: "MT-OS-12", dept: "الورشة", title: "سجل خارج الخدمة",
    fields: [{ key: "week", label: "الأسبوع", type: "text" }],
    tables: [
      { key: "rows", title: "المركبات خارج الخدمة", columns: ["المركبة / رقمها", "تاريخ الخروج", "السبب", "المطلوب", "الحالة", "الموعد المستهدف"] },
    ],
    sigs: ["مشرف الورشة"],
  },
  {
    code: "MT-RV-13", dept: "وثائق", title: "وثيقة الرؤية",
    staticBody: [
      "في ظل الضغوط المالية والالتزامات وخروج مركبات عن الخدمة، نؤمن أن هذه المرحلة عنق الزجاجة التي تسبق النهوض — والخروج منها بعمل جماعي منظم.",
      "رؤيتنا: خلال عام واحد المصنع الأكثر كفاءة والتزامًا — تشغيل مستقر بلا توقفات مفاجئة، وأسطول بكامل طاقته، وجودة ثابتة، ومالية متوازنة من الديون إلى النمو.",
      "الكفاءة أولًا، الجودة التزام، الشفافية: تقارير يومية صادقة — فلا نهوض بلا أرقام صحيحة.",
    ],
    sigs: ["مدير المصنع"],
  },
  {
    code: "MT-GO-14", dept: "وثائق", title: "وثيقة الأهداف",
    fields: [{ key: "notes", label: "ملاحظات", type: "textarea" }],
    staticBody: [
      "الهدف العام: الخروج من الأزمة خلال أربعة أرباع — استعادة كامل الطاقة، وسداد الالتزامات، ثم التعادل والربحية.",
      "التشغيل: جاهزية الأسطول 90٪ خلال 6 أشهر. الإنتاج: الطاقة المستهدفة يوميًا بنسبة مرفوض ≤ 2٪. الجودة: صفر شكاوى متكررة في الربع الثالث.",
    ],
    sigs: ["مدير المصنع"],
  },
  {
    code: "MT-FM-15", dept: "المالية", title: "خطاب الخطة الربع سنوية",
    fields: [
      { key: "no", label: "رقم الخطاب", type: "text" },
      { key: "date", label: "التاريخ", type: "date" },
      { key: "breakeven", label: "نقطة التعادل (م³/شهر)", type: "text" },
      { key: "targets", label: "كميات البيع المستهدفة", type: "textarea" },
      { key: "debts", label: "بيان الديون وجدول السداد", type: "textarea" },
    ],
    sigs: ["المحاسب", "المدير المالي", "مدير المصنع"],
  },
  {
    code: "MT-DL-16", dept: "المبيعات", title: "بون تسليم خرسانة",
    fields: [
      { key: "no", label: "رقم البون", type: "text" },
      { key: "datetime", label: "التاريخ / وقت الخروج", type: "text" },
      { key: "customer", label: "العميل", type: "text" },
      { key: "site", label: "الموقع", type: "text" },
      { key: "grade", label: "الرتبة", type: "text" },
      { key: "qty", label: "الكمية (م³)", type: "number" },
      { key: "truck", label: "الخلاطة / السائق", type: "text" },
      { key: "arrive", label: "الوصول / بدء / انتهاء الصب", type: "text" },
      { key: "receiver", label: "المستلم", type: "text" },
    ],
    staticBody: ["إقرار الاستلام: استلمت الكمية بحالة جيدة، وأي إضافة ماء بالموقع مسؤوليتي وتُسقط ضمان الرتبة."],
    sigs: ["مشغل المحطة", "السائق", "اعتماد"],
  },
  {
    code: "MT-SO-17", dept: "المبيعات", title: "أمر توريد (طلبية عميل)",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "customer", label: "العميل / المشروع", type: "text" },
      { key: "phone", label: "الجوال", type: "text" },
      { key: "site", label: "الموقع", type: "text" },
      { key: "pay", label: "الدفع", type: "select", options: ["نقدي", "آجل", "دفعة مقدمة"] },
      { key: "due", label: "موعد التوريد", type: "text" },
      { key: "total", label: "الإجمالي", type: "number" },
      { key: "advance", label: "الدفعة المقدمة", type: "number" },
      { key: "rest", label: "المتبقي", type: "number" },
    ],
    tables: [
      { key: "items", title: "البنود", columns: ["المنتج", "الكمية", "الوحدة", "سعر الوحدة", "الإجمالي"] },
    ],
    sigs: ["المبيعات", "المدير المالي", "مدير المصنع"],
  },
  {
    code: "MT-QU-18", dept: "المبيعات", title: "عرض سعر",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "customer", label: "العميل", type: "text" },
      { key: "project", label: "المشروع / الموقع", type: "text" },
      { key: "duration", label: "مدة التوريد", type: "text" },
      { key: "validity", label: "الصلاحية", type: "text", preset: "15 يوم" },
    ],
    tables: [
      { key: "items", title: "البنود", columns: ["البيان", "المواصفة", "الكمية", "سعر الوحدة", "الإجمالي"] },
    ],
    staticBody: ["الشروط: الأسعار لا تشمل الضريبة ما لم يُذكر. الدفع وفق المتفق عليه. أي تغيير بالمواصفات يُعاد تسعيره."],
    sigs: ["المبيعات", "المدير المالي", "مدير المصنع"],
  },
  {
    code: "MT-RV-19", dept: "المالية", title: "سند قبض",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "no", label: "رقم السند", type: "text" },
      { key: "from", label: "استلمنا من", type: "text" },
      { key: "amount", label: "المبلغ رقمًا", type: "number" },
      { key: "words", label: "كتابة", type: "text" },
      { key: "method", label: "الطريقة", type: "select", options: ["نقدي", "شيك", "تحويل"] },
      { key: "ref", label: "عن (فاتورة/دفعة/تسوية)", type: "text" },
    ],
    sigs: ["المستلم", "أمين الصندوق", "المدير المالي"],
  },
  {
    code: "MT-PV-20", dept: "المالية", title: "سند صرف",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "no", label: "رقم السند", type: "text" },
      { key: "to", label: "يُصرف إلى", type: "text" },
      { key: "amount", label: "المبلغ رقمًا", type: "number" },
      { key: "words", label: "كتابة", type: "text" },
      { key: "method", label: "الطريقة", type: "select", options: ["نقدي", "شيك", "تحويل"] },
      { key: "for", label: "وذلك عن", type: "select", options: ["رواتب", "مورد", "وقود", "صيانة", "أخرى"] },
    ],
    staticBody: ["لا يُصرف أي مبلغ دون توقيعين."],
    sigs: ["المستلم", "أمين الصندوق", "المدير المالي", "مدير المصنع"],
  },
  {
    code: "MT-AR-21", dept: "المالية", title: "سجل الذمم والتحصيل",
    fields: [{ key: "week", label: "الأسبوع", type: "text" }],
    tables: [
      { key: "rows", title: "الذمم", columns: ["العميل", "الفاتورة", "المبلغ", "الاستحقاق", "العمر", "المُحصّل", "المتبقي", "الإجراء"] },
    ],
    sigs: ["المحاسب"],
  },
  {
    code: "MT-FU-22", dept: "التشغيل", title: "سجل استهلاك الوقود اليومي",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "station", label: "المحطة / المورد", type: "text" },
      { key: "price", label: "سعر اللتر", type: "number" },
    ],
    tables: [
      { key: "rows", title: "التعبئات", columns: ["المركبة", "السائق", "العداد", "اللترات", "المبلغ", "التوقيع"] },
    ],
    sigs: ["مسؤول الوقود", "مشرف التشغيل", "اعتماد"],
  },
  {
    code: "MT-QC-23", dept: "الجودة", title: "ضبط الجودة — الهبوط والمكعبات",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "customer", label: "العميل / الموقع", type: "text" },
      { key: "grade", label: "الرتبة", type: "text" },
      { key: "mix", label: "رقم الخلطة", type: "text" },
      { key: "weather", label: "الحرارة / الطقس", type: "text" },
      { key: "decision", label: "قرار الجودة", type: "textarea" },
    ],
    tables: [
      { key: "slump", title: "الهبوط", columns: ["الاختبار", "الخلاطة", "المقاس", "المسموح", "مقبول؟", "الإجراء"] },
      { key: "cubes", title: "المكعبات", columns: ["العينة", "الصب", "التكسير", "النتيجة", "مطابق؟", "ملاحظات"] },
    ],
    sigs: ["فني الجودة", "مشرف الإنتاج", "اعتماد"],
  },
  {
    code: "MT-ST-24", dept: "المخزن", title: "محضر الجرد الشهري",
    fields: [
      { key: "date", label: "تاريخ الجرد", type: "date" },
      { key: "store", label: "المخزن", type: "select", options: ["قطع غيار", "مواد خام", "بلك"] },
      { key: "committee", label: "لجنة الجرد", type: "text" },
      { key: "verdict", label: "النتيجة", type: "select", options: ["مطابق", "فروقات مبررة", "فروقات للتحقيق"] },
    ],
    tables: [
      { key: "rows", title: "الأصناف", columns: ["الصنف", "الدفتري", "الفعلي", "العجز/الزيادة", "ملاحظات"] },
    ],
    sigs: ["اللجنة", "أمين المخزن", "مدير المصنع"],
  },
  {
    code: "MT-MT-25", dept: "الإدارة", title: "محضر الاجتماع الأسبوعي",
    fields: [
      { key: "date", label: "التاريخ / الوقت", type: "text" },
      { key: "place", label: "المكان", type: "text" },
      { key: "chair", label: "الرئيس", type: "text" },
      { key: "present", label: "الحاضرون", type: "textarea" },
      { key: "absent", label: "الغائبون", type: "textarea" },
    ],
    tables: [
      { key: "prev", title: "قرارات الأسبوع الماضي", columns: ["القرار", "المسؤول", "تم؟", "سبب عدم التنفيذ"] },
      { key: "kpi", title: "المؤشرات", columns: ["المؤشر", "المستهدف", "الفعلي", "الانحراف", "التصحيح"] },
      { key: "decisions", title: "القرارات الجديدة", columns: ["القرار", "المسؤول", "الموعد", "ملاحظات"] },
    ],
    sigs: ["معد المحضر", "مدير المصنع"],
  },
  {
    code: "MT-VN-26", dept: "المشتريات", title: "مقارنة عروض الأسعار",
    fields: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "subject", label: "موضوع التوريد", type: "text" },
      { key: "pr", label: "طلب الشراء", type: "text" },
      { key: "winner", label: "الترسية على", type: "text" },
      { key: "why", label: "السبب", type: "text" },
    ],
    tables: [
      {
        key: "rows", title: "المقارنة", columns: ["البند", "المورد 1", "المورد 2", "المورد 3", "ملاحظات"],
        fixed: [["الصنف 1"], ["الصنف 2"], ["الصنف 3"], ["الصنف 4"], ["مدة التوريد"], ["شروط الدفع"], ["التقييم العام"]],
      },
    ],
    sigs: ["المشتريات", "المدير المالي", "مدير المصنع"],
  },
  {
    code: "MT-WR-27", dept: "الإدارة", title: "إنذار إداري",
    fields: [
      { key: "no", label: "رقم الإنذار", type: "text" },
      { key: "date", label: "التاريخ", type: "date" },
      { key: "emp", label: "الموظف / المدير", type: "text" },
      { key: "dept", label: "القسم", type: "text" },
      { key: "title", label: "المسمى", type: "text" },
      { key: "degree", label: "الدرجة", type: "select", options: ["تنبيه كتابي", "إنذار أول", "إنذار ثانٍ", "إنذار نهائي"] },
      { key: "reason", label: "السبب", type: "select", options: ["عدم تقديم التقرير اليومي", "تكرار التأخير (3+)", "بيانات غير صحيحة", "عدم تنفيذ قرارات الاجتماع", "الإهمال في الفحص/التبليغ"] },
      { key: "signed", label: "توقيع الموظف", type: "text" },
      { key: "witness", label: "الشاهد (عند الرفض)", type: "text" },
    ],
    sigs: ["مصدر الإنذار", "الشؤون الإدارية", "مدير المصنع"],
  },
  {
    code: "MT-CM-28", dept: "الإدارة", title: "متابعة التزام التقارير",
    fields: [
      { key: "month", label: "الشهر", type: "text" },
      { key: "by", label: "معد السجل", type: "text" },
    ],
    tables: [
      {
        key: "weeks", title: "الأسابيع (✓ بالموعد / م متأخر / غ غائب)",
        columns: ["الأسبوع", "تشغيل", "إنتاج", "مالية", "ورشة", "الالتزام"],
        fixed: [["الأسبوع 1 (1-7)"], ["الأسبوع 2 (8-14)"], ["الأسبوع 3 (15-21)"], ["الأسبوع 4 (22-28)"], ["الأسبوع 5 (29-31)"]],
      },
      {
        key: "depts", title: "ملخص الأقسام",
        columns: ["القسم", "المطلوب", "بالموعد", "المتأخر", "الغائب", "النسبة", "الإنذارات"],
        fixed: [["التشغيل"], ["الإنتاج"], ["المالية"], ["الورشة"]],
      },
    ],
    sigs: ["المتابع الإداري", "مدير المصنع"],
  },
];

export const DEPTS = [...new Set(FORMS.map((f) => f.dept))];
