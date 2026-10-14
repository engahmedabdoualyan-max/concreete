import { usePageDict, type PageDict } from './pageDict';

/**
 * Plant & branch locations — /sites
 *
 * Arabic and English are written by hand (the pair the plant actually uses). The
 * rest fall back to English via `usePageDict`, so an untranslated screen is
 * readable rather than blank.
 */
const ar = (ar: string, en: string) => ({
  en, ar, ru: en, de: en, it: en, hi: en, ur: en, ja: en, zh: en,
});

const DICT: PageDict = {
  pageTitle: ar('📍 مواقع المصنع والفروع', '📍 Plant & Branch Locations'),
  subtitle: ar(
    'العنوان اللي بتقيس منه المسافات وبتتحسب منه أوقات الوصول — لازم كل موقع يكون معروف مكانه',
    'The origin every distance and arrival time is measured from — each site must know where it is'
  ),
  backToDashboard: ar('← الرئيسية', '← Dashboard'),
  accessDenied: ar('🔒 غير مصرح بالدخول', '🔒 Access Denied'),
  backToLogin: ar('العودة لتسجيل الدخول', 'Back to Login'),

  // tabs
  tabRegister: ar('➕ إضافة موقع', '➕ Add a Site'),
  tabMap: ar('🗺️ الخريطة', '🗺️ Map'),
  tabFleet: ar('🚛 الأسطول على الخريطة', '🚛 Fleet on the Map'),
  tabRegistry: ar('📋 السجل', '📋 Register'),

  // form
  formTitle: ar('تسجيل المصنع أو الفرع', 'Register the plant or a branch'),
  formHint: ar(
    'اكتب خط العرض وخط الطول، أو خدهم من زر «موقعي الحالي».',
    'Enter the latitude and longitude, or capture them with “My current location”.'
  ),
  siteCode: ar('كود الموقع', 'Site code'),
  siteCodePh: ar('مثال: HQ أو BR-JED', 'e.g. HQ or BR-JED'),
  siteName: ar('اسم الموقع', 'Site name'),
  siteNamePh: ar('مثال: المصنع الرئيسي - الرياض', 'e.g. Main Plant - Riyadh'),
  siteType: ar('النوع', 'Type'),
  city: ar('المدينة', 'City'),
  address: ar('العنوان', 'Address'),
  latitude: ar('خط العرض', 'Latitude'),
  longitude: ar('خط الطول', 'Longitude'),
  myLocation: ar('📍 موقعي الحالي', '📍 My current location'),
  locating: ar('جاري تحديد الموقع…', 'Locating…'),
  locationDenied: ar(
    'المتصفح رفض تحديد الموقع. اسمح بالصلاحيات أو اكتب الأرقام يدوي.',
    'The browser refused to share your location. Allow the permission, or type the numbers.'
  ),
  radius: ar('نصف قطر الوصول (متر)', 'Geofence radius (metres)'),
  radiusHint: ar(
    'أقرب قد إيه عشان يتحسب إن المركبة وصلت؟ 200 متر مناسب لبوابة المصنع.',
    'How close counts as arrived? 200 m suits a plant gate.'
  ),
  isPrimary: ar('🌟 هذا هو المصنع الأساسي (نقطة القياس)', '🌟 This is the primary site (the origin)'),
  submit: ar('💾 حفظ الموقع', '💾 Save Site'),
  submitting: ar('جاري الحفظ…', 'Saving…'),

  // registry
  primaryBadge: ar('🌟 أساسي', '🌟 Primary'),
  retiredBadge: ar('معطّل', 'Retired'),
  emptyRegistry: ar(
    'لسه مفيش مواقع مسجلة. المصنع نفسه أول موقع تضيفه.',
    'No sites yet. The plant itself is the first one to add.'
  ),
  noPrimaryWarning: ar(
    '⚠️ مفيش موقع أساسي. لازم واحد يبقى أساسي، لأن كل المسافات بتتقيس منه.',
    '⚠️ No primary site. One must be set — every distance is measured from it.'
  ),
  actions: ar('إجراءات', 'Actions'),
  makePrimary: ar('اجعله الأساسي', 'Make Primary'),
  retire: ar('تعطيل', 'Retire'),
  showRetired: ar('اظهار المعطّلة', 'Show retired'),
  editLocation: ar('✏️ تعديل الموقع', '✏️ Edit Location'),
  saveChanges: ar('حفظ التعديلات', 'Save Changes'),

  // messages
  loadFailed: ar('فشل تحميل المواقع', 'Failed to load sites'),
  saveFailed: ar('فشل حفظ الموقع', 'Failed to save the site'),
  readOnlyNote: ar(
    'ⓘ عرض فقط — دورك يقدر يشوف المواقع بس مش يعدّلها. تعديل موقع المصنع من صاحب المصنع فقط.',
    'ⓘ Read-only — your role can see the sites but not change them. Only the plant owner can move a site.'
  ),
  noTokenNote: ar(
    'ⓘ لازم تسجّل دخول من النظام (مش من شاشة الـ console) عشان تشوف المواقع.',
    'ⓘ Sign in through the system (not the admin console) to see the sites.'
  ),

  // types
  typePlant: ar('مصنع رئيسي', 'Main plant'),
  typeBranch: ar('فرع', 'Branch'),
  typeStation: ar('محطة', 'Station'),
  typeYard: ar('ساحة', 'Yard'),

  // map
  mapTitle: ar('مواقع الشركة على الخريطة', 'Company sites on the map'),
  mapEmpty: ar('مفيش مواقع لعرضها', 'No sites to display'),
  mapTilesNote: ar(
    'الخرائط من OpenStreetMap.',
    'Map tiles © OpenStreetMap.'
  ),

  // fleet vs sites
  fleetTitle: ar('🚛 السيارات مقابل المواقع', '🚛 Vehicles against the sites'),
  fleetSubtitle: ar(
    'موقع كل سيارة، وأقرب موقع ليها، والمسافة للمصنع.',
    'Where each vehicle is, which site it is nearest, and how far from the plant.'
  ),
  fleetNoPrimary: ar(
    '⚠️ مفيش موقع أساسي مسجل، فمفيش مسافة تتقاس للمصنع. سجّل المصنع من تبويب «إضافة موقع».',
    '⚠️ No primary site is registered, so there is no plant distance to report. Register the plant under “Add a Site”.'
  ),
  fleetNoFixes: ar(
    '🚛 مفيش أي سيارة راسلة موقع دلوقتي.',
    '🚛 No vehicle is reporting a position right now.'
  ),
  fleetNoFixesHint: ar(
    'السيارات مسجلة وأجهزة التتبع موجودة، بس مفيش قراءات جاية من الأجهزة. أول قراءة بتيجي من الجهاز هتظهر هنا.',
    'The vehicles and their trackers are registered, but no fixes have arrived. They will appear here as soon as one does.'
  ),
  statReporting: ar('بترسل موقع', 'Reporting'),
  statOnSite: ar('داخل الموقع', 'On site'),
  statNoFix: ar('بدون قراءة', 'No fix'),
  statSites: ar('مواقع مسجلة', 'Sites'),
  onlyOnSite: ar('اللي جوه الموقع بس', 'On-site only'),
  refresh: ar('🔄 تحديث', '🔄 Refresh'),
  refreshing: ar('⏳ جاري…', '⏳ Loading…'),
  loadingFleet: ar('جاري تحميل مواقع السيارات', 'Loading vehicle positions'),
  onSiteBadge: ar('📍 في الموقع', '📍 On site'),
  staleBadge: ar('⏱️ قراءة قديمة', '⏱️ Stale fix'),
  fromPlant: ar('من المصنع', 'from plant'),
  nearest: ar('أقرب', 'nearest'),
  noSitesYet: ar('مفيش مواقع مسجلة', 'No sites registered'),
  ageNow: ar('دلوقتي', 'just now'),
  ageMinutes: ar('من {n} دقيقة', '{n} min ago'),
  ageHours: ar('من {n} ساعة', '{n} h ago'),
  ageDays: ar('من {n} يوم', '{n} d ago'),
};

export function useSitesDict() {
  return usePageDict(DICT);
}