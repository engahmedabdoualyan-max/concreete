export interface TreeRole {
  key: string;
  ar: string;
  perms: string[];
  mods: string[];
}

const ALL_MODS = ['operations', 'production', 'workshop', 'mixing', 'schedule', 'orders', 'evaluation', 'rnd'];

export const TREE_ROLES: TreeRole[] = [
  { key: 'sysadmin', ar: 'مدير نظام', perms: ['كل الصلاحيات', 'لوحة الإدارة'], mods: ALL_MODS },
  { key: 'ptown', ar: 'صاحب مصنع', perms: ['متابعة الأقسام', 'التقارير'], mods: ALL_MODS },
  { key: 'driver', ar: 'سائق', perms: ['تسليم الطلبات', 'متابعة الشحنات', 'GPS الحظيرة'], mods: ['operations', 'orders'] },
  { key: 'sales', ar: 'مندوب مبيعات', perms: ['إنشاء الطلبات', 'العملاء', 'المشاريع'], mods: ['orders', 'operations'] },
  { key: 'accountant', ar: 'محاسب', perms: ['الفواتير', 'المدفوعات', 'التقارير المالية'], mods: ['orders', 'evaluation'] },
  { key: 'storekeeper', ar: 'أمين مخزن', perms: ['المخزون', 'المواد الخام', 'الموزعين'], mods: ['production', 'orders'] },
  { key: 'workshopMgr', ar: 'مدير ورشة', perms: ['الورشة', 'الأصول', 'الأعطال'], mods: ['workshop', 'production'] },
  { key: 'mechanic', ar: 'ميكانيكي', perms: ['أوامر الشغل', 'الصيانة'], mods: ['workshop'] },
  { key: 'batchOp', ar: 'مشغل محطة', perms: ['الإنتاج', 'الخلاطة', 'الوزن'], mods: ['production', 'mixing'] },
  { key: 'labMgr', ar: 'مدير مختبر', perms: ['المختبر', 'الجودة', 'المواصفات'], mods: ['mixing', 'evaluation', 'rnd'] },
  { key: 'labTech', ar: 'فني مختبر', perms: ['الفحوصات', 'المعايرة', 'العينات'], mods: ['mixing', 'evaluation', 'rnd'] },
];

export function treeModsForRole(key: string): string[] {
  const role = TREE_ROLES.find(r => r.key === key);
  return role ? [...role.mods] : [];
}

export const TREE_ROLE_KEYS: string[] = TREE_ROLES.map(r => r.key);
