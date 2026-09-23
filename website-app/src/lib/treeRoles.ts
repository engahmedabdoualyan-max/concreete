export interface TreeRole {
  key: string;
  ar: string;
  perms: string[];
  mods: string[];
}

const ALL_MODS = ['operations', 'production', 'workshop', 'mixing', 'schedule', 'orders', 'evaluation', 'rnd', 'governance', 'finance', 'materials', 'multiplant', 'hr'];

export const TREE_ROLES: TreeRole[] = [
  { key: 'sysadmin', ar: 'مدير نظام', perms: ['كل الصلاحيات', 'لوحة الإدارة'], mods: ALL_MODS },
  { key: 'ptown', ar: 'صاحب مصنع', perms: ['متابعة الأقسام', 'التقارير'], mods: ALL_MODS },
  { key: 'driver', ar: 'سائق', perms: ['تسليم الطلبات', 'متابعة الشحنات', 'GPS الحظيرة'], mods: ['operations', 'orders'] },
  { key: 'sales', ar: 'مندوب مبيعات', perms: ['إنشاء الطلبات', 'العملاء', 'المشاريع'], mods: ['orders', 'operations'] },
  { key: 'accountant', ar: 'محاسب', perms: ['الفواتير', 'المدفوعات', 'التقارير المالية'], mods: ['orders', 'evaluation', 'finance'] },
  { key: 'scheduleMgr', ar: 'مسئول الجدول', perms: ['اعتماد الجدول', 'إعادة الترتيب', 'تبكير وتأخير الصب'], mods: ['schedule', 'orders'] },
  { key: 'opsMgr', ar: 'مدير تشغيل', perms: ['التشغيل', 'الجدول', 'الطلبات'], mods: ['operations', 'schedule', 'orders', 'multiplant'] },
  { key: 'repsMgr', ar: 'مدير مناديب', perms: ['تتبع خط سير المناديب', 'إسناد المهام اليومية', 'متابعة الإنجاز'], mods: ['orders'] },
  { key: 'prodMgr', ar: 'مدير إنتاج', perms: ['الإنتاج', 'المختبر', 'الورشة'], mods: ['production', 'mixing', 'workshop', 'multiplant'] },
  { key: 'storekeeper', ar: 'أمين مخزن', perms: ['المخزون', 'المواد الخام', 'الموزعين'], mods: ['production', 'orders', 'materials'] },
  { key: 'workshopMgr', ar: 'مدير ورشة', perms: ['الورشة', 'الأصول', 'الأعطال'], mods: ['workshop', 'production'] },
  { key: 'mechanic', ar: 'ميكانيكي', perms: ['أوامر الشغل', 'الصيانة'], mods: ['workshop'] },
  { key: 'stationTech', ar: 'فني صيانة محطات', perms: ['بيان الفحص اليومي', 'جدول المتابعة', 'طلبات التغيير', 'الصيانة'], mods: ['workshop', 'mixing', 'multiplant'] },
  { key: 'batchOp', ar: 'مشغل محطة', perms: ['الإنتاج', 'الخلاطة', 'الوزن'], mods: ['production', 'mixing', 'multiplant'] },
  { key: 'labMgr', ar: 'مدير مختبر', perms: ['المختبر', 'الجودة', 'المواصفات'], mods: ['mixing', 'evaluation', 'rnd', 'materials'] },
  { key: 'labTech', ar: 'فني مختبر', perms: ['الفحوصات', 'المعايرة', 'العينات'], mods: ['mixing', 'evaluation', 'rnd', 'materials'] },
  { key: 'rndMgr', ar: 'مدير البحث والتطوير', perms: ['خطط التطوير', 'إسناد المهام', 'المتابعة الأسبوعية', 'تقييم الموظفين', 'ذكاء المنافسين'], mods: ['rnd', 'evaluation', 'orders'] },
  { key: 'hrOfficer', ar: 'موظف الموارد البشرية', perms: ['طلبات الإجازات والسلف', 'إعلانات الموظفين', 'الحضور والانصراف', 'مسيرات الرواتب'], mods: ['hr', 'orders'] },
];

export function treeModsForRole(key: string): string[] {
  const role = TREE_ROLES.find(r => r.key === key);
  return role ? [...role.mods] : [];
}

export const TREE_ROLE_KEYS: string[] = TREE_ROLES.map(r => r.key);
