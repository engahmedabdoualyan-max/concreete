# 🔄 Tenant Recovery — دليل التشغيل

نسخة احتياطية مؤرخة (بالتاريخ والساعة) لكل مصنع/مشترك، بباسورد استرجاع،
كل 6 ساعات → أقصى خسارة محتملة ≈ 6 ساعات (أقل من يوم).

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

Vercel → Cron (يحتاج خطة تدعم أقل من يومي) على:

```
GET /api/cron/recovery-backup   +   Authorization: Bearer <CRON_SECRET>
0 0,6,12,18 * * *
```

> ⚠️ ملاحظة الإنتاج: نظام ملفات Vercel مؤقت — النسخ على `/tmp` أو `backups/`
> تضيع مع إعادة النشر. للإنتاج الحقيقي وجّه `RECOVERY_DIR` لتخزين دائم
> (S3/Supabase Storage) قبل الاعتماد على الخاصية.

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
