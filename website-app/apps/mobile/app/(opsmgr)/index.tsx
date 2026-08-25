/**
 * Operations Manager Home
 * Dedicated screen: live KPIs + trip distribution board + live fleet map +
 * shortcuts to operations/schedule/orders.
 * Uses the same Firestore data layer as the dashboard modules.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from "react-native";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { loadDashboardStats, type DashboardStats } from "@/lib/dashboard";
import { erp, dataUsername } from "@/lib/firestore";

const BG = "#FFF7ED";
const ACCENT = "#EA580C";

interface LivePoint {
  id: string;
  label: string;
  emoji: string;
  lat: number;
  lng: number;
  live: boolean;
}

// ── Projection-based fleet map (no Google Maps key needed) ────────────────────
function FleetMap({ points, plant, tall }: {
  points: LivePoint[];
  plant: { lat: number; lng: number } | null;
  tall?: boolean;
}) {
  const W = Dimensions.get("window").width - (tall ? 40 : 52);
  const H = tall ? 340 : 190;
  const padX = 28, padTop = 28, padBottom = 22;

  const coords: { lat: number; lng: number }[] = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  if (plant) coords.push(plant);
  const all = coords.length ? coords : [{ lat: 26.4207, lng: 50.0888 }];
  const lats = all.map((c) => c.lat), lngs = all.map((c) => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const sLat = maxLat - minLat || 0.01, sLng = maxLng - minLng || 0.01;
  const x = (lng: number) => padX + ((lng - minLng) / sLng) * (W - padX * 2);
  const y = (lat: number) => H - padBottom - ((lat - minLat) / sLat) * (H - padTop - padBottom);

  const grid: React.ReactNode[] = [];
  for (let i = 0; i <= 4; i++) {
    const gx = (W / 4) * i, gy = (H / 4) * i;
    grid.push(
      <View key={`v${i}`} style={{ position: "absolute", left: gx, top: 0, width: 1, height: H, backgroundColor: "rgba(154,52,18,0.06)" }} />,
      <View key={`h${i}`} style={{ position: "absolute", left: 0, top: gy, width: W, height: 1, backgroundColor: "rgba(154,52,18,0.06)" }} />
    );
  }

  return (
    <View style={{ height: H, borderRadius: 14, backgroundColor: "#FFEDD5", overflow: "hidden" }}>
      {grid}
      {plant && (
        <View style={{ position: "absolute", left: x(plant.lng) - 14, top: y(plant.lat) - 28, alignItems: "center" }}>
          <Text style={{ fontSize: 22 }}>🏭</Text>
          <Text style={{ color: "#9A3412", fontSize: 9, fontWeight: "800", marginTop: 1 }}>المصنع</Text>
        </View>
      )}
      {points.map((p) => (
        <View key={p.id} style={{ position: "absolute", left: x(p.lng) - 13, top: y(p.lat) - 13, alignItems: "center" }}>
          <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: p.live ? "#22C55E" : "#F87171",
              borderWidth: 1,
              borderColor: "#fff",
              marginTop: 1,
            }}
          />
          {tall && (
            <Text style={{ color: "#7C2D12", fontSize: 9, fontWeight: "800", marginTop: 2, textAlign: "center", width: 90 }}>
              {p.label}
            </Text>
          )}
        </View>
      ))}
      {coords.length === 0 && (
        <Text style={{ color: "#9A3412", fontSize: 12, position: "absolute", top: H / 2 - 8, left: 0, right: 0, textAlign: "center" }}>
          لا توجد معدات بمواقع GPS مسجلة
        </Text>
      )}
    </View>
  );
}

function ModuleLink({ emoji, en, ar, desc, color, onPress }: {
  emoji: string; en: string; ar: string; desc: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        backgroundColor: "#fff",
        borderColor: "rgba(234,88,12,0.15)",
        borderWidth: 1,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View style={{ width: 72, alignItems: "center", justifyContent: "center", backgroundColor: `${color}15`, borderRightWidth: 1, borderRightColor: "rgba(0,0,0,0.05)" }}>
        <Text style={{ fontSize: 30 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, padding: 14, justifyContent: "center" }}>
        <Text style={{ color: "#1E293B", fontSize: 16, fontWeight: "900" }}>{en}</Text>
        <Text style={{ color, fontSize: 12, fontWeight: "700", marginTop: 2 }}>{ar}</Text>
        <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>{desc}</Text>
      </View>
      <View style={{ justifyContent: "center", paddingHorizontal: 14 }}>
        <Text style={{ color: ACCENT, fontSize: 18, fontWeight: "900" }}>‹</Text>
      </View>
    </TouchableOpacity>
  );
}

function Kpi({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(234,88,12,0.12)", alignItems: "center" }}>
      <Text style={{ color, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

const TRIP_STATUSES = ["SCHEDULED", "LOADING", "IN_TRANSIT", "AT_SITE", "POURING", "RETURNING", "DELAYED", "COMPLETED", "CANCELLED"];
const STATUS_AR: Record<string, string> = {
  SCHEDULED: "مجدولة",
  LOADING: "تحميل",
  IN_TRANSIT: "في الطريق",
  AT_SITE: "في الموقع",
  POURING: "صبّ",
  RETURNING: "عودة",
  DELAYED: "متأخرة",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};
const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "#F97316",
  LOADING: "#D97706",
  IN_TRANSIT: "#0891B2",
  AT_SITE: "#0284C7",
  POURING: "#7C3AED",
  RETURNING: "#4B5563",
  DELAYED: "#DC2626",
  COMPLETED: "#16A34A",
  CANCELLED: "#9CA3AF",
};

export default function OperationsMgrHome() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const u = dataUsername(user);
  const [refreshing, setRefreshing] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const { data: stats, refetch } = useQuery<DashboardStats>({
    queryKey: ["opsmgr-stats", u],
    queryFn: () => loadDashboardStats(user),
    staleTime: 60_000,
  });

  const { data: trips } = useQuery<any[]>({
    queryKey: ["opsmgr-trips", u],
    queryFn: async () => (await erp.loadTrips(u)) || [],
    refetchInterval: 30000,
  });

  const { data: assets } = useQuery<any[]>({
    queryKey: ["opsmgr-assets", u],
    queryFn: async () => (await erp.loadAssets(u)) || [],
  });

  const { data: live } = useQuery<any[]>({
    queryKey: ["opsmgr-live", u],
    queryFn: async () => (await erp.loadLivePositions(u)) || [],
    refetchInterval: 30000,
  });

  const { data: plantProfile } = useQuery<any>({
    queryKey: ["opsmgr-plant", u],
    queryFn: async () => (await erp.loadPlantProfile(u)) || null,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const s = stats;

  // ── Trip distribution board (today) ─────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const tripList = (trips || []).filter((t) => String(t?.date || "") === today);
  const driverMap = new Map<string, { name: string; trips: number; qty: number; active: number }>();
  tripList.forEach((t) => {
    const name = String(t?.driver || "").trim() || "غير محدد";
    if (!driverMap.has(name)) driverMap.set(name, { name, trips: 0, qty: 0, active: 0 });
    const d = driverMap.get(name)!;
    d.trips++;
    d.qty += Number(t?.qty) || 0;
    const st = String(t?.status || "").toUpperCase();
    if (st !== "COMPLETED" && st !== "CANCELLED") d.active++;
  });
  const driverBoard = [...driverMap.values()].sort((a, b) => b.qty - a.qty);

  const statusCounts = TRIP_STATUSES.map((st) => ({
    status: st,
    count: tripList.filter((t) => String(t?.status || "").toUpperCase() === st).length,
  })).filter((x) => x.count > 0);

  const activeTrips = tripList.filter((t) => {
    const st = String(t?.status || "").toUpperCase();
    return st !== "COMPLETED" && st !== "CANCELLED";
  }).length;

  // ── Live fleet map points ───────────────────────────────────────────────────
  const liveByAsset = new Map<string, any>();
  (live || []).forEach((e) => { if (e?.assetId) liveByAsset.set(e.assetId, e); });

  const points: LivePoint[] = (assets || []).flatMap((a) => {
    const lp = liveByAsset.get(a?.id);
    let lat: number | null = null, lng: number | null = null, liveFlag = false;
    if (lp && typeof lp.lat === "number" && typeof lp.lng === "number") {
      const fresh = Date.now() - (Number(lp.ts) || 0) < 180000;
      if (fresh) { lat = lp.lat; lng = lp.lng; liveFlag = true; }
    }
    if (lat === null && typeof a?.gpsLat === "number" && typeof a?.gpsLng === "number") {
      lat = a.gpsLat;
      lng = a.gpsLng;
    }
    if (lat === null || lng === null) return [];
    return [{
      id: a.id,
      label: `${a.id}${a.plate ? " — " + a.plate : ""}`,
      emoji: a.type === "batching" ? "🏗️" : a.type === "pump" ? "🚰" : "🚚",
      lat,
      lng,
      live: liveFlag,
    }];
  });

  const plant =
    plantProfile && typeof plantProfile.gpsLat === "number" && typeof plantProfile.gpsLng === "number"
      ? { lat: plantProfile.gpsLat, lng: plantProfile.gpsLng }
      : null;

  const liveCount = points.filter((p) => p.live).length;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <View style={{ alignItems: "center", marginBottom: 18, marginTop: 6 }}>
          <Text style={{ color: "#1E293B", fontSize: 19, fontWeight: "900" }}>إدارة التشغيل والجدول</Text>
          <Text style={{ color: ACCENT, fontSize: 12, fontWeight: "800", letterSpacing: 3, marginTop: 6 }}>OPERATIONS</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
          <Kpi value={String(s?.todayTrips ?? tripList.length)} label="رحلات اليوم" color={ACCENT} />
          <Kpi value={`${s?.volume ?? 0} م³`} label="إجمالي الكمية" color="#D97706" />
          <Kpi value={String(activeTrips)} label="جارية الآن" color="#0284C7" />
        </View>

        {/* ── Trip distribution board ── */}
        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>
          🎯 توزيع الرحلات (اليوم)
        </Text>
        {driverBoard.length === 0 ? (
          <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(234,88,12,0.12)", marginBottom: 12 }}>
            <Text style={{ color: "#94A3B8", textAlign: "center", fontSize: 13 }}>
              لا توجد رحلات مجدولة اليوم
            </Text>
          </View>
        ) : (
          driverBoard.map((d, i) => (
            <View
              key={d.name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#fff",
                borderRadius: 14,
                padding: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: "rgba(234,88,12,0.12)",
              }}
            >
              <Text style={{ color: "#C2410C", fontSize: 16, fontWeight: "900", width: 28 }}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#1E293B", fontSize: 14, fontWeight: "800" }}>{d.name}</Text>
                <Text style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>
                  {d.trips} رحلة · {d.qty} م³ {d.active > 0 ? `· ${d.active} نشطة` : ""}
                </Text>
              </View>
              <View style={{ width: 90, height: 8, borderRadius: 4, backgroundColor: "rgba(234,88,12,0.1)", overflow: "hidden" }}>
                <View
                  style={{
                    width: `${Math.min(100, (d.qty / (driverBoard[0].qty || 1)) * 100)}%`,
                    height: "100%",
                    backgroundColor: d.active > 0 ? "#EA580C" : "#16A34A",
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>
          ))
        )}

        {statusCounts.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {statusCounts.map((x) => (
              <View key={x.status} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(234,88,12,0.12)" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_COLOR[x.status] || "#94A3B8" }} />
                <Text style={{ color: "#334155", fontSize: 11, fontWeight: "700" }}>
                  {STATUS_AR[x.status] || x.status} ({x.count})
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Live fleet map ── */}
        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>
          🗺️ خريطة الأسطول الحية
        </Text>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setShowMap((v) => !v)}>
          <FleetMap points={points} plant={plant} tall={showMap} />
        </TouchableOpacity>
        <Text style={{ color: "#94A3B8", fontSize: 11, textAlign: "center", marginTop: 6, marginBottom: 14 }}>
          {liveCount} معدة حية الآن من أصل {points.length} · ⛶ اضغط للتصغير/التكبير
        </Text>

        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>وحداتي</Text>

        <ModuleLink
          emoji="🚚" en="Operations" ar="التشغيل" desc="تفريغ الشحنات وتتبع الأسطول"
          color={ACCENT}
          onPress={() => router.push("/(dashboard)/operations" as any)}
        />
        <ModuleLink
          emoji="📅" en="Schedule" ar="الجدول" desc="جدولة الصب الذكي"
          color="#0891B2"
          onPress={() => router.push("/(dashboard)/schedule" as any)}
        />
        <ModuleLink
          emoji="📦" en="Orders" ar="الطلبات" desc="الطلبات والاعتمادات"
          color="#D97706"
          onPress={() => router.push("/(dashboard)/orders" as any)}
        />

        <View style={{ marginTop: 10, backgroundColor: "#FFEDD5", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(234,88,12,0.2)" }}>
          <Text style={{ color: "#9A3412", fontSize: 13, fontWeight: "800", marginBottom: 4 }}>⚙️ نصائح تشغيلية</Text>
          <Text style={{ color: "#7C2D12", fontSize: 12, lineHeight: 18 }}>
            تابِع توزيع الرحلات على السائقين ووازن بينهم (البار لكل سائق)، وراقب الحالات المتأخرة 🟥 في خريطة الأسطول الحية.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
