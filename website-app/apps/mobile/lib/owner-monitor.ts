/**
 * Owner Monitoring — data + scoring for the "شاشة التقييم" screen.
 * Mirrors the website's Evaluation.tsx scoring so the owner sees the same
 * department ratings and overall plant score on mobile, plus a live fleet map.
 */

import { erp, dataUsername } from "@/lib/firestore";
import type { AuthUser } from "@/types";

export interface DeptScore {
  key: string;
  name: string;
  icon: string;
  score: number; // 0..100
  details: string;
  color: string;
}

export interface MapPoint {
  id: string;
  label: string;
  type: string;
  status: string;
  emoji: string;
  lat: number;
  lng: number;
  live: boolean;
}

export interface StaffStat {
  name: string;
  role: "driver" | "rep";
  trips: number;
  orders: number;
  qty: number;
  completed: number;
}

export interface OwnerReport {
  overall: number;
  label: string;
  depts: DeptScore[];
  kpis: { label: string; value: string; color: string }[];
  plant: { lat: number; lng: number } | null;
  points: MapPoint[];
  staff: StaffStat[];
  generatedAt: number;
}

const NUM = (v: any) => Number(v) || 0;
const todayStr = () => new Date().toISOString().slice(0, 10);

function daysBetween(from: string, to: string): number {
  const d1 = new Date(from), d2 = new Date(to);
  const ms = Math.abs(d2.getTime() - d1.getTime());
  return Math.max(1, Math.ceil(ms / 86400000) + 1);
}

function inRange(item: any, from: string, to: string): boolean {
  const d = String(item?.date || item?.orderDate || "");
  return !!d && d >= from && d <= to;
}

function ratingColor(score: number): string {
  if (score >= 85) return "#34D399";
  if (score >= 70) return "#38BDF8";
  if (score >= 55) return "#FBBF24";
  if (score >= 40) return "#FB923C";
  return "#F87171";
}

function ratingLabel(score: number): string {
  if (score >= 85) return "ممتاز";
  if (score >= 70) return "جيد جداً";
  if (score >= 55) return "جيد";
  if (score >= 40) return "مقبول";
  return "ضعيف";
}

const TYPE_ICON: Record<string, string> = {
  Mixer: "🚛", "Mobile Pump": "🎯", "Light Vehicle": "🚗", Loader: "🚜",
  Generator: "⚡", Station: "🏗️",
};

export async function loadOwnerReport(user: AuthUser | null): Promise<OwnerReport> {
  const u = dataUsername(user);
  const from = new Date(); from.setMonth(from.getMonth() - 1);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = todayStr();
  const days = daysBetween(fromStr, toStr);

  const [trips, orders, stations, breakdowns, assets, live, plantProfile, runs, qc, oee, deliveries, production] = await Promise.all([
    erp.loadTrips(u).catch(() => null),
    erp.loadOrders(u).catch(() => null),
    erp.loadStations(u).catch(() => null),
    erp.loadBreakdowns(u).catch(() => null),
    erp.loadAssets(u).catch(() => null),
    erp.loadLivePositions(u).catch(() => null),
    erp.loadPlantProfile(u).catch(() => null),
    erp.loadProductionRuns(u).catch(() => null),
    erp.loadQCRecords(u).catch(() => null),
    erp.loadOEELogs(u).catch(() => null),
    erp.loadDeliveries(u).catch(() => null),
    erp.loadInventory(u).catch(() => null),
  ]);

  const tripsL = (Array.isArray(trips) ? trips : []);
  const ordersL = (Array.isArray(orders) ? orders : []);
  const stationsL = (Array.isArray(stations) ? stations : []);
  const bdL = (Array.isArray(breakdowns) ? breakdowns : []);
  const assetsL = (Array.isArray(assets) ? assets : []);
  const liveL = (Array.isArray(live) ? live : []);
  const runsL = (Array.isArray(runs) ? runs : []);
  const qcL = (Array.isArray(qc) ? qc : []);
  const oeeL = (Array.isArray(oee) ? oee : []);
  const delivL = (Array.isArray(deliveries) ? deliveries : []);

  const ftrips = tripsL.filter(t => inRange(t, fromStr, toStr));
  const forders = ordersL.filter(o => inRange(o, fromStr, toStr));
  const fbd = bdL.filter(b => inRange(b, fromStr, toStr));

  // ── 1. محطات الخلط ──
  let stationsScore = 0, stationsDetail = "لا توجد بيانات";
  if (stationsL.length) {
    let total = 0, active = 0;
    stationsL.forEach(s => {
      if (s.status === "Running") {
        active++;
        const eff = (NUM(s.actualCap) / (NUM(s.designCap) || 1)) * 100;
        total += Math.min(eff, 100);
      }
    });
    const avgEff = active ? total / active : 0;
    const avail = (active / stationsL.length) * 100;
    stationsScore = Math.round(avgEff * 0.7 + avail * 0.3);
    stationsDetail = `الكفاءة ${avgEff.toFixed(1)}% · التوفر ${avail.toFixed(1)}% (${active}/${stationsL.length} محطة)`;
  }

  // ── 2. السيارات الخلاطة ──
  let trucksScore = 0, trucksDetail = "لا توجد رحلات";
  if (ftrips.length) {
    const totalQty = ftrips.reduce((s, t) => s + NUM(t.qty), 0);
    const avgDaily = totalQty / days;
    const targetDaily = 1000;
    const done = ftrips.filter(t => (String(t.status || "").toUpperCase() === "COMPLETED")).length;
    const compRate = (done / ftrips.length) * 100;
    const qtyAch = Math.min((avgDaily / targetDaily) * 100, 100);
    trucksScore = Math.round(compRate * 0.5 + qtyAch * 0.5);
    trucksDetail = `الإنجاز ${qtyAch.toFixed(1)}% · الإكمال ${compRate.toFixed(1)}% · ${avgDaily.toFixed(0)} م³/يوم`;
  }

  // ── 3. المضخات ──
  let pumpsScore = 0, pumpsDetail = "لا توجد رحلات بمضخات";
  {
    const withPump = ftrips.filter(t => t.pump && t.pump !== "--");
    if (withPump.length) {
      const pumpStats: Record<string, { trips: number; qty: number; delays: number; wait: number }> = {};
      withPump.forEach(t => {
        if (!pumpStats[t.pump]) pumpStats[t.pump] = { trips: 0, qty: 0, delays: 0, wait: 0 };
        const p = pumpStats[t.pump];
        p.trips++; p.qty += NUM(t.qty);
        const arr = String(t.pumpArrivalTime || ""), pour = String(t.pourStartTime || "");
        if (arr && pour && arr !== "00:00" && pour !== "00:00") {
          const am = Number(arr.split(":")[0]) * 60 + Number(arr.split(":")[1]);
          const pm = Number(pour.split(":")[0]) * 60 + Number(pour.split(":")[1]);
          if (pm > am) p.wait += pm - am;
        }
        if (t.delayReason && t.delayReason !== "ready") p.delays++;
      });
      const pumpCount = Object.keys(pumpStats).length;
      const avgTrips = withPump.length / pumpCount;
      const avgQty = withPump.reduce((s, t) => s + NUM(t.qty), 0) / pumpCount;
      const avgWait = Object.values(pumpStats).reduce((s, p) => s + p.wait, 0) / withPump.length;
      const delayRate = (Object.values(pumpStats).reduce((s, p) => s + p.delays, 0) / withPump.length) * 100;
      const tEff = Math.min((avgTrips / (20 * days)) * 100, 100);
      const qEff = Math.min((avgQty / (200 * days)) * 100, 100);
      const wPen = Math.min((avgWait / 30) * 5, 30);
      const dPen = Math.min((delayRate / 10) * 5, 20);
      pumpsScore = Math.round(Math.max(0, tEff * 0.4 + qEff * 0.4 + (100 - wPen - dPen) * 0.2));
      pumpsDetail = `${pumpCount} مضخة · متوسط ${avgTrips.toFixed(1)} رحلة · انتظار ${avgWait.toFixed(0)} دقيقة · تأخير ${delayRate.toFixed(1)}%`;
    }
  }

  // ── 4. الورشة ──
  let wsScore = 0, wsDetail = "لا توجد أعطال";
  if (bdL.length) {
    const resolved = fbd.filter(b => b.status === "Resolved").length;
    const open = fbd.length - resolved;
    const resRate = fbd.length ? (resolved / fbd.length) * 100 : 100;
    const openPen = Math.min(open * 5, 30);
    const avgCost = fbd.length ? fbd.reduce((s, b) => s + NUM(b.repairCost), 0) / fbd.length : 0;
    const costScore = Math.max(0, 100 - avgCost / 10);
    wsScore = Math.round(Math.max(0, resRate * 0.6 + costScore * 0.4 - openPen));
    wsDetail = `الحل ${resRate.toFixed(1)}% · مفتوح ${open} · متوسط التكلفة ${avgCost.toFixed(0)}`;
  }

  // ── 5. المبيعات ──
  let salesScore = 0, salesDetail = "لا توجد مبيعات";
  if (ftrips.length) {
    const totalQty = ftrips.filter(t => NUM(t.qty) > 0).reduce((s, t) => s + NUM(t.qty), 0);
    const avgDaily = totalQty / days;
    let target = 1000;
    if (stationsL.length) {
      const cap = stationsL.filter(s => s.type === "Concrete" || s.type === "Both").reduce((s, x) => s + NUM(x.designCap), 0);
      target = Math.max(1000, cap * 8);
    }
    const ach = Math.min((avgDaily / target) * 100, 150);
    salesScore = Math.round(Math.min(ach, 100));
    salesDetail = `${totalQty.toFixed(0)} م³ · متوسط ${avgDaily.toFixed(0)} م³/يوم · الهدف ${target.toFixed(0)}`;
  }

  // ── 6. الطلبات ──
  let ordersScore = 0, ordersDetail = "لا توجد طلبات";
  if (forders.length) {
    const total = forders.length;
    const done = forders.filter(o => o.status === "completed").length;
    const scheduled = forders.filter(o => o.status === "scheduled").length;
    const cancelled = forders.filter(o => o.status === "cancelled").length;
    const approved = forders.filter(o => o.accountStatus === "approved").length;
    const comp = (done / total) * 100, sch = (scheduled / total) * 100;
    const appr = (approved / total) * 100, can = (cancelled / total) * 100;
    ordersScore = Math.round(Math.max(0, comp * 0.4 + sch * 0.3 + appr * 0.3 - can * 0.2));
    ordersDetail = `${total} طلب · مكتمل ${done} · مجدول ${scheduled} · موافقة ${appr.toFixed(1)}%`;
  }

  // ── 7. الإنتاج ──
  let prodScore = 0, prodDetail = "لا توجد دفعات إنتاج";
  if (runsL.length) {
    const runsInRange = runsL.filter(r => inRange(r, fromStr, toStr)).length;
    const avgDaily = runsInRange / days;
    const ach = Math.min((avgDaily / 20) * 100, 100);
    prodScore = Math.round(ach);
    prodDetail = `${runsInRange} دفعة · متوسط ${avgDaily.toFixed(1)}/يوم`;
  }

  // ── 8. الجودة ──
  let qcScore = 0, qcDetail = "لا توجد فحوصات";
  if (qcL.length) {
    const pass = qcL.filter(r => /pass|accept|ok|مطابق/i.test(String(r.status || ""))).length;
    const rate = (pass / qcL.length) * 100;
    qcScore = Math.round(rate);
    qcDetail = `${pass}/${qcL.length} مطابق · ${rate.toFixed(1)}%`;
  }

  // ── 9. OEE ──
  let oeeScore = 0, oeeDetail = "لا توجد سجلات تقييم";
  if (oeeL.length) {
    const avg = oeeL.reduce((s, r) => s + NUM(r.oee), 0) / oeeL.length;
    oeeScore = Math.round(avg);
    oeeDetail = `متوسط OEE ${avg.toFixed(1)}%`;
  }

  const depts: DeptScore[] = [
    { key: "stations", name: "محطات الخلط", icon: "🏭", score: stationsScore, details: stationsDetail, color: "#38BDF8" },
    { key: "trucks", name: "السيارات الخلاطة", icon: "🚛", score: trucksScore, details: trucksDetail, color: "#34D399" },
    { key: "pumps", name: "المضخات", icon: "🚰", score: pumpsScore, details: pumpsDetail, color: "#38BDF8" },
    { key: "workshop", name: "الورشة", icon: "🔧", score: wsScore, details: wsDetail, color: "#FB923C" },
    { key: "sales", name: "المبيعات", icon: "💰", score: salesScore, details: salesDetail, color: "#34D399" },
    { key: "orders", name: "الطلبات", icon: "📦", score: ordersScore, details: ordersDetail, color: "#2DD4BF" },
    { key: "production", name: "الإنتاج", icon: "🏭", score: prodScore, details: prodDetail, color: "#FBBF24" },
    { key: "quality", name: "الجودة", icon: "🧪", score: qcScore, details: qcDetail, color: "#60A5FA" },
    { key: "oee", name: "التقييم OEE", icon: "📊", score: oeeScore, details: oeeDetail, color: "#FB7185" },
  ];

  const present = depts.filter(d => d.score > 0);
  const overall = present.length
    ? Math.round(present.reduce((s, d) => s + d.score, 0) / present.length)
    : 0;

  // ── KPIs ──
  const today = todayStr();
  const todayTrips = tripsL.filter(t => String(t?.date || "") === today).length;
  const todayQty = tripsL.filter(t => String(t?.date || "") === today).reduce((s, t) => s + NUM(t.qty), 0);
  const openBd = bdL.filter(b => b.status === "Open" || b.status === "In Repair").length;
  const readyAssets = assetsL.filter(a => a.status === "Ready").length;
  const invItems = production && typeof production === "object" ? Object.keys(production).length : 0;

  const kpis = [
    { label: "رحلات اليوم", value: String(todayTrips), color: "#38BDF8" },
    { label: "كمية اليوم م³", value: todayQty.toFixed(0), color: "#F97316" },
    { label: "طلبات", value: String(ordersL.length), color: "#34D399" },
    { label: "دفعات إنتاج", value: String(runsL.length), color: "#FBBF24" },
    { label: "فحوصات", value: String(qcL.length), color: "#60A5FA" },
    { label: "معدات جاهزة", value: `${readyAssets}/${assetsL.length}`, color: "#2DD4BF" },
    { label: "أعطال مفتوحة", value: String(openBd), color: openBd ? "#F87171" : "#34D399" },
    { label: "خامات", value: String(invItems), color: "#A78BFA" },
    { label: "تسليمات", value: String(delivL.length), color: "#FB7185" },
  ];

  // ── Staff performance: trips per driver, orders per sales rep ──
  const driverStats = new Map<string, StaffStat>();
  ftrips.forEach(t => {
    const name = String(t.driver || t.mixer || "").trim() || "غير محدد";
    if (!driverStats.has(name)) driverStats.set(name, { name, role: "driver", trips: 0, orders: 0, qty: 0, completed: 0 });
    const s = driverStats.get(name)!;
    s.trips++;
    s.qty += NUM(t.qty);
    if (String(t.status || "").toUpperCase() === "COMPLETED") s.completed++;
  });
  const repStats = new Map<string, StaffStat>();
  forders.forEach(o => {
    const name = String(o.salesRep || o.repName || "").trim() || "غير محدد";
    if (!repStats.has(name)) repStats.set(name, { name, role: "rep", trips: 0, orders: 0, qty: 0, completed: 0 });
    const s = repStats.get(name)!;
    s.orders++;
    if (o.status === "completed" || o.status === "scheduled" || o.status === "in_progress") s.completed++;
  });
  const staff = [
    ...[...driverStats.values()].sort((a, b) => b.qty - a.qty),
    ...[...repStats.values()].sort((a, b) => b.orders - a.orders),
  ];

  // ── Map points ──
  const plantGps =
    plantProfile && typeof plantProfile.gpsLat === "number" && typeof plantProfile.gpsLng === "number"
      ? { lat: plantProfile.gpsLat, lng: plantProfile.gpsLng }
      : null;

  const liveByAsset = new Map<string, any>();
  liveL.forEach(e => { if (e?.assetId) liveByAsset.set(e.assetId, e); });

  const points: MapPoint[] = [];
  assetsL.forEach(a => {
    let lat: number | null = null, lng: number | null = null, liveFlag = false;
    const lp = liveByAsset.get(a.id);
    if (lp && typeof lp.lat === "number" && typeof lp.lng === "number") {
      const fresh = Date.now() - NUM(lp.ts) < 180000;
      if (fresh) { lat = lp.lat; lng = lp.lng; liveFlag = true; }
      else if (lat === null && typeof a.gpsLat === "number" && typeof a.gpsLng === "number") { lat = a.gpsLat; lng = a.gpsLng; }
    }
    if (lat === null && typeof a.gpsLat === "number" && typeof a.gpsLng === "number") { lat = a.gpsLat; lng = a.gpsLng; }
    if (lat === null || lng === null) return;
    points.push({
      id: a.id,
      label: `${a.id}${a.plate ? " — " + a.plate : ""}`,
      type: a.type || "",
      status: a.status || "",
      emoji: TYPE_ICON[a.type] || "🚚",
      lat, lng, live: liveFlag,
    });
  });

  return { overall, label: ratingLabel(overall), depts, kpis, plant: plantGps, points, staff, generatedAt: Date.now() };
}
