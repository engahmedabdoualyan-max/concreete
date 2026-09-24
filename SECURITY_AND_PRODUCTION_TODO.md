# 🔐 SECURITY & PRODUCTION TODO

> خطة العمل التنفيذية derived from `COMPETITIVE_ANALYSIS_2026.md`.
> **قاعدة ثابتة:** لا يتم تعديل تصميم Dashboard دون موافقة صريحة.
> **قاعدة ثابتة:** أي feature جديدة تُختبر وتُنشر عبر preview قبل production، وتُراجع من ناحية OTA وdata preservation.

## How to use this file

- `[ ]` لم يبدأ/لم يكتمل.
- `[~]` تم البدء أو تنفيذ جزء قابل للتحقق.
- `[x]` مكتمل مع evidence/commit.
- `#blocked-owner` يحتاج secret أو صلاحية deploy أو قرار من المالك.

---

## Phase 0 — Stop-the-line / Security baseline

### 0.1 Production API and deployment

- [x] فحص live endpoints: `/api/health`, `/api/auth/login`, `/api/rnd/plans` ترجع `404` حالياً.
- [ ] اختيار deployment architecture: Next API project مستقل أو SPA + API في نفس Vercel project.
- [ ] ضبط `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_APP_BASE_URL`.
- [ ] نشر API على production.
- [ ] إضافة deployment smoke test للـhealth/login/RBAC/order/trip/R&D.
- [ ] التأكد من أن `Console` login/OTP يعملان على production.
- [ ] Review live `Access-Control-Allow-Origin: *` and restrict API CORS to approved origins.
- [ ] Design/test a strict CSP (Firebase, Supabase, EmailJS, API, maps) after the basic headers are deployed.
- [ ] Deploy/verify static Vercel security headers; live response currently lacks `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.
- [ ] توثيق rollback ونشر API في `BUILD_TROUBLESHOOTING.md`.

**#blocked-owner:** Vercel project choice, production environment secrets, DNS.

### 0.2 Authentication and authorization

- [x] توثيق anonymous Firebase read exposure في `COMPETITIVE_ANALYSIS_2026.md`.
- [~] Website production uses server `/api/auth/login` + `/api/auth/me`; mobile tree-login migration remains.
- [x] Disable production client-side password comparison on Website; mobile fallback is opt-in/dev-only.
- [~] Add `tenantId` to JWT/session validation; Firebase custom-claim issuance still needs the server identity flow.
- [x] Add tenant predicates/ownership checks to representative orders, finance, dispatch, fleet, inventory, quality, workshop, batching, QR, and workspace routes.
- [x] Add rate limiting, ID validation, no-store, and sandbox headers to public report-share downloads; still migrate them to durable signed tenant-scoped tokens.
- [x] Add rate limiting and no-store headers to the public portal token route; verify portal token scope/expiry/revocation end-to-end.
- [ ] Review the remaining 11 route files reported by `npm run security:tenant-report`; classify public/token-scoped routes vs tenant-scoped routes, then add negative tests.
- [x] Write fail-closed Firestore Rules based on custom claims/tenant boundaries (source only; not deployed).
- [x] Deny anonymous browser access to `companyTrees`, `users`, and sensitive `userData` in the checked-in rules (source only; not deployed).
- [ ] Add Firebase Emulator/Rules tests: user A cannot reach company B (local Java runtime is currently unavailable).
- [ ] Supabase: remove public CRUD policies and plaintext `admin_users.password`; migration prepared at `supabase/security-hardening.sql` but not applied to live yet.
- [ ] Apply and test `supabase/security-hardening.sql` only after API/auth tenant model is live.
- [ ] migration لإزالة legacy plaintext password fields.
- [ ] rotation/revoke for all legacy sessions after migration.

**#blocked-owner:** deploying Rules/Functions and choosing Firebase Auth provider.

### 0.3 Secrets and production configuration

- [x] Implement fail-closed behavior in production for JWT, integration crypto, SSO state, and tree-sync key.
- [x] Add a repository secret scanner and wire it into the release script.
- [x] Add a ZATCA gap review and port plan for `invoice-sandpoint`: `ZATCA_GAP_REVIEW.md` and `ZATCA_PORT_PLAN.md`.
- [ ] Define and implement the Fimto ↔ `invoice-sandpoint` service contract with idempotency/replay and tenant-scoped credentials (`ZATCA_ADAPTER_CONTRACT.md`).
- [x] Add ZATCA basic validation smoke, Fatoora timeout handling, returned-QR capture, tenant joins, audit events, and prepared counter/artifact/idempotency migrations.
- [x] Block production ZATCA issuance for clearly ineligible order states and zero delivered quantity; approve the final POD/partial policy.
- [ ] Make the idempotency key mandatory at the public issuance boundary after confirming the one-invoice/partial-invoice policy.
- [x] Disable local fake tax-invoice previews in production and gate accounting push/export on accepted ZATCA status.
- [x] Fix dispatch ownership checks and make the optional RLS policy fail closed when tenant claims are missing.
- [ ] Decide whether the external `invoice-sandpoint` engine is the certified EGS boundary or port its pure compliance modules into Fimto.
- [ ] Remove/protect the external `/api/zatca/debug-csid` endpoint and remove production secret fallbacks before reuse.
- [ ] Run a ZATCA sandbox contract test with CSID, returned cleared artifact, and replay evidence.
- [x] Add a static Firestore/Supabase rules audit (`npm run security:rules`).
- [x] Add a representative tenant-isolation regression audit (`npm run security:tenancy`).
- [x] Add a production guard smoke test for all legacy `/api` handlers (`npm run security:legacy`).
- [x] Restrict local `.env.local` file permissions to `0600` and add a scanner check for group/world-readable secret files.
- [ ] Verify Git history and APK metadata contain no secrets (scanner covers tracked files; APK review is manual).
- [ ] إعداد secret rotation runbook.
- [x] Add baseline Next.js security headers.
- [x] Add Android release hardening: `allowBackup=false`, cleartext traffic disabled, and block unnecessary storage/overlay permissions.
- [ ] Build and publish a new APK after the Android config change; current APK still has the old manifest.

### 0.4 Build, typecheck and tests

- [x] تسجيل نتائج الفحص الحالية وحفظ build logs.
- [x] Fix Leaflet SSR for `/Schedule` and client-only-load the Admin GPS map.
- [x] إصلاح website-app TypeScript errors (25 → 0).
- [x] تصحيح mobile typecheck configuration (0 diagnostics).
- [x] إضافة `typecheck:all`, `security:audit`, `security:rules`, `security:tenancy`, `security:legacy`, `test:zatca` إلى CI/release script.
- [x] Root Next build يمر بعد إصلاح Leaflet/DB وclient-only legacy app wrapper.
- [ ] إضافة unit tests للـauth/RBAC, QR validation, dispatch transitions, OTP/rate limits.
- [ ] إضافة API smoke tests محلياً وفي staging.
- [ ] إضافة EAS/OTA smoke test: runtime + channel + manifest.

### 0.5 Dependency and supply-chain security

- [x] تشغيل `npm audit --omit=dev` وتحليل النتائج.
- [x] تحديث Next.js وPostCSS المتأثرين بإصدارات متوافقة بعد typecheck/build.
- [ ] استبدال/عزل `xlsx` بعد مراجعة بديل آمن؛ لا يوجد npm fix للثغرات الحالية.
- [ ] ترقية Expo/React Native في staging فقط، لا force-upgrade على production.
- [ ] إضافة Dependabot/Renovate أو تاريخ دوري للupdates.
- [ ] تثبيت EAS code signing/rollout قبل production OTA.
- [ ] التحقق من signing certificates وAPK SHA-256 في كل release.

---

## Phase 1 — Core vertical slice (pilot plant)

- [ ] quote → approval → order.
- [ ] finance gate → ticket/batch plan.
- [ ] dispatch → live GPS → seven checkpoints.
- [ ] signature/POD → invoice/ZATCA.
- [ ] customer tracking + real notification.
- [ ] R&D task and HR request through the same auth/RBAC/audit path.
- [ ] offline queue + retry + conflict UI.
- [ ] data freshness indicator لكل source.

**Exit criteria:** رحلة كاملة من sales إلى invoice، مع logs، retry، audit، وtenant isolation.

---

## Phase 2 — Operational depth

- [ ] Multi-plant capacity/dispatch board.
- [ ] Drag-and-drop scheduling مع constraints.
- [ ] Load queue وthird-party hauler rules.
- [ ] Live rescheduling بعد truck/plant failure.
- [ ] KPIs: plant wait, queue, cycle time, deadhead, on-time, rejected loads.
- [ ] Customer self-service: create/edit/cancel/reorder.
- [ ] SMS/WhatsApp provider حقيقي + retry/dead-letter.
- [ ] AR, credit, collections, payment reconciliation.
- [ ] QC traceability, mix versioning, material lots, hold/release.
- [ ] PLC commissioning على plant واحدة (read → staging write → guarded production).
- [ ] IoT sensor validation وtimestamps.

---

## Phase 3 — Scale and market parity

- [ ] iOS/TestFlight (بعد تثبيت Android).
- [ ] SSO + MFA.
- [ ] Customer payments وinvoice portal.
- [ ] Advanced BI/AI simulation وexplainability.
- [ ] Multi-company/independent legal-tenant isolation.
- [ ] SLA/monitoring وon-call alerts.
- [ ] Disaster recovery drills وretention policy.

---

## Tasks requiring owner input

- [ ] تحديد Vercel deployment architecture.
- [ ] Rotate/revoke the local Vercel OIDC token and verify Vercel audit logs.
- [ ] Apply `supabase/security-hardening.sql` after API/auth is live, then verify anon denial.
- [ ] Deploy the fail-closed Firebase/Storage rules only after custom claims and backend access are tested.
- [ ] تزويد production secrets في Vercel/Supabase، وليس في Git.
- [ ] تفعيل/تأكيد Firebase Auth + deploy Rules بعد اختبار.
- [ ] تزويد Apple Developer credentials عندما يبدأ iOS.
- [ ] تزويد credentials مزودي SMS/WhatsApp/ZATCA/Fatoora.
- [ ] توفير network/register maps وموافقة commissioning للـPLC.
- [ ] تحديد Piano/SLA ومواعيد rollback.

---

## Done definition for every security change

- [ ] Threat/risk واضح في commit أو documentation.
- [ ] automated test أو reproduction test.
- [ ] negative test (غير مصرح) وليس positive test فقط.
- [ ] لا secrets أو plaintext credentials في diff.
- [ ] `git diff --check` وtypecheck/build relevant checks.
- [ ] deployment evidence أو blocker موثق بوضوح.
- [ ] rollback plan.
- [ ] OTA impact documented: JS OTA أو Native APK.

## Current audit snapshot (24 Sep 2026)

- Live API: `404` (must fix before calling ERP modules production-ready).
- Firestore: anonymous authenticated read to `companyTrees` confirmed live; checked-in rules are fail-closed but not deployed.
- Root `npm run build`: PASS بعد إصلاح Leaflet SSR، eager DB/secret initialization، وlegacy client-only app wrapper.
- Website `npm run typecheck:site`: 0 errors after fixes.
- Mobile `npm run typecheck:mobile`: 0 errors after tsconfig fixes.
- No automated test/e2e suite was found in the repository at audit time.
- PLC v1 is read-only/simulator-oriented; ZATCA can remain PENDING; notifications default to `log`.
