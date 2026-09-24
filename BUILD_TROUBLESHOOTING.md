# Fimto ERP — Mobile Build & App-Tree Runbook

> **اقرأ هذا الملف قبل أي بناء Android، تعديل شجرة الحسابات، أو نشر الموقع.**
> آخر تحديث: 24 سبتمبر 2026

## 0) الخلاصة السريعة

| المهمة | الأمر/المكان الصحيح |
|---|---|
| Website source | `website-app/` |
| Android app source | `website-app/apps/mobile/` |
| Website production | `https://concrete.fimtosoft.com` |
| Vercel project | `fimtosoft/concreete` |
| EAS project | `@fimtosoft/fimto-concrete-erp` |
| EAS project ID | `4bbc5a6b-7958-49b6-9538-c34bbd4e52d4` |
| App tree store | Firebase project `concrete-erb`, collection `companyTrees` |
| App login users | Firebase project `concrete-erb`, collection `users` |
| Website Supabase DB | بيانات الموقع فقط؛ **ليست** شجرة حسابات التطبيق |
| Android package | `com.fimtosoft.concrete` |
| Current app version | `1.3.0`, versionCode `13` |

> **مهم:** لا تضع Supabase connection string أو Expo token أو كلمات مرور داخل Git أو README.

---

## 1) App Tree: مصدر الحقيقة

شجرة حسابات التطبيق ليست في Supabase. التطبيق يقرأها من Firebase Firestore:

```text
concrete-erb
└── companyTrees/{companyUsername}
    ├── companyUsername
    ├── accounts[]
    │   ├── email
    │   ├── passwordHash
    │   ├── phone
    │   ├── role       # rndMgr / hrOfficer / ...
    │   ├── roleAr
    │   ├── permissions[]
    │   └── mods[]
    └── subscriptionStart / subscriptionEnd / subscriptionStatus
```

عند إنشاء/تعديل حساب، يُكتب record مقابل في:

```text
concrete-erb/users/{email-lowercase}
```

### أولوية الـ stores

- **Supabase**: Admin users, GPS locations, plant profiles، وبيانات الموقع.
- **Firestore `companyTrees`**: شجرة حسابات App.
- **Firestore `users`**: مستخدمو الدخول الفعليون للجوال/الموقع.
- **Postgres `drizzle` migrations**: بيانات ERP/Backend.

### أدوار R&D و HR

```text
rndMgr      → RND_MANAGER
hrOfficer   → HR_OFFICER
```

Mobile mapping lives in:

```text
website-app/apps/mobile/lib/tree-auth.ts
```

Website role catalog and module permissions live in:

```text
website-app/src/lib/treeRoles.ts
```

---

## 2) إنشاء شركة جديدة وحسابات R&D / HR

من **Website Console**:

1. افتح `Companies & App Trees`.
2. أنشئ الشركة الجديدة.
3. اضغط **فتح الشجرة / Tree**.
4. اختر الدور:
   - `مدير البحث والتطوير`
   - `موظف الموارد البشرية`
5. اضغط **Generate**، ثم املأ البريد ورقم الجوال وكلمة المرور.
6. اضغط **Save**.

عند الحفظ يجب أن يحدث التالي:

1. يُكتب الحساب في `companyTrees/{companyUsername}`.
2. يُكتب سجل مقابل في `users/{email}`.
3. يتم تسجيل `role`, `roleAr`, `permissions`, و`mods`.
4. يتم حفظ `passwordHash` ولا تُخزّن كلمة المرور كنص صريح.

### لماذا لا تظهر الأدوار تلقائيًا؟

`TREE_ROLES` هي قائمة أدوار، وليست حسابات. فتحها في الكود لا ينشئ حسابًا فعليًا داخل شركة جديدة. يجب الضغط على **Generate** ثم **Save**.

### كيف تتحقق أن الشجرة صحيحة؟

افتح Console بعد تحديث الصفحة (`Ctrl+F5`):

- يجب أن يظهر عدد الحسابات الجديدة.
- يجب أن يظهر الدور العربي الصحيح.
- عند تحميل التطبيق، استخدم **رقم الجوال** وكلمة المرور.
- لا تستخدم Supabase accountiga لإنشاء حساب App.

---

## 3) Mobile build prerequisites

من جذر المشروع:

```bash
npm install
```

### Preflight قبل رفع EAS

```bash
cd website-app/apps/mobile
node ../../../node_modules/expo/bin/cli config --json --full --type public
```

يجب أن ينتهي الأمر بدون error. لعرض أخطاء的配置:

```bash
EXPO_DEBUG=1 node ../../../node_modules/expo/bin/cli config --json --full --type public
```

تحقق سريع من إصدارات Mobile:

```bash
node -e "console.log(require('./node_modules/react-native/package.json').version)" # 0.74.5
node -e "console.log(require('./node_modules/expo-router/package.json').version)"
node -e "console.log(require('./node_modules/tailwindcss/package.json').version)" # website: 4.x
node -e "console.log(require('./node_modules/ajv/package.json').version)" # 8.x
```

---

## 4) EAS Android build

```bash
cd website-app/apps/mobile
export EXPO_TOKEN="<token from your secret manager>"
eas build -p android --profile preview --non-interactive
```

### Download the APK

Remote EAS builds **لا تستخدم** `--output`؛ هذا الخيار للتعبئة المحلية فقط.

```bash
eas build:view <BUILD_ID> --json
eas build:download --build-id <BUILD_ID> --non-interactive
```

انسخ الملف الناتج إلى:

```text
website-app/public/downloads/fimto-android.apk
```

ثم تحقق:

```bash
test -s website-app/public/downloads/fimto-android.apk
unzip -p website-app/public/downloads/fimto-android.apk assets/app.config | head -c 500
```

المتوقع:

```json
{
  "version": "1.3.0",
  "android": {
    "package": "com.fimtosoft.concrete",
    "versionCode": 13
  }
}
```

---

## 5) Website build and production deploy

### Important: deploy website and APK together

```bash
cd website-app
npm run build
test -s dist/downloads/fimto-android.apk
vercel deploy --prod --yes
```

Vercel CLI لا يقبل option اسمه `--timeout`. لا تستخدمه.

### Verify production

```bash
curl -sL https://concrete.fimtosoft.com/ -o /tmp/fimto-live.html
grep -c "hrOfficer" /tmp/fimto-live.html   # المتوقع: > 0
grep -c "rndMgr" /tmp/fimto-live.html      # المتوقع: > 0
curl -sI https://concrete.fimtosoft.com/downloads/fimto-android.apk
```

يجب أن يرجع APK:

```text
HTTP 200
Content-Type: application/vnd.android.package-archive
Content-Length: nonzero
```

لا تنشر الموقع بدون APK موجود فعليًا في `public/downloads`.

---

## 6) Known failures → root cause → fix

| رسالة الخطأ | السبب | الحل |
|---|---|---|
| `Failed to resolve plugin for module "expo-router"` | EAS clean install لا وجد plugin في graph.monorepo | وجود `expo-router` في root dependencies + `package-lock` صحيح |
| `Could not get unknown property 'com' for settings` | تم hoisting `react-native 0.86` بدل Expo SDK 51 / RN 0.74 | root `overrides`: `react-native: 0.74.5` و`@react-native/gradle-plugin: 0.74.87` |
| `Cannot find module 'ajv/dist/compile/codegen'` | `ajv-keywords 5` و`ajv 6` تم hoisting معًا | root dependency `ajv ^8.20.0` |
| `NativeWind only supports Tailwind CSS v3` | Website Tailwind 4 يصل إلى NativeWind | `tailwindcss-v3` alias + `scripts/link-mobile-tailwind.cjs` في postinstall |
| `PermissionsService.kt:166` nullable error | bug Kotlin معروف في `expo-modules-core 1.12.26` | patch في `website-app/apps/mobile/patches/` وتطبيقه عبر `scripts/apply-mobile-patches.cjs` |
| `expo config` يخرج بدون رسالة | استدعاء plugin فاشل | `getConfig` من `@expo/config` لإظهار stack trace |
| الأدوار ظاهرة في source لكنها لا تظهر في الموقع | الموقع الحي ما زال deployment قديم | build + Vercel production deploy ثم Ctrl+F5 |
| الأدوار ظاهرة，但没有 حسابات | `TREE_ROLES` ليست accounts | Console → Tree → Generate → Save، أو migration/backfill لـ `companyTrees` |
| حساب جديد يدخل كـ Driver | `tree-auth.ts` لا يعرف role key | mapping `rndMgr` و`hrOfficer` يجب أن يطابق role المخزن في Firestore |
| حفظ الشجرة يجعل login يفشل | hashed accounts كانت تُقرأ بلا `passwordHash` | `Console.tsx` يحفظ `passwordHash` ولا يعيد hash لكلمة فارغة |
| `vercel deploy` يقول unknown option | استخدام `--timeout` | نفّذ `vercel deploy --prod --yes` فقط |
| `eas build --output` يقول output غير مسموح | misuse remote build | `eas build` ثم `eas build:download --build-id` |

---

## 7) Patches and dependency rules

### EAS postinstall

Root `postinstall` يجب أن يشغّل:

```text
node scripts/link-mobile-tailwind.cjs
node scripts/apply-mobile-patches.cjs
```

- `link-mobile-tailwind.cjs` يفصل Tailwind 3 لـ NativeWind عن Tailwind 4 للويب.
- `apply-mobile-patches.cjs` يطبق patch Expo Modules أثناء EAS.
- Script الثاني يتجاهل Vercel عند وجود `VERCEL=1` حتى لا يحاول تعديل اعتماديات الموبايل الأصلية أثناء تثبيت Website.

### لا تغيّر هذه الإصدارات بدون Preflight

```text
Expo SDK:       51
React Native:   0.74.5
Expo Router:    3.5.x
Tailwind/Web:   4.x
Tailwind/NativeWind: 3.4.x
AJV:            8.x
```

بعد أي تغيير في dependencies، نفّذ clean install ثم EAS preflight قبل بدء build طويل.

---

## 8) Current successful release

- Android EAS build: `FINISHED`
- App version: `1.3.0 (13)`
- Live APK:
  `https://concrete.fimtosoft.com/downloads/fimto-android.apk`
- Live website:
  `https://concrete.fimtosoft.com`
- App tree company currently verified: `elkhaleej`
- App tree roles verified: `rndMgr`, `hrOfficer`

لا تضع passwords أو tokens في هذا الملف. استخدم Secret Manager أو بيانات الشركة المحمية.

---

## 9) OTA updates — no reinstall for JS changes

The current APK contains `expo-updates` and the app checks on launch and whenever it returns to the foreground. When an update is available, it is fetched and the app reloads automatically.

Current channel:

```text
branch: preview
runtimeVersion: 1.3.0
```

Publish a JS/UI update:

```bash
cd website-app/apps/mobile
eas update --branch preview --message "Describe the JS/UI change" --non-interactive
eas update:list --branch preview --json --non-interactive
```

The first OTA update is already published:

```text
message: Initialize automatic OTA updates
manifest: https://u.expo.dev/update/01a0d0c3-1340-7ada-a157-7255dacfd94b
```

OTA updates preserve the installed app and its local AsyncStorage. Firestore/Supabase data is remote and is not touched by the update. A new APK is required only for native changes, permissions, SDK/Gradle changes, or a new runtime/versionCode.

---

## 10) iOS status

iOS كان متوقفًا بناءً على طلب مالك المشروع. قبل تشغيله:

1. يلزم Apple Developer account.
2. تسجيل الدخول عبر:
   ```bash
   eas credentials:configure-build -p ios -e preview
   ```
3. إنشاء App ID / provisioning profile.
4. بناء iOS ورفعة إلى TestFlight.

لا تبدأ iOS workflow قبل طلب صريح من مالك المشروع.
