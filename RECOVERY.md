# 🔄 Tenant Recovery — دليل التشغيل

نسخة احتياطية مؤرخة (بالتاريخ والساعة) لكل مصنع/مشترك، بباسورد استرجاع،
كل 6 ساعات → أقصى خسارة محتملة ≈ 6 ساعات (أقل من يوم).

## النشر (Render — تلقائي من GitHub)

الـAPI الحي يعمل على Render ويُبنى تلقائياً من فرع `main`:

1. راجع وادمج فرع `feat/recovery-snapshots` في `main` (Pull Request).
2. Render يعيد البناء والنشر تلقائياً — تحقق بعدها:
   `curl -s https://concrete.fimtosoft.com/api/recovery/backups -H "Authorization: Bearer $TOKEN"`
   يجب أن يرد `401` (وليس `404`) — أي أن المسارات الجديدة حية.

## متغيرات البيئة (Render Dashboard → الخدمة → Environment)

| المتغير | القيمة |
|---|---|
| `RECOVERY_PASSWORD_HASH` | ناتج السكريبت أدناه (الصقه كما هو) |
| `CRON_SECRET` | نص عشوائي طويل (ولّده بالأمر أدناه) |
| `RECOVERY_DIR` | `/var/fimto-data/recovery` (مع قرص دائم، راجع أدناه) |
| `RECOVERY_RETENTION_COUNT` | `28` (4 نسخ/يوم × 7 أيام) |

## التجهيز (مرة واحدة، من جهاز المالك)

```bash
# 1. توليد بصمة الباسورد محلياً (الباسورد نفسه لا يُحفظ في أي ملف)
RECOVERY_PASSWORD=<recovery-password> node scripts/make-recovery-hash.mjs
# → يطبع سطر scrypt:...

# 2. في Vercel → Settings → Environment Variables:
RECOVERY_PASSWORD_HASH=scrypt:<paste>
CRON_SECRET=<random-secret>
#RECOVERY_DIR=backups/recovery          (افتراضي — للإنتاج الدائم استخدم تخزيناً دائماً، راجع الملاحظة)
#RECOVERY_RETENTION_COUNT=28            (افتراضي: 4 نسخ/يوم × 7 أيام)
```

## الجدولة التلقائية (كل 6 ساعات)

Render Dashboard → **Cron Jobs** → New (نفس الريبو/البيئة):

- Schedule (cron): `0 */6 * * *`
- Command:
  `curl -fsS https://concrete.fimtosoft.com/api/cron/recovery-backup -H "Authorization: Bearer $CRON_SECRET"`
- المتغيرات: نفس `CRON_SECRET` أعلاه.

> بديل: Vercel Cron على مشروع `concreete` بنفس المسار — لكن Render Cron
> أنظف (نفس مضيف الـAPI بدون قفزة إضافية).

## التخزين الدائم (مهم للإنتاج)

نظام ملفات Render مؤقت مع كل نشر — بدون قرص دائم تضيع النسخ:

1. Render Dashboard → الخدمة → **Disks** → Add Disk بالاسم `fimto-data` على المسار `/var/fimto-data`.
2. اضبط `RECOVERY_DIR=/var/fimto-data/recovery`.
3. بدون قرص دائم: لا تعتمد على الخاصية في الإنتاج (للتجربة فقط).

## الاستخدام اليدوي (SUPER_ADMIN فقط)

```bash
# نسخة فورية
curl -X POST $API/api/recovery/backup \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"recoveryPassword":"..."}'

# سرد النسخ (الأحدث أولاً: YYYYMMDD-HHMMSS.json)
curl $API/api/recovery/backups -H "Authorization: Bearer $TOKEN"

# استرجاع (يأخذ نسخة أمان تلقائياً قبل الكتابة)
curl -X POST $API/api/recovery/restore \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"file":"20261014-060000.json","confirmText":"RESTORE","recoveryPassword":"..."}'
```

## قواعد الأمان

- الباسورد لا يُخزن أبداً — فقط بصمة scrypt في متغير بيئة.
- بدون `RECOVERY_PASSWORD_HASH` في الإنتاج: كل المسارات ترد `503`.
- الاسترجاع لمستأجرك فقط، داخل transaction واحدة، ويُسجَّل في `audit_logs`.
- حد المعدل: نسخ 5/دقيقة، استرجاع 3/دقيقة لكل IP.
- ⚠️ جرّب الاسترجاع على staging أولاً. لا تسترجع على الإنتاج بدون نسخة أمان freshly taken (تُؤخذ تلقائياً، وتحقق من `safetyBackup` في الرد).
- الباسورد الذي يُشارك في الشات يُعتبر مكشوفاً — بدّله بعد التجهيز وأعد توليد البصمة.
