# 📲 التحديث الهوائي OTA (EAS Update) — بدون إعادة بناء APK

> بعد هذا الإعداد، أي إصلاح JS/واجهات يصل للمستخدمين **فور نشره** —
> لا EAS Build جديد ولا تحميل APK جديد. (تغييرات الـ native فقط
> تحتاج build: مكتبات جديدة، صلاحيات، versionCode.)

## الحالة الحالية

- Project ID: `4bbc5a6b-7958-49b6-9538-c34bbd4e52d4`
- APK الحالي: إصدار `1.3.0` / build `13`
- القناة: `preview`
- أول OTA منشور: `Initialize automatic OTA updates`
- Manifest: https://u.expo.dev/update/01a0d0c3-1340-7ada-a157-7255dacfd94b

## الإعداد لمرة واحدة (5 دقائق من جهازك)

```bash
cd website-app/apps/mobile
eas login
```

تم ربط المشروع بالفعل. تأكد فقط من وجود الإعدادات التالية في `app.json`:

- `updates.url` → `https://u.expo.dev/4bbc5a6b-7958-49b6-9538-c34bbd4e52d4`
- `extra.eas.projectId` → نفس الـ Project ID
- `runtimeVersion.policy` → `appVersion`
- `updates.checkAutomatically` → `ON_LOAD`

## النشر اليومي (30 ثانية)

بعد أي تعديل JS/UI محفوظ على `main`:

```bash
cd website-app/apps/mobile
eas update --branch preview --message "وصف التغيير" --non-interactive
```

- التطبيق يفحص تلقائياً عند الفتح وعند العودة إلى foreground.
- عند وجود تحديث: يتم تنزيله ثم إعادة تشغيل التطبيق تلقائياً.
- لا يحتاج الموظف إلى حذف التطبيق أو تنزيل APK جديد.
- بيانات AsyncStorage المحلية وبيانات Firestore لا تُمسح أثناء OTA update.
- زر **"التحقق من التحديثات"** في البروفايل يبقى متاحاً كخطة احتياطية.

## متى يحتاج APK جديد؟

يلزم build جديد فقط عند تغيير:

- Native modules أو linking.
- صلاحيات Android/iOS.
- Gradle/CocoaPods أو Expo SDK.
- `version` / `versionCode` / `runtimeVersion`.
- أي تغيير في assets لا يمكن تضمينه في JS OTA.

## Rollout والقنوات

- `preview`: القناة التي يستخدمها APK الحالي.
- `production`: بعد اختبار Preview، يمكن ربطها بنسخة production/TestFlight.
- لا تنشر إلى production قبل اختبار Preview على جهاز فعلي.

## أوامر التحقق

```bash
eas update:list --branch preview --json --non-interactive
eas build:view <BUILD_ID> --json
```

## ملاحظات

- القنوات في `eas.json`: `development` / `preview` / `production`.
- تسجيل توكن الدفع (`lib/push.ts`) يقرأ الـ projectId تلقائياً من نفس الموضع.
- لا أسرار في الكود: القنوات عامة، والتوثيق عبر حساب Expo فقط.
- راجع أيضًا [BUILD_TROUBLESHOOTING.md](BUILD_TROUBLESHOOTING.md) عند أي خطأ build أو شجرة.
