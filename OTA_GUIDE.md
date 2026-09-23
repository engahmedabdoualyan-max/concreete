# 📲 التحديث الهوائي OTA (EAS Update) — بدون إعادة بناء APK

> بعد هذا الإعداد، أي إصلاح JS/واجهات يصل للمستخدمين **فور نشره** —
> لا EAS Build جديد ولا تحميل APK جديد. (تغييرات الـ native فقط
> تحتاج build: مكتبات جديدة، صلاحيات، versionCode.)

## الإعداد لمرة واحدة (5 دقائق من جهازك)

```bash
cd website-app/apps/mobile
eas login
eas project:init        # يطبع Project ID
```

1. ضع الـ Project ID مكان `REPLACE_WITH_EXPO_PROJECT_ID` في موضعين بملف `app.json`:
   - `updates.url` → `https://u.expo.dev/<PROJECT_ID>`
   - `extra.eas.projectId`
2. ابنِ APK واحد أخير يتضمن قناة OTA:
```bash
eas build -p android --profile preview
```
3. ارفع الـ APK إلى `https://concrete.fimtosoft.com/downloads/fimto-android.apk`

## النشر اليومي (30 ثانية)

```bash
# بعد أي تعديل JS/UI ومراجعته على main:
eas update --branch preview --message "وصف التغيير"
# للنسخة المستقرة:
eas update --branch production --message "وصف التغيير"
```

- التطبيق يفحص تلقائياً عند الفتح (`ON_LOAD`) بفضل `checkAutomatically`.
- زر **"التحقق من التحديثات"** في البروفايل يفحص يدوياً ويعيد التشغيل فوراً.
- `runtimeVersion: appVersion` يقيّد التحديثات بقشرة 1.3.0 الأصلية —
  عند رفع `version` لاحقاً (1.4.0) ابنِ APK جديد مرة واحدة فقط.

## ملاحظات

- القنوات في `eas.json`: `development` / `preview` / `production`.
- تسجيل توكن الدفع (`lib/push.ts`) يقرأ الـ projectId تلقائياً من نفس الموضع —
  بعد ضبطه ستعمل إشعارات Expo فعلياً على الأجهزة.
- لا أسرار في الكود: القنوات عامة، والتوثيق عبر حساب Expo فقط.
