# 🔐 Fimto Security Model & Findings

**آخر تحديث:** 24 سبتمبر 2026
**النطاق:** Website SPA، Android/Expo app، Next.js API، Firebase، Supabase/PostgreSQL، OTA.

> **Dashboard:** لم يتم تغيير تصميم Dashboard. إصلاحات Leaflet/SSR والـsecurity boundaries لا تغيّر layout أو الألوان أو سلوك الشاشات.
>
> ⚠️ **Source hardening is not live yet:** do not deploy the new Firebase/Storage rules or production auth path until the server identity, custom claims, and negative tests are ready.


### الكود

- كود Website بعد وصوله للمتصفح **ليس سرًا**؛ يمكن لأي طرف فتح DevTools وقراءة JavaScript وAPI calls.
- يمكن تفكيك Android APK decompile واستخراج JavaScript bundle وstrings، لذلك لا يمكن الاعتماد على إخفاء الكود كوسيلة حماية.
- Minification وobfuscation يرفعان تكلفة القراءة، لكنهما ليسا barrier أمان.

### الاختراق

الحماية الحقيقية يجب أن تأتي من:

1. Server-side authorization.
2. Tenant isolation.
3. Secret manager، وليس secrets داخل Client أو APK.
4. TLS، HSTS، secure token storage.
5. Input validation وrate limiting.
6. Audit logs وmonitoring.
7. OTA signing وstaged rollout وrollback.

أي API endpoint يثق ببيانات العميل أو يقبل token قابلاً للتزوير يظل ثغرة، حتى لو كان mobile app مشفّراً.

## حالة الحماية الآن

| Area | الحالة |
|---|---|
| Source secret fallbacks | تم جعل JWT/SSO/integration/QR/tree-sync يفشلون في production |
| Website/mobile typecheck | ✅ 0 errors |
| Active Vite website build | ✅ PASS |
| Root Next build | ✅ PASS بعد Leaflet SSR fix وlegacy client-only app wrapper |
| Firebase Rules source | ✅ fail-closed و tenant-aware، لكن **غير منشور** |
| Supabase RLS source | ✅ حُذفت public policies من schema، لكن **migration لم تُطبق live** |
| Production API | ❌ `/api/*` ما زال 404 على النطاق الحالي |
| Android hardening | ✅ prepared in app config، لكن APK المنشور ما زال manifest القديم |
| Dependency audit | ⚠️ ما زال هناك vulnerabilities عالية/حرجة، جزء منها يحتاج major migration |
| Automated tests | ⚠️ static gates فقط؛ لا يوجد Firebase Rules/tenant negative test suite بعد |

## Live verification snapshot — 24 September 2026

تم تنفيذ GET/status probes فقط، بدون كتابة أو حذف بيانات production:

| Surface | Result |
|---|---|
| Firebase unauthenticated `companyTrees` / `users` | `403` |
| Firebase anonymous `companyTrees` / `users` | `200` — Critical |
| Supabase publishable-key reads of `admin_users`, `plant_profiles`, `gps_locations` | `200` — Critical |
| Live `/api/health`, `/api/auth/login`, `/api/otp/request`, `/api/console/login` | `404` |
| Public APK | `200`; SHA-256 `133398046c7d3be9d7692b2b6278e9c3f885c5c8e1f9a434f34a731cede1430e` |
| Live website headers | HSTS present؛ `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` غير ظاهرة؛ `Access-Control-Allow-Origin: *` موجود |

These results are why the checked-in rule/RLS hardening is not considered a live fix until it is deployed and re-tested.

## Findings الحالية

### Critical

1. **Anonymous Firebase access — confirmed live**
   - تم التحقق من anonymous read لبيانات حساسة مثل `users` و`companyTrees` و`userData` في مشروع `concrete-erb`.
   - `firestore.rules` الحالي في Git أصبح deny-by-default ويتوقع `tenantId` و`role` custom claims، مع إبقاء `users` و`userData` browser access مقصوراً على admin/server path. هذا لم يُنشر بعد.
   - المطلوب: نشر Rules بعد تشغيل server auth، ثم اختبار anonymous وcross-tenant denial.

2. **Supabase public CRUD — confirmed live**
   - `supabase/schema.sql` كان يحتوي `using (true)` policies وعمود `admin_users.password` نصياً.
   - تم تجهيز `supabase/security-hardening.sql`، لكنه **لم يُطبق على live** بعد.
   - المطلوب: نشر API/auth model أولاً، ثم تطبيق migration واختبار القراءة/الكتابة قبل وبعد.

3. **Client-controlled authentication — source-confirmed**
   - Website production now calls `/api/auth/login` and revalidates with `/api/auth/me`; browser local fallback is disabled in production.
   - Mobile still has a development-only tree fallback; production disables it unless explicitly overridden while the server login rollout is incomplete.
   - المطلوب: finish server-side tree login migration، hash Argon2id/bcrypt، refresh rotation، revocation، and remove the opt-in fallback flag.

4. **Legacy plaintext credentials — repository/history risk**
   - تم حذف snapshots/reports المولدة التي كانت تحتوي passwords وPII من شجرة العمل الحالية.
   - البيانات القديمة قد تبقى في Git history أو backups؛ يجب تدوير credentials وحذفها من history وفق سياسة المشروع.
   - لا تُعاد passwords إلى reports أو exports أو console logs.

### High

5. **Root API tenant isolation — source-confirmed, deployment-dependent**
   - بعض routes تقرأ أو تعدّل resources by ID من دون `tenantId` predicate.
   - API غير منشور على النطاق الحالي، لذلك لا يمكن اعتباره production-safe قبل deployment واختبارات two-tenant negative tests.
   - Representative route patches are in place; `npm run security:tenant-report` now lists 11 route files for explicit review (health/SSO/delegated handlers and public token routes remain).
   - Report-share downloads now have rate limiting, ID validation, no-store, and sandbox headers; durable signed tenant-scoped share tokens remain pending.
   - المطلوب: tenant check لكل read/mutation + resource ownership + database defense-in-depth.

6. **Legacy API implementations**
   - `api/` و`mobile-api/` rely على نماذج public Firebase أو shared admin token، ويوجد fallback secret/role elevation.
   - تم تقليل fallback risk في JWT/CORS/role mapping، لكن المسارات legacy يجب retirement أو عزلها عن production.
   - لا تنشر legacy API كبديل عن hardened Next API.

7. **Customer portal fallback**
   - تم تعطيل browser OTP وcross-company client lookup في production build.
   - المسار الآمن غير مكتمل لأن API/OTP routes غير منشورة؛ portal سيعرض failure بدلاً من تسريب بيانات.
   - المطلوب: public portal token server-side، exact identifier lookup، expiry/revocation/rate limit.

8. **Dependency vulnerabilities**
   - `npm audit --omit=dev` يعرض حالياً 52 issue تقريباً، منها `xlsx` prototype-pollution/ReDoS بلا npm fix وtar critical داخل toolchain.
   - تم تحديث Next.js وPostCSS بإصدارات متوافقة، وإضافة حدود للصفوف/الخلايا حول XLSX.
   - لا تستخدم `npm audit fix --force` قبل staging؛ Expo/React Native upgrade يحتاج migration واختبار APK/OTA.

9. **Current APK manifest hardening not deployed**
   - APK المنشور يحتوي `allowBackup=true` وstorage/overlay permissions غير مطلوبة.
   - app config الآن يضيف `allowBackup=false`، cleartext disabled، وblocked permissions؛ يلزم build APK جديد والتحقق من manifest قبل الاعتماد عليه.

10. **Secret and release supply chain**
    - development fallbacks يجب ألا تصل إلى production.
    - تم تفعيل fail-closed، لكن production secrets ما زالت تحتاج Vercel/Supabase configuration.
    - يجب تدوير Vercel OIDC token الموجود محلياً، والتحقق من EAS signing/certificate provenance.
    - لا تستخدم preview APK كـpublic production APK، ولا تنشر OTA بلا code signing وrollback.

11. **Rate limiting and token storage**
    - rate limiting الحالي process-local، وقد يتكرر/يختفي بين serverless instances.
    - web tokens are now kept in `sessionStorage` in production (not persistent localStorage), but HttpOnly cookies remain preferable.
    - المطلوب: shared rate-limit store، HttpOnly/Secure/SameSite cookies للويب، threat model لـXSS/CSRF.

### Medium

12. **OTA integrity**
    - EAS Updates مفعلة مع `ON_LOAD`، لكن production code signing وstaged rollout وmanifest allow-list غير موثقة في evidence.
    - المطلوب: signing key، staged rollout، rollback، ومراجعة channel قبل production.

13. **Observability and backups**
    - auth failures، sync، finance، notifications، OTA، PLC، وrate-limit alerts غير موحدة.
    - `backup-db.ts` يحتاج TLS verification مشددة، encrypted archives، retention، وrestore drill.

14. **Data privacy**
    - GPS، HR، R&D، finance، signatures، وcustomer data تحتاج minimization، retention، export/delete، وaudit access.

## Controls المطلوبة قبل production

- [ ] API production مع TLS/HSTS/security headers.
- [ ] `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTEGRATION_CRYPTO_KEY`, `TREE_SYNC_KEY`, `QR_SECRET` في secret manager.
- [ ] JWT access قصير العمر + refresh rotation + revocation.
- [ ] RBAC وtenant checks على server لكل route.
- [ ] Firebase anonymous access مغلق، ونشر Rules بعد اختبار.
- [ ] Supabase public RLS policies مطبقة ومثبتة by negative tests.
- [ ] لا plaintext password أو API secret في Git/Website/APK/logs.
- [ ] rate limits على login/OTP/portal/tree-sync/integration endpoints.
- [ ] Zod validation + payload limits + SSRF protection.
- [ ] audit log لكل login/permission/finance/role/task change.
- [ ] dependency scan وSBOM وsecret scan في CI.
- [ ] OTA code signing وstaged rollout وrollback.
- [ ] backup + restore drill + alerting.
- [ ] penetration test قبل معالجة بيانات customers حساسة.

## ما هو public عمداً؟

Firebase Web/API keys وExpo project identifiers ليست server secrets. أمانها يعتمد على:

- Firebase Rules.
- Authentication/authorization.
- API validation.
- Firebase Console restrictions.
- عدم اعتبار API key بديلاً عن backend secret.

## كيف نحمي الكود من النسخ؟

### غير كافٍ وحده

- rename variables.
- hide JavaScript.
- minify/obfuscate APK.
- إزالة comments أو source maps فقط.

### فعّال

- إبقاء business rules وcredentials وauthorization decisions على server.
- tokens قابلة للتدوير والإلغاء.
- rate limits وmonitoring وaudit logs.
- tenant data separation وwatermarking عند الحاجة.
- حماية قانونية/عقودية للملكية الفكرية.

## هل يمكن أن يصبح Fimto Top-tier app؟

نعم، لكن الطريق ليس إضافة شاشات أكثر. الترتيب الواقعي:

1. إصلاح API/auth/tenant isolation والـRules.
2. إغلاق quote → order → finance gate → dispatch → POD → invoice → ZATCA.
3. reliable offline sync مع retry/conflict UI.
4. real plant/customer integrations.
5. multi-company isolation + SSO/MFA + observability.
6. validated R&D/HR/Arabic/offline/OTA differentiation.
7. بعد ذلك AI/IoT/PLC features على foundation موثوق.

## Audit commands

```bash
npm run security:audit
npm run security:rules
npm run security:tenancy
npm run security:legacy
npm run security:zatca
npm run security:tenant-report
npm run security:audit:deps
npm run typecheck:all
npm run build
npm run build:site
```

## مراجع

- `SECURITY_AND_PRODUCTION_TODO.md`
- `COMPETITIVE_ANALYSIS_2026.md`
- `BUILD_TROUBLESHOOTING.md`
- `firestore.rules`
- `supabase/security-hardening.sql`
- `FIRESTORE_RULES_TEST_PLAN.md`
- `SUPABASE_RLS_TEST_PLAN.md`
- `DEPLOY_MECHANISM.md`
- `ZATCA_GAP_REVIEW.md`
- `ZATCA_PORT_PLAN.md`
- `ZATCA_ADAPTER_CONTRACT.md`
