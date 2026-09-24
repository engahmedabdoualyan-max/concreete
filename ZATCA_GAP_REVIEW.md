# ZATCA Integration Gap Review

**مراجعة source:** 24 سبتمبر 2026
**النطاق:** `src/lib/services/zatca.service.ts`، مسارات API، `drizzle/0007_zatca_documents.sql`، وواجهة `/zatca`.
**قرار النطاق:** لا نضيف Accounting/GL/party ledger الآن. المطلوب هو secure invoice + reliable Fatoora boundary + evidence/operations.

> هذا التقرير يصف الكود الموجود في هذا المستودع. إذا كان المشروع المرتبط بـZATCA الذي يعمل حالياً مشروعاً خارجياً أو ملفاً آخر، يجب مراجعة ذلك المستودع/العقد قبل تعديل العقد.

## الخلاصة

المسار الحالي يستطيع:

- حفظ taxpayer configuration وFatoora credentials بشكل مشفّر عبر AES-256-GCM.
- إرسال invoice XML إلى Fatoora simulation/production.
- حفظ counter/hash/previous hash/status/QR.
- عرض compliance summary وinvoice registry.

لكن لا يجب اعتباره **ZATCA Phase-2 certified** قبل إغلاق نقاط P0 التالية:

## P0 — قبل الاعتماد عليه في production

> بعد مراجعة `invoice-sandpoint`، تم في Fimto source إضافة validation أساسية، tenant joins، gateway timeout، حفظ QR العائد من رد Fatoora، audit events، وPostgreSQL counter guard. هذه improvements لا تعني أن Phase 2 certification أو production deployment اكتمل.

### ZATCA-01 — Phase 2 QR/cleared artifact

`buildTlvBase64()` في `src/lib/services/zatca.service.ts:160-181` يبني 5 tags فقط، ويصف نفسه بأنه Phase-1-compatible. هذا لا يثبت استيفاء متطلبات Phase 2 QR ذات 9 tags، كما أن cryptographic stamp/public key غير مولّدين في هذا الكود.

عند نجاح clearance يجب حفظ واستخدام:

- Fatoora-returned `qrCode`.
- `clearedInvoice` أو XML النهائي بعد clearance.
- validation/clearance warnings.
- previous invoice hash كما تعيده المنصة.

**لا يتم تنفيذ هذا اعتماداً على هذا الكود دون certification/CSID strategy.** إذا كان المشروع الخارجي هو EGS certified، يجب أن نتعامل معه كـblack box ونخزن النتيجة النهائية، ولا نولد QR محلياً ونسميه Phase-2 compliant.

المرجع الرسمي: [ZATCA Detailed Guideline](https://www.zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf) و[QR implementation standard](https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/QRCodeCreation.pdf).

### ZATCA-02 — Duplicate invoices وidempotency

`issueInvoice()` في Fimto الآن يستخدم PostgreSQL advisory lock، prepared unique migrations للـcounter/UUID/invoice number، وoptional caller-provided `idempotencyKey` مع replay. ومع ذلك ما زالت مطلوبة:

- جعل المفتاح إلزامياً بعد تثبيت billing policy.
- منع تكرار فاتورة واحدة للـorder دون قرار واضح.
- policy للـpartial invoices/credit notes.
- replay/reconciliation worker يعتمد على نفس UUID/hash.

**خطر:** ضغط زر Issue مرتين أو request timeout بعد قبول Fatoora قد ينتج duplicate invoice أو document غير قابل للمطابقة.

**الإصلاح المتبقي:** adapter contract + idempotency key + unique business constraint + replay-safe submission.

### ZATCA-03 — Exact invoice persistence وreconciliation

الـFimto source الآن يحفظ `submittedXml` داخل `fatooraResponse`، لكن ما زال يحتاج حقلاً مستقلاً/مشفّراً، retention policy، وretry endpoint يعتمد على نفس UUID/hash.

يجب حفظ:

- original XML أو نسخة مشفّرة ومرتبطة بالdocument.
- UUID/hash قبل submission.
- invoice hash format migrated to base64 PIH chain, but the current Fimto builder still does not implement the full external canonicalization/XAdES engine.
- request metadata من غير secrets.
- response/stamp/QR النهائية.
- submission attempts وtimestamps.

### ZATCA-04 — Tenant boundary في order joins

الاستعلام في `issueInvoice()` أصبح يربط `orders` مع `clients` و`deliverySites` و`mixDesigns` مع tenant predicates على كل جدول.

```text
orders.tenantId = tenantId
clients.tenantId = tenantId
deliverySites.tenantId = tenantId
mixDesigns.tenantId = tenantId
```

وكذلك service-level authorization/tenant assertion، وليس الاعتماد على route guard فقط.

### ZATCA-05 — Fatoora timeout/retry/outbox

`fatooraPost()` أصبح له `AbortSignal.timeout(30_000)`، ويحوّل timeout/network failure إلى `PENDING` مع `SUBMISSION_UNKNOWN`. أضيف optional idempotency replay، وما زالت ناقصة:

- retry policy منضبطة.
- outbox/worker.
- recovery/reconciliation job.
- endpoint/worker لإعادة الإرسال بنفس UUID/hash.

لا المفروض retry عشوائي لـPOST بعد timeout، لأن Fatoora قد يكون قد قبل الفاتورة أصلاً. الإصلاح المتبقي هو persistent state + same UUID/hash replay + controlled retry.

### ZATCA-06 — Audit trail

أضيفت في Fimto source audit events لـconfig changes، invoice creation، pending/unknown submission، وaccepted/rejected. ما زالت ناقصة events دقيقة للـretry/replay/reconciliation وcredit/debit notes.

### ZATCA-07 — Production safety gate

أضيف gate على server وUI يتطلب `confirmProduction` قبل حفظ production. ما زال مطلوب sandbox evidence فعلي وrole segregation/alerting قبل production submission:

- explicit confirmation.
- role segregation بين config operator وinvoice issuer.
- sandbox smoke test obligation.
- environment allowlist.
- no automatic fallback من production إلى simulation أو العكس.
- alerting عند rejected/pending/unknown state.

## P1 — تحسينات قبل pilot

### ZATCA-08 — Status mapping وHTTP semantics

أضيف `httpStatus` إلى نتيجة Fatoora، ولم تعد 401/403/429/5xx أو response غير مفهومة تتحول تلقائياً إلى business `REJECTED`. API يعيد 201 للقبول، 202 للـpending، و422 للـbusiness rejection، والـUI يعرض state marker.

ما زال ناقصاً:

- request ID من Fatoora.
- latency/attempt metrics.
- status vocabulary دائم مثل `RETRYABLE` و`AUTH_ERROR` و`RATE_LIMITED` في reporting/UI.
- polling/reconciliation endpoint.

### ZATCA-09 — Invoice eligibility

أضيف validation أساسي seller/VAT/quantity/rate، وفي production يمنع issue للطلبات `DRAFT/PENDING_FINANCE/CREDIT_HOLD/FINANCE_REJECTED/CANCELLED/ON_HOLD` أو عند عدم وجود delivered quantity. ما زال يتعين قرار واضح ومطبق لـ:

- اعتماد الـfinance/approval policy النهائية.
- delivered quantity أو approved POD semantics.
- partial invoice policy.
- one invoice per order أو أكثر.
- credit/debit note policy.

لا أغير سياسة partial/one-invoice من افتراضي؛ تحتاج قرار المالك.

### ZATCA-10 — B2B/B2C selection

`type` يرسله المستخدم (`STANDARD` أو `SIMPLIFIED`). أضيف blocking في production STANDARD لعميل بلا VAT (`STANDARD_BUYER_VAT_REQUIRED`)، لكن binding التلقائي لـB2B/B2C في SIMPLIFIED ما زال قرار سياسة.

### ZATCA-11 — Money precision

أضيف `round2()` لتوحيد التقريب إلى منزلتين في الحسابات، لكن الأفضل استخدام integer minor units أو decimal library ومطابقة:

- line extension.
- taxable amount.
- VAT.
- payable amount.
- QR totals.
- ZATCA validation result.

### ZATCA-12 — Configuration validation

أضيف regex validation للـSaudi VAT number، production confirmation gate، و`credentialStatus` يميز `UNCONFIGURED/INCOMPLETE/CONFIGURED/CORRUPTED`. ما زال مطلوب:

- required seller fields.
- branch/building data.
- explicit test-connection state.
- certificate/credential rotation runbook.

### ZATCA-13 — Observability

مطلوب dashboard/alert for:

- Fatoora latency.
- timeout count.
- rejected validation codes.
- pending age.
- duplicate/idempotency conflicts.
- missing QR/cryptographic stamp.
- last successful sandbox/production smoke test.

### ZATCA-14 — Tests

أضيف `npm run test:zatca` كـbasic validation smoke. ما زال يجب إضافة:

- golden UBL XML against current ZATCA XSD/SDK.
- hash determinism.
- VAT rounding.
- TLV decode/required tags.
- Fatoora sandbox success/rejection/timeout.
- same idempotency key behavior.
- concurrent Issue requests.
- cross-tenant order attempt.
- production environment guard.
- cleared QR/XML persistence.
- replay after timeout.

## خارج النطاق الآن — Accounting

لا نضيف في هذه المرحلة:

- General ledger.
- chart of accounts.
- bank reconciliation.
- payroll/accounting journals.
- accounting tax reports.
- vendor/customer accounting sync logic.

المفصل المقترح:

```text
Approved order / POD
        ↓
ZATCA adapter or certified external EGS
        ↓
Invoice status + cleared artifact
        ↓
External specialized accounting program
```

Fimto يجب أن ينسق **invoice lifecycle**، لا أن ينشئ accounting ledger منافس.

## ما يمكن إغلاقه بدون Accounting expansion

1. تثبيت عقد واضح مع المشروع الخارجي: endpoints, auth, status mapping, replay/idempotency, webhook/polling.
2. إضافة ZATCA contract tests وsandbox smoke test.
3. إضافة timeout + persisted submission state + same UUID/hash replay.
4. إضافة tenant joins/audit logs/idempotency.
5. إضافة golden XML/QR/hash evidence.
6. إضافة ZATCA gap dashboard بدل accounting features.
7. اختبار cross-tenant وduplicate issuance على environment محلي/قاعدة staging.

## مطلوب من المالك أو من المشروع الخارجي

- رابط المستودع/الـservice أو API contract الخاص بالمشروع الذي يعمل مع ZATCA.
- هل هو EGS certified أم يرسل فقط إلى Fatoora؟
- هل invoice واحدة لكل order أم partial invoices مسموحة؟
- ما هو مصدر البيانات المعتمد: `remainingVolumeM3` أم POD/approved delivery؟
- هل يوجد CSID/private key/certificate workflow خارج Fatoora؟
- Sandbox credentials/environment names — **لا ترسل tokens أو secrets هنا**.

## مراجعة `invoice-sandpoint` الخارجية

- الـengine في `invoice-app/src/lib/zatca/` أقوى بكثير من Fimto الحالي: full UBL, C14N hash, 9-tag QR, ECDSA/XAdES, CSID parsing, protected counter.
- لا أنسخ Prisma/SQLite/UI/Accounting؛ سأحوّلها إلى Drizzle/PostgreSQL multi-tenant.
- points to fix before reuse: `debug-csid` unprotected, production secret fallbacks, private key/OTP response exposure, sensitive logging, arbitrary `zatcaBaseUrl`, no tenant scope, no replay/outbox, validation module currently not called.
- Source build/typecheck passes, but `npm audit --omit=dev` reports 1 critical (`xmldom`) and 3 high (`prisma`/`deepmerge-ts`).
- في Fimto source تم تعطيل local fake tax-invoice previews في production، ومنع accounting push/export قبل `CLEARED/REPORTED`، وإضافة optional idempotency replay، وإحكام dispatch/RLS boundaries. هذه الضوابط لا تعني certification.

## الخلاصة التنفيذية

لا أزود Accounting الآن. أعلى خطوة عملية هي أن نستخدم المشروع الخارجي كـ**certified ZATCA boundary**، ونغلق حوله:

- reliability
- idempotency
- tenant isolation
- auditability
- replay/reconciliation
- golden compliance tests

ثم نقفل phase 2 vertical slice:

```text
Order approved → delivery/POD approved → invoice issued once → Fatoora response persisted → status monitored → external accounting receives only approved result
```
