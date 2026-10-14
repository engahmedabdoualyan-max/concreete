# legacy-archive — أرشيف للقراءة فقط (لا يُبنى ولا يُنشر)

نُقلت هذه الملفات هنا **نقلاً فقط (git mv)** — لا حذف لأي بيانات أو كود.
التاريخ محفوظ في git ويمكن إرجاع أي ملف متى شئت.

## ما هو حي (لا تلمسه)

| المسار | الدور |
|---|---|
| `src/app/`, `src/db/`, `src/lib/`, `src/proxy.ts`, `src/services/` | باك إند Next.js الحي |
| `root-legacy-ui/components/EInvoice.tsx` | مرجع لفحص `npm run security:zatca` (المسار محدث في السكريبت) |
| `src/server.ts`, `src/routes/` | خادم Realtime مستقل (غير موصول حالياً) |
| `api/` | legacy handlers تحت حماية `npm run security:legacy` |
| `website-app/` | **المصدر النشط الوحيد للموقع** |

## ما هو مؤرشف هنا

| المسار | السبب |
|---|---|
| `root-legacy-ui/` | نسخة الواجهة القديمة من جذر `src/` (مكررة مع `website-app/`) — صفر استيرادات من الباك إند/السكريبتات/الفحوصات |
| `mobile-api/` | خادم Express قديم لـ Flutter — غير مربوط (`WEBSITE_DEV_REQUIREMENTS.md`)؛ فحص ZATCA حُدّث للمسار الجديد |

## ملاحظات

- `security:zatca` يقرأ `legacy-archive/mobile-api/server.js` (تحقق fail-closed).
- `tsconfig.json` يستثني هذا المجلد من الفحص.
- تصميم الـDashboard الحي في `website-app/` لم يُمس إطلاقاً.
