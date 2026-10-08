import { usePageDict, type PageDict } from './pageDict';

/**
 * Fleet device coding — /fleet/coding
 *
 * Arabic and English are written by hand (this is the language pair the plant
 * and the workshop actually use). The remaining locales fall back to English via
 * `usePageDict`, so an untranslated screen is readable rather than blank.
 */
const DICT: PageDict = {
  pageTitle: { en: '🔗 Vehicle & Device Coding', ar: '🔗 ربط وتكويد المركبات', ru: '🔗 Vehicle & Device Coding', de: '🔗 Vehicle & Device Coding', it: '🔗 Vehicle & Device Coding', hi: '🔗 Vehicle & Device Coding', ur: '🔗 Vehicle & Device Coding', ja: '🔗 Vehicle & Device Coding', zh: '🔗 Vehicle & Device Coding' },
  subtitle: {
    en: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck',
    ar: 'ربط جهاز التتبع أو الحساس بالمركبة حتى تُنسب قراءاته للمركبة الصحيحة',
    ru: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck', de: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck', it: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck', hi: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck', ur: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck', ja: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck', zh: 'Attach a tracker or probe to a mixer so its readings are attributed to the right truck',
  },
  backToDashboard: { en: '← Dashboard', ar: '← الرئيسية', ru: '← Dashboard', de: '← Dashboard', it: '← Dashboard', hi: '← Dashboard', ur: '← Dashboard', ja: '← Dashboard', zh: '← Dashboard' },
  accessDenied: { en: '🔒 Access Denied', ar: '🔒 غير مصرح بالدخول', ru: '🔒 Access Denied', de: '🔒 Access Denied', it: '🔒 Access Denied', hi: '🔒 Access Denied', ur: '🔒 Access Denied', ja: '🔒 Access Denied', zh: '🔒 Access Denied' },
  backToLogin: { en: 'Back to Login', ar: 'العودة لتسجيل الدخول', ru: 'Back to Login', de: 'Back to Login', it: 'Back to Login', hi: 'Back to Login', ur: 'Back to Login', ja: 'Back to Login', zh: 'Back to Login' },

  // tabs
  tabRegister: { en: '➕ Code a Device', ar: '➕ تكويد جهاز', ru: '➕ Code a Device', de: '➕ Code a Device', it: '➕ Code a Device', hi: '➕ Code a Device', ur: '➕ Code a Device', ja: '➕ Code a Device', zh: '➕ Code a Device' },
  tabRegistry: { en: '📋 Registry', ar: '📋 السجل', ru: '📋 Registry', de: '📋 Registry', it: '📋 Registry', hi: '📋 Registry', ur: '📋 Registry', ja: '📋 Registry', zh: '📋 Registry' },
  tabLookup: { en: '🔍 Find by IMEI', ar: '🔍 بحث بالرقم التسلسلي', ru: '🔍 Find by IMEI', de: '🔍 Find by IMEI', it: '🔍 Find by IMEI', hi: '🔍 Find by IMEI', ur: '🔍 Find by IMEI', ja: '🔍 Find by IMEI', zh: '🔍 Find by IMEI' },
  tabTrips: { en: '🚚 Trip report', ar: '🚚 تقرير الرحلات', ru: '🚚 Trip report', de: '🚚 Trip report', it: '🚚 Trip report', hi: '🚚 Trip report', ur: '🚚 Trip report', ja: '🚚 Trip report', zh: '🚚 Trip report' },
  tripsTitle: { en: 'Trips per vehicle — gate exit to gate entry', ar: 'رحلات كل سيارة — من خروجها من المحطة حتى عودتها', ru: 'Trips per vehicle', de: 'Trips per vehicle', it: 'Trips per vehicle', hi: 'Trips per vehicle', ur: 'Trips per vehicle', ja: 'Trips per vehicle', zh: 'Trips per vehicle' },
  tripsHint: { en: 'A trip starts when the truck leaves the plant fence and ends when it returns. Under 3 minutes is ignored as fence-edge wobble.', ar: 'الرحلة تبدأ بخروج الشاحنة من سور المصنع وتنتهي بعودتها. أقل من 3 دقائق يُتجاهل.', ru: 'Trips per vehicle', de: 'Trips per vehicle', it: 'Trips per vehicle', hi: 'Trips per vehicle', ur: 'Trips per vehicle', ja: 'Trips per vehicle', zh: 'Trips per vehicle' },
  tripsLoad: { en: 'Show', ar: 'عرض', ru: 'Show', de: 'Show', it: 'Show', hi: 'Show', ur: 'Show', ja: 'Show', zh: 'Show' },
  tripsTotal: { en: 'trips', ar: 'رحلة', ru: 'trips', de: 'trips', it: 'trips', hi: 'trips', ur: 'trips', ja: 'trips', zh: 'trips' },
  tripsOpen: { en: 'out now', ar: 'خارج الآن', ru: 'out now', de: 'out now', it: 'out now', hi: 'out now', ur: 'out now', ja: 'out now', zh: 'out now' },
  tripsNone: { en: 'No trips this day — devices must report regularly for trips to appear.', ar: 'لا رحلات في هذا اليوم — يجب أن ترسل الأجهزة بانتظام لتظهر الرحلات.', ru: 'No trips', de: 'No trips', it: 'No trips', hi: 'No trips', ur: 'No trips', ja: 'No trips', zh: 'No trips' },
  tripsMinOut: { en: 'min out', ar: 'دقيقة خارجاً', ru: 'min out', de: 'min out', it: 'min out', hi: 'min out', ur: 'min out', ja: 'min out', zh: 'min out' },

  // form
  formTitle: { en: 'Code a device onto a vehicle', ar: 'تكويد جهاز على مركبة', ru: 'Code a device onto a vehicle', de: 'Code a device onto a vehicle', it: 'Code a device onto a vehicle', hi: 'Code a device onto a vehicle', ur: 'Code a device onto a vehicle', ja: 'Code a device onto a vehicle', zh: 'Code a device onto a vehicle' },
  vehicle: { en: 'Vehicle', ar: 'المركبة', ru: 'Vehicle', de: 'Vehicle', it: 'Vehicle', hi: 'Vehicle', ur: 'Vehicle', ja: 'Vehicle', zh: 'Vehicle' },
  selectVehicle: { en: '— choose a vehicle —', ar: '— اختر مركبة —', ru: '— choose a vehicle —', de: '— choose a vehicle —', it: '— choose a vehicle —', hi: '— choose a vehicle —', ur: '— choose a vehicle —', ja: '— choose a vehicle —', zh: '— choose a vehicle —' },
  deviceType: { en: 'Device type', ar: 'نوع الجهاز', ru: 'Device type', de: 'Device type', it: 'Device type', hi: 'Device type', ur: 'Device type', ja: 'Device type', zh: 'Device type' },
  deviceCode: { en: 'Device code', ar: 'كود الجهاز', ru: 'Device code', de: 'Device code', it: 'Device code', hi: 'Device code', ur: 'Device code', ja: 'Device code', zh: 'Device code' },
  deviceCodeHint: {
    en: 'Short label you read off the dashboard, e.g. DRUM-01',
    ar: 'كود قصير تقرؤه من الشاشة، مثل DRUM-01',
    ru: 'Short label you read off the dashboard, e.g. DRUM-01', de: 'Short label you read off the dashboard, e.g. DRUM-01', it: 'Short label you read off the dashboard, e.g. DRUM-01', hi: 'Short label you read off the dashboard, e.g. DRUM-01', ur: 'Short label you read off the dashboard, e.g. DRUM-01', ja: 'Short label you read off the dashboard, e.g. DRUM-01', zh: 'Short label you read off the dashboard, e.g. DRUM-01',
  },
  serialNumber: { en: 'IMEI / serial number', ar: 'الرقم التسلسلي / IMEI', ru: 'IMEI / serial number', de: 'IMEI / serial number', it: 'IMEI / serial number', hi: 'IMEI / serial number', ur: 'IMEI / serial number', ja: 'IMEI / serial number', zh: 'IMEI / serial number' },
  serialHint: {
    en: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.',
    ar: 'مطبوع على الجهاز. من هذا الرقم تصل قراءاته، ولا يمكن تكويده إلا مرة واحدة',
    ru: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.', de: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.', it: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.', hi: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.', ur: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.', ja: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.', zh: 'Printed on the device. This is what its readings arrive as, and it can only ever be coded once.',
  },
  isPrimary: { en: 'Primary device of this type for the vehicle', ar: 'الجهاز الأساسي لهذا النوع للمركبة', ru: 'Primary device of this type for the vehicle', de: 'Primary device of this type for the vehicle', it: 'Primary device of this type for the vehicle', hi: 'Primary device of this type for the vehicle', ur: 'Primary device of this type for the vehicle', ja: 'Primary device of this type for the vehicle', zh: 'Primary device of this type for the vehicle' },
  isPrimaryHint: {
    en: 'Only one per type. Coding a new one replaces the previous primary.',
    ar: 'جهاز واحد فقط لكل نوع. تكويد جهاز جديد يحل محل الأساسي السابق',
    ru: 'Only one per type. Coding a new one replaces the previous primary.', de: 'Only one per type. Coding a new one replaces the previous primary.', it: 'Only one per type. Coding a new one replaces the previous primary.', hi: 'Only one per type. Coding a new one replaces the previous primary.', ur: 'Only one per type. Coding a new one replaces the previous primary.', ja: 'Only one per type. Coding a new one replaces the previous primary.', zh: 'Only one per type. Coding a new one replaces the previous primary.',
  },
  submit: { en: 'Code device', ar: 'تكويد الجهاز', ru: 'Code device', de: 'Code device', it: 'Code device', hi: 'Code device', ur: 'Code device', ja: 'Code device', zh: 'Code device' },
  submitting: { en: 'Coding…', ar: 'جارٍ التكويد…', ru: 'Coding…', de: 'Coding…', it: 'Coding…', hi: 'Coding…', ur: 'Coding…', ja: 'Coding…', zh: 'Coding…' },

  // registry
  registryTitle: { en: 'Coded devices', ar: 'الأجهزة المكوّدة', ru: 'Coded devices', de: 'Coded devices', it: 'Coded devices', hi: 'Coded devices', ur: 'Coded devices', ja: 'Coded devices', zh: 'Coded devices' },
  showUncoded: { en: 'Show uncoded history', ar: 'إظهار سجل الأجهزة المفكوكة', ru: 'Show uncoded history', de: 'Show uncoded history', it: 'Show uncoded history', hi: 'Show uncoded history', ur: 'Show uncoded history', ja: 'Show uncoded history', zh: 'Show uncoded history' },
  colVehicle: { en: 'Vehicle', ar: 'المركبة', ru: 'Vehicle', de: 'Vehicle', it: 'Vehicle', hi: 'Vehicle', ur: 'Vehicle', ja: 'Vehicle', zh: 'Vehicle' },
  colPlate: { en: 'Plate', ar: 'اللوحة', ru: 'Plate', de: 'Plate', it: 'Plate', hi: 'Plate', ur: 'Plate', ja: 'Plate', zh: 'Plate' },
  colType: { en: 'Type', ar: 'النوع', ru: 'Type', de: 'Type', it: 'Type', hi: 'Type', ur: 'Type', ja: 'Type', zh: 'Type' },
  colCode: { en: 'Code', ar: 'الكود', ru: 'Code', de: 'Code', it: 'Code', hi: 'Code', ur: 'Code', ja: 'Code', zh: 'Code' },
  colSerial: { en: 'IMEI', ar: 'الرقم التسلسلي', ru: 'IMEI', de: 'IMEI', it: 'IMEI', hi: 'IMEI', ur: 'IMEI', ja: 'IMEI', zh: 'IMEI' },
  colPrimary: { en: 'Primary', ar: 'أساسي', ru: 'Primary', de: 'Primary', it: 'Primary', hi: 'Primary', ur: 'Primary', ja: 'Primary', zh: 'Primary' },
  colLastSeen: { en: 'Last seen', ar: 'آخر ظهور', ru: 'Last seen', de: 'Last seen', it: 'Last seen', hi: 'Last seen', ur: 'Last seen', ja: 'Last seen', zh: 'Last seen' },
  colActions: { en: 'Actions', ar: 'إجراءات', ru: 'Actions', de: 'Actions', it: 'Actions', hi: 'Actions', ur: 'Actions', ja: 'Actions', zh: 'Actions' },
  noDevices: { en: 'No devices coded yet.', ar: 'لم يتم تكويد أي جهاز بعد.', ru: 'No devices coded yet.', de: 'No devices coded yet.', it: 'No devices coded yet.', hi: 'No devices coded yet.', ur: 'No devices coded yet.', ja: 'No devices coded yet.', zh: 'No devices coded yet.' },
  never: { en: 'never', ar: 'أبداً', ru: 'never', de: 'never', it: 'never', hi: 'never', ur: 'never', ja: 'never', zh: 'never' },
  primary: { en: '★ primary', ar: '★ أساسي', ru: '★ primary', de: '★ primary', it: '★ primary', hi: '★ primary', ur: '★ primary', ja: '★ primary', zh: '★ primary' },
  inactive: { en: 'uncoded', ar: 'مفكوك', ru: 'uncoded', de: 'uncoded', it: 'uncoded', hi: 'uncoded', ur: 'uncoded', ja: 'uncoded', zh: 'uncoded' },
  moveTo: { en: 'Move to…', ar: 'نقل إلى…', ru: 'Move to…', de: 'Move to…', it: 'Move to…', hi: 'Move to…', ur: 'Move to…', ja: 'Move to…', zh: 'Move to…' },
  uncode: { en: 'Uncode', ar: 'فك التكويد', ru: 'Uncode', de: 'Uncode', it: 'Uncode', hi: 'Uncode', ur: 'Uncode', ja: 'Uncode', zh: 'Uncode' },

  // lookup
  lookupTitle: { en: 'Where is this device?', ar: 'أين هذا الجهاز؟', ru: 'Where is this device?', de: 'Where is this device?', it: 'Where is this device?', hi: 'Where is this device?', ur: 'Where is this device?', ja: 'Where is this device?', zh: 'Where is this device?' },
  lookupHint: {
    en: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.',
    ar: 'اكتب الرقم التسلسلي المطبوع على الجهاز لمعرفة المركبة المربوط بها',
    ru: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.', de: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.', it: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.', hi: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.', ur: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.', ja: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.', zh: 'Type the IMEI printed on the hardware to find the vehicle it is coded onto.',
  },
  lookup: { en: 'Find', ar: 'بحث', ru: 'Find', de: 'Find', it: 'Find', hi: 'Find', ur: 'Find', ja: 'Find', zh: 'Find' },
  notCoded: { en: 'This device is not coded anywhere.', ar: 'هذا الجهاز غير مربوط بأي مركبة.', ru: 'This device is not coded anywhere.', de: 'This device is not coded anywhere.', it: 'This device is not coded anywhere.', hi: 'This device is not coded anywhere.', ur: 'This device is not coded anywhere.', ja: 'This device is not coded anywhere.', zh: 'This device is not coded anywhere.' },

  // device types
  typeDrumRpm: { en: 'Drum RPM', ar: 'دوران المحور', ru: 'Drum RPM', de: 'Drum RPM', it: 'Drum RPM', hi: 'Drum RPM', ur: 'Drum RPM', ja: 'Drum RPM', zh: 'Drum RPM' },
  typeTemp: { en: 'Concrete temperature', ar: 'حرارة الخرسانة', ru: 'Concrete temperature', de: 'Concrete temperature', it: 'Concrete temperature', hi: 'Concrete temperature', ur: 'Concrete temperature', ja: 'Concrete temperature', zh: 'Concrete temperature' },
  typeWater: { en: 'Water-add meter', ar: 'عدّاد الماء', ru: 'Water-add meter', de: 'Water-add meter', it: 'Water-add meter', hi: 'Water-add meter', ur: 'Water-add meter', ja: 'Water-add meter', zh: 'Water-add meter' },
  typeGps: { en: 'GPS tracker', ar: 'جهاز التتبع', ru: 'GPS tracker', de: 'GPS tracker', it: 'GPS tracker', hi: 'GPS tracker', ur: 'GPS tracker', ja: 'GPS tracker', zh: 'GPS tracker' },

  // confirmations
  confirmUncode: {
    en: 'Uncode this device? It stops reporting immediately. Its history is kept.',
    ar: 'فك تكويد هذا الجهاز؟ سيتوقف عن الإرسال فوراً، وسيبقى سجله محفوظاً',
    ru: 'Uncode this device? It stops reporting immediately. Its history is kept.', de: 'Uncode this device? It stops reporting immediately. Its history is kept.', it: 'Uncode this device? It stops reporting immediately. Its history is kept.', hi: 'Uncode this device? It stops reporting immediately. Its history is kept.', ur: 'Uncode this device? It stops reporting immediately. Its history is kept.', ja: 'Uncode this device? It stops reporting immediately. Its history is kept.', zh: 'Uncode this device? It stops reporting immediately. Its history is kept.',
  },
  reloading: { en: 'Reloading…', ar: 'جارٍ التحديث…', ru: 'Reloading…', de: 'Reloading…', it: 'Reloading…', hi: 'Reloading…', ur: 'Reloading…', ja: 'Reloading…', zh: 'Reloading…' },
};

export function useFleetCodingDict() {
  return usePageDict(DICT);
}
