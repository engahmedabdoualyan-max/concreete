# 🖥️ Fimto Concrete — نسخة الديسكتوب (Windows EXE)

غلاف **Tauri v2** خفيف حول واجهة `website-app/` (نفس الكود — لا إعادة كتابة).
يُنتج مثبّت `setup.exe` (NSIS) لأجهزة غرفة الكنترول والميزان والمعمل.

> ملاحظة تسمية: المجلد `desktop-app-exe` (بشرطات) بدل `desktop app exe`
> لأن المسافات تكسر بناء Rust/Cargo — نفس المعنى، اسم آمن للأدوات.

## البنية

```
desktop-app-exe/
├── src-tauri/
│   ├── Cargo.toml          # حزمة fimto-concrete-desktop + إضافات store/opener/single-instance
│   ├── tauri.conf.json     # الواجهة = ../website-app/dist ، المثبت = NSIS
│   ├── capabilities/       # صلاحيات النافذة والمخزن
│   ├── icons/              # مولدة من website-app/public/apple-touch-icon.png
│   └── src/main.rs         # نسخة واحدة + تركيز النافذة
└── README.md               # هذا الملف
```

## البناء محلياً (Windows)

```powershell
# 1) المتطلبات: Node 22 + Rust stable + MSVC Build Tools + WebView2 (موجود افتراضياً في Win10/11)
# 2) من جذر المشروع:
npm install
npm run build:site                      # ينتج website-app/dist (وجبة Tauri)
npx tauri build --config desktop-app-exe/src-tauri/tauri.conf.json
# المخرج: desktop-app-exe/src-tauri/target/release/bundle/nsis/*.exe
```

الأسهل: ادفع tag مثل `desktop-v1.0.0` وسيبني GitHub Actions الـ EXE تلقائياً
(`.github/workflows/desktop-build.yml`) ويرفعه كـ Draft Release.

## أول تشغيل في المحطة

1. ثبّت الـ EXE على جهاز المحطة.
2. من شاشة الدخول افتح **🖥️ إعدادات الخادم** وأدخل رابط سيرفر المحطة
   (مثال `https://concrete.fimtosoft.com`) — يحفظ محلياً ويفحص الاتصال
   عبر `/api/health`، وتغييره يمسح الجلسة القديمة ويلزم دخولاً جديداً.
3. سجل الدخول بحساب المحطة — كل البيانات من نفس الباكند المركزي.

## إعدادات السيرفر (مهم)

- أضف origin الديسكتوب لقائمة CORS في بيئة الباكند:
  `CORS_ORIGINS=https://concrete.fimtosoft.com,http://tauri.localhost`
- CSP داخل `tauri.conf.json` يسمح `connect-src` لأي `https:`/`http:` لأن كل
  محطة لها سيرفر مختلف — مقبول للديسكتوب (التوكن لكل محطة على حدة)،
  ولا تضع أسراراً في كود الواجهة أبداً.

## حالة الملفات (2026-09-24)

| الملف | الحالة | المسار |
|---|---|---|
| Linux `.deb` (Ubuntu/Debian) | ✅ جاهز ومُتحقق منه | `installers/Fimto Concrete ERP_1.0.0_amd64.deb` |
| Windows `setup.exe` | ⏳ عبر CI (أمر واحد بالأسفل) | يُنزل من GitHub Releases |
| Linux `.AppImage` | ⏳ عبر CI (FUSE لا يعمل داخل Docker) | يُنزل من GitHub Releases |
| macOS `.dmg` | ⏳ عبر CI فقط (Apple تمنع البناء خارج أجهزتها) | يُنزل من GitHub Releases |

## إصدار ملفات ويندوز/ماك/AppImage (أمر واحد)

الـ workflow (`.github/workflows/desktop-build.yml`) يبني الأنظمة الثلاثة
على سيرفرات GitHub. من مجلد المشروع الأصلي:

```bash
git add desktop-app-exe website-app .github/workflows/desktop-build.yml
git commit -m "Desktop v1.0.0"
git push
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

بعد ~10 دقائق: GitHub → Releases → حمّل `setup.exe` و`dmg` و`AppImage`
(مسودة Draft تُراجع ثم تُنشر). ضعها بعدها في `public/downloads/` على
سيرفر الباكند لتفعيل أزرار التحميل في الموقع.

## قبل البيع للعملاء (إلزامي)

- [ ] شهادة توقيع كود OV (بدونها SmartScreen يحذر "ناشر غير معروف")
- [ ] اختبار على Windows 10 و11 نظيفين (طباعة + دخول + GPS)
- [ ] استبدال الأيقونات المؤقتة بشعار نهائي 1024×1024 ثم إعادة توليد `icons/`
- [ ] لاحقاً: التحديث التلقائي (tauri-plugin-updater + سيرفر نسخ) — غير مشمول الآن عمداً

## ما تم تعديله في الواجهة لدعم الديسكتوب

- `website-app/src/api/client.ts`: `resolveApiBase()` يقرأ تجاوز الرابط من
  `fimto_server_url` + دوال `setServerUrl/clearServerUrl` (تغيير السيرفر
  يمسح التوكنات القديمة).
- `website-app/src/components/ServerSettings.tsx` (جديد) + مُدمج في شاشة
  الدخول `LoginRegister.tsx`.
