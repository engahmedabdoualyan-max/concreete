# 📱 Fimto Concrete ERP — Mobile Field App

تطبيق ميداني موحد للسائقين ومندوبي المبيعات لنظام إدارة الخرسانة الجاهزة.

> **قبل أي بناء Android أو تعديل شجرة الحسابات:** اقرأ [BUILD_TROUBLESHOOTING.md](../../../BUILD_TROUBLESHOOTING.md) في جذر المشروع، فهو يوضح أخطاء EAS السابقة والحل الصحيح، ومصدر شجرة AppAccounts، ودورة إضافة R&D/HR.

## 🎯 الميزات الرئيسية

### 1. **دخول موحد ذكي (Unified Smart Login)**
- شاشة دخول واحدة (رقم الجوال + كلمة المرور)
- توجيه تلقائي بناءً على الدور:
  - **السائق** → واجهة الرحلات الميدانية
  - **المندوب** → واجهة طلبات المبيعات

### 2. **واجهة السائق (Driver View)**
- بطاقة رحلة كبيرة مع زر ديناميكي
- تسجيل البوابات السبعة بالترتيب:
  1. 🏭 أنا بالمحطة
  2. 📥 تحت البلانت للتعبئة
  3. 🚚 انطلقت للموقع
  4. 📍 وصل الموقع
  5. 💧 بدأت الصب
  6. ✅ انتهيت الصب
  7. 🔄 راجعت للمصنع
- تتبع GPS مستمر (حتى مع إغلاق الشاشة)
- Socket.io real-time updates

### 3. **واجهة المندوب (Sales Rep View)**
- نموذج طلب بسيط وسريع
- اختيار العميل، الموقع، الخلطة، الكمية
- التقاط موقع GPS للمقاول
- كروت ملونة لحالة الطلب:
  - 🟠 برتقالي = بانتظار الحسابات
  - 🟢 أخضر = معتمد للإنتاج
  - 🔵 أزرق = في الطريق
  - ✅ أخضر غامق = تم التسليم

## 🏗️ البنية التقنية

### Tech Stack
```
React Native (Expo)
├── expo-router (File-based routing)
├── nativewind (Tailwind CSS for RN)
├── @tanstack/react-query (Data fetching)
├── zustand (State management)
├── socket.io-client (Real-time updates)
├── expo-location (Background GPS)
└── expo-secure-store (JWT storage)
```

### Project Structure
```
apps/sales-driver-app/
├── app/
│   ├── _layout.tsx              # Root layout (auth routing)
│   ├── (auth)/
│   │   └── login.tsx            # Unified login screen
│   ├── (driver)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx            # Driver home (trip card)
│   │   └── history.tsx          # Trip history
│   └── (sales)/
│       ├── _layout.tsx
│       ├── index.tsx            # Sales home (booking form)
│       └── track.tsx            # Order tracking
├── components/
│   ├── ui/                      # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── StatusBadge.tsx
│   ├── driver/
│   │   └── TripCard.tsx         # Main driver UI
│   └── sales/
│       ├── BookingForm.tsx      # Order creation form
│       └── OrderCard.tsx        # Order status card
├── lib/
│   ├── api.ts                   # API client (JWT, refresh)
│   ├── socket.ts                # Socket.io client
│   ├── geolocation.ts           # Background GPS service
│   └── storage.ts               # Secure storage wrapper
├── store/
│   └── auth-store.ts            # Auth state (Zustand)
├── types/
│   └── index.ts                 # TypeScript types
└── assets/                      # App icons, splash
```

## 🚀 التشغيل

### المتطلبات
- Node.js 18+
- npm أو yarn
- Expo CLI: `npm install -g expo-cli`

### التثبيت
```bash
cd apps/sales-driver-app
npm install
```

### التطوير
```bash
npm start
```

### البناء للتشغيل
```bash
# Android
npm run build:android

# iOS
npm run build:ios
```

## 🔐 المصادقة

### JWT Flow
1. تسجيل الدخول عبر `/api/auth/login`
2. تخزين `accessToken` و `refreshToken` في SecureStore
3. إرسال `accessToken` مع كل طلب API
4. عند انتهاء صلاحية التوكن → `/api/auth/refresh`
5. عند فشل الـ refresh → تسجيل الخروج

### Role-Based Routing
```typescript
// في app/_layout.tsx
if (isDriver(user)) return <Redirect href="/(driver)" />
if (isSalesRep(user)) return <Redirect href="/(sales)" />
```

## 📍 Background GPS

### Expo Location Configuration
```typescript
// expo-location مع خلفية مستمرة
await Location.startLocationUpdatesAsync(TASK_NAME, {
  accuracy: Location.Accuracy.High,
  timeInterval: 10000, // 10 seconds
  distanceInterval: 50, // 50 meters
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: "تتبع موقع الشاحنة",
    notificationBody: "يتم تتبع موقعك",
  },
});
```

### Socket.io Events
```typescript
// إرسال تحديث الموقع
socket.emit("driver:location_update", {
  tripId,
  vehicleId,
  driverId,
  latitude,
  longitude,
  deviceSpeedKmh,
  headingDegrees,
  accuracyMetres,
  isMoving,
  capturedAt: new Date().toISOString(),
});

// استقبال تحديثات الحالة
socket.on("trip:checkpoint_updated", (data) => {
  // تحديث واجهة المستخدم
});
```

## 🎨 فلسفة التصميم

### البساطة المطلقة
- واجهات نظيفة بدون تشتيت
- أزرار كبيرة (48px+ touch targets)
- خطوط عربية واضحة
- ألوان عالية التباين

### RTL Support
```typescript
// جميع النصوص بالعربية
<Text className="text-right">مرحباً</Text>

// NativeWind يدعم RTL تلقائياً
<View className="flex-row justify-between">
```

### Mobile-First
- تصميم للشاشات الصغيرة أولاً
- أيقونات واضحة (emoji بدلاً من SVG)
- إيماءات بسيطة (tap فقط)
- بدون قوائم معقدة

## 🔗 API Endpoints

### Driver Endpoints
```typescript
GET  /api/trips/my-active          // الرحلة النشطة الحالية
POST /api/trips/:id/checkpoint     // تسجيل بوابة
POST /api/trips/:id/location       // تحديث موقع GPS
```

### Sales Endpoints
```typescript
GET  /api/orders/my-orders         // طلباتي
POST /api/orders                   // إنشاء طلب جديد
GET  /api/orders/:id/status        // حالة الطلب
GET  /api/clients                  // قائمة العملاء
GET  /api/clients/:id/sites        // مواقع العميل
GET  /api/mix-designs              // الخلطات المتاحة
```

## 📊 Socket.io Events

### Outbound (Mobile → Server)
```typescript
driver:location_update    // تحديث موقع السائق
```

### Inbound (Server → Mobile)
```typescript
fleet:vehicle_position    // تحديث موقع الشاحنة
trip:checkpoint_updated   // تحديث بوابة الرحلة
order:approved            // اعتماد الطلب
order:credit_hold         // إيقاف ائتماني
driver:notification       // إشعار للسائق
```

## 🧪 الاختبار

### Mock Data
للاختبار بدون backend حقيقي، يمكن استخدام:
```typescript
// في lib/api.ts
const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === "true";

if (USE_MOCK) {
  return mockData; // بيانات وهمية
}
```

### Testing on Device
```bash
# Android
npm run android

# iOS
npm run ios

# Web (للاختبار السريع)
npm run web
```

## 📦 النشر

### EAS Build (Expo Application Services)
```bash
npm install -g eas-cli
eas build --platform android
eas build --platform ios
```

### Self-Hosted
```bash
# Android APK
expo build:android -t apk

# iOS IPA
expo build:ios -t archive
```

## 🔧 Environment Variables

```bash
# .env
EXPO_PUBLIC_API_URL=https://concrete.fimtosoft.com/api
EXPO_PUBLIC_SOCKET_URL=https://concrete.fimtosoft.com
EXPO_PUBLIC_USE_MOCK=false
```

## 📝 ملاحظات مهمة

### Permissions
- **iOS**: يتطلب `NSLocationAlwaysAndWhenInUseUsageDescription`
- **Android**: يتطلب `ACCESS_BACKGROUND_LOCATION`

### Performance
- React Query caching (5 minutes stale time)
- Socket.io reconnection (10 attempts)
- GPS throttling (10 seconds interval)

### Security
- JWT stored in SecureStore (encrypted)
- HTTPS only for API calls
- Biometric auth (TODO)

## 🎯 Roadmap

### Phase 3 (Coming Soon)
- [ ] Push notifications (FCM/APNs)
- [ ] Offline mode (AsyncStorage sync)
- [ ] Photo upload (delivery tickets)
- [ ] Signature capture
- [ ] Multi-language (EN/AR)
- [ ] Biometric authentication
- [ ] Dark mode

## 📞 الدعم

للمساعدة أو الاستفسارات:
- Email: support@fimtosoft.com
- Web: https://concrete.fimtosoft.com

---

**Fimto Soft — Concrete Plant ERP**  
*Al-Sharqia, Saudi Arabia*
