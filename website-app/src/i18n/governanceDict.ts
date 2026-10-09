import { usePageDict, type PageDict } from './pageDict';

export function useGovernanceDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  gvBackLogin: { en: 'Back to Login', ar: 'عودة للدخول', ru: 'Back to Login', de: 'Back to Login', it: 'Back to Login', hi: 'Back to Login', ur: 'Back to Login', ja: 'Back to Login', zh: 'Back to Login' },
  gvNet: { en: 'Net', ar: 'الصافي', ru: 'Net', de: 'Net', it: 'Net', hi: 'Net', ur: 'Net', ja: 'Net', zh: 'Net' },
  gvNetT: { en: 'Net received (t)', ar: 'الصافي المستلم (طن)', ru: 'Net received (t)', de: 'Net received (t)', it: 'Net received (t)', hi: 'Net received (t)', ur: 'Net received (t)', ja: 'Net received (t)', zh: 'Net received (t)' },
  gvNoRet: { en: 'No returns submitted yet this session.', ar: 'لا مرتجعات هذه الجلسة.', ru: 'No returns submitted yet this session.', de: 'No returns submitted yet this session.', it: 'No returns submitted yet this session.', hi: 'No returns submitted yet this session.', ur: 'No returns submitted yet this session.', ja: 'No returns submitted yet this session.', zh: 'No returns submitted yet this session.' },
  gvNoteLocal: { en: 'Note (local)', ar: 'ملاحظة (محلية)', ru: 'Note (local)', de: 'Note (local)', it: 'Note (local)', hi: 'Note (local)', ur: 'Note (local)', ja: 'Note (local)', zh: 'Note (local)' },
  gvNotes: { en: 'Notes', ar: 'ملاحظات', ru: 'Notes', de: 'Notes', it: 'Notes', hi: 'Notes', ur: 'Notes', ja: 'Notes', zh: 'Notes' },
  gvNoWb: { en: 'No weighbridge transactions.', ar: 'لا معاملات ميزان.', ru: 'No weighbridge transactions.', de: 'No weighbridge transactions.', it: 'No weighbridge transactions.', hi: 'No weighbridge transactions.', ur: 'No weighbridge transactions.', ja: 'No weighbridge transactions.', zh: 'No weighbridge transactions.' },
  gvRecEff: { en: 'Recovery efficiency', ar: 'كفاءة الاسترداد', ru: 'Recovery efficiency', de: 'Recovery efficiency', it: 'Recovery efficiency', hi: 'Recovery efficiency', ur: 'Recovery efficiency', ja: 'Recovery efficiency', zh: 'Recovery efficiency' },
  gvRecycled: { en: 'Recycled', ar: 'معاد تدويره', ru: 'Recycled', de: 'Recycled', it: 'Recycled', hi: 'Recycled', ur: 'Recycled', ja: 'Recycled', zh: 'Recycled' },
  gvSand: { en: 'Sand', ar: 'الرمل', ru: 'Sand', de: 'Sand', it: 'Sand', hi: 'Sand', ur: 'Sand', ja: 'Sand', zh: 'Sand' },
  gvScaleId: { en: 'Scale unit ID', ar: 'رقم الميزان', ru: 'Scale unit ID', de: 'Scale unit ID', it: 'Scale unit ID', hi: 'Scale unit ID', ur: 'Scale unit ID', ja: 'Scale unit ID', zh: 'Scale unit ID' },
  gvSiteLocal: { en: 'Site (local)', ar: 'الموقع (محلي)', ru: 'Site (local)', de: 'Site (local)', it: 'Site (local)', hi: 'Site (local)', ur: 'Site (local)', ja: 'Site (local)', zh: 'Site (local)' },
  gvSlump: { en: 'Slump (cm)', ar: 'الهبوط (سم)', ru: 'Slump (cm)', de: 'Slump (cm)', it: 'Slump (cm)', hi: 'Slump (cm)', ur: 'Slump (cm)', ja: 'Slump (cm)', zh: 'Slump (cm)' },
  gvStatus: { en: 'Status', ar: 'الحالة', ru: 'Status', de: 'Status', it: 'Status', hi: 'Status', ur: 'Status', ja: 'Status', zh: 'Status' },
  gvSupLocal: { en: 'Supplier (local)', ar: 'المورد (محلي)', ru: 'Supplier (local)', de: 'Supplier (local)', it: 'Supplier (local)', hi: 'Supplier (local)', ur: 'Supplier (local)', ja: 'Supplier (local)', zh: 'Supplier (local)' },
  gvTareKg: { en: 'Tare (kg, local)', ar: 'الفارغ (كجم، محلي)', ru: 'Tare (kg, local)', de: 'Tare (kg, local)', it: 'Tare (kg, local)', hi: 'Tare (kg, local)', ur: 'Tare (kg, local)', ja: 'Tare (kg, local)', zh: 'Tare (kg, local)' },
  gvCement: { en: 'Cement', ar: 'أسمنت', ru: 'Cement', de: 'Cement', it: 'Cement', hi: 'Cement', ur: 'Cement', ja: 'Cement', zh: 'Cement' },
  gvGravel: { en: 'Gravel / Aggregate', ar: 'بحص', ru: 'Gravel / Aggregate', de: 'Gravel / Aggregate', it: 'Gravel / Aggregate', hi: 'Gravel / Aggregate', ur: 'Gravel / Aggregate', ja: 'Gravel / Aggregate', zh: 'Gravel / Aggregate' },
  gvGross: { en: 'Gross', ar: 'الإجمالي', ru: 'Gross', de: 'Gross', it: 'Gross', hi: 'Gross', ur: 'Gross', ja: 'Gross', zh: 'Gross' },
  gvHash: { en: 'Hash', ar: 'البصمة', ru: 'Hash', de: 'Hash', it: 'Hash', hi: 'Hash', ur: 'Hash', ja: 'Hash', zh: 'Hash' },
  gvLocked: { en: 'Locked at', ar: 'أُقفلت', ru: 'Locked at', de: 'Locked at', it: 'Locked at', hi: 'Locked at', ur: 'Locked at', ja: 'Locked at', zh: 'Locked at' },
  gvMaterialLocal: { en: 'Material (local)', ar: 'الخامة (محلية)', ru: 'Material (local)', de: 'Material (local)', it: 'Material (local)', hi: 'Material (local)', ur: 'Material (local)', ja: 'Material (local)', zh: 'Material (local)' },
  gvExpectedKg: { en: 'Expected (kg, local)', ar: 'المتوقع (كجم، محلي)', ru: 'Expected (kg, local)', de: 'Expected (kg, local)', it: 'Expected (kg, local)', hi: 'Expected (kg, local)', ur: 'Expected (kg, local)', ja: 'Expected (kg, local)', zh: 'Expected (kg, local)' },
  gvBlocksMfg: { en: 'Blocks manufactured', ar: 'البلك المصنع', ru: 'Blocks manufactured', de: 'Blocks manufactured', it: 'Blocks manufactured', hi: 'Blocks manufactured', ur: 'Blocks manufactured', ja: 'Blocks manufactured', zh: 'Blocks manufactured' },
  gvCastBlocks: { en: 'Cast blocks', ar: 'صب بلك', ru: 'Cast blocks', de: 'Cast blocks', it: 'Cast blocks', hi: 'Cast blocks', ur: 'Cast blocks', ja: 'Cast blocks', zh: 'Cast blocks' },
  gvAuditChain: { en: 'Audit chain (server)', ar: 'سلسلة التدقيق (الخادم)', ru: 'Audit chain (server)', de: 'Audit chain (server)', it: 'Audit chain (server)', hi: 'Audit chain (server)', ur: 'Audit chain (server)', ja: 'Audit chain (server)', zh: 'Audit chain (server)' },
  gvFlagged: { en: 'Flagged mismatches', ar: 'فروقات معلمة', ru: 'Flagged mismatches', de: 'Flagged mismatches', it: 'Flagged mismatches', hi: 'Flagged mismatches', ur: 'Flagged mismatches', ja: 'Flagged mismatches', zh: 'Flagged mismatches' },

  gvTripBoard: { en: 'Trip (dispatch board)', ar: 'الرحلة (التشغيل)', ru: 'Trip (dispatch board)', de: 'Trip (dispatch board)', it: 'Trip (dispatch board)', hi: 'Trip (dispatch board)', ur: 'Trip (dispatch board)', ja: 'Trip (dispatch board)', zh: 'Trip (dispatch board)' },
  gvDisposition: { en: 'Disposition', ar: 'التصرف', ru: 'Disposition', de: 'Disposition', it: 'Disposition', hi: 'Disposition', ur: 'Disposition', ja: 'Disposition', zh: 'Disposition' },
  gvWashout: { en: 'Washout', ar: 'غسيل', ru: 'Washout', de: 'Washout', it: 'Washout', hi: 'Washout', ur: 'Washout', ja: 'Washout', zh: 'Washout' },
  gvVehicle: { en: 'Vehicle', ar: 'المركبة', ru: 'Vehicle', de: 'Vehicle', it: 'Vehicle', hi: 'Vehicle', ur: 'Vehicle', ja: 'Vehicle', zh: 'Vehicle' },
  gvType: { en: 'Type', ar: 'النوع', ru: 'Type', de: 'Type', it: 'Type', hi: 'Type', ur: 'Type', ja: 'Type', zh: 'Type' },
  gvTrip: { en: 'Trip', ar: 'الرحلة', ru: 'Trip', de: 'Trip', it: 'Trip', hi: 'Trip', ur: 'Trip', ja: 'Trip', zh: 'Trip' },
  gvTripId: { en: 'Trip ID', ar: 'رقم الرحلة', ru: 'Trip ID', de: 'Trip ID', it: 'Trip ID', hi: 'Trip ID', ur: 'Trip ID', ja: 'Trip ID', zh: 'Trip ID' },
  gvTxns: { en: 'Transactions', ar: 'المعاملات', ru: 'Transactions', de: 'Transactions', it: 'Transactions', hi: 'Transactions', ur: 'Transactions', ja: 'Transactions', zh: 'Transactions' },
  gvTxnType: { en: 'Transaction type', ar: 'نوع المعاملة', ru: 'Transaction type', de: 'Transaction type', it: 'Transaction type', hi: 'Transaction type', ur: 'Transaction type', ja: 'Transaction type', zh: 'Transaction type' },
  gvTicket: { en: 'Ticket', ar: 'التذكرة', ru: 'Ticket', de: 'Ticket', it: 'Ticket', hi: 'Ticket', ur: 'Ticket', ja: 'Ticket', zh: 'Ticket' },
  gvTare: { en: 'Tare', ar: 'الفارغ', ru: 'Tare', de: 'Tare', it: 'Tare', hi: 'Tare', ur: 'Tare', ja: 'Tare', zh: 'Tare' },
  gvTimeLocal: { en: 'Time (local)', ar: 'الوقت (محلي)', ru: 'Time (local)', de: 'Time (local)', it: 'Time (local)', hi: 'Time (local)', ur: 'Time (local)', ja: 'Time (local)', zh: 'Time (local)' },
  gvPlateLocal: { en: 'Vehicle Plate (local)', ar: 'اللوحة (محلي)', ru: 'Vehicle Plate (local)', de: 'Vehicle Plate (local)', it: 'Vehicle Plate (local)', hi: 'Vehicle Plate (local)', ur: 'Vehicle Plate (local)', ja: 'Vehicle Plate (local)', zh: 'Vehicle Plate (local)' },
  gvTruckLocal: { en: 'Truck (local)', ar: 'الشاحنة (محلي)', ru: 'Truck (local)', de: 'Truck (local)', it: 'Truck (local)', hi: 'Truck (local)', ur: 'Truck (local)', ja: 'Truck (local)', zh: 'Truck (local)' },

  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
};