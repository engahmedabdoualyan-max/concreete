# Fimto Concrete — Mobile API (بنية API للجوال)

بنية جاهزة للاستخدام كخلفية (Backend) لتطبيقي Flutter:

- **تطبيق السائق (Driver App)** — قبول الرحلات، تحديث الحالة، إرسال GPS، تسجيل بون التسليم.
- **تطبيق العميل (Client App)** — متابعة الطلبات لحظياً، طلب خرسانة، تحميل الفاتورة الإلكترونية بـ QR.

تعمل نفس قاعدة بيانات الويب (Firebase Firestore — مشروع `concrete-erb`).

## الملفات

| الملف | الوصف |
|------|--------|
| `openapi.yaml` | توثيق كامل للـ API (OpenAPI 3.0) — يُستورد في Postman/Swagger |
| `server.js` | سيرفر Express جاهز للتشغيل، يقرأ/يكتب نفس Firestore |
| `README.md` | هذه الوثيقة |

## التشغيل

```bash
cd mobile-api
npm install express cors firebase-admin qrcode
export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json   # مفاتيح Firebase
export PORT=8080
node server.js
```

بدون ملف المفاتيح يعمل السيرفر بوضع **demo (في الذاكرة)** لاختبار البنية فوراً:

```bash
node server.js
curl http://localhost:8080/api/health
```

## المصادقة

التطبيقات تمرر رمزاً في الهيدر:

```
Authorization: Bearer dev-secret-change-me
```

(في الإنتاج: ضع `ADMIN_TOKEN` واستبدله بـ JWT لكل مستخدم.)

## نقاط النهاية

### تطبيق السائق
| الطريقة | المسار | الوظيفة |
|---------|--------|---------|
| GET | `/api/driver/trips?driver=Ahmed%20Ali` | رحلات اليوم للسائق |
| GET | `/api/driver/trips/:id` | تفاصيل رحلة + الموقع + الخلطة |
| PATCH | `/api/driver/trips/:id/status` | تغيير الحالة `PLANT→TRANSIT→UNLOADING→COMPLETED` |
| POST | `/api/driver/trips/:id/location` | إرسال GPS `{lat, lng}` — يغذي خريطة الأسطول |
| POST | `/api/driver/trips/:id/bon` | تسجيل بون التسليم `{bonNo}` |

### تطبيق العميل
| الطريقة | المسار | الوظيفة |
|---------|--------|---------|
| GET | `/api/client/orders?customerCode=C-009` | سجل طلبات العميل (بحالة مباشرة) |
| POST | `/api/client/orders` | طلب خرسانة جديد (`pending`) |
| GET | `/api/client/orders/:id/invoice` | فاتورة إلكترونية + QR (ZATCA) |

### المحطة / التتبع
| الطريقة | المسار | الوظيفة |
|---------|--------|---------|
| GET | `/api/plant/live` | مواقع الشاحنات الحية (لخريطة الأسطول في الويب) |

## ربط Flutter

البنية تعتمد فقط على `package:http` — مثال جلب رحلات السائق:

```dart
final res = await http.get(
  Uri.parse('https://concrete.fimtosoft.com/api/driver/trips?driver=$driver'),
  headers: {'Authorization': 'Bearer $token'},
);
final trips = jsonDecode(res.body) as List;
```

مثال إرسال الموقع كل 10 ثوانٍ:

```dart
http.post(
  Uri.parse('https://concrete.fimtosoft.com/api/driver/trips/$id/location'),
  headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
  body: jsonEncode({'lat': lat, 'lng': lng, 'timestamp': DateTime.now().toIso8601String()}),
);
```

## ملاحظة النشر

- `server.js` مستقل عن حزمة Vite — يُنشر كدالة (Vercel Serverless/Firebase Functions) أو على سيرفر Node منفصل.
- للجوال: يمكن تثبيت عنوان `https://concrete.fimtosoft.com/api` في الإعدادات.
