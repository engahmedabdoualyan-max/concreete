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
  { key: 'financeMgr', ar: 'مدير مالي', perms: ['اعتماد المدفوعات', 'حدود الائتمان', 'الميزان والمرتجعات', 'التقارير المالية'], mods: ['orders', 'evaluation', 'finance', 'governance'] },
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
  if (role) return [...role.mods];
  // API (Postgres) roles are UPPER_SNAKE and never match the legacy lowercase
  // tree keys above — without this map every API login resolved to [] and the
  // dashboard rendered zero cards. Only modules with a real web route are
  // listed here.
  return [...(API_ROLE_MODS[key] ?? [])];
}

/**
 * Dashboard modules per API role (see user_role enum in src/db/schema.ts).
 * Fail-closed: a role missing here sees no cards, same as before.
 */
const API_ALL = [...ALL_MODS.filter(m => m !== 'hr'), 'procurement'];

const API_ROLE_MODS: Record<string, string[]> = {
  SUPER_ADMIN: API_ALL,
  PLANT_MGR: API_ALL,
  ACCOUNTANT: ['orders', 'evaluation', 'finance', 'procurement'],
  LAB_TECH: ['mixing', 'evaluation', 'rnd', 'materials'],
  LAB_TECHNICIAN: ['mixing', 'evaluation', 'rnd', 'materials'],
  LAB_MGR: ['mixing', 'evaluation', 'rnd', 'materials'],
  BATCH_OPERATOR: ['production', 'mixing', 'multiplant'],
  BATCH_OP: ['production', 'mixing', 'multiplant'],
  SALES_REP: ['orders', 'operations'],
  REPS_MGR: ['orders'],
  // Drivers must never reach the fleet map: MODULES has no sites card and
  // QuickJump limits DRIVER to ['/', '/operations'] — keep it that way.
  DRIVER: ['operations', 'orders'],
  FINANCE: ['orders', 'evaluation', 'finance', 'governance'],
  CFO: ['orders', 'evaluation', 'finance', 'governance', 'procurement'],
  DISPATCHER: ['operations', 'schedule', 'orders'],
  SCHEDULE_MGR: ['schedule', 'orders'],
  OPERATIONS_MGR: ['operations', 'schedule', 'orders', 'multiplant', 'procurement'],
  PRODUCTION_MGR: ['production', 'mixing', 'workshop', 'multiplant', 'procurement'],
  WORKSHOP_MGR: ['workshop', 'production', 'procurement'],
  WORKSHOP_MECHANIC: ['workshop'],
  MECHANIC: ['workshop'],
  STOREKEEPER: ['production', 'orders', 'materials', 'procurement'],
  STATION_TECH: ['workshop', 'mixing', 'multiplant'],
  RND_MANAGER: ['rnd', 'evaluation', 'orders'],
  // '/hr' exists (HR command page), so HR roles get a working card.
  HR_OFFICER: ['hr', 'orders'],
  // Gate officer: the gate card alone. Narrow by design — this account must
  // never wander into procurement, finance or HR.
  GATE_OPERATOR: ['gate'],
  HR_MANAGER: ['hr', 'orders', 'evaluation'],
};

export const TREE_ROLE_KEYS: string[] = TREE_ROLES.map(r => r.key);
