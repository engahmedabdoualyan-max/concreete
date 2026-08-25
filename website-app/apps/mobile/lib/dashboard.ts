/**
 * Native ERP Dashboard — module registry + live stats
 * Mirrors the website's dashboard module grid (same 8 modules + admin).
 */

import { erp, dataUsername } from "@/lib/firestore";
import type { AuthUser } from "@/types";

export interface DashboardModule {
  key: string;
  en: string;
  ar: string;
  desc: string;
  icon: string; // emoji (no asset pipeline needed for RN)
  color: string; // accent tint
  path: string; // expo-router href
  adminOnly?: boolean;
}

export const MODULES: DashboardModule[] = [
  { key: "orders", en: "Orders", ar: "الطلبات", desc: "Order entry & approvals", icon: "📦", color: "#38BDF8", path: "/(dashboard)/orders" },
  { key: "operations", en: "Operations", ar: "التشغيل", desc: "Fleet dispatch & tracking", icon: "🚚", color: "#F97316", path: "/(dashboard)/operations" },
  { key: "production", en: "Production", ar: "الإنتاج", desc: "Batching & inventory", icon: "🏭", color: "#34D399", path: "/(dashboard)/production" },
  { key: "workshop", en: "Workshop", ar: "الورشة", desc: "Maintenance & fleet", icon: "🔧", color: "#A78BFA", path: "/(dashboard)/workshop" },
  { key: "mixing", en: "Mixing & Quality", ar: "المختبر والجودة", desc: "QC samples & calibration", icon: "🧪", color: "#FBBF24", path: "/(dashboard)/mixing" },
  { key: "schedule", en: "Schedule", ar: "الجدول", desc: "Smart daily pouring", icon: "📅", color: "#2DD4BF", path: "/(dashboard)/schedule" },
  { key: "evaluation", en: "Evaluation", ar: "التقييم", desc: "Plant OEE & KPI", icon: "📊", color: "#FB7185", path: "/(dashboard)/evaluation" },
  { key: "rnd", en: "R & D", ar: "البحث والتطوير", desc: "Innovation & training", icon: "⚗️", color: "#60A5FA", path: "/(dashboard)/rnd" },
  { key: "owner", en: "Owner Monitor", ar: "شاشة التقييم", desc: "مراقبة شاملة: تقييم كل الأقسام + خريطة المعدات", icon: "👁️", color: "#FBBF24", path: "/(dashboard)/owner", adminOnly: true },
  { key: "admin", en: "Admin", ar: "الإدارة", desc: "Users, roles & permissions", icon: "🛠️", color: "#E2E8F0", path: "/(dashboard)/admin", adminOnly: true },
];

export interface DashboardStats {
  trips: number;
  todayTrips: number;
  volume: number;
  orders: number;
  productionRuns: number;
  inventoryItems: number;
  qc: number;
  assets: number;
  customers: number;
  oeeLogs: number;
  deliveries: number;
}

export async function loadDashboardStats(user: AuthUser | null): Promise<DashboardStats> {
  const u = dataUsername(user);
  const empty: DashboardStats = {
    trips: 0, todayTrips: 0, volume: 0, orders: 0, productionRuns: 0,
    inventoryItems: 0, qc: 0, assets: 0, customers: 0, oeeLogs: 0, deliveries: 0,
  };
  const [trips, orders, runs, inv, qc, assets, customers, oee, dels] = await Promise.all([
    erp.loadTrips(u).catch(() => null),
    erp.loadOrders(u).catch(() => null),
    erp.loadProductionRuns(u).catch(() => null),
    erp.loadInventory(u).catch(() => null),
    erp.loadQCRecords(u).catch(() => null),
    erp.loadAssets(u).catch(() => null),
    erp.loadCustomers(u).catch(() => null),
    erp.loadOEELogs(u).catch(() => null),
    erp.loadDeliveries(u).catch(() => null),
  ]);
  const list = (v: any) => (Array.isArray(v) ? v : []);
  const today = new Date().toISOString().slice(0, 10);
  const tripList = list(trips);
  return {
    trips: tripList.length,
    todayTrips: tripList.filter((t) => t?.date === today).length,
    volume: tripList.reduce((s, t) => s + (Number(t?.qty) || 0), 0),
    orders: list(orders).length,
    productionRuns: list(runs).length,
    inventoryItems: inv && typeof inv === "object" ? Object.keys(inv).length : 0,
    qc: list(qc).length,
    assets: list(assets).length,
    customers: list(customers).length,
    oeeLogs: list(oee).length,
    deliveries: list(dels).length,
  };
}

export function moduleStat(m: DashboardModule, s: DashboardStats): string {
  switch (m.key) {
    case "orders": return `${s.orders} طلب`;
    case "operations": return `${s.todayTrips} رحلة اليوم · ${s.volume} م³`;
    case "production": return `${s.productionRuns} دفعة · ${s.inventoryItems} خامة`;
    case "workshop": return `${s.assets} معدة`;
    case "mixing": return `${s.qc} فحص`;
    case "schedule": return `${s.deliveries} تسليمة · ${s.customers} عميل`;
    case "evaluation": return `${s.oeeLogs} سجل تقييم`;
    case "owner": return "تقييم الأقسام · خريطة المعدات";
    case "rnd": return "ابتكار وتدريب";
    case "admin": return "مستخدمين وصلاحيات";
    default: return "";
  }
}
