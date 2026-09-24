# Fimto Concrete ERP — Competitive Gap Analysis

**تاريخ المراجعة:** 24 سبتمبر 2026  
**النطاق:** Android + Website + Next.js ERP backend + Firestore/SQL data planes  
**المرجع البرمجي:** commit `2787c64` ونتائج الفحص المباشر بتاريخ 24 سبتمبر 2026

> هذا التقرير يفرّق بين **وجود الكود/الواجهة** و**جاهزية production فعلية**. مزايا المنافسين مبنية على صفحات الشركات الرسمية، وهي claims عامة للتسويق وليست اختباراً مستقلاً للأداء أو السعر.

---

## 1. الخلاصة التنفيذية

Fimto يملك اليوم **نطاقاً واسعاً** في الـERP: فروع operations وproduction وquality وdispatch وfinance وHR وR&D وZATCA، وتطبيق Android ميداني، وCustomer Portal، وOTA updates. ويوجد في المستودع حوالي **150 API route و16 migration و60 mobile screen**، وهو أوسع من معظم برامج Concrete المتخصصة في نقطة واحدة.

لكن وضعية المنتج الحالية هي:

- **قوة المنتج:** تغطية كبيرة + توطين عربي قوي + R&D/HR + مرونة في الأدوار والشركات.
- **الضعف الحاسم:** الـERP backend غير منشور على النطاق الحي؛ `/api/*` يرجع `404`.
- **الضعف الثاني:** وجود مصدرين للبيانات (Firestore + PostgreSQL) مع syncebo best-effort، ما قد ينتج اختلافاً بين شاشة وأخرى.
- **الضعف الثالث:** مصادقة شجرة الحسابات تعتمد على Firebase Anonymous Auth ومقارنة hash داخل العميل؛ أي anonymous user قد يقرأ بيانات الشجر.
- **الضعف الرابع:** build/typecheck/test gates ليست خضراء بعد.

### القاعدة التجارية المقترحة

لا ننافس المنافسين الآن على عدد الشاشات. نبدأ بإغلاق **quote → order → finance gate → dispatch → delivery → POD → invoice** في production، ثم نستخدم R&D/HR وOTA والـmultilingual كميزة Fimto الخاصة.

---

## 2. لمحة المقارنة

| المحور | Fimto حاليًا | Command Alkon | Sysdyne | Jonel | BCMI/XBE |
|---|---|---|---|---|---|
| Quote / Order / CRM | RFQ وOrders وcustomer data موجودة؛ API غير متاح حيًا | Sales & Quoting + quote-to-cash | Slabstack/CRM + QuickLink | Sales Insight + billing/ticketing | CRM & Quoting + quote-to-order |
| Dispatch / Scheduling | dispatch service وoptimization/ETA؛ يحتاج إثبات تشغيل حي | Dispatch مركزي real-time | ConcreteGo multi-plant dispatch | Dispatch Scheduling + GPS alerts | BCMI Dispatch + All-22 simulation/optimization |
| Plant / Batching | Modbus/HTTP framework + Simulator؛ القراءة فقط في v1 | COMMANDbatch/Batch/Batch AI | BatchGo remote batching | Archer PLC/remote batching | Inbound materials + production integration عبر XBE |
| Quality / Lab | mixes، tests، calibration، environmental compensation | COMMANDqc + Load Assurance sensor data | QC/mix integrations | QC/ticketing ecosystem | mix/performance analytics + integrations |
| GPS / Fleet | QR + checkpoints + geofence + live location + telematics ingest | TrackIt/Digital Fleet | DeliveryGo/Delivery Sensor | LoadTrack + GPS integrations | Material Now + delivery visibility |
| E-ticket / POD | signature وchallan وQR؛ API غير متاح حيًا | Digital tickets/POD | iStrada/DeliveryGo e-ticketing | Clutch sign-on-glass/e-ticket | eTickets/eSign |
| Customer Portal | magic links وتتبع وpublic route؛ يحتاج API/UX/self-service | طلب/تعديل/إلغاء + ETA + payments | self-service access للتذاكر والطلبات | Jonel 360: invoices, tickets, payments, RBAC | Material Now + Agent XBE |
| Finance / AR | Ledger، finance gate، ZATCA، accounting connectors؛ لم يتحقق production | AR، credit، collections، GL، payments | QuickLink + AR/invoicing | Dynamics/Sage/Viewpoint/QuickBooks | XBE finance + cross-material analytics |
| HR / Payroll | قوي ومختلف: HR، attendance، payroll، GOSI | غير محور أساسي في عروض Ready Mix العامة | تركيز على concrete operations | تركيز على concrete operations | XBE يضيف business-wide workflows |
| R&D / Competitor analysis | feature مميزة: R&D plans/tasks/budget/competitor DB | Command Cloud يركز على batch/QC/AI | InsightGo + operational data | Sales/BI | AI/analytics واسع، وليس R&D Academically |
| Mobile / Offline | Android field app + offline/cache + OTA؛ iOS مؤجل | mobile/cloud + TrackIt apps | mobile + CloudBatch/DeliveryGo | mobile LoadTrack/360 (iOS/Android) | Material Now + mobile/cloud |
| Multi-company / RBAC | شجرة أدوار مرنة وsubscription؛ تحتاج tightening أمني | enterprise roles/SSO/MFA claims | enterprise platform/SSO claims | multi-plant + role-based portal | enterprise roles/AI agents |
| AI / Analytics | ETA + heuristics + optimization؛ ليست autonomous engine | Batch AI + ML/GenAI claims | InsightGo + predictive/BI claims | BI/mobile KPIs | All-22 + Agent XBE + autonomous dispatch claims |
| Security / Operations | JWT/RBAC/audit في backend، لكن غير متاح live؛ Firebase auth broad | public SOC/SSO/MFA claims | public SOC2/SSO claims | audit/SSO/encryption claims on 360 | SOC2 / enterprise platform claims |

**ملاحظة:** “غير متاح حيًا” تعني أن route موجودة في source أو تعمل محليًا، لكنها لا تُعتبر capability إنتاجية حتى ترجع API smoke tests ناجحة على `concrete.fimtosoft.com`.

### قراءة تنافسية سريعة

- **Command Alkon:** أوسع suite native موثق في العرض الحالي، خصوصاً batch/QC/load sensors/fleet/customer portal/back office.
- **Sysdyne:** أقوى قصة cloud-native متكاملة، مع ConcreteGo + BatchGo + DeliveryGo + InsightGo + QuickLink/AR.
- **Jonel:** أقوى دليل public على plant automation وPLC integration، إضافة إلى accounting/QC integrations وJonel 360.
- **BCMI/XBE:** يركز على simulation-driven/autonomous dispatch وagentic AI وتجربة العميل، مع نقاط قوة XBE في materials والـcross-material workflows.
- **Fimto:** لا يتفوق بعد في operational depth أو production maturity، لكنه يتفوق محتملاً في العربية وR&D/HR وOTA وتخصيص الأدوار.

---

## 3. ما نملكه ونحافظ عليه

### 3.1 تخصيص السوق العربي

- Arabic/English/Urdu وواجهات RTL.
- ZATCA وworkflows قريبة من السوق السعودي.
- استخدام أسماء وworkflows تشغيلية مخصصة للمواقع والمشاريع والمقاولين.
- إمكانية تشغيل أكثر من plant/company من نفس الحساب مع tree accounts.

### 3.2 R&D وHR

هذا يميز Fimto عن المنتجات التي تركز على dispatch/batch فقط:

- R&D: plans، tasks، weekly tracking، budget، employee evaluation، external tasks، competitor analysis.
- HR: employee/attendance/requests/payroll/geo attendance، مع إمكانية إضافة job titles ومهام جديدة عبر release checklist.

### 3.3 Mobile-first + OTA

- التطبيق الحالي Android 1.3.0 / build 13.
- Expo Updates على channel `preview` مع runtime `1.3.0`.
- فحص OTA عند launch وعند العودة إلى foreground.
- features جديدة في JS/TS/UI لا تحتاج uninstall.
- البيانات المحلية (SecureStore/AsyncStorage) والبيانات remote لا تُمسح أثناء OTA.

### 3.4 تطبيق متعدد الأدوار

يوجد في Fimto أدوار متعددة: driver، sales، production، schedule، finance، workshop، lab، R&D، HR وغيرها. هذا مناسب للشركات التي لا تريد تبنّي monolith rigid واحد.

---

## 4. المشاكل الحقيقية عند Fimto — مرتبة بالخطورة

## P0 — يجب إصلاحها قبل إضافة features جديدة

### P0.1 — Backend غير منشور على production

**التحقق الحالي:**

```text
https://concrete.fimtosoft.com/api/health       -> 404
https://concrete.fimtosoft.com/api/auth/login   -> 404
https://concrete.fimtosoft.com/api/rnd/plans    -> 404
```

الـsource يحتوي Next.js routes كثيرة، لكن Vercel production الحالي يقدّم SPA فقط. لذلك:

- تسجيل الدخول عبر API يفشل ثم يعتمد mobile على Firestore tree fallback.
- شاشة Console نفسها تستخدم `/api/console/login` و`/api/otp/verify`؛ لذلك لا يمكن اعتبار flow إنشاء/إدارة accounts من production website مؤكداً حتى يعمل هذا endpoint.
- R&D/HR/Finance/Dispatch backend flows لا يمكن اعتبارها production.
- Customer Portal magic link لا يجد البيانات من API إذا لم يكن Firestore/local fallback كافياً.
- APIs في `api/` القديمة وNext routes وجودهما في repository لا يعني وجودهما على الدومين.

**الإجراء:** اختيار deployment architecture واحد:

1. نشر جذر Next.js على Vercel project مستقل + `api.fimtosoft.com`، ثم تغيير API URL للموبايل/الموقع؛ أو
2. جعل نفس production project يقدّم SPA وNext API مع build/rewrite صحيح.

يجب إضافة deployment smoke test يفرض:

- `/api/health` = 200 وdatabase connected.
- login/refresh/RBAC.
- قراءة/إنشاء order وtripSignature وR&D task.
- upload APK وWebsite في نفس الإصدار.

### P0.2 — Firebase Authentication authorization غير كافٍ

في `firestore.rules`، paths مثل `companyTrees` و`users` و`userData` تسمح لأي `request.auth != null`. الموقع وMobile يطلبان Firebase Anonymous Auth، وتم اختبار anonymous read لـ`companyTrees` بنجاح.

المشكلة ليست فقط anonymous auth؛ التصميم الحالي يقوم بـ:

- قراءة كل company trees من العميل.
- مقارنة hash أو legacy password داخل العميل.
- الاعتماد على بيانات Firebase كـ auth fallback في غياب API.

**الأثر:** تسريب بيانات الحسابات/hash، القراءة أو الكتابة غير المقيدة داخل نطاق Firestore، وصعوبة فرض tenant isolation.

**الإجراء:**

1. تعطيل anonymous auth كـ production identity، أو تقييد القواعد إلى server-only.
2. نقل tree login إلى `/api/auth/login` server-side مع bcrypt/Argon2.
3. إضافة `companyId/tenantId` إلى token وFirebase custom claims، والتحقق منها في كل route.
4. إزالة plaintext password من documents؛ تشغيل migration للـlegacy accounts.
5. إضافة session revocation وaudit log حقيقي.
6. اختبار rule tests: user A لا يقرأ user B أو company B.

### P0.3 — Build وtypecheck ليست release gates صالحة

نتائج المراجعة الحالية:

```text
npm run build              -> FAIL: window is not defined (leaflet during Next page data)
npm run build:site         -> PASS (Vite build)
npm run typecheck:site     -> FAIL: 25 TypeScript errors
npm run typecheck:mobile   -> FAIL: dynamic imports require module flag
```

كما لم أجد automated test/e2e suite في repository.

**الأثر:** build قد ينجح مؤقتاً لكن يكسر feature، أو ينشر SPA لا يستطيع تشغيل API/Next بسلاسة.

**الإجراء:**

- عزل Leaflet/Map imports خلف client-only boundary أو dynamic import.
- إصلاح أخطاء TypeScript الـ25، ثم إضافة `typecheck:all` إلى CI.
- تعديل mobile typecheck script ليشمل `--module esnext --moduleResolution bundler` أو tsconfig صحيح.
- إضافة اختبارات smoke للـAPI، auth/RBAC، order lifecycle، trip checkpoints، OTA manifest، وtenant isolation.
- منع deploy إذا فشل أي gate.

### P0.4 — مصدران للبيانات بدون conflict policy

`DATA_UNIFICATION.md` يصف Firestore كمسار سريع وPostgreSQL/Postgres كسجل مالي. هذا مفكر فيه، لكنه لا يكفي كـ production architecture إلا إذا تم التحقق من:

- Source of truth لكل entity.
- outbox/queue بدل best-effort mirror.
- retry + dead-letter + replay.
- idempotency keys.
- conflict policy بدل last-write-wins غير الموثق.
- data freshness indicator ظاهر للمدير.

**الإجراء:** اختر PG كـ authoritative للـERP/المال، وFirestore فقط للأحداث/presence/field cache، ثم ابنِ sync قابلاً للمراقبة والتكرار.

## P1 — بعد stabilization

### P1.1 — Dispatch ليس بعد مستوى Central Command في المنافسين

الموجود: service، order/trip flow، optimization preview/apply، ETA، geofence/checkpoints، وتطبيقات driver/sales.

الناقص أو غير مُثبت:

- multi-plant capacity view حقيقي.
- drag-and-drop dispatch board مع constraints.
- load queue-first workflow.
- third-party hauler rules.
- live rescheduling when a truck/slot/plant fails.
- operational KPIs: plant wait، queue، cycle time، deadhead، on-time، rejected loads.

### P1.2 — Plant/Batch/PLC في وضع framework وليس production parity

`batch-control.service.ts` يعلن providers MODBUS_TCP وHTTP_GATEWAY وSIMULATOR، لكن v1 read-only ويحتاج commissioning لكل مصنع.

**الإجراء:**

- commissioning checklist لكل plant.
- register map وnetwork/security diagram.
- safe write commands وinterlocks وoperator confirmation.
- simulator tests ثم staging hardware ثم production.
- calibration وmaterial traceability.

### P1.3 — Quality وLoad Assurance أضعف من المنافسين في التكامل التشغيلي

لدينا mixes، tests، calibration، environmental compensation وQC routes، وما زال علينا إثبات:

- versioned mix design approvals.
- raw material lots and traceability.
- slump/temperature/air/water data from load.
- tolerance breach → hold → approve/release flow.
- sensor/vehicle integration ومزامنة timestamps.

### P1.4 — Customer Portal ليس self-service كامل بعد

Current portal implemented كـ magic-link/share + tracking. ويعلن المنافسون:

- create/edit/cancel orders.
- reorder.
- quotes and acceptance.
- notifications.
- payments.
- account and invoice access.

**اقتراح:** launch version متدرجة: read-only tracking → request new order → change/cancel with finance rules → payment/credit visibility.

### P1.5 — Notifications/AR/ZATCA/Accounting لم تتحقق live

في source توجد adapters، لكن:

- `NOTIFY_PROVIDER` default هو `log`.
- TGA/Bayan module يوصف نفسه كـ `PLACEHOLDER` من دون credentials.
- accounting credentials تحتاج production key/crypto setup واختبار provider حقيقي.
- ZATCA يمكن أن يبقى `PENDING` إذا لم تتوفر Fatoora tokens.

يجب اعتبار كل adapter **غير مكتمل** حتى يوجد اختبار end-to-end من event → provider → retry/audit → UI/notification.

### P1.6 — Observability, backup and recovery غير ناضجة

يوجد script للـbackup المنطقي، لكن لم أجد restore script مطابقاً أو اختبار استعادة تلقائياً أو monitoring واضح لـdata freshness وqueue failures. قبل إدراج plants جديدة نحتاج:

- backup يومي خارج الخادم مع retention policy.
- restore drill ربع سنوي على بيئة منفصلة.
- uptime/error monitoring وتنبيهات.
- dashboard لـAPI latency, sync lag, failed notifications, failed PLC events.
- سجل مركزي للأخطاء مع request/tenant correlation.

### P1.7 — Role وTask governance يحتاج templating

إضافة job title أو task جديدة يجب ألا تعتمد على تعديل ملف واحد. نحتاج registry موحد يربط:

`role → permissions → modules → routes → translations → API guards → mobile mapping → audit policy`

وبالتالي يمكن إضافة role/task من Console مع validation وmigration، مع بقاء feature delivery عبر OTA عندما يكون JS فقط.

## P2 — التمايز والنمو

### P2.1 — AI needs governance, not just a label

لدينا ETA/heuristics/dispatch optimization وR&D comparison. يعلن المنافسون AI/optimization/autonomous dispatch.

التطوير الصحيح:

- simulation sandbox قبل apply.
- objective weights: service level، utilization، cost، rejected loads.
- explainable recommendation.
- confidence وfallback إلى dispatcher.
- offline model/data quality score.
- سجل لكل recommendation ونتيجة الفعالية.

### P2.2 — Product breadth advantage needs packaging

R&D وHR valuable، لكن لا يبيعان وحدهما إذا كان core quote-to-cash غير مستقر. نوصي بتنفيذهما ضمن packages واضحة:

- Fimto Core: dispatch + production + quality + finance.
- Fimto Field: Android + offline + OTP + OTA.
- Fimto People: HR + payroll + attendance.
- Fimto Innovation: R&D + competitor intelligence + sustainability.
- ZATCA/Saudi compliance add-on.

## P2.3 — iOS/coverage

iOS متأخر بناءً على طلب المالك الحالي. لا نبدأه ضمن P0، لكن يجب احتسابه كـ market gap. بعد Android stabilization، نحتاج قرار Apple Developer credentials، TestFlight، background permissions، وOTA rollout للـiOS.

---

## 5. خطة الأولويات المقترحة

### المرحلة 0 — Stop-the-line (1–2 أسبوع)

1. نشر API production واختيار architecture واضح.
2. إصلاح build/typecheck gates.
3. إغلاق anonymous Firestore access وإيقاف tree-auth client fallback.
4. migration/rotation للـpassword hashes.
5. smoke test على device حقيقي وعلى live URL.
6. freeze مؤقت لأي feature جديدة لا يخدم الـcore flow.

**Exit criteria:** API health 200، login آمن، tenant isolation، build أخضر، ولا توجد plaintext secrets.

### المرحلة 1 — Core vertical slice (2–6 أسابيع)

اختر plant/company واحدة pilot ونفّذ:

1. quote → approval → order.
2. finance gate → ticket/batch plan.
3. dispatch → live GPS → seven checkpoints.
4. signature/POD → invoice/ZATCA.
5. customer tracking/notification.
6. R&D task/HR request يجب أن يمر من نفس auth/RBAC/audit model.

**Exit criteria:** رحلة كاملة من فريق المبيعات حتى POD/invoice، مع logs وretry ومؤشرات freshness.

### المرحلة 2 — Operational depth (6–12 أسبوع)

- dispatch board + multi-plant.
- real notification provider.
- AR/credit/collections.
- QC traceability + material lots.
- PLC/IoT commissioning على plant واحدة.
- dashboards for cycle time, wait time, rejection, on-time, utilization.

### المرحلة 3 — Scale/market

- more plants/tenants.
- iOS.
- SSO/MFA.
- customer self-service/payments.
- predictive/autonomous dispatch بعد 충분 من clean historical data.

---

## 6. Feature Acceptance Checklist لكل إضافة جديدة

أي feature جديدة يجب أن تحمل casestudy أو test report، ولا счита مكتملة إلا إذا:

- [ ] تم تصنيفها OTA أم Native APK.
- [ ] تم تحديث Website role catalog وtranslations.
- [ ] تم تحديث mobile UserRole/mapping/routing/RBAC.
- [ ] تم تحديث backend permissions وtenant isolation.
- [ ] تم تحديث schema/migration عند الحاجة.
- [ ] تم اختبار online وoffline وسيناريو regression.
- [ ] تم اختبار permissions positives وnegative tests.
- [ ] تم نشر preview OTA أو APK متى يلزم.
- [ ] تم التأكد من بقاء البيانات والجلسات.
- [ ] تم تحديث deployment/API smoke evidence.
- [ ] لم يتم تغيير Dashboard دون موافقة صريحة.

---

## 7. Sources — competitor public pages

تم الوصول إليها في 24 سبتمبر 2026:

### Command Alkon

- Command Cloud: <https://commandalkon.com/command-cloud/>
- Ready Mix solutions: <https://commandalkon.com/ready-mix-producer/>
- COMMANDqc: <https://commandalkon.com/products/commandqc/>
- Load Assurance: <https://commandalkon.com/products/load-assurance/>
- Customer Portal: <https://commandalkon.com/products/customer-portal/>
- TrackIt: <https://commandalkon.com/products/trackit/>
- Accounts Receivable: <https://commandalkon.com/products/accounts-receivable/>
- Dispatch: <https://commandalkon.com/products/dispatch/>
- Batch: <https://commandalkon.com/products/batch/>
- Batch AI: <https://commandalkon.com/products/batch-ai/>
- APIs: <https://commandalkon.com/products/apis/>

### Sysdyne

- Platform: <https://sysdynetechnologies.com/platform>
- ConcreteGo: <https://sysdynetechnologies.com/products/concrete-go>
- BatchGo: <https://sysdynetechnologies.com/product/batch-go>
- DeliveryGo: <https://sysdynetechnologies.com/product/delivery-go>
- InsightGo: <https://sysdynetechnologies.com/product/insight-go-basic>
- QuickLink: <https://sysdynetechnologies.com/product/quicklink>
- Homepage/product family: <https://sysdynetechnologies.com/>

### Jonel

- Ready Mix: <https://www.jonel.com/concrete-technology/ready-mix>
- Dispatch Scheduling: <https://www.jonel.com/concrete-technology/dispatch-scheduling>
- Load Tracking: <https://www.jonel.com/concrete-technology/load-tracking>
- E-Ticketing: <https://www.jonel.com/concrete-technology/ticketing>
- Accounting: <https://www.jonel.com/concrete-technology/accounting>
- Flex API: <https://www.jonel.com/concrete-technology/flex-api>
- Jonel 360: <https://www.jonel.com/concrete-technology/jonel360>
- Plant Controls: <https://www.jonel.com/concrete-technology/plant-controls>
- Batching Alerts: <https://www.jonel.com/concrete-technology/batching-alerts>
- Business Intelligence: <https://www.jonel.com/concrete-technology/business-intelligence>
- Reporting: <https://www.jonel.com/concrete-technology/reporting>

### BCMI / XBE

- BCMI current platform page: <https://www.bcmicorp.com/>
- BCMI/XBE platform announcement: <https://www.x-b-e.com/news/xbe-and-bcmi-merge-to-create-comprehensive-platform-for-heavy-construction-logistics-and-materials-industries/>
- INFORM + BCMI AI dispatch collaboration: <https://www.inform-software.com/en/news/syncrotess/inform-and-bcmi-announce-collaboration-on-ai-powered-ready-mix-dispatch-solution>
- BCMI dispatch: <https://www.bcmicorp.com/bcmi-dispatch/>
- XBE current BCMI system page: <https://www.x-b-e.com/system-of-action/bcmi/>
- All-22 autonomous dispatch: <https://www.x-b-e.com/superworkforce/all22/>
- Agent XBE: <https://www.x-b-e.com/agent-xbe/>

### Fimto audit references

- `DEPLOY_MECHANISM.md`
- `DATA_UNIFICATION.md`
- `COMPETITIVE_ROADMAP.md`
- `firestore.rules`
- `src/lib/auth/jwt.ts`
- `src/lib/services/notification.service.ts`
- `src/lib/integrations/saudi-tga.ts`
- `src/lib/integrations/batch/controller.ts`
- `website-app/apps/mobile/lib/tree-auth.ts`

---

## الخلاصة

Fimto ليس أقل من المنافسين في عدد الصفحات؛ المشكلة أن أجزاء كثيرة لم تصل بعد إلى مستوى **production vertical slice**. أهم خطوة في 2026 ليست إضافة feature جديدة، melainkan:

1. نشر API بأمان.
2. توحيد source of truth والـsync.
3. إصلاح auth/RBAC.
4. تسليم quote-to-cash/dispatch/POD على plant حقيقي.
5. إثبات integrations مقابل providers حقيقيين.

بعدها يمكن استخدام R&D + HR + Arabic + OTA كميزة تنافسية واضحة بدل مجرد وجودها كـ modules.
