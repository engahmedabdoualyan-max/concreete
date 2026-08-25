/**
 * Owner Monitoring Screen — "شاشة التقييم"
 * A single combined control-room view for the plant owner:
 *   • Overall plant score + department-by-department evaluation
 *   • Live KPIs across all sections
 *   • Fleet map (equipment positions, plant HQ)
 * Every panel expands to full screen when tapped (X closes it back).
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, Pressable, Dimensions } from "react-native";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadOwnerReport, type OwnerReport, type DeptScore, type MapPoint, type StaffStat } from "@/lib/owner-monitor";
import { dataUsername } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.10)";
const ACCENT = "#38BDF8";

// ── Fleet map (projection-based, no Google Maps key needed) ────────────────
function FleetMap({ points, plant, tall }: { points: MapPoint[]; plant: { lat: number; lng: number } | null; tall?: boolean }) {
  const W = Dimensions.get("window").width - (tall ? 32 : 48);
  const H = tall ? 420 : 190;
  const padX = 28, padTop = 28, padBottom = 22;

  const coords: { lat: number; lng: number }[] = points.map(p => ({ lat: p.lat, lng: p.lng }));
  if (plant) coords.push(plant);
  const all = coords.length ? coords : [{ lat: 26.4207, lng: 50.0888 }];
  const lats = all.map(c => c.lat), lngs = all.map(c => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const sLat = maxLat - minLat || 0.01, sLng = maxLng - minLng || 0.01;
  const x = (lng: number) => padX + ((lng - minLng) / sLng) * (W - padX * 2);
  const y = (lat: number) => H - padBottom - ((lat - minLat) / sLat) * (H - padTop - padBottom);

  const grid: React.ReactNode[] = [];
  for (let i = 0; i <= 4; i++) {
    const gx = (W / 4) * i, gy = (H / 4) * i;
    grid.push(
      <View key={`v${i}`} style={{ position: "absolute", left: gx, top: 0, width: 1, height: H, backgroundColor: "rgba(148,163,184,0.08)" }} />,
      <View key={`h${i}`} style={{ position: "absolute", left: 0, top: gy, width: W, height: 1, backgroundColor: "rgba(148,163,184,0.08)" }} />
    );
  }

  return (
    <View style={{ height: H, borderRadius: 14, backgroundColor: "#0B1220", overflow: "hidden" }}>
      {grid}
      {plant && (
        <View style={{ position: "absolute", left: x(plant.lng) - 14, top: y(plant.lat) - 28, alignItems: "center" }}>
          <Text style={{ fontSize: 22 }}>🏭</Text>
          <Text style={{ color: "#FBBF24", fontSize: 9, fontWeight: "800", marginTop: 1 }}>المصنع</Text>
        </View>
      )}
      {points.map(p => {
        const color = p.live ? "#22C55E" : p.status === "Ready" ? "#34D399" : p.status === "Workshop" || p.status === "In Workshop" ? "#FBBF24" : "#F87171";
        return (
          <View key={p.id} style={{ position: "absolute", left: x(p.lng) - 13, top: y(p.lat) - 13, alignItems: "center" }}>
            <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color, borderWidth: 1, borderColor: "#fff", marginTop: 1 }} />
            {tall && <Text style={{ color: "#E2E8F0", fontSize: 9, fontWeight: "800", marginTop: 2, textAlign: "center" }}>{p.id}</Text>}
          </View>
        );
      })}
      {coords.length === 0 && (
        <Text style={{ color: "#94A3B8", fontSize: 12, position: "absolute", top: H / 2 - 8, left: 0, right: 0, textAlign: "center" }}>
          لا توجد معدات بمواقع GPS مسجلة
        </Text>
      )}
    </View>
  );
}

function DeptBar({ d, tall }: { d: DeptScore; tall?: boolean }) {
  const color = d.score >= 85 ? "#34D399" : d.score >= 70 ? "#38BDF8" : d.score >= 55 ? "#FBBF24" : d.score >= 40 ? "#FB923C" : "#F87171";
  return (
    <View style={{ marginBottom: tall ? 18 : 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ color: "#E2E8F0", fontSize: tall ? 16 : 12, fontWeight: "800" }}>
          {d.icon} {d.name}
        </Text>
        <Text style={{ color, fontSize: tall ? 17 : 12, fontWeight: "900" }}>{d.score}%</Text>
      </View>
      <View style={{ height: tall ? 12 : 8, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <View style={{ width: `${Math.max(2, d.score)}%`, height: "100%", backgroundColor: color, borderRadius: 6 }} />
      </View>
      {tall && d.details && d.details !== "لا توجد بيانات" && (
        <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 4 }}>{d.details}</Text>
      )}
    </View>
  );
}

// ── Expandable panel card ─────────────────────────────────────────────────────
function Panel({ title, emoji, accent, children, onExpand }: {
  title: string; emoji: string; accent: string; children: React.ReactNode; onExpand: () => void;
}) {
  return (
    <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>{emoji} {title}</Text>
        <TouchableOpacity onPress={onExpand} style={{ backgroundColor: `${accent}22`, borderColor: `${accent}55`, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ color: accent, fontSize: 11, fontWeight: "800" }}>⛶ تكبير</Text>
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

// ── Staff performance (trips per driver / orders per rep) ────────────────────
function StaffRow({ s }: { s: StaffStat }) {
  const accent = s.role === "driver" ? "#38BDF8" : "#34D399";
  return (
    <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 10, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: "#E2E8F0", fontSize: 13, fontWeight: "800" }}>
          {s.role === "driver" ? "🚛" : "📦"} {s.name}
        </Text>
        <Text style={{ color: accent, fontSize: 13, fontWeight: "900" }}>
          {s.role === "driver" ? `${s.trips} رحلة · ${s.qty.toFixed(0)} م³` : `${s.orders} طلب`}
        </Text>
      </View>
      <Text style={{ color: "#94A3B8", fontSize: 10, fontWeight: "700", marginTop: 3 }}>
        {s.role === "driver" ? `${s.completed} مكتملة` : `${s.completed} قيد التقدم/مكتملة`}
      </Text>
    </View>
  );
}

export default function OwnerMonitorScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rep, refetch } = useQuery<OwnerReport>({
    queryKey: ["owner-monitor", dataUsername(user)],
    queryFn: () => loadOwnerReport(user),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const r = rep;
  const overall = r?.overall ?? 0;
  const overallColor = overall >= 85 ? "#34D399" : overall >= 70 ? "#38BDF8" : overall >= 55 ? "#FBBF24" : overall >= 40 ? "#FB923C" : "#F87171";

  const fullscreen = (
    <Modal visible={expanded !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(null)}>
      <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>
            {expanded === "overall" ? "📊 التقييم العام" : expanded === "depts" ? "🏆 تقييم الأقسام" : expanded === "kpis" ? "📈 المؤشرات الحية" : expanded === "map" ? "🗺️ خريطة المعدات" : expanded === "staff" ? "👷 تقارير الأداء" : ""}
          </Text>
          <TouchableOpacity onPress={() => setExpanded(null)} style={{ backgroundColor: "rgba(248,113,113,0.15)", borderColor: "rgba(248,113,113,0.5)", borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: "#F87171", fontSize: 14, fontWeight: "900" }}>✕ إغلاق</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {expanded === "overall" && r && (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <View style={{ width: 170, height: 170, borderRadius: 85, backgroundColor: `${overallColor}18`, borderWidth: 5, borderColor: overallColor, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontSize: 46, fontWeight: "900" }}>{overall}%</Text>
                <Text style={{ color: overallColor, fontSize: 16, fontWeight: "800" }}>{r.label}</Text>
              </View>
              <Text style={{ color: "#94A3B8", fontSize: 13, marginTop: 18, textAlign: "center", lineHeight: 20 }}>
                متوسط تقييم كل الأقسام صاحب بيانات في آخر 30 يوم.{`\n`}اضغط على أي قسم من القائمة السابقة للتفاصيل.
              </Text>
              {r.depts.filter(d => d.score > 0).map(d => <DeptBar key={d.key} d={d} tall />)}
            </View>
          )}
          {expanded === "depts" && r && (
            <View>
              {r.depts.map(d => (
                <View key={d.key} style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>{d.icon} {d.name}</Text>
                    <Text style={{ color: d.color, fontSize: 18, fontWeight: "900" }}>{d.score}%</Text>
                  </View>
                  <View style={{ height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 10 }}>
                    <View style={{ width: `${Math.max(2, d.score)}%`, height: "100%", backgroundColor: d.color, borderRadius: 5 }} />
                  </View>
                  <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 8 }}>{d.details}</Text>
                </View>
              ))}
            </View>
          )}
          {expanded === "kpis" && r && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              {r.kpis.map((k, i) => (
                <View key={i} style={{ width: "46%", backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center" }}>
                  <Text style={{ color: k.color, fontSize: 30, fontWeight: "900" }}>{k.value}</Text>
                  <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "700", marginTop: 4, textAlign: "center" }}>{k.label}</Text>
                </View>
              ))}
            </View>
          )}
          {expanded === "map" && r && (
            <View>
              <FleetMap points={r.points} plant={r.plant} tall />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E", marginRight: 5 }} /><Text style={{ color: "#94A3B8", fontSize: 11 }}>موقع حي</Text></View>
                <View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#34D399", marginRight: 5 }} /><Text style={{ color: "#94A3B8", fontSize: 11 }}>جاهزة</Text></View>
                <View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#FBBF24", marginRight: 5 }} /><Text style={{ color: "#94A3B8", fontSize: 11 }}>بالورشة</Text></View>
                <View style={{ flexDirection: "row", alignItems: "center" }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#F87171", marginRight: 5 }} /><Text style={{ color: "#94A3B8", fontSize: 11 }}>عطل</Text></View>
                <Text style={{ color: "#94A3B8", fontSize: 11 }}>🏭 المصنع</Text>
              </View>
              {r.points.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900", marginBottom: 8 }}>المعدات ({r.points.length})</Text>
                  {r.points.map(p => (
                    <View key={p.id} style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: "#E2E8F0", fontSize: 12, fontWeight: "700" }}>{p.emoji} {p.label}</Text>
                      <Text style={{ color: p.live ? "#22C55E" : "#94A3B8", fontSize: 11, fontWeight: "700" }}>{p.live ? "● حي" : p.status}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
          {expanded === "staff" && r && (
            <View>
              <View style={{ backgroundColor: "rgba(56,189,248,0.1)", borderColor: "rgba(56,189,248,0.3)", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <Text style={{ color: "#7DD3FC", fontSize: 12, fontWeight: "700", textAlign: "center" }}>
                  آخر 30 يوم · رحلات كل سائق وطلبات كل مندوب
                </Text>
              </View>
              <Text style={{ color: "#FBBF24", fontSize: 14, fontWeight: "900", marginBottom: 8 }}>🚛 السائقون ({r.staff.filter(s => s.role === "driver").length})</Text>
              {r.staff.filter(s => s.role === "driver").map(s => <StaffRow key={"d" + s.name} s={s} />)}
              <Text style={{ color: "#34D399", fontSize: 14, fontWeight: "900", marginBottom: 8, marginTop: 14 }}>📦 المندوبون ({r.staff.filter(s => s.role === "rep").length})</Text>
              {r.staff.filter(s => s.role === "rep").map(s => <StaffRow key={"r" + s.name} s={s} />)}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {fullscreen}
      <View style={{ paddingTop: insets.top, backgroundColor: "rgba(11,17,30,0.9)" }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/(dashboard)" as any))} style={{ padding: 6 }}>
            <Text style={{ color: ACCENT, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>👁️ شاشة التقييم الشامل</Text>
          <View style={{ width: 28 }} />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <View style={{ alignItems: "center", marginBottom: 18, marginTop: 6 }}>
          <Text style={{ color: "#fff", fontSize: 19, fontWeight: "900" }}>شاشة التقييم الشامل</Text>
          <Text style={{ color: ACCENT, fontSize: 12, fontWeight: "800", letterSpacing: 4, marginTop: 6 }}>OWNER MONITOR</Text>
        </View>

        {/* Overall score card */}
        <TouchableOpacity
          onPress={() => setExpanded("overall")}
          activeOpacity={0.9}
          style={{ backgroundColor: CARD, borderColor: `${overallColor}55`, borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 16, alignItems: "center" }}
        >
          <Text style={{ color: "#94A3B8", fontSize: 13, fontWeight: "700", marginBottom: 8 }}>التقييم العام للمصنع (آخر 30 يوم)</Text>
          <Text style={{ color: overallColor, fontSize: 54, fontWeight: "900" }}>{overall}%</Text>
          <Text style={{ color: overallColor, fontSize: 16, fontWeight: "800" }}>{r?.label ?? "جارِ الحساب..."}</Text>
          <Text style={{ color: ACCENT, fontSize: 11, fontWeight: "700", marginTop: 10 }}>⛶ اضغط للتكبير</Text>
        </TouchableOpacity>

        {/* Departments panel */}
        <Panel title="تقييم الأقسام" emoji="🏆" accent="#FBBF24" onExpand={() => setExpanded("depts")}>
          {r ? (
            r.depts.map(d => <DeptBar key={d.key} d={d} />)
          ) : (
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>جارِ التحميل...</Text>
          )}
        </Panel>

        {/* Staff performance panel */}
        <Panel title="تقارير الأداء" emoji="👷" accent="#34D399" onExpand={() => setExpanded("staff")}>
          {r ? (
            r.staff.length ? (
              <>
                <Text style={{ color: "#7DD3FC", fontSize: 11, fontWeight: "800", marginBottom: 6 }}>🚛 رحلات السائقين</Text>
                {r.staff.filter(s => s.role === "driver").slice(0, 3).map(s => <StaffRow key={"d" + s.name} s={s} />)}
                {r.staff.filter(s => s.role === "rep").length > 0 && (
                  <Text style={{ color: "#6EE7B7", fontSize: 11, fontWeight: "800", marginTop: 8, marginBottom: 6 }}>📦 طلبات المندوبين</Text>
                )}
                {r.staff.filter(s => s.role === "rep").slice(0, 3).map(s => <StaffRow key={"r" + s.name} s={s} />)}
              </>
            ) : (
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>لا توجد بيانات بعد</Text>
            )
          ) : (
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>جارِ التحميل...</Text>
          )}
          <Text style={{ color: ACCENT, fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "center" }}>⛶ اضغط للتكبير — كل السائقين والمندوبين</Text>
        </Panel>

        {/* Live KPIs panel */}
        <Panel title="مؤشرات حية" emoji="📈" accent="#60A5FA" onExpand={() => setExpanded("kpis")}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
            {(r?.kpis ?? []).slice(0, 4).map((k, i) => (
              <View key={i} style={{ width: "48%", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 10, alignItems: "center" }}>
                <Text style={{ color: k.color, fontSize: 20, fontWeight: "900" }}>{k.value}</Text>
                <Text style={{ color: "#94A3B8", fontSize: 10, fontWeight: "700", marginTop: 2, textAlign: "center" }}>{k.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: ACCENT, fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "center" }}>⛶ اضغط للتكبير — كل المؤشرات</Text>
        </Panel>

        {/* Fleet map panel */}
        <Panel title="خريطة المعدات" emoji="🗺️" accent="#34D399" onExpand={() => setExpanded("map")}>
          <FleetMap points={r?.points ?? []} plant={r?.plant ?? null} />
          <Text style={{ color: ACCENT, fontSize: 11, fontWeight: "700", marginTop: 8, textAlign: "center" }}>
            ⛶ اضغط للتكبير · {r?.points.length ?? 0} معدة بموقع GPS
          </Text>
        </Panel>

        {/* Latest snapshot */}
        {r && (
          <View style={{ backgroundColor: "rgba(56,189,248,0.08)", borderColor: "rgba(56,189,248,0.25)", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 }}>
            <Text style={{ color: "#7DD3FC", fontSize: 11, fontWeight: "700" }}>
              آخر تحديث: {new Date(r.generatedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })} — اسحب للأسفل للتحديث
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
