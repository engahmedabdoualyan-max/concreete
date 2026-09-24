# 🚀 ميكانزم النشر — اقرأ قبل أي Deploy (تم التحقق ميدانياً)

> **القاعدة الذهبية:** التطبيق مشروع منفصل — لا تنشر الموقع بدون ملف APK
> موجود، وإلا انكسر رابط التحميل.

## المشاريع على Vercel (فريق fimtosoft)

| المشروع | الدور | النطاق الحي |
|---------|-------|-------------|
| **`concreete`** | ⭐ الموقع الحي + ملف APK | `concrete.fimtosoft.com` (+ `concreete.vercel.app`) |
| `deploy-site` | بديل/قديم — لا شيء يشير إليه | `deploy-site-snowy.vercel.app` فقط |
| `concreteapp-andorid-ios` | موبايل (EAS/معاينات) | — |

## من أين يأتي المحتوى الحي؟

- `/` → حزمة SPA مبنية (`website-app/dist/index.html` — ملف واحد ~5MB)
- `/downloads/fimto-android.apk` (~96MB) → **ملف يُحقن يدوياً وقت النشر**
  (غير موجود في الريبو عمداً — `.gitignore` — يُبنى عبر EAS)
- `/api/*` على هذا النطاق → **404** (الباك إند مشروع `concreete`... تحقق:
  الـ API الحقيقي يُخدم من مشروع الباك إند Next.js — راجع `vercel.json` الجذري)

## إجراء النشر الصحيح (من جهاز المالك)

> **مختصر:** `./scripts/release-apk.sh "وصف الإصدار"` — ينفذ security gates والبناء والنشر.
> الـscript افتراضياً يستخدم `FIMTO_EAS_PROFILE=production`؛ preview build داخلي.
> (يحتاج `eas login` لمرة واحدة).

```bash
# 1. بناء الـ APK أولاً (إن تغيّر الموبايل)
cd website-app/apps/mobile
eas build -p android --profile production
# حمّل الـ APK الناتج

# 2. ضع الـ APK بجانب البناء (لا يُرفع على git)
cp fimto-android.apk ../../public/downloads/   # ← يُنسخ تلقائياً إلى dist/
# أو: website-app/dist/downloads/fimto-android.apk مباشرة بعد البناء

# 3. ابنِ الموقع
cd website-app && npm run build

# 4. انشر على مشروع concreete (وليس deploy-site)
vercel deploy --prod   # من داخل website-app، مربوط بمشروع concreete
```

## ⚠️ أخطاء قاتلة (حدثت فعلاً)

1. **النشر بدون APK** → رابط التحميل ينكسر (404). تحقق دائماً:
   `curl -sI https://concrete.fimtosoft.com/downloads/fimto-android.apk`
2. **النشر على `deploy-site`** → لا يظهر على النطاق الحقيقي (مشروع مهجور).
3. **فرع `gh-pages`** → لا يخدمه شيء حالياً (أرشيف فقط). النطاق يشير إلى Vercel.
4. **بناء Website من جذر الريبو** — استخدم `npm run build:site` من الجذر أو `npm run build` من `website-app`؛ `npm run build` في الجذر يبني Next API/legacy boundary وليس SPA.

## التحقق بعد النشر (60 ثانية)

```bash
curl -sL https://concrete.fimtosoft.com/ -o /tmp/live.html
grep -c "hrOfficer\|rndMgr" /tmp/live.html        # يجب > 0
grep -o "v1\.[0-9.]*" /tmp/live.html | sort -u    # رقم الإصدار المتوقع
curl -sI https://concrete.fimtosoft.com/downloads/fimto-android.apk | grep -i content-length
curl -sI https://concrete.fimtosoft.com/ | grep -iE 'x-content-type-options|x-frame-options|referrer-policy'
```

## حالة آخر نشر معروف

- SPA حي: بناء ~20 سبتمبر (بدون أدوار HR/R&D — قديم)
- APK حي: 93MB بتاريخ 23 سبتمبر 20:42 GMT (جديد — رُفع منفرداً)
- الاستنتاج: الفريق يرفع الـ APK مع حزمة قديمة — حدّث الاثنين معاً دائماً.

## 🚨 الباك إند (API) غير منشور — حرج

- `https://concrete.fimtosoft.com/api/*` → **404** (وكذلك `concreete.vercel.app`)
- لا `api.fimtosoft.com` (DNS غير موجود)
- **الأثر:** APK/website production الحالي لا يثق في API لمجرد نجاح SPA build؛ المسار الآمن هو Next API. الـtree fallback موجود في development فقط، والـrelease الحالية قديمة وتحتاج API قبل الاعتماد عليها.
- **الإصلاح (يختار المالك):**
  - **أ:** مشروع Vercel جديد للباك إند (جذر الريبو = Next.js) على
    `api.fimtosoft.com` مع `DATABASE_URL` + `JWT_SECRET`، ثم توجيه
    `API_BASE_URL` في الموبايل إليه (يحتاج rebuild واحد).
  - **ب:** proxy من مشروع الموقع: `vercel.json` rewrite
    `/api/:path*` → `https://api-host/api/:path*` + إعادة نشر الموقع
    (مع ملف APK حاضر!).
- لا تنفذ (أ) أو (ب) بدون أسرار قاعدة البيانات — ليست في بيئة العمل.

## 🚨 احتواء المخاطر قبل توصيل API

- تم تأكيد anonymous Firebase reads وSupabase publishable reads مباشرة؛ راجع `SECURITY.md`.
- `firestore.rules` و`storage.rules` في source fail-closed، لكن لا تنشرهما قبل custom claims + `FIRESTORE_RULES_TEST_PLAN.md`.
- `supabase/security-hardening.sql` جاهز، ولا يُطبق قبل تشغيل API/auth model.
- لا تستخدم legacy `/api` أو `mobile-api` في production؛ Protection guards موجودة في source.
