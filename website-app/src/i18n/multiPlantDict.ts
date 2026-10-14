import { usePageDict, type PageDict } from './pageDict';

export function useMultiPlantDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  mpBackDash: { en: 'Back to Dashboard', ar: 'عودة للرئيسية', ru: 'Back to Dashboard', de: 'Back to Dashboard', it: 'Back to Dashboard', hi: 'Back to Dashboard', ur: 'Back to Dashboard', ja: 'Back to Dashboard', zh: 'Back to Dashboard' },
  mpCement: { en: 'Cement', ar: 'أسمنت', ru: 'Cement', de: 'Cement', it: 'Cement', hi: 'Cement', ur: 'Cement', ja: 'Cement', zh: 'Cement' },
  mpCollected: { en: 'Collected', ar: 'المُحصّل', ru: 'Collected', de: 'Collected', it: 'Collected', hi: 'Collected', ur: 'Collected', ja: 'Collected', zh: 'Collected' },
  mpCollectedSar: { en: 'Collected (SAR)', ar: 'المُحصّل (ر.س)', ru: 'Collected (SAR)', de: 'Collected (SAR)', it: 'Collected (SAR)', hi: 'Collected (SAR)', ur: 'Collected (SAR)', ja: 'Collected (SAR)', zh: 'Collected (SAR)' },
  mpGravel: { en: 'Gravel', ar: 'البحص', ru: 'Gravel', de: 'Gravel', it: 'Gravel', hi: 'Gravel', ur: 'Gravel', ja: 'Gravel', zh: 'Gravel' },
  mpNetPos: { en: 'Group net position (SAR)', ar: 'صافي المجموعة (ر.س)', ru: 'Group net position (SAR)', de: 'Group net position (SAR)', it: 'Group net position (SAR)', hi: 'Group net position (SAR)', ur: 'Group net position (SAR)', ja: 'Group net position (SAR)', zh: 'Group net position (SAR)' },
  mpHealth: { en: 'Health', ar: 'الصحة', ru: 'Health', de: 'Health', it: 'Health', hi: 'Health', ur: 'Health', ja: 'Health', zh: 'Health' },
  mpLoading: { en: 'Loading plants...', ar: 'جاري التحميل...', ru: 'Loading plants...', de: 'Loading plants...', it: 'Loading plants...', hi: 'Loading plants...', ur: 'Loading plants...', ja: 'Loading plants...', zh: 'Loading plants...' },
  mpLocation: { en: 'Location', ar: 'الموقع', ru: 'Location', de: 'Location', it: 'Location', hi: 'Location', ur: 'Location', ja: 'Location', zh: 'Location' },
  mpNet: { en: 'Net', ar: 'الصافي', ru: 'Net', de: 'Net', it: 'Net', hi: 'Net', ur: 'Net', ja: 'Net', zh: 'Net' },
  mpNoMatch: { en: 'No plants match the filter.', ar: 'لا مصانع مطابقة.', ru: 'No plants match the filter.', de: 'No plants match the filter.', it: 'No plants match the filter.', hi: 'No plants match the filter.', ur: 'No plants match the filter.', ja: 'No plants match the filter.', zh: 'No plants match the filter.' },
  mpOpenPOs: { en: 'Open POs', ar: 'طلبات مفتوحة', ru: 'Open POs', de: 'Open POs', it: 'Open POs', hi: 'Open POs', ur: 'Open POs', ja: 'Open POs', zh: 'Open POs' },
  mpOrders: { en: 'Orders', ar: 'الطلبات', ru: 'Orders', de: 'Orders', it: 'Orders', hi: 'Orders', ur: 'Orders', ja: 'Orders', zh: 'Orders' },
  mpOutstanding: { en: 'Outstanding (SAR)', ar: 'المستحق (ر.س)', ru: 'Outstanding (SAR)', de: 'Outstanding (SAR)', it: 'Outstanding (SAR)', hi: 'Outstanding (SAR)', ur: 'Outstanding (SAR)', ja: 'Outstanding (SAR)', zh: 'Outstanding (SAR)' },
  mpPlant: { en: 'Plant', ar: 'المصنع', ru: 'Plant', de: 'Plant', it: 'Plant', hi: 'Plant', ur: 'Plant', ja: 'Plant', zh: 'Plant' },
  mpPlants: { en: 'Plants', ar: 'المصانع', ru: 'Plants', de: 'Plants', it: 'Plants', hi: 'Plants', ur: 'Plants', ja: 'Plants', zh: 'Plants' },
  mpPoSpend: { en: 'PO spend (SAR)', ar: 'المشتريات (ر.س)', ru: 'PO spend (SAR)', de: 'PO spend (SAR)', it: 'PO spend (SAR)', hi: 'PO spend (SAR)', ur: 'PO spend (SAR)', ja: 'PO spend (SAR)', zh: 'PO spend (SAR)' },
  mpQc: { en: 'QC tests', ar: 'اختبارات الجودة', ru: 'QC tests', de: 'QC tests', it: 'QC tests', hi: 'QC tests', ur: 'QC tests', ja: 'QC tests', zh: 'QC tests' },
  mpSand: { en: 'Sand', ar: 'الرمل', ru: 'Sand', de: 'Sand', it: 'Sand', hi: 'Sand', ur: 'Sand', ja: 'Sand', zh: 'Sand' },
  mpOwnerNote: { en: 'This unified multi-plant dashboard is for the owner/manager role.', ar: 'لوحة متعددة المصانع للمالك/المدير.', ru: 'This unified multi-plant dashboard is for the owner/manager role.', de: 'This unified multi-plant dashboard is for the owner/manager role.', it: 'This unified multi-plant dashboard is for the owner/manager role.', hi: 'This unified multi-plant dashboard is for the owner/manager role.', ur: 'This unified multi-plant dashboard is for the owner/manager role.', ja: 'This unified multi-plant dashboard is for the owner/manager role.', zh: 'This unified multi-plant dashboard is for the owner/manager role.' },
  mpTrips: { en: 'Trips', ar: 'الرحلات', ru: 'Trips', de: 'Trips', it: 'Trips', hi: 'Trips', ur: 'Trips', ja: 'Trips', zh: 'Trips' },
  mpVolume: { en: 'Volume', ar: 'الحجم', ru: 'Volume', de: 'Volume', it: 'Volume', hi: 'Volume', ur: 'Volume', ja: 'Volume', zh: 'Volume' },

  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
};