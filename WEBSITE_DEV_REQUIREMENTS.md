# خطة توحيد النظام — وثيقة عمل لمبرمج الويب

> هذه الوثيقة تحدد العمل المطلوب على موقع `concrete.fimtosoft.com` بعد فحص كود الموقع
> (repo: `concreete`) واتخاذ قرار التوحيد. ترسل كما هي لمطور الويب.

---

## ✅ حالة التنفيذ (تحديث: 2026-08-11)

| البند | الحالة |
|---|---|
| مسارات إدارة المستخدمين `/api/users` (قائمة/إنشاء/تعديل/تعطيل/إعادة كلمة المرور) | ✅ مكتمل ومختبر |
| مسار تخزين موحّد `website_workspace` — `/api/workspace/:collection` (GET/PUT/DELETE) + `/api/workspace/summary` | ✅ مكتمل ومختبر |
| دخول متعدد المعرفات: هاتف أو بريد أو كود وظيفي `POST /api/auth/login` | ✅ مكتمل ومختبر |
| CORS للزوار (المتصفح) عبر `src/proxy.ts` (كل مسارات `/api`) | ✅ مكتمل ومختبر |
| **ترحيل بيانات الموقع من Firebase** — 35 مجموعة (مستودعات admin + guest) إلى `website_workspace` | ✅ مكتمل (`scripts/migrate-firebase/migrate-workspace.ts`) |
| **ترحيل ERP من Firebase** — tenants/users/orders/trips/clients/vehicles/silos/payments | ✅ مكتمل سابقاً (`scripts/migrate-firebase/migrate.ts`) |
| **الموقع `website-app/`**: استبدال طبقة `firestore.ts` بواجهة `/api/workspace` بنفس التواقيع | ✅ مكتمل |
| **الموقع**: دخول موحّد (بريد/هاتف + كلمة مرور) — `LoginRegister.tsx` + `AuthContext.tsx` | ✅ مكتمل |
| **الموقع**: توجيه حسب الدور `QuickJump.tsx` + قسم المالية الموحّد `ErpFinance.tsx` في صفحة Finance | ✅ مكتمل |
| النشر على Vercel (حساب مالك النظام) | ⏳ بانتظار توكن/تسجيل دخول Vercel |

**ملاحظات الترحيل:**
- كلمات مرور الحسابات المُرحَّلة عشوائية من الترحيل السابق؛ أُعيد تعيين حسابات
  `SUPER_ADMIN` أثناء الاختبار إلى `Admin@2026!` (يُغيَّر لاحقاً). حسابات quota كلمة مرورها `test12345`.
- حسابات الدخول: بريد/هاتف من جدول `users` — الموقع الجديد يدعم الدخول بالبريد أو رقم الهاتف أو الكود الوظيفي.
- النسخة العامل عليها: `website-app/` (نسخة استنساخ آمنة للموقع، بناؤها `vite build` → `dist/index.html`).

---

## 1) الوضع الحالي (تم فحصه)

**الموقع الحالي (`concreete`):**
- React 19 + Vite + Tailwind 4 (تطبيق صفحة واحدة، يُبنى كملف واحد عبر `vite-plugin-singlefile`).
- واجهات كاملة جاهزة: Dashboard، Operations، Workshop، MixingQuality، Production، Evaluation،
  Schedule، Orders، Finance، Governance، MultiPlant، R&D، Admin.
- كل بياناته في **Firebase Firestore** (مشروع `concrete-erb`) — بيانات كل مستخدم (محطة) معزولة في
  `userData/{user}/{collection}/data` (24 مجموعة: trips, orders, customers, inventory,
  payments, workshopConfig, assets, qcRecords, oeeLogs, rawStock, ...).
- دخول خاص به: اسم مستخدم + كلمة مرور من Firestore + تفعيل بريدي بكود (EmailJS).
- يوجد `mobile-api/` (Express على نفس Firestore) موجه لتطبيقات **Flutter** — **غير مربوط** بالتطبيق
  الحالي، سيُهمل.
- المشروعان Supabase الموجودان في كود الموقع مختلفان عن قاعدة بيانات التطبيق.

**التطبيق (الموبايل):**
- React Native / Expo SDK 51 — شاشات السائق والمندوب فقط.
- يخاطب **Next.js API** على `https://concrete.fimtosoft.com/api` الذي يتصل بقاعدة بيانات
  **PostgreSQL (Supabase)** فيها 31 جدولاً (العملاء، الطلبات، الرحلات، البوابات السبعة، الميزان
  بسلسلة هاش، الفواتير، المخزون، أوامر الصيانة، الوقود...) و12 دوراً بوصلاحيات RBAC كاملة.

**النتيجة:** النظامان منفصلان تماماً — المحاسب على الموقع يعتمد طلبات من بيانات الموقع، لا من
طلبات المندوب على الموبايل. **لا يوجد أي كود في الموقع يستدعي `concrete.fimtosoft.com/api`.**

---

## 2) القرار المعتمد

> **الموقع يتصل بنفس الـ API الذي يستخدمه تطبيق الموبايل، ويعملان على نفس قاعدة البيانات
> (PostgreSQL). الموبايل يبقى للسائق والمندوب. الموقع يصبح لوحة التحكم لبقية الأدوار.**
> نقل بيانات Firebase الحقيقية الحالية إلى قاعدة البيانات الجديدة.

لا يتم بناء واجهات جديدة من الصفر — الواجهات موجودة. المطلوب:

1. **استبدال طبقة البيانات** في الموقع (من Firestore إلى الـ API) مع إبقاء الواجهات كما هي.
2. **نقل بيانات Firebase** (بيانات حقيقية) إلى PostgreSQL.
3. **توحيد الدخول** على رقم الهاتف + كلمة المرور مع توجيه الدور.
4. إضافة شاشة إدارة مستخدمين + شاشة إبلاغ أعطال للسائق (على الموبايل).

---

## 3) عقد الـ API (أساس كل العمل)

### 3.1 الدخول
```
POST /api/auth/login
{ "phone": "0500000000", "password": "Admin@2026" }
→ { success, data: { accessToken, refreshToken, expiresAt, user: { id, tenantId,
    employeeCode, fullName, email, role, zone } } }
```
- يقبل `05xxxxxxxx` أو `+9665xxxxxxxx` (تطبيع تلقائي).
- كل الطلبات: `Authorization: Bearer <accessToken>`.
- عند `401` → `POST /api/auth/refresh` بتوكين التحديث؛ عند فشله أعد تسجيل الدخول.
- الاستجابة الموحدة: `{ success, data, message, timestamp }` والأخطاء `{ success, error: { code, message } }`.

### 3.2 الأدوار
`SUPER_ADMIN` (كل الصلاحيات) · `PLANT_MGR` · `ACCOUNTANT` (=`FINANCE`) · `DISPATCHER` ·
`WORKSHOP_MGR` · `WORKSHOP_MECHANIC` · `LAB_TECH` · `LAB_TECHNICIAN` · `BATCH_OPERATOR` ·
`SALES_REP` · `DRIVER`.

**توزيع الشاشات:** الموبايل = `SALES_REP` و `DRIVER`. الموقع = باقي الأدوار.

### 3.3 المسارات المتوفرة (تُستخدم كما هي — لا تُعاد كتابتها)
| الوحدة | المسارات |
|---|---|
| المحاسبة | `GET /api/finance` · `POST /api/finance/approve` · `POST /api/finance/reject` · `POST /api/finance/evaluate-credit` · `POST /api/finance/:orderId/override` |
| الطلبات | `GET/POST /api/orders` · `GET /api/orders/:orderId` |
| التشغيل/الرحلات | `GET/POST /api/dispatch` · `GET /api/dispatch/my-active` · `POST /api/dispatch/:tripId/checkpoint` · `POST /api/dispatch/:tripId/live-location` |
| الورشة | `GET/POST /api/workshop` · `POST /api/workshop/:id/close` · `GET/POST /api/workshop/fuel` · `GET /api/fleet` · `POST /api/fleet` |
| المعمل | `GET/POST /api/quality` · `POST /api/quality/:sampleId/result` · `POST /api/quality/environment-compensation` · `GET /api/mix-designs` |
| الخلاطة | `POST /api/batching/start` · `GET/POST /api/weighbridge` · `GET /api/weighbridge/verify` |
| المخزون | `GET/POST /api/inventory` · `POST /api/inventory/tipper-intake` |
| العملاء | `GET/POST /api/clients` · `GET /api/clients/:clientId/sites` |
| التقارير | `GET /api/reports` |
| الصحة | `GET /api/health` |

> قبل البدء، وثّق المطور بنفسه شكل كل استجابة من هذه المسارات (حقول الحمولة) من الـ API الحي
> وقارنها بنموذج بيانات صفحات الموقع الحالية.

### 3.4 مستودع واجهات الموقع (جديد — يحل محل Firestore)
```
GET/PUT/DELETE /api/workspace/:collection     (مصادق — مربوط بمنطقة المستخدم tenant)
GET /api/workspace/summary                    (SUPER_ADMIN فقط — ملخص كل المحطات)
```
- المجموعات المسموحة: `trips, orders, payments, customers, inventory, deliveries,
  productionRuns, qcRecords, assets, workshopConfig, plantProfile, weighbridgeRecords,
  returnedConcrete, purchaseOrders, rawStock, plants, blockPlants, gpsConfig, gpsHistory,
  livePositions, oeeLogs, recipes, calibrationLogs, notifications`.
- الحمولة: أي JSON (≤ 20MB). يستخدمه الموقع لكامل بيانات الواجهات (بدائل Firestore).

---

## 4) المهام بالتفصيل

### 4.1 توحيد الدخول (أولوية أولى)
- استبدال دخول Firebase (اسم مستخدم/كلمة مرور) بالدخول عبر `POST /api/auth/login`.
- بعد الدخول توجيه المستخدم حسب `user.role` إلى الصفحات المسموح بها فقط (أخفِ صفحات غير المسموحة).
- إزالة التسجيل المفتوح مع التحقق الإلكتروني — المستخدمون يُنشئون من شاشة الإدارة (بند 4.4).

### 4.2 استبدال طبقة البيانات في الموقع
- ملف `src/firebase/firestore.ts` يحتوي دوال الحفظ/التحميل (`saveTrips`, `loadTrips`, `saveOrders`,
  `saveCustomers`, `saveInventory`, `savePayments`, `saveAssets`, `saveQCRecords`, ...).
- **المطلوب:** استبدال تنفيذ هذه الدوال بالاستدعاءات عبر الـ API بنفس التوقيعات، بحيث لا تتغير
  صفحات الواجهة (أو تتغير بأقل تعديل). التعامل مع مساحة التخزين (`storageQuotaMB`) يُلغى.
- ربط خرائط GPS: استبدال مصدر بيانات الخرائط بنقاط `live-location` من الـ API إن كانت في
  النطاق، أو إبقاء Traccar كما هو (قرار منفصل — غير حاسم الآن).

### 4.3 ترحيل البيانات من Firebase إلى PostgreSQL
قواعد Firestore مفتوحة القراءة (rules = true) والوصول بمفاتيح مشروع `concrete-erb` الموجودة في الكود.

| مصدر Firebase (لكل مستخدم/محطة) | الوجهة في PostgreSQL | ملاحظات |
|---|---|---|
| مستخدم الموقع (plantName/معلومات المحطة) | `tenants` + `users` (مدير المحطة) | Tenant لكل محطة من `admin_users` |
| `customers` | `clients` + `delivery_sites` | جهة اتصال/هاتف/موقع إن وُجدت |
| `orders` | `orders` | طابق الحالات: pending→DRAFT/PENDING_FINANCE، accountStatus→حالة الاعتماد |
| `trips` | `trips` | ترحيل سجل تاريخي (بدون سلسلة البوابات — البيانات الجديدة فقط تدخلها) |
| `inventory` + `rawStock` | `inventory_silos` | رصيد أولي |
| `payments` | (جدول مدفوعات جديد يُضاف حسب الحاجة) | إن لم يوجد جدول مناسب يُضاف عمود/جدول |
| `assets` | `fleet_vehicles` | إن كانت بيانات المركبات جاهزة في الموقع |
| `qcRecords` | `lab_test_samples` | سجل تاريخي |
| `workshopConfig`/`assets` | `maintenance_orders` + `fuel_logs` | حسب جاهزية البيانات |
| `oeeLogs`/`productionRuns` | `evaluation`/`production` (جداول تُضاف لاحقاً) | مرحلة لاحقة |

> الترحيل سكربت `node` لمرة واحدة (خارج الموقع). يُعمل على نسخة أولاً ثم على البيانات الحقيقية،
> مع تقرير مطابقة (عدد السجلات المصدر/الوجهة). الأدوار والحقول الجديدة في النظام الجديد
> (حد الائتمان، البوابات، سلسلة الميزان) تبدأ فارغة.

> **مستودعات الموقع (بيانات واجهات الموقع غير الـ ERP):** لكل مستخدم/محطة تُنقل المجموعات
> (`trips, orders, payments, customers, inventory, workshopConfig, plantProfile, assets,
> qcRecords, oeeLogs, gpsHistory, livePositions, notifications, ...`) حرفياً إلى جدول
> `website_workspace (tenant_id, collection, data jsonb)` المرتبط بالـ tenant.
> `scripts/migrate-firebase/migrate-workspace.ts` — منفّذ (35 مجموعة).

### 4.4 شاشة إدارة المستخدمين (SUPER_ADMIN فقط)
- إنشاء مستخدم: الاسم، البريد، **رقم الهاتف**، كلمة المرور، الدور، الكود الوظيفي، المنطقة، تفعيل/تعطيل.
- إعادة تعيين كلمة المرور.
- مسارات API موجودة ومختبرة على الباكند:
  - `GET/POST /api/users` (قائمة بفلترة + إنشاء مستخدم بتحقق من التواريخ وbcrypt)
  - `PATCH/DELETE /api/users/:userId` (تعديل + تعطيل soft-delete)
  - `POST /api/users/:userId/reset-password`
  - صالحة لـ `SUPER_ADMIN`/`PLANT_MGR` الحاليين فقط، مع منع تعطيل الذات.

### 4.5 شاشات الأدوار على الموقع (ربط البيانات الحية)
1. **المحاسب `ACCOUNTANT`**: قائمة الطلبات بانتظار الاعتماد، اعتماد/رفض مع سبب، تقييم الائتمان
   (headroom = limit − outstanding − pending)، تجاوز CREDIT_HOLD بمبرر، تعديل حد ائتمان العميل.
2. **المالك `SUPER_ADMIN` / `PLANT_MGR`**: لوحة ملخص عام + قائمة التقييمات + رؤية كل الأقسام.
3. **الورشة `WORKSHOP_MGR` / `WORKSHOP_MECHANIC`**: قائمة أوامر الصيانة، إنشاء/إغلاق، حالة
   المركبات (CRITICAL تخرج المركبة من التشغيل تلقائياً)، الوقود وشواذه، مخزون قطع الغيار.
4. **التشغيل `DISPATCHER`**: جدولة رحلات (طلب + شاحنة + سائق)، حالة الأسطول الحي.
5. **المعمل `LAB_TECH`**: عينات + نتائج ضغط + تعويض الحرارة + الخلطات.
6. **الخلاطة `BATCH_OPERATOR`**: بدء دفعة ذرّية، تسجيل الميزان، التحقق من السلسلة.

### 4.6 تطبيق الموبايل (يُضاف لاحقاً بمعرفة مالك النظام)
- زر "إبلاغ عن عطل" للسائق (يُنشئ طلب صيانة) — الباكند جاهز لهذه الصلاحية.
- (اختياري) شاشة مبسطة للورشة للمتابعة السريعة.

---

## 5) الأولويات والمراحل

| المرحلة | المحتوى | التقدير |
|---|---|---|
| **0** | نشر الباكند + قاعدة البيانات على `concrete.fimtosoft.com/api` والتحقق من `/api/health` والدخول | يوم |
| **1** | توحيد الدخول + استبدال طبقة البيانات + لوحة المالك + شاشات المحاسب | الأهم |
| **2** | ترحيل البيانات من Firebase إلى PostgreSQL | بالتوازي |
| **3** | الورشة + التشغيل + إدارة المستخدمين (بعد إضافة مساراتها) | |
| **4** | المعمل + الخلاطة + تحديث الصفحة التعريفية (الأدوار والجداول الفعلية) | |
| **5** | (موبايل) زر إبلاغ العطل للسائق | |

---

## 6) ملاحظات فنية

- **الهوية البصرية**: برتقالي `#F97316` + خلفية داكنة — تُحفظ كما هي في الموقع.
- **اللغة**: عربي RTL أساسي + دعم الإنجليزية (أوفردو).
- **لا تُعدل** منطق الباكند (الاعتماد، سلسلة الميزان، البوابات) — يعمل وموجود؛ المرئية فقط هي المطلوبة.
- الباكند له `POST /api/reports` وتقارير `GET /api/reports/share/:id`.
- لا يُستخدم `mobile-api/` ولا Flutter — يمكن إزالتهما من الـ repo.
- مستويات الوصول للواجهات مرجعها `MODULE_ACCESS_MAP` في الباكند (orders→order:read، finance→finance:read، ...).
