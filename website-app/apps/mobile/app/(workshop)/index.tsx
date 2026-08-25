/**
 * Workshop Manager Home (مدير ورشة)
 * Dedicated panel: live KPIs + shortcuts + integration of the station-tech
 * change requests (stn_requests) so the workshop can approve/reject them.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Image } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { erp, dataUsername } from "@/lib/firestore";

const BG = "#F5F3FF";
const ACCENT = "#7C3AED";

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
        borderColor: "rgba(124,58,237,0.15)",
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
    <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(124,58,237,0.12)", alignItems: "center" }}>
      <Text style={{ color, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

function Pill({ s, c }: { s: string; c: string }) {
  return <Text style={{ color: c, fontSize: 10, fontWeight: "900", backgroundColor: `${c}22`, borderColor: `${c}55`, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: "hidden", textAlign: "center" }}>{s}</Text>;
}

function Row({ title, sub, right, border, photo }: { title: string; sub?: string; right?: React.ReactNode; border?: string; photo?: string }) {
  return (
    <View style={{ backgroundColor: "#fff", borderColor: border || "rgba(124,58,237,0.12)", borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#1E293B", fontSize: 14, fontWeight: "900" }}>{title}</Text>
          {sub ? <Text style={{ color: "#64748B", fontSize: 12, marginTop: 3 }}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: "100%", height: 160, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" }}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

export default function WorkshopMgrHome() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["wsmgr-all", u],
    queryFn: async () => {
      const [assets, breakdowns, prs, warehouse, stnRequests] = await Promise.all([
        erp.loadAssets(u).catch(() => null),
        erp.loadBreakdowns(u).catch(() => null),
        erp.loadPurchaseReqs(u).catch(() => null),
        erp.loadWarehouse(u).catch(() => null),
        erp.loadStnRequests(u).catch(() => null),
      ]);
      return { assets, breakdowns, prs, warehouse, stnRequests };
    },
    staleTime: 60_000,
  });

  const saveStn = useMutation({
    mutationFn: async (values: any[]) => erp.saveStnRequests(u, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wsmgr-all", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.refetchQueries({ queryKey: ["wsmgr-all", u] });
    setRefreshing(false);
  }, [qc, u]);

  const list = (v: any) => (Array.isArray(v) ? v : []);
  const assets = list(data?.assets) as any[];
  const breakdowns = list(data?.breakdowns) as any[];
  const prs = list(data?.prs) as any[];
  const warehouse = list(data?.warehouse) as any[];
  const stnRequests = list(data?.stnRequests) as any[];

  const openBDs = breakdowns.filter((b) => b.status === "Open" || b.status === "In Repair");
  const workshopAssets = assets.filter((a) => a.status === "Workshop" || a.status === "In Workshop" || a.status === "MAJOR_BREAKDOWN").length;
  const pendingPrs = prs.filter((p) => p.status === "Pending");
  const pendingStn = stnRequests.filter((r) => r.status === "pending" || r.status === "approved");
  const lowStock = warehouse.filter((w) => w.safetyStock > 0 && w.currentStock <= w.safetyStock);

  const decide = (id: string, status: "approved" | "rejected") => {
    saveStn.mutate(stnRequests.map((r) => (String(r.id) === String(id) ? { ...r, status } : r)));
  };

  const prioColor = (p: string) => p === "high" ? "#F87171" : p === "medium" ? "#FBBF24" : "#94A3B8";
  const statusAr = (s: string) => ({ pending: "قيد الانتظار", approved: "موافق", rejected: "مرفوض", done: "تم" }[s] || s);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <View style={{ alignItems: "center", marginBottom: 18, marginTop: 6 }}>
          <Text style={{ color: "#1E293B", fontSize: 19, fontWeight: "900" }}>الورشة والصيانة</Text>
          <Text style={{ color: ACCENT, fontSize: 12, fontWeight: "800", letterSpacing: 3, marginTop: 6 }}>WORKSHOP</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <Kpi value={String(openBDs.length)} label="أعطال مفتوحة" color="#EF4444" />
          <Kpi value={String(workshopAssets)} label="مركبات بالورشة" color="#F59E0B" />
          <Kpi value={String(pendingPrs.length)} label="طلبات شراء" color="#FB923C" />
          <Kpi value={String(pendingStn.length)} label="طلبات المحطات" color="#06B6D4" />
        </View>

        {pendingStn.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>🔧 طلبات فني المحطات (تغيير)</Text>
            {pendingStn.map((r) => (
              <Row key={r.id} border="rgba(6,182,212,0.3)" photo={r.photo}
                title={`${r.stationName || "—"} · ${r.itemType || "—"} — ${r.itemName || ""}`}
                sub={`${r.date} · ${r.reason || ""}`}
                right={
                  <View style={{ gap: 6, alignItems: "flex-end" }}>
                    <Pill s={r.priority || ""} c={prioColor(r.priority)} />
                    <Pill s={statusAr(r.status)} c={r.status === "approved" ? "#34D399" : r.status === "rejected" ? "#F87171" : "#FBBF24"} />
                    {r.status !== "approved" && r.status !== "rejected" ? (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity onPress={() => decide(r.id, "approved")}><Text style={{ color: "#16A34A", fontSize: 12, fontWeight: "800" }}>موافقة</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => decide(r.id, "rejected")}><Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "800" }}>رفض</Text></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                }
              />
            ))}
          </View>
        ) : null}

        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>وحداتي</Text>

        <ModuleLink
          emoji="🔧" en="Workshop" ar="الورشة" desc="الوقود والزيت وقطع الغيار والأعطال"
          color={ACCENT}
          onPress={() => router.push("/(dashboard)/workshop" as any)}
        />
        <ModuleLink
          emoji="🏭" en="Production" ar="الإنتاج" desc="دفعات الإنتاج والخلاطات"
          color="#34D399"
          onPress={() => router.push("/(dashboard)/production" as any)}
        />

        {lowStock.length > 0 && (
          <View style={{ marginTop: 10, backgroundColor: "#FEF2F2", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" }}>
            <Text style={{ color: "#B91C1C", fontSize: 13, fontWeight: "800", marginBottom: 4 }}>🚨 {lowStock.length} صنف تحت مستوى الأمان</Text>
            <Text style={{ color: "#7F1D1D", fontSize: 12, lineHeight: 18 }}>
              {lowStock.map((w) => w.code + " — " + w.name).join(" · ")}
            </Text>
          </View>
        )}

        <View style={{ marginTop: 10, backgroundColor: "#EDE9FE", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(124,58,237,0.2)" }}>
          <Text style={{ color: "#5B21B6", fontSize: 13, fontWeight: "800", marginBottom: 4 }}>⚙️ نصائح الصيانة</Text>
          <Text style={{ color: "#4C1D95", fontSize: 12, lineHeight: 18 }}>
            راقب الأعطال المفتوحة وطلبات الشراء من الصفحة الرئيسية، واعتمد طلبات فني المحطات فوراً لاستكمال الصيانة في وقتها.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
