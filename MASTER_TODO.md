# 📋 MASTER TODO — كل المهام المتبقية (لا تتوقف)

> خارطة الطريق الاستراتيجية: `COMPETITIVE_ROADMAP.md` · خطة R&D: `RND_PMP_PLAN.md` · خطة الأمن والإنتاج: `SECURITY_AND_PRODUCTION_TODO.md`
> قاعدة العمل لكل بند: سكيما + migration + خدمة + API + موبايل/ويب + ترجمة EN/AR/UR + فحص + توثيق

## ✅ المنجز (لا يعاد)

- [x] وحدة R&D كاملة (10 شاشات + باك إند + RBAC + دور R&D MANAGER)
- [x] المصانع المنافسة (سكيما + API + شاشة مقارنة)
- [x] ملحمة 1: إشعارات العميل التلقائية (4 مزودين + ربط checkpoints)
- [x] ملحمة 2: بوابة العميل (روابط سحرية + صفحة `#/track/:token` + مشاركة واتساب)

---

## ✅ ملحمة 3 — التوقيع الإلكتروني والتذكرة اللاورقية (تم تسليمها)

### باك إند
- [x] سكيما: `trips.signature_image/signed_by/signed_at` + migration `0004`
- [x] خدمة `saveTripSignature` في `dispatch.service.ts` (تحقق صيغة/حجم + منع الملغي + audit)
- [x] `POST /api/dispatch/[tripId]/signature` (تحقق حجم/صيغة + ملكية السائق)
- [x] إدراج التوقيع في حمولة البوابة العامة (إثبات للعميل) + `hasSignature` في رحلة السائق

### موبايل
- [x] إضافة `react-native-signature-canvas` + `react-native-webview` للاعتمادات
- [x] مكون `SignaturePad` + شاشة `app/(driver)/sign.tsx`
- [x] إظهار طلب التوقيع بعد DEP_SITE (انتهاء الصب) وقبل إغلاق الرحلة
- [x] مفاتيح `driver.sign.*` (EN/AR/UR)

### ويب
- [x] عرض التوقيع في صفحة التتبع العامة (شارة ✍️ + الصورة + الاسم والوقت)

### تحقق
- [x] فحص صياغي + تطابق i18n (283 مفتاح × 3 لغات) + تحديث المستندات

---

## ✅ ملحمة 4 — التحسين الذكي للتوزيع (تم تسليمها)

- [x] محرك `dispatch-optimization.service.ts`: تعيين جشع + ترتيب nearest-neighbour + Haversine (بدون اعتمادات أصلية، وواجهة تسمح بمحول OR-Tools لاحقاً)
- [x] `POST /api/dispatch/optimize` (معاينة) + `POST /api/dispatch/optimize/apply` (تنفيذ عبر createTrip)
- [x] ETA تنبؤي `predictEtaMinutes`: متوسط تاريخي لنفس الموقع (≥3 عينات) وإلا مسافة/سرعة + تعديل حي بعد الانطلاق
- [x] `GET /api/dispatch/eta/[tripId]` + ربط التنبؤ بالإشعارات وبوابة العميل (شارة ⏱️)
- [x] **المصدر:** Linkoper · BCMI AI · BatchLogic ML

## ✅ ملحمة 5 — تيليمترية البرميل IoT (تم تسليمها)

- [x] جدولا `telematics_devices` + `telematics_readings` + migration `0005`
- [x] خدمة `telematics.service.ts`: استقبال مُتحقق + سجل رحلة + عدّاد صلاحية (FRESH/AGING/EXPIRED) + كشف توقفات التقليب
- [x] `POST /api/v1/telematics/ingest` (مفتاح تكامل + حد معدل + تجميع مستأجرين) + `GET /api/dispatch/[tripId]/telemetry`
- [x] بانر صلاحية حي للسائق أثناء النقل + لقطة QA في بوابة العميل (RPM/حرارة/صلاحية)
- [x] **المصدر:** InfoRMC · Coretex · BatchLogic

## ✅ ملحمة 6 — التكامل المحاسبي الخارجي (تم تسليمها)

- [x] سكيما: `integration_connections` (بيانات مشفرة) + `integration_sync_logs` + migration `0006`
- [x] إطار موصلات: Zoho Books + QuickBooks Online + CSV Bridge (SAP/Oracle) + تشفير AES-256-GCM
- [x] خدمة `accounting-sync.service.ts`: دفع عميل/فاتورة (فاتورة تدفع العميل أولاً تلقائياً) + تصدير CSV
- [x] 7 API routes: connections + test + push-customer + push-invoice + logs + export
- [x] صفحة ويب `/integrations`: إدارة + اختبار + دفع + تنزيل CSV + سجل تدقيق
- [x] **المصدر:** Sysdyne QuickLink · D4A

## ✅ ملحمة 7 — تعميق ZATCA Phase 2 (تم تسليمها)

- [x] سكيما: `zatca_documents` (سلسلة hash + عدّاد) + migration `0007` + إعداد المكلف في `tenants.settings`
- [x] خدمة `zatca.service.ts`: UBL 2.1 + TLV QR + SHA-256 + عميل Fatoora (clearance/reporting) + وضع PENDING بدون شهادات
- [x] 4 API routes: config + issue + documents + status
- [x] صفحة ويب `/zatca`: إعداد + إصدار + سجل + نسب القبول
- [x] **المصدر:** iCeipts · ERPGulf — إلزامي KSA

## ✅ ملحمة 8 — عروض الأسعار بهامش مُلزِم + العمولات (تم تسليمها)

- [x] سكيما: `rfqs` + `rfq_items` (تكاليف + هامش + سعر أدنى) + `commission_schemes` + `sales_commissions` + migration `0008`
- [x] صلاحية `RFQ_APPROVE` لمدير المصنع
- [x] خدمة `rfq.service.ts`: تقدير خامات تلقائي من تكاليف الصوامع + بوابة الهامش + تحويل لطلبات PENDING_FINANCE + عمولات
- [x] 9 API routes: rfq + items + convert + schemes + commissions + status
- [x] صفحة ويب `/quoting`: عروض + تكاليف + اعتماد + تحويل + مخططات + معاينة واعتماد عمولات
- [x] **المصدر:** D4A · MAS eMAS

## ✅ ملحمة 9 — الرواتب الخليجية (تم تسليمها)

- [x] سكيما: `payroll_employees` (مسار GOSI صريح) + `payroll_runs` + `payroll_lines` + migration `0009`
- [x] صلاحيتا `HR_READ`/`HR_WRITE` (مدير مصنع + محاسب + مالية)
- [x] خدمة `payroll.service.ts`: محرك GOSI الدقيق (نظامان + سقف 45k + أساسي+سكن فقط) + مسيرات + مدد CSV + قسائم
- [x] 7 API routes: موظفون + مسيرات + اعتماد/دفع + تصدير + قسيمة
- [x] صفحة ويب `/payroll`: موظفون + مسيرات + تفاصيل + مدد + جدول الحسابات
- [x] **المصدر:** AKST · iCeipts

## ✅ ملحمة 10 — تكامل PLC المباشر (تم تسليمها)

- [x] عميل Modbus-TCP حقيقي (FC03/FC16) + إطار موصلات (Modbus/HTTP/Simulator) + خرائط ريجستر
- [x] سكيما: `batch_controllers` + migration `0010` + خدمة (تعقيم الأسرار + لقطات حية)
- [x] 5 API routes: registry + test + live status + ticket weights
- [x] صفحة ويب `/batch-control`: تسجيل + فحص + قراءة حية + أوزان التذكرة
- [x] v1 للقراءة فقط عمداً (التشغيل عن بُعد يحتاج commissioning لكل مصنع)

## ✅ ملحمة 11 — مواد متعددة + استدامة + SSO (تم تسليمها)

- [x] سكيما: `product_type` (طلبات + خلطات) + `carbon_factors` + لقطة كربون + migration `0011`
- [x] خدمة `sustainability.service.ts`: عوامل افتراضية + بصمة طلب + ملخص مستأجر
- [x] 3 API routes: factors/order/summary + صفحة `/sustainability`
- [x] خدمة `sso.service.ts`: OIDC كامل (discovery + PKCE + JWKS + جلسة ERP) بدون اعتمادات جديدة
- [x] 4 API routes: login/callback/providers + صفحة `/sso`

## ✅ ملحمة 12 — التواصل مع HR + الحضور باللوكيشن (تم تسليمها)
- [x] سكيما: `hr_requests` + `hr_broadcasts` + reads + `hr_zones` + `hr_attendance` + migrations `0012/0013`
- [x] خدمة دفع Expo Push + تسجيل التوكن + ping عند الجديد والمراجعة والبث
- [x] 13 API routes: requests/mine/review/cancel + broadcasts/read + push/register + zones + ping/attendance/today/driver-trips
- [x] موبايل: مجموعة `(hr)` (وارد + إعلان + تقارير) + زر HrFab عائم صغير في كل الشاشات + HeaderActions (بروفايل + خروج) في كل عنوان
- [x] ping تلقائي: سائق كل 5 دقائق + مندوب عند الفتح + أول دخول=حضور وآخر خروج=انصراف
- [x] ويب: تبويب حضور في `/payroll` (زونات + تقرير + إضافي السائقين) + دور `hr` في الشجرة
- [x] ترجمات hr.* + attendance (311 مفتاح × 3 لغات)

## ✅ ملحمة 13 — توحيد مساري البيانات (تم تسليمها)

- [x] وثيقة `DATA_UNIFICATION.md`: مصفوفة ملكية + قواعد + تدفقات
- [x] سكيما: `orders.source_ref` + migration `0014`
- [x] خدمة `tree-sync.service.ts`: استيراد (مطابقات + إنشاء معلن + بوابة مالية) + مرآة best-effort
- [x] 3 API routes: استيراد مفتاح + حلّ المرجع + مرآة يدوية + خطافات (إنشاء/مالية/توزيع)
- [x] موبايل: مشاركة التتبع تحاول الرابط السحري أولاً ثم رسالة
- [x] `firebase-admin` في الاعتمادات (اختياري التشغيل)

---

## 🔁 بعد كل ملحمة (تعريف الإنجاز)

- [ ] فحص صياغي نظيف (ملفات جديدة فقط)
- [ ] تطابق مفاتيح i18n (EN/AR/UR) بسكريبت
- [ ] تحديث `COMPETITIVE_ROADMAP.md` + `IMPLEMENTATION_PLAN.md`
- [ ] أوامر التشغيل (migrate + env) موثقة
