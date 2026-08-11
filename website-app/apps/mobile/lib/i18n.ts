/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE ERP MOBILE — Internationalization
 *  apps/sales-driver-app/lib/i18n.ts
 * ============================================================
 *
 *  SUPPORTED LOCALES (12)
 *  ─────────────────────────────────────────────────────────
 *  Primary (default):  English (en)
 *  Supported:          Arabic (ar), Urdu (ur), Hindi (hi),
 *                      Filipino (fil), Chinese (zh),
 *                      Japanese (ja), Russian (ru),
 *                      Bengali (bn), Nepali (ne),
 *                      Italian (it), German (de)
 *
 *  USAGE
 *  ─────────────────────────────────────────────────────────
 *  import { useT } from "@/lib/i18n";
 *  const { t, locale, setLocale } = useT();
 *  <Text>{t("login.title")}</Text>
 *
 *  Translations are a flat string-key map per locale. Missing
 *  keys fall back to the English string so the app never shows
 *  a raw key to the user.
 * ============================================================
 */

import { useState, useCallback, useEffect } from "react";
import { getItem, setItem } from "./storage";

// ─── Supported Locales ────────────────────────────────────────────────────────

export const SUPPORTED_LOCALES = [
  "en",   // English (primary / fallback)
  "ar",   // العربية — Arabic
  "ur",   // اردو — Urdu
  "hi",   // हिन्दी — Hindi
  "fil",  // Filipino
  "zh",   // 中文 — Chinese
  "ja",   // 日本語 — Japanese
  "ru",   // Русский — Russian
  "bn",   // বাংলা — Bengali
  "ne",   // नेपाली — Nepali
  "it",   // Italiano — Italian
  "de",   // Deutsch — German
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Locales whose script is written right-to-left.
 * The UI should mirror flex directions and padding when one of these is active.
 */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ar", "ur"]);

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  ur: "اردو",
  hi: "हिन्दी",
  fil: "Filipino",
  zh: "中文",
  ja: "日本語",
  ru: "Русский",
  bn: "বাংলা",
  ne: "नेपाली",
  it: "Italiano",
  de: "Deutsch",
};

// ─── Translation Dictionaries ─────────────────────────────────────────────────

/**
 * Flat key → value map. Keys are namespaced by screen:
 *   login.*     — Login screen
 *   driver.*    — Driver home / trip
 *   sales.*     — Sales booking
 *   common.*    — Buttons, status labels, errors
 */
export type TranslationKey = keyof typeof en;

const en = {
  // ── Login ───────────────────────────────────────────────────────────────
  "login.title": "Fimto Concrete",
  "login.subtitle": "Ready-Mix ERP — Field Operations",
  "login.phone": "Phone Number",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "Password",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "Sign In",
  "login.error": "Invalid phone or password",
  "login.help": "Contact your system administrator if you cannot sign in.",

  // ── Driver ──────────────────────────────────────────────────────────────
  "driver.title": "Driver Trip",
  "driver.noTrip": "No active trip",
  "driver.noTripHint": "You will be notified when a new trip is assigned.",
  "driver.refresh": "Refresh",
  "driver.tripNumber": "Trip Number",
  "driver.client": "Client",
  "driver.site": "Site",
  "driver.mixDesign": "Mix Design",
  "driver.vehicle": "Vehicle",
  "driver.progress": "Trip Progress",
  "driver.status": "Current Status",
  "driver.ticket": "Delivery Ticket Number",
  "driver.completed": "Trip completed",
  "driver.completedHint": "Thank you — you can return to the plant.",
  "driver.gpsActive": "GPS active — location being tracked",

  // Checkpoint button labels
  "driver.step.ARR_PLANT": "At Plant",
  "driver.step.ARR_BSTC": "Loading",
  "driver.step.DEP_PLANT": "Departed to Site",
  "driver.step.ARR_SITE": "Arrived at Site",
  "driver.step.POUR_START": "Pour Started",
  "driver.step.DEP_SITE": "Finished Pour",
  "driver.step.RETURN_PLANT": "Return to Plant",

  // ── Sales ───────────────────────────────────────────────────────────────
  "sales.title": "Sales Orders",
  "sales.newOrder": "+ New Order",
  "sales.cancel": "Cancel",
  "sales.myOrders": "My Orders",
  "sales.pending": "Pending Finance",
  "sales.approved": "Approved for Production",
  "sales.empty": "No orders yet",

  // Booking form
  "sales.booking.client": "Select Client",
  "sales.booking.site": "Select Pour Site",
  "sales.booking.mixDesign": "Select Mix Design",
  "sales.booking.volume": "Volume (m³)",
  "sales.booking.scheduleDate": "Pour Date",
  "sales.booking.captureLocation": "Capture Site Location",
  "sales.booking.locationCaptured": "Location Captured",
  "sales.booking.submit": "Submit Order",

  // Order tracking
  "sales.track.stages.created": "Order created",
  "sales.track.stages.pending": "Pending finance approval",
  "sales.track.stages.approved": "Approved by finance",
  "sales.track.stages.production": "In production",
  "sales.track.stages.transit": "In transit to site",
  "sales.track.stages.delivered": "Delivered",

  // ── Common ──────────────────────────────────────────────────────────────
  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.loading": "Loading...",
  "common.error": "Something went wrong",
  "common.retry": "Retry",
  "common.yes": "Yes",
  "common.no": "No",
  "common.logout": "Sign Out",
  "common.language": "Language",
  "common.welcome": "Hello",

  // ── Profile / Account Deletion (Google Play compliance) ──────────────────
  "profile.title": "Profile & Settings",
  "profile.account": "Account",
  "profile.deleteAccount": "Delete My Account & Personal Data",
  "profile.deleteWarningTitle": "Delete your account?",
  "profile.deleteWarning":
    "This permanently deletes your account and personal data (name, phone, email, login tokens) from our servers. This action cannot be undone.",
  "profile.deleteConfirmLabel": "Type DELETE to confirm",
  "profile.deleteConfirmPlaceholder": "DELETE",
  "profile.deleteConfirmButton": "Permanently Delete",
  "profile.deleteCancel": "Cancel",
  "profile.deleteSuccess": "Your account and personal data have been permanently deleted.",
  "profile.deleteError": "Could not delete your account. Please try again or contact support.",
  "profile.webDeletionInfo": "Not logged in? You can request deletion from our website.",
  "profile.webDeletionLink": "Open web deletion form",

  // ── Background Location Disclosure (privacy compliance) ──────────────────
  "disclosure.title": "Background Location Notice",
  "disclosure.body":
    "This application collects real-time background location data even when the app is closed or not in active use to enable fleet routing tracking, live ETA computations, and safety evaluations on the plant dashboard.",
  "disclosure.accept": "I Understand & Allow",
  "disclosure.decline": "Not Now",

  // ── Offline sync ─────────────────────────────────────────────────────────
  "offline.banner": "Offline — events are being saved on your device",
  "offline.syncing": "Back online — syncing saved events…",
  "offline.synced": "All saved events synced",

  // ── Download buttons (native app installs) ───────────────────────────────
  "download.android": "Download Android APK",
  "download.ios": "Download iOS App",
  "download.failed": "Download failed",
  "download.androidError": "Unable to open the Android download link. Try again later.",
  "download.iosError": "Unable to open the App Store link. Try again later.",
} as const;

// ─── Arabic (ar) ──────────────────────────────────────────────────────────────

const ar: Record<TranslationKey, string> = {
  "login.title": "فيمتو للخرسانة",
  "login.subtitle": "نظام الخرسانة الجاهزة — العمليات الميدانية",
  "login.phone": "رقم الجوال",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "كلمة المرور",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "تسجيل الدخول",
  "login.error": "رقم الجوال أو كلمة المرور غير صحيحة",
  "login.help": "تواصل مع مسؤول النظام في حال تعذر الدخول.",

  "driver.title": "رحلة السائق",
  "driver.noTrip": "لا توجد رحلة نشطة",
  "driver.noTripHint": "سيتم إخطارك عند تعيين رحلة جديدة.",
  "driver.refresh": "تحديث",
  "driver.tripNumber": "رقم الرحلة",
  "driver.client": "العميل",
  "driver.site": "الموقع",
  "driver.mixDesign": "الخلطة",
  "driver.vehicle": "الشاحنة",
  "driver.progress": "تقدم الرحلة",
  "driver.status": "الحالة الحالية",
  "driver.ticket": "رقم تذكرة التسليم",
  "driver.completed": "تم إنهاء الرحلة",
  "driver.completedHint": "شكراً لك، يمكنك العودة للمحطة.",
  "driver.gpsActive": "GPS نشط — يتم تتبع الموقع",

  "driver.step.ARR_PLANT": "أنا بالمحطة",
  "driver.step.ARR_BSTC": "تحت البلانت للتعبئة",
  "driver.step.DEP_PLANT": "انطلقت للموقع",
  "driver.step.ARR_SITE": "وصلت الموقع",
  "driver.step.POUR_START": "بدأت الصب",
  "driver.step.DEP_SITE": "انتهيت الصب",
  "driver.step.RETURN_PLANT": "راجعت للمصنع",

  "sales.title": "طلبات المبيعات",
  "sales.newOrder": "➕ طلب جديد",
  "sales.cancel": "❌ إلغاء",
  "sales.myOrders": "طلباتي",
  "sales.pending": "بانتظار الحسابات",
  "sales.approved": "معتمد للإنتاج",
  "sales.empty": "لا توجد طلبات حالياً",

  "sales.booking.client": "اختر العميل",
  "sales.booking.site": "اختر موقع الصب",
  "sales.booking.mixDesign": "اختر الخلطة",
  "sales.booking.volume": "الكمية (م³)",
  "sales.booking.scheduleDate": "تاريخ الصب",
  "sales.booking.captureLocation": "📍 التقاط موقع الصب",
  "sales.booking.locationCaptured": "📍 تم الالتقاط",
  "sales.booking.submit": "إرسال الطلب",

  "sales.track.stages.created": "تم إنشاء الطلب",
  "sales.track.stages.pending": "بانتظار موافقة الحسابات",
  "sales.track.stages.approved": "معتمد من الحسابات",
  "sales.track.stages.production": "قيد الإنتاج",
  "sales.track.stages.transit": "في الطريق للموقع",
  "sales.track.stages.delivered": "تم التسليم",

  "common.ok": "موافق",
  "common.cancel": "إلغاء",
  "common.save": "حفظ",
  "common.close": "إغلاق",
  "common.loading": "جارِ التحميل...",
  "common.error": "حدث خطأ ما",
  "common.retry": "إعادة المحاولة",
  "common.yes": "نعم",
  "common.no": "لا",
  "common.logout": "تسجيل الخروج",
  "common.language": "اللغة",
  "common.welcome": "مرحباً",

  "profile.title": "الملف الشخصي والإعدادات",
  "profile.account": "الحساب",
  "profile.deleteAccount": "حذف حسابي وبياناتي الشخصية",
  "profile.deleteWarningTitle": "هل تريد حذف حسابك؟",
  "profile.deleteWarning":
    "سيؤدي هذا إلى حذف حسابك وبياناتك الشخصية نهائياً (الاسم، الجوال، البريد، رموز الدخول) من خوادمنا. لا يمكن التراجع عن هذا الإجراء.",
  "profile.deleteConfirmLabel": "اكتب DELETE للتأكيد",
  "profile.deleteConfirmPlaceholder": "DELETE",
  "profile.deleteConfirmButton": "حذف نهائي",
  "profile.deleteCancel": "إلغاء",
  "profile.deleteSuccess": "تم حذف حسابك وبياناتك الشخصية نهائياً.",
  "profile.deleteError": "تعذر حذف الحساب. يرجى المحاولة مجدداً أو التواصل مع الدعم.",
  "profile.webDeletionInfo": "لست مسجلاً للدخول؟ يمكنك طلب الحذف من موقعنا الإلكتروني.",
  "profile.webDeletionLink": "فتح نموذج الحذف على الويب",

  "disclosure.title": "إشعار تتبع الموقع في الخلفية",
  "disclosure.body":
    "يقوم هذا التطبيق بجمع بيانات الموقع في الوقت الفعلي في الخلفية حتى عند إغلاق التطبيق أو عدم استخدامه بشكل فعّال، وذلك لتمكين تتبع مسارات الأسطول، وحساب أوقات الوصول المتوقعة مباشرة، وتقييمات السلامة على لوحة تحكم المصنع.",
  "disclosure.accept": "أفهم وأوافق",
  "disclosure.decline": "ليس الآن",

  "offline.banner": "غير متصل — يتم حفظ الأحداث على جهازك",
  "offline.syncing": "عاد الاتصال — جارٍ مزامنة الأحداث المحفوظة…",
  "offline.synced": "تمت مزامنة جميع الأحداث المحفوظة",

  // ── Download buttons ──────────────────────────────────────────────────────
  "download.android": "تنزيل APK أندرويد",
  "download.ios": "تنزيل تطبيق iOS",
  "download.failed": "فشل التحميل",
  "download.androidError": "تعذّر فتح رابط تنزيل أندرويد. حاول مرة أخرى لاحقاً.",
  "download.iosError": "تعذّر فتح رابط متجر التطبيقات. حاول مرة أخرى لاحقاً.",
};

// ─── Urdu (ur) ────────────────────────────────────────────────────────────────

const ur: Record<TranslationKey, string> = {
  "login.title": "فیمٹو کنکریٹ",
  "login.subtitle": "ریڈی مکس ای آر پی — فیلڈ آپریشنز",
  "login.phone": "فون نمبر",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "پاس ورڈ",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "سائن ان",
  "login.error": "غلط فون نمبر یا پاس ورڈ",
  "login.help": "اگر سائن ان نہیں ہو رہا تو سسٹم ایڈمنسٹریٹر سے رابطہ کریں۔",

  "driver.title": "ڈرائیور ٹرپ",
  "driver.noTrip": "کوئی فعال ٹرپ نہیں",
  "driver.noTripHint": "نیا ٹرپ مختص ہونے پر آپ کو مطلع کیا جائے گا۔",
  "driver.refresh": "ریفریش",
  "driver.tripNumber": "ٹرپ نمبر",
  "driver.client": "کلائنٹ",
  "driver.site": "سائٹ",
  "driver.mixDesign": "مکس ڈیزائن",
  "driver.vehicle": "گاڑی",
  "driver.progress": "ٹرپ کی پیشرفت",
  "driver.status": "موجودہ حالت",
  "driver.ticket": "ڈیلیوری ٹکٹ نمبر",
  "driver.completed": "ٹرپ مکمل ہو گئی",
  "driver.completedHint": "شکریہ — آپ پلانٹ واپس جا سکتے ہیں۔",
  "driver.gpsActive": "GPS فعال — مقام ٹریک ہو رہا ہے",

  "driver.step.ARR_PLANT": "پلانٹ پر",
  "driver.step.ARR_BSTC": "لوڈنگ",
  "driver.step.DEP_PLANT": "سائٹ کی طرف روانہ",
  "driver.step.ARR_SITE": "سائٹ پر پہنچ گیا",
  "driver.step.POUR_START": "ڈھلائی شروع",
  "driver.step.DEP_SITE": "ڈھلائی مکمل",
  "driver.step.RETURN_PLANT": "پلانٹ واپسی",

  "sales.title": "سیلز آرڈرز",
  "sales.newOrder": "➕ نیا آرڈر",
  "sales.cancel": "❌ منسوخ",
  "sales.myOrders": "میرے آرڈرز",
  "sales.pending": "فنانش کی منظوری کا انتظار",
  "sales.approved": "پروڈکشن کے لیے منظور",
  "sales.empty": "ابھی تک کوئی آرڈر نہیں",

  "sales.booking.client": "کلائنٹ منتخب کریں",
  "sales.booking.site": "پور سائٹ منتخب کریں",
  "sales.booking.mixDesign": "مکس ڈیزائن منتخب کریں",
  "sales.booking.volume": "حجم (m³)",
  "sales.booking.scheduleDate": "پور کی تاریخ",
  "sales.booking.captureLocation": "📍 سائٹ کا مقام کیپچر کریں",
  "sales.booking.locationCaptured": "📍 مقام کیپچر ہو گیا",
  "sales.booking.submit": "آرڈر جمع کرائیں",

  "sales.track.stages.created": "آرڈر بنایا گیا",
  "sales.track.stages.pending": "فنانش کی منظوری کا انتظار",
  "sales.track.stages.approved": "فنانش سے منظور",
  "sales.track.stages.production": "پروڈکشن میں",
  "sales.track.stages.transit": "سائٹ کی طرف",
  "sales.track.stages.delivered": "پہنچا دیا گیا",

  "common.ok": "ٹھیک ہے",
  "common.cancel": "منسوخ",
  "common.save": "محفوظ کریں",
  "common.close": "بند کریں",
  "common.loading": "لوڈ ہو رہا ہے...",
  "common.error": "کچھ غلط ہو گیا",
  "common.retry": "دوبارہ کوشش",
  "common.yes": "ہاں",
  "common.no": "نہیں",
  "common.logout": "سائن آؤٹ",
  "common.language": "زبان",
  "common.welcome": "خوش آمدید",

  "profile.title": "پروفائل اور ترتیبات",
  "profile.account": "اکاؤنٹ",
  "profile.deleteAccount": "میرا اکاؤنٹ اور ذاتی ڈیٹا حذف کریں",
  "profile.deleteWarningTitle": "کیا آپ اپنا اکاؤنٹ حذف کرنا چاہتے ہیں؟",
  "profile.deleteWarning":
    "یہ آپ کے اکاؤنٹ اور ذاتی ڈیٹا (نام، فون، ای میل، لاگ اِن ٹوکنز) کو ہمارے سرورز سے مستقل طور پر حذف کر دے گا۔ یہ عمل واپس نہیں ہو سکتا۔",
  "profile.deleteConfirmLabel": "تصدیق کے لیے DELETE ٹائپ کریں",
  "profile.deleteConfirmPlaceholder": "DELETE",
  "profile.deleteConfirmButton": "مستقل طور پر حذف کریں",
  "profile.deleteCancel": "منسوخ",
  "profile.deleteSuccess": "آپ کا اکاؤنٹ اور ذاتی ڈیٹا مستقل طور پر حذف کر دیا گیا ہے۔",
  "profile.deleteError": "اکاؤنٹ حذف نہیں ہو سکا۔ دوبارہ کوشش کریں یا سپورٹ سے رابطہ کریں۔",
  "profile.webDeletionInfo": "لاگ اِن نہیں ہیں؟ آپ ہماری ویب سائٹ سے حذف کی درخواست کر سکتے ہیں۔",
  "profile.webDeletionLink": "ویب ڈیلیٹ فارم کھولیں",

  "disclosure.title": "پس منظر مقام کی اطلاع",
  "disclosure.body":
    "یہ ایپلیکیشن حقیقی وقت میں پس منظر کے مقام کا ڈیٹا اکٹھا کرتی ہے چاہے ایپ بند ہو یا فعال استعمال میں نہ ہو، تاکہ فلیٹ روٹنگ ٹریکنگ، لائیو ETA حساب، اور پلانٹ ڈیش بورڈ پر حفاظتی جائزوں کو ممکن بنایا جا سکے۔",
  "disclosure.accept": "میں سمجھتا ہوں اور اجازت دیتا ہوں",
  "disclosure.decline": "ابھی نہیں",

  "offline.banner": "آف لائن — واقعات آپ کے آلے پر محفوظ ہو رہے ہیں",
  "offline.syncing": "دوبارہ آن لائن — محفوظ واقعات کی مطابقت پذیری جاری ہے…",
  "offline.synced": "تمام محفوظ واقعات ہم آہنگ ہو گئے",

  // ── Download buttons ──────────────────────────────────────────────────────
  "download.android": "انڈروڈ ایپ ک ٹیلنا",
  "download.ios": "iOS ایپ ڈاؤن لوڈ کریں",
  "download.failed": "ڈاؤن لوڈ فیل ہو گیا",
  "download.androidError": "انڈروڈ ڈاؤن لوڈ لینک کھل نہیں سکا۔ براہ کرم دوبارہ کوشش کریں۔",
  "download.iosError": "ایپ اسٹور لینک کھل نہیں سکا۔ براہ کرم دوبارہ کوشش کریں۔",
};

// ─── Hindi (hi) ───────────────────────────────────────────────────────────────

const hi: Partial<Record<TranslationKey, string>> = {
  "login.title": "फिम्तो कंक्रीट",
  "login.subtitle": "रेडी-मिक्स ERP — फील्ड संचालन",
  "login.phone": "फ़ोन नंबर",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "पासवर्ड",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "साइन इन",
  "login.error": "गलत फ़ोन या पासवर्ड",
  "login.help": "साइन इन करने में समस्या होने पर सिस्टम व्यवस्थापक से संपर्क करें।",

  "driver.title": "ड्राइवर ट्रिप",
  "driver.noTrip": "कोई सक्रिय ट्रिप नहीं",
  "driver.noTripHint": "नई ट्रिप आवंटित होने पर आपको सूचित किया जाएगा।",
  "driver.refresh": "रीफ्रेश",
  "driver.tripNumber": "ट्रिप नंबर",
  "driver.client": "ग्राहक",
  "driver.site": "साइट",
  "driver.mixDesign": "मिक्स डिज़ाइन",
  "driver.vehicle": "वाहन",
  "driver.progress": "ट्रिप प्रगति",
  "driver.status": "वर्तमान स्थिति",
  "driver.ticket": "डिलीवरी टिकट नंबर",
  "driver.completed": "ट्रिप पूरी हुई",
  "driver.completedHint": "धन्यवाद — आप प्लांट वापस जा सकते हैं।",
  "driver.gpsActive": "GPS सक्रिय — स्थान ट्रैक हो रहा है",

  "driver.step.ARR_PLANT": "प्लांट पर",
  "driver.step.ARR_BSTC": "लोडिंग",
  "driver.step.DEP_PLANT": "साइट के लिए रवाना",
  "driver.step.ARR_SITE": "साइट पर पहुँचे",
  "driver.step.POUR_START": "डालना शुरू",
  "driver.step.DEP_SITE": "डालना पूरा",
  "driver.step.RETURN_PLANT": "प्लांट वापसी",

  "sales.title": "बिक्री आदेश",
  "sales.newOrder": "➕ नया आदेश",
  "sales.cancel": "❌ रद्द",
  "sales.myOrders": "मेरे आदेश",
  "sales.pending": "वित्त अनुमोदन की प्रतीक्षा में",
  "sales.approved": "उत्पादन के लिए स्वीकृत",
  "sales.empty": "अभी तक कोई आदेश नहीं",

  "sales.booking.client": "ग्राहक चुनें",
  "sales.booking.site": "डालने की साइट चुनें",
  "sales.booking.mixDesign": "मिक्स डिज़ाइन चुनें",
  "sales.booking.volume": "मात्रा (m³)",
  "sales.booking.scheduleDate": "डालने की तिथि",
  "sales.booking.captureLocation": "📍 साइट का स्थान कैप्चर करें",
  "sales.booking.locationCaptured": "📍 स्थान कैप्चर हो गया",
  "sales.booking.submit": "आदेश जमा करें",

  "sales.track.stages.created": "आदेश बनाया गया",
  "sales.track.stages.pending": "वित्त अनुमोदन की प्रतीक्षा में",
  "sales.track.stages.approved": "वित्त से स्वीकृत",
  "sales.track.stages.production": "उत्पादन में",
  "sales.track.stages.transit": "साइट की ओर",
  "sales.track.stages.delivered": "डिलीवर हो गया",

  "common.ok": "ठीक",
  "common.cancel": "रद्द",
  "common.save": "सहेजें",
  "common.close": "बंद",
  "common.loading": "लोड हो रहा है...",
  "common.error": "कुछ गलत हो गया",
  "common.retry": "पुनः प्रयास",
  "common.yes": "हाँ",
  "common.no": "नहीं",
  "common.logout": "साइन आउट",
  "common.language": "भाषा",
  "common.welcome": "नमस्ते",
};

// ─── Filipino (fil) ───────────────────────────────────────────────────────────

const fil: Partial<Record<TranslationKey, string>> = {
  "login.title": "Fimto Concrete",
  "login.subtitle": "Ready-Mix ERP — Field Operations",
  "login.phone": "Phone Number",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "Password",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "Mag-sign In",
  "login.error": "Maling phone o password",
  "login.help": "Kontakin ang system administrator kung hindi makapag-sign in.",

  "driver.title": "Trip ng Driver",
  "driver.noTrip": "Walang aktibong trip",
  "driver.noTripHint": "Aabisuhan ka kapag may bagong trip.",
  "driver.refresh": "I-refresh",
  "driver.tripNumber": "Trip Number",
  "driver.client": "Client",
  "driver.site": "Site",
  "driver.mixDesign": "Mix Design",
  "driver.vehicle": "Sasakyan",
  "driver.progress": "Progreso ng Trip",
  "driver.status": "Kasalukuyang Status",
  "driver.ticket": "Delivery Ticket Number",
  "driver.completed": "Tapos na ang trip",
  "driver.completedHint": "Salamat — pwede ka nang bumalik sa plant.",
  "driver.gpsActive": "GPS aktibo — tine-track ang lokasyon",

  "driver.step.ARR_PLANT": "Nasa Plant",
  "driver.step.ARR_BSTC": "Naglo-load",
  "driver.step.DEP_PLANT": "Umalis papunta sa Site",
  "driver.step.ARR_SITE": "Dumating sa Site",
  "driver.step.POUR_START": "Nagsimula ang Pagbubuhos",
  "driver.step.DEP_SITE": "Tapos na ang Pagbubuhos",
  "driver.step.RETURN_PLANT": "Bumalik sa Plant",

  "sales.title": "Mga Sales Order",
  "sales.newOrder": "➕ Bagong Order",
  "sales.cancel": "❌ Kanselahin",
  "sales.myOrders": "Mga Order Ko",
  "sales.pending": "Hinihintay ang Finance",
  "sales.approved": "Naaprubahan para sa Production",
  "sales.empty": "Wala pang order",

  "sales.booking.client": "Pumili ng Client",
  "sales.booking.site": "Pumili ng Pour Site",
  "sales.booking.mixDesign": "Pumili ng Mix Design",
  "sales.booking.volume": "Volume (m³)",
  "sales.booking.scheduleDate": "Petsa ng Pour",
  "sales.booking.captureLocation": "📍 I-capture ang Lokasyon ng Site",
  "sales.booking.locationCaptured": "📍 Na-capture na ang Lokasyon",
  "sales.booking.submit": "Isumite ang Order",

  "sales.track.stages.created": "Ginawa ang order",
  "sales.track.stages.pending": "Hinihintay ang finance approval",
  "sales.track.stages.approved": "Naaprubahan ng finance",
  "sales.track.stages.production": "Nasa production",
  "sales.track.stages.transit": "Nasa daan papunta sa site",
  "sales.track.stages.delivered": "Naihatid na",

  "common.ok": "OK",
  "common.cancel": "Kanselahin",
  "common.save": "I-save",
  "common.close": "Isara",
  "common.loading": "Naglo-load...",
  "common.error": "May nangyaring mali",
  "common.retry": "Subukan muli",
  "common.yes": "Oo",
  "common.no": "Hindi",
  "common.logout": "Mag-sign Out",
  "common.language": "Wika",
  "common.welcome": "Kamusta",
};

// ─── Chinese (zh) ─────────────────────────────────────────────────────────────

const zh: Partial<Record<TranslationKey, string>> = {
  "login.title": "菲姆托混凝土",
  "login.subtitle": "预拌 ERP — 现场运营",
  "login.phone": "手机号码",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "密码",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "登录",
  "login.error": "手机号或密码错误",
  "login.help": "无法登录请联系系统管理员。",

  "driver.title": "司机行程",
  "driver.noTrip": "没有活跃行程",
  "driver.noTripHint": "分配新行程时您将收到通知。",
  "driver.refresh": "刷新",
  "driver.tripNumber": "行程号",
  "driver.client": "客户",
  "driver.site": "工地",
  "driver.mixDesign": "配比",
  "driver.vehicle": "车辆",
  "driver.progress": "行程进度",
  "driver.status": "当前状态",
  "driver.ticket": "交货单号",
  "driver.completed": "行程已完成",
  "driver.completedHint": "谢谢 — 您可以返回工厂。",
  "driver.gpsActive": "GPS 活跃 — 正在追踪位置",

  "driver.step.ARR_PLANT": "到达工厂",
  "driver.step.ARR_BSTC": "装料中",
  "driver.step.DEP_PLANT": "出发去工地",
  "driver.step.ARR_SITE": "到达工地",
  "driver.step.POUR_START": "开始浇筑",
  "driver.step.DEP_SITE": "浇筑完成",
  "driver.step.RETURN_PLANT": "返回工厂",

  "sales.title": "销售订单",
  "sales.newOrder": "➕ 新订单",
  "sales.cancel": "❌ 取消",
  "sales.myOrders": "我的订单",
  "sales.pending": "等待财务审核",
  "sales.approved": "已批准生产",
  "sales.empty": "暂无订单",

  "sales.booking.client": "选择客户",
  "sales.booking.site": "选择浇筑工地",
  "sales.booking.mixDesign": "选择配比",
  "sales.booking.volume": "体积 (m³)",
  "sales.booking.scheduleDate": "浇筑日期",
  "sales.booking.captureLocation": "📍 捕捉工地位置",
  "sales.booking.locationCaptured": "📍 已捕捉位置",
  "sales.booking.submit": "提交订单",

  "sales.track.stages.created": "订单已创建",
  "sales.track.stages.pending": "等待财务审批",
  "sales.track.stages.approved": "财务已批准",
  "sales.track.stages.production": "生产中",
  "sales.track.stages.transit": "在途",
  "sales.track.stages.delivered": "已交付",

  "common.ok": "确定",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.close": "关闭",
  "common.loading": "加载中...",
  "common.error": "出错了",
  "common.retry": "重试",
  "common.yes": "是",
  "common.no": "否",
  "common.logout": "退出登录",
  "common.language": "语言",
  "common.welcome": "你好",
};

// ─── Japanese (ja) ────────────────────────────────────────────────────────────

const ja: Partial<Record<TranslationKey, string>> = {
  "login.title": "フィムト・コンクリート",
  "login.subtitle": "レディーミクス ERP — 現場運用",
  "login.phone": "電話番号",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "パスワード",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "サインイン",
  "login.error": "電話番号またはパスワードが正しくありません",
  "login.help": "サインインできない場合はシステム管理者にお問い合わせください。",

  "driver.title": "ドライバー運行",
  "driver.noTrip": "有効な運行はありません",
  "driver.noTripHint": "新しい運行が割り当てられたら通知されます。",
  "driver.refresh": "更新",
  "driver.tripNumber": "運行番号",
  "driver.client": "顧客",
  "driver.site": "現場",
  "driver.mixDesign": "配合",
  "driver.vehicle": "車両",
  "driver.progress": "運行進捗",
  "driver.status": "現在の状態",
  "driver.ticket": "納品伝票番号",
  "driver.completed": "運行完了",
  "driver.completedHint": "ありがとうございました — プラントに戻れます。",
  "driver.gpsActive": "GPS 稼働中 — 位置を追跡中",

  "driver.step.ARR_PLANT": "プラント到着",
  "driver.step.ARR_BSTC": "積込中",
  "driver.step.DEP_PLANT": "現場へ出発",
  "driver.step.ARR_SITE": "現場到着",
  "driver.step.POUR_START": "打設開始",
  "driver.step.DEP_SITE": "打設完了",
  "driver.step.RETURN_PLANT": "プラントへ戻る",

  "sales.title": "販売注文",
  "sales.newOrder": "➕ 新規注文",
  "sales.cancel": "❌ キャンセル",
  "sales.myOrders": "自分の注文",
  "sales.pending": "経理承認待ち",
  "sales.approved": "製造承認済み",
  "sales.empty": "まだ注文がありません",

  "sales.booking.client": "顧客を選択",
  "sales.booking.site": "打設現場を選択",
  "sales.booking.mixDesign": "配合を選択",
  "sales.booking.volume": "体積 (m³)",
  "sales.booking.scheduleDate": "打設日",
  "sales.booking.captureLocation": "📍 現場の位置を取得",
  "sales.booking.locationCaptured": "📍 位置を取得しました",
  "sales.booking.submit": "注文を送信",

  "sales.track.stages.created": "注文作成済み",
  "sales.track.stages.pending": "経理承認待ち",
  "sales.track.stages.approved": "経理承認済み",
  "sales.track.stages.production": "製造中",
  "sales.track.stages.transit": "現場へ輸送中",
  "sales.track.stages.delivered": "配送完了",

  "common.ok": "OK",
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.close": "閉じる",
  "common.loading": "読み込み中...",
  "common.error": "問題が発生しました",
  "common.retry": "再試行",
  "common.yes": "はい",
  "common.no": "いいえ",
  "common.logout": "サインアウト",
  "common.language": "言語",
  "common.welcome": "こんにちは",
};

// ─── Russian (ru) ─────────────────────────────────────────────────────────────

const ru: Partial<Record<TranslationKey, string>> = {
  "login.title": "Фимто Бетон",
  "login.subtitle": "ERP товарного бетона — полевые операции",
  "login.phone": "Номер телефона",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "Пароль",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "Войти",
  "login.error": "Неверный телефон или пароль",
  "login.help": "Если не можете войти, свяжитесь с администратором системы.",

  "driver.title": "Поездка водителя",
  "driver.noTrip": "Нет активной поездки",
  "driver.noTripHint": "Вас уведомит о новой поездке.",
  "driver.refresh": "Обновить",
  "driver.tripNumber": "Номер поездки",
  "driver.client": "Клиент",
  "driver.site": "Объект",
  "driver.mixDesign": "Состав смеси",
  "driver.vehicle": "Транспорт",
  "driver.progress": "Прогресс поездки",
  "driver.status": "Текущий статус",
  "driver.ticket": "Номер накладной",
  "driver.completed": "Поездка завершена",
  "driver.completedHint": "Спасибо — можно возвращаться на завод.",
  "driver.gpsActive": "GPS активен — местоположение отслеживается",

  "driver.step.ARR_PLANT": "На заводе",
  "driver.step.ARR_BSTC": "Загрузка",
  "driver.step.DEP_PLANT": "Выехал на объект",
  "driver.step.ARR_SITE": "Прибыл на объект",
  "driver.step.POUR_START": "Начало укладки",
  "driver.step.DEP_SITE": "Укладка завершена",
  "driver.step.RETURN_PLANT": "Возврат на завод",

  "sales.title": "Заказы продаж",
  "sales.newOrder": "➕ Новый заказ",
  "sales.cancel": "❌ Отмена",
  "sales.myOrders": "Мои заказы",
  "sales.pending": "Ожидает финансов",
  "sales.approved": "Одобрен для производства",
  "sales.empty": "Заказов пока нет",

  "sales.booking.client": "Выберите клиента",
  "sales.booking.site": "Выберите объект укладки",
  "sales.booking.mixDesign": "Выберите состав смеси",
  "sales.booking.volume": "Объём (м³)",
  "sales.booking.scheduleDate": "Дата укладки",
  "sales.booking.captureLocation": "📍 Захватить местоположение объекта",
  "sales.booking.locationCaptured": "📍 Местоположение захвачено",
  "sales.booking.submit": "Отправить заказ",

  "sales.track.stages.created": "Заказ создан",
  "sales.track.stages.pending": "Ожидает одобрения финансов",
  "sales.track.stages.approved": "Одобрен финансами",
  "sales.track.stages.production": "В производстве",
  "sales.track.stages.transit": "В пути к объекту",
  "sales.track.stages.delivered": "Доставлено",

  "common.ok": "ОК",
  "common.cancel": "Отмена",
  "common.save": "Сохранить",
  "common.close": "Закрыть",
  "common.loading": "Загрузка...",
  "common.error": "Что-то пошло не так",
  "common.retry": "Повторить",
  "common.yes": "Да",
  "common.no": "Нет",
  "common.logout": "Выйти",
  "common.language": "Язык",
  "common.welcome": "Привет",
};

// ─── Bengali (bn) ─────────────────────────────────────────────────────────────

const bn: Partial<Record<TranslationKey, string>> = {
  "login.title": "ফিমটো কংক্রিট",
  "login.subtitle": "রেডি-মিক্স ERP — ফিল্ড অপারেশন",
  "login.phone": "ফোন নম্বর",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "পাসওয়ার্ড",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "সাইন ইন",
  "login.error": "ভুল ফোন বা পাসওয়ার্ড",
  "login.help": "সাইন ইন করতে সমস্যা হলে সিস্টেম অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।",

  "driver.title": "ড্রাইভার ট্রিপ",
  "driver.noTrip": "কোনো সক্রিয় ট্রিপ নেই",
  "driver.noTripHint": "নতুন ট্রিপ বরাদ্দ হলে আপনাকে জানানো হবে।",
  "driver.refresh": "রিফ্রেশ",
  "driver.tripNumber": "ট্রিপ নম্বর",
  "driver.client": "ক্লায়েন্ট",
  "driver.site": "সাইট",
  "driver.mixDesign": "মিক্স ডিজাইন",
  "driver.vehicle": "যান",
  "driver.progress": "ট্রিপ অগ্রগতি",
  "driver.status": "বর্তমান অবস্থা",
  "driver.ticket": "ডেলিভারি টিকেট নম্বর",
  "driver.completed": "ট্রিপ সম্পন্ন",
  "driver.completedHint": "ধন্যবাদ — আপনি প্ল্যান্টে ফিরে যেতে পারেন।",
  "driver.gpsActive": "GPS সক্রিয় — অবস্থান ট্র্যাক করা হচ্ছে",

  "driver.step.ARR_PLANT": "প্ল্যান্টে",
  "driver.step.ARR_BSTC": "লোড হচ্ছে",
  "driver.step.DEP_PLANT": "সাইটের দিকে রওনা",
  "driver.step.ARR_SITE": "সাইটে পৌঁছেছি",
  "driver.step.POUR_START": "ঢালাই শুরু",
  "driver.step.DEP_SITE": "ঢালাই শেষ",
  "driver.step.RETURN_PLANT": "প্ল্যান্টে ফেরত",

  "sales.title": "বিক্রয় অর্ডার",
  "sales.newOrder": "➕ নতুন অর্ডার",
  "sales.cancel": "❌ বাতিল",
  "sales.myOrders": "আমার অর্ডার",
  "sales.pending": "ফাইন্যান্সের অপেক্ষায়",
  "sales.approved": "উৎপাদনের জন্য অনুমোদিত",
  "sales.empty": "এখনও কোনো অর্ডার নেই",

  "sales.booking.client": "ক্লায়েন্ট নির্বাচন করুন",
  "sales.booking.site": "ঢালাই সাইট নির্বাচন করুন",
  "sales.booking.mixDesign": "মিক্স ডিজাইন নির্বাচন করুন",
  "sales.booking.volume": "পরিমাণ (m³)",
  "sales.booking.scheduleDate": "ঢালাইয়ের তারিখ",
  "sales.booking.captureLocation": "📍 সাইটের অবস্থান ক্যাপচার করুন",
  "sales.booking.locationCaptured": "📍 অবস্থান ক্যাপচার হয়েছে",
  "sales.booking.submit": "অর্ডার জমা দিন",

  "sales.track.stages.created": "অর্ডার তৈরি হয়েছে",
  "sales.track.stages.pending": "ফাইন্যান্স অনুমোদনের অপেক্ষায়",
  "sales.track.stages.approved": "ফাইন্যান্স থেকে অনুমোদিত",
  "sales.track.stages.production": "উৎপাদনে",
  "sales.track.stages.transit": "সাইটে যাচ্ছে",
  "sales.track.stages.delivered": "ডেলিভারি সম্পন্ন",

  "common.ok": "ঠিক আছে",
  "common.cancel": "বাতিল",
  "common.save": "সংরক্ষণ",
  "common.close": "বন্ধ",
  "common.loading": "লোড হচ্ছে...",
  "common.error": "কিছু ভুল হয়েছে",
  "common.retry": "পুনরায় চেষ্টা",
  "common.yes": "হ্যাঁ",
  "common.no": "না",
  "common.logout": "সাইন আউট",
  "common.language": "ভাষা",
  "common.welcome": "হ্যালো",
};

// ─── Nepali (ne) ──────────────────────────────────────────────────────────────

const ne: Partial<Record<TranslationKey, string>> = {
  "login.title": "फिम्टो कङ्क्रिट",
  "login.subtitle": "रेडी-मिक्स ERP — फिल्ड सञ्चालन",
  "login.phone": "फोन नम्बर",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "पासवर्ड",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "साइन इन",
  "login.error": "गलत फोन वा पासवर्ड",
  "login.help": "साइन इन गर्न समस्या भएमा प्रणाली प्रशासकलाई सम्पर्क गर्नुहोस्।",

  "driver.title": "ड्राइभर यात्रा",
  "driver.noTrip": "कुनै सक्रिय यात्रा छैन",
  "driver.noTripHint": "नयाँ यात्रा तोकिएमा तपाईंलाई सूचित गरिनेछ।",
  "driver.refresh": "रिफ्रेस",
  "driver.tripNumber": "यात्रा नम्बर",
  "driver.client": "ग्राहक",
  "driver.site": "साइट",
  "driver.mixDesign": "मिक्स डिजाइन",
  "driver.vehicle": "सवारी",
  "driver.progress": "यात्रा प्रगति",
  "driver.status": "वर्तमान स्थिति",
  "driver.ticket": "डेलिभरी टिकट नम्बर",
  "driver.completed": "यात्रा पूरा भयो",
  "driver.completedHint": "धन्यवाद — तपाईं प्लान्ट फर्कन सक्नुहुन्छ।",
  "driver.gpsActive": "GPS सक्रिय — स्थान ट्र्याक भइरहेको छ",

  "driver.step.ARR_PLANT": "प्लान्टमा",
  "driver.step.ARR_BSTC": "लोड हुँदै",
  "driver.step.DEP_PLANT": "साइटतर्फ प्रस्थान",
  "driver.step.ARR_SITE": "साइटमा पुगियो",
  "driver.step.POUR_START": "खलाइ सुरु",
  "driver.step.DEP_SITE": "खलाइ सकियो",
  "driver.step.RETURN_PLANT": "प्लान्ट फर्कने",

  "sales.title": "बिक्री अर्डरहरू",
  "sales.newOrder": "➕ नयाँ अर्डर",
  "sales.cancel": "❌ रद्द",
  "sales.myOrders": "मेरा अर्डरहरू",
  "sales.pending": "वित्त स्वीकृति पर्खाइमा",
  "sales.approved": "उत्पादनको लागि स्वीकृत",
  "sales.empty": "अहिलेसम्म कुनै अर्डर छैन",

  "sales.booking.client": "ग्राहक छान्नुहोस्",
  "sales.booking.site": "खलाइ साइट छान्नुहोस्",
  "sales.booking.mixDesign": "मिक्स डिजाइन छान्नुहोस्",
  "sales.booking.volume": "मात्रा (m³)",
  "sales.booking.scheduleDate": "खलाइ मिति",
  "sales.booking.captureLocation": "📍 साइटको स्थान क्याप्चर गर्नुहोस्",
  "sales.booking.locationCaptured": "📍 स्थान क्याप्चर भयो",
  "sales.booking.submit": "अर्डर पेश गर्नुहोस्",

  "sales.track.stages.created": "अर्डर बनाइयो",
  "sales.track.stages.pending": "वित्त स्वीकृति पर्खाइमा",
  "sales.track.stages.approved": "वित्तबाट स्वीकृत",
  "sales.track.stages.production": "उत्पादनमा",
  "sales.track.stages.transit": "साइटतर्फ जाँदै",
  "sales.track.stages.delivered": "डेलिभरी भयो",

  "common.ok": "ठिक छ",
  "common.cancel": "रद्द",
  "common.save": "बचत",
  "common.close": "बन्द",
  "common.loading": "लोड हुँदैछ...",
  "common.error": "केही गलत भयो",
  "common.retry": "पुनः प्रयास",
  "common.yes": "हो",
  "common.no": "होइन",
  "common.logout": "साइन आउट",
  "common.language": "भाषा",
  "common.welcome": "नमस्ते",
};

// ─── Italian (it) ─────────────────────────────────────────────────────────────

const it: Partial<Record<TranslationKey, string>> = {
  "login.title": "Fimto Calcestruzzo",
  "login.subtitle": "ERP Calcestruzzo preconfezionato — Operazioni in campo",
  "login.phone": "Numero di telefono",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "Password",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "Accedi",
  "login.error": "Telefono o password errati",
  "login.help": "Se non riesci ad accedere, contatta l'amministratore di sistema.",

  "driver.title": "Corsa autista",
  "driver.noTrip": "Nessuna corsa attiva",
  "driver.noTripHint": "Sarai avvisato quando verrà assegnata una nuova corsa.",
  "driver.refresh": "Aggiorna",
  "driver.tripNumber": "Numero corsa",
  "driver.client": "Cliente",
  "driver.site": "Cantiere",
  "driver.mixDesign": "Composizione",
  "driver.vehicle": "Veicolo",
  "driver.progress": "Avanzamento corsa",
  "driver.status": "Stato attuale",
  "driver.ticket": "Numero bolla di consegna",
  "driver.completed": "Corsa completata",
  "driver.completedHint": "Grazie — puoi tornare all'impianto.",
  "driver.gpsActive": "GPS attivo — posizione tracciata",

  "driver.step.ARR_PLANT": "All'impianto",
  "driver.step.ARR_BSTC": "Caricamento",
  "driver.step.DEP_PLANT": "In viaggio verso il cantiere",
  "driver.step.ARR_SITE": "Arrivato al cantiere",
  "driver.step.POUR_START": "Getto iniziato",
  "driver.step.DEP_SITE": "Getto terminato",
  "driver.step.RETURN_PLANT": "Ritorno all'impianto",

  "sales.title": "Ordini di vendita",
  "sales.newOrder": "➕ Nuovo ordine",
  "sales.cancel": "❌ Annulla",
  "sales.myOrders": "I miei ordini",
  "sales.pending": "In attesa finanza",
  "sales.approved": "Approvato per produzione",
  "sales.empty": "Nessun ordine ancora",

  "sales.booking.client": "Seleziona cliente",
  "sales.booking.site": "Seleziona cantiere di getto",
  "sales.booking.mixDesign": "Seleziona composizione",
  "sales.booking.volume": "Volume (m³)",
  "sales.booking.scheduleDate": "Data del getto",
  "sales.booking.captureLocation": "📍 Cattura posizione cantiere",
  "sales.booking.locationCaptured": "📍 Posizione catturata",
  "sales.booking.submit": "Invia ordine",

  "sales.track.stages.created": "Ordine creato",
  "sales.track.stages.pending": "In attesa approvazione finanza",
  "sales.track.stages.approved": "Approvato dalla finanza",
  "sales.track.stages.production": "In produzione",
  "sales.track.stages.transit": "In viaggio verso il cantiere",
  "sales.track.stages.delivered": "Consegnato",

  "common.ok": "OK",
  "common.cancel": "Annulla",
  "common.save": "Salva",
  "common.close": "Chiudi",
  "common.loading": "Caricamento...",
  "common.error": "Qualcosa è andato storto",
  "common.retry": "Riprova",
  "common.yes": "Sì",
  "common.no": "No",
  "common.logout": "Esci",
  "common.language": "Lingua",
  "common.welcome": "Ciao",
};

// ─── German (de) ──────────────────────────────────────────────────────────────

const de: Partial<Record<TranslationKey, string>> = {
  "login.title": "Fimto Beton",
  "login.subtitle": "Transportbeton-ERP — Feldeinsatz",
  "login.phone": "Telefonnummer",
  "login.phonePlaceholder": "05xxxxxxxx",
  "login.password": "Passwort",
  "login.passwordPlaceholder": "••••••••",
  "login.submit": "Anmelden",
  "login.error": "Falsche Telefonnummer oder Passwort",
  "login.help": "Bei Anmeldeproblemen wenden Sie sich an den Systemadministrator.",

  "driver.title": "Fahrer-Fahrt",
  "driver.noTrip": "Keine aktive Fahrt",
  "driver.noTripHint": "Sie werden benachrichtigt, sobald eine neue Fahrt zugewiesen wird.",
  "driver.refresh": "Aktualisieren",
  "driver.tripNumber": "Fahrtnummer",
  "driver.client": "Kunde",
  "driver.site": "Baustelle",
  "driver.mixDesign": "Rezeptur",
  "driver.vehicle": "Fahrzeug",
  "driver.progress": "Fahrtfortschritt",
  "driver.status": "Aktueller Status",
  "driver.ticket": "Lieferscheinnummer",
  "driver.completed": "Fahrt abgeschlossen",
  "driver.completedHint": "Vielen Dank — Sie können zum Werk zurückkehren.",
  "driver.gpsActive": "GPS aktiv — Position wird verfolgt",

  "driver.step.ARR_PLANT": "Im Werk",
  "driver.step.ARR_BSTC": "Wird beladen",
  "driver.step.DEP_PLANT": "Auf zur Baustelle",
  "driver.step.ARR_SITE": "Auf der Baustelle",
  "driver.step.POUR_START": "Einbau begonnen",
  "driver.step.DEP_SITE": "Einbau abgeschlossen",
  "driver.step.RETURN_PLANT": "Rückkehr zum Werk",

  "sales.title": "Verkaufsaufträge",
  "sales.newOrder": "➕ Neuer Auftrag",
  "sales.cancel": "❌ Abbrechen",
  "sales.myOrders": "Meine Aufträge",
  "sales.pending": "Wartet auf Finanzen",
  "sales.approved": "Zur Produktion freigegeben",
  "sales.empty": "Noch keine Aufträge",

  "sales.booking.client": "Kunde auswählen",
  "sales.booking.site": "Einbaustelle auswählen",
  "sales.booking.mixDesign": "Rezeptur auswählen",
  "sales.booking.volume": "Volumen (m³)",
  "sales.booking.scheduleDate": "Einbaudatum",
  "sales.booking.captureLocation": "📍 Baustellenposition erfassen",
  "sales.booking.locationCaptured": "📍 Position erfasst",
  "sales.booking.submit": "Auftrag absenden",

  "sales.track.stages.created": "Auftrag erstellt",
  "sales.track.stages.pending": "Wartet auf Finanzfreigabe",
  "sales.track.stages.approved": "Von Finanzen freigegeben",
  "sales.track.stages.production": "In Produktion",
  "sales.track.stages.transit": "Unterwegs zur Baustelle",
  "sales.track.stages.delivered": "Zugestellt",

  "common.ok": "OK",
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.close": "Schließen",
  "common.loading": "Wird geladen...",
  "common.error": "Etwas ist schiefgelaufen",
  "common.retry": "Erneut versuchen",
  "common.yes": "Ja",
  "common.no": "Nein",
  "common.logout": "Abmelden",
  "common.language": "Sprache",
  "common.welcome": "Hallo",
};

// ─── Dictionaries Map ─────────────────────────────────────────────────────────

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en,
  ar,
  ur,
  hi,
  fil,
  zh,
  ja,
  ru,
  bn,
  ne,
  it,
  de,
};

// ─── Locale Persistence ───────────────────────────────────────────────────────

const LOCALE_STORAGE_KEY = "fimto_locale";

export async function loadLocale(): Promise<Locale> {
  try {
    const stored = await getItem(LOCALE_STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // fall through to default
  }
  return "en";
}

export async function saveLocale(locale: Locale): Promise<void> {
  try {
    await setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage errors — locale just won't persist
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────

interface UseT {
  /** Current active locale */
  locale: Locale;
  /** Translate a key; falls back to English if missing */
  t: (key: TranslationKey) => string;
  /** Switch the active locale (persists to storage) */
  setLocale: (locale: Locale) => Promise<void>;
  /** True when the active locale is written right-to-left */
  isRtl: boolean;
}

/**
 * React hook for i18n.
 *
 * Usage:
 *   const { t, locale, setLocale, isRtl } = useT();
 *   <Text>{t("login.title")}</Text>
 */
export function useT(): UseT {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Hydrate locale from storage on mount
  useEffect(() => {
    loadLocale().then(setLocaleState);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = DICTIONARIES[locale];
      const value = dict?.[key] ?? en[key];
      return value ?? key;
    },
    [locale]
  );

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await saveLocale(next);
  }, []);

  return {
    locale,
    t,
    setLocale,
    isRtl: isRtl(locale),
  };
}
