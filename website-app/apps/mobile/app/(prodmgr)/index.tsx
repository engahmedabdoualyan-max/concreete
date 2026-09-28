/**
 * Production Manager Home
 * Dedicated screen: live KPIs + batch↔order linking + inventory-vs-orders
 * readiness check + shortcuts to production/mixing/workshop.
 * Uses the same Firestore data layer as the dashboard modules.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { loadDashboardStats, type DashboardStats } from "@/lib/dashboard";
import { erp, dataUsername } from "@/lib/firestore";
import { type SalesOrder } from "@/components/sales/BookingForm";

const BG = "#ECFDF5";
const ACCENT = "#059669";

/** Recipe factor vs the C30 base (matches the website batch calculator). */
function recipeFactor(concreteType?: string): number {
  const t = String(concreteType || "");
  if (t === "2000" || t === "2500") return 0.85;
  if (t === "3500") return 1.15;
  if (t === "4000" || t === "5000") return 1.3;
  return 1;
}

function recipeFor(concreteType?: string): string {
  const t = String(concreteType || "");
  if (t === "2000" || t === "2500") return "C25";
  if (t === "3500") return "C35";
  if (t === "4000" || t === "5000") return "C40";
  return "C30";
}

const INVENTORY_LABELS: Record<string, string> = {
  cement: "الأسمنت",
  sand: "الرمل",
  gravel: "الزلط",
  admixture: "الإضافات",
};
const INVENTORY_UNITS: Record<string, string> = {
  cement: "طن",
  sand: "طن",
  gravel: "طن",
  admixture: "لتر",
};

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
        borderColor: "rgba(5,150,105,0.15)",
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
    <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(5,150,105,0.12)", alignItems: "center" }}>
      <Text style={{ color, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

export default function ProductionMgrHome() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const u = dataUsername(user);
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, refetch } = useQuery<DashboardStats>({
    queryKey: ["prodmgr-stats", u],
    queryFn: () => loadDashboardStats(user),
    staleTime: 60_000,
  });

  const { data: orders } = useQuery<SalesOrder[]>({
    queryKey: ["prodmgr-orders", u],
    queryFn: async () => (await erp.loadOrders(u)) || [],
    refetchInterval: 30000,
  });

  const { data: runs } = useQuery<any[]>({
    queryKey: ["prodmgr-runs", u],
    queryFn: async () => (await erp.loadProductionRuns(u)) || [],
    refetchInterval: 30000,
  });

  const { data: inventory } = useQuery<Record<string, number> | null>({
    queryKey: ["prodmgr-inv", u],
    queryFn: async () => (await erp.loadInventory(u)) || null,
  });

  const saveRunsMutation = useMutation({
    mutationFn: async (list: any[]) => {
      const ok = await erp.saveProductionRuns(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prodmgr-runs", u] }),
  });

  const saveInventoryMutation = useMutation({
    mutationFn: async (v: any) => {
      const ok = await erp.saveInventory(u, v);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prodmgr-inv", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const s = stats;

  // ── Approved orders waiting for production (linked runs = fulfilled) ────────
  const approvedOrders = (orders || []).filter(
    (o) => o.accountStatus === "approved" && o.status !== "cancelled" && o.status !== "completed"
  );
  const concreteOrders = approvedOrders.filter((o) => o.orderType === "concrete");
  const blocksOrders = approvedOrders.filter((o) => o.orderType !== "concrete");

  const runsByOrderId = new Set<string>();
  (runs || []).forEach((r) => { if (r?.orderId) runsByOrderId.add(String(r.orderId)); });

  const pendingProduction = concreteOrders.filter((o) => !runsByOrderId.has(String(o.id)));

  // ── Inventory vs. orders readiness (same math as the website) ───────────────
  const inv = inventory || {};
  const cementNeeded = concreteOrders.reduce((s, o) => s + (Number(o.quantity) || 0) * 0.35 * recipeFactor(o.concreteType), 0);
  const sandNeeded = concreteOrders.reduce((s, o) => s + (Number(o.quantity) || 0) * 0.75 * recipeFactor(o.concreteType), 0);
  const gravelNeeded = concreteOrders.reduce((s, o) => s + (Number(o.quantity) || 0) * 1.1 * recipeFactor(o.concreteType), 0);

  const stockRows = [
    { key: "cement", have: Number(inv.cement) || 0, need: cementNeeded },
    { key: "sand", have: Number(inv.sand) || 0, need: sandNeeded },
    { key: "gravel", have: Number(inv.gravel) || 0, need: gravelNeeded },
  ];
  const shortages = stockRows.filter((r) => r.need > r.have && r.need > 0);

  // ── Create a production run linked to an order + deduct inventory ──────────
  const createRunForOrder = async (order: SalesOrder) => {
    const qty = Number(order.quantity) || 0;
    const factor = recipeFactor(order.concreteType);
    const cementN = 0.35 * qty * factor;
    const sandN = 0.75 * qty * factor;
    const gravelN = 1.1 * qty * factor;
    if ((Number(inv.cement) || 0) < cementN || (Number(inv.sand) || 0) < sandN || (Number(inv.gravel) || 0) < gravelN) {
      Alert.alert(
        "❌ خامات غير كافية",
        `هذه الدفعة تحتاج:\n• أسمنت ${cementN.toFixed(2)} طن (المتاح ${(Number(inv.cement) || 0).toFixed(2)})\n• رمل ${sandN.toFixed(2)} طن (المتاح ${(Number(inv.sand) || 0).toFixed(2)})\n• زلط ${gravelN.toFixed(2)} طن (المتاح ${(Number(inv.gravel) || 0).toFixed(2)})\n\nسجّل إضافة خامات أولاً.`
      );
      return;
    }
    const seq = (runs || []).length + 1;
    const rec = {
      batch: "B-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(seq).padStart(3, "0"),
      date: new Date().toISOString().slice(0, 10),
      product: recipeFor(order.concreteType),
      qty: qty,
      machine: "",
      status: "RUNNING",
      orderId: order.id,
      orderNo: order.orderNo || order.id,
      project: order.projectName,
      customer: order.customerName,
      cementUsed: Number(cementN.toFixed(2)),
      sandUsed: Number(sandN.toFixed(2)),
      gravelUsed: Number(gravelN.toFixed(2)),
    };
    await saveRunsMutation.mutateAsync([...(runs || []), rec]);
    await saveInventoryMutation.mutateAsync({
      ...inv,
      cement: Number(((Number(inv.cement) || 0) - cementN).toFixed(2)),
      sand: Number(((Number(inv.sand) || 0) - sandN).toFixed(2)),
      gravel: Number(((Number(inv.gravel) || 0) - gravelN).toFixed(2)),
    });
    erp
      .addNotification(u, {
        level: "info",
        title: "🏭 دفعة إنتاج جديدة " + rec.batch,
        body: `${order.customerName} · ${order.projectName} · ${qty} م³ (${rec.product})`,
      })
      .catch(() => {});
  };

  // ── Link an existing (unlinked) run to an order ─────────────────────────────
  const linkRunToOrder = async (run: any, order: SalesOrder) => {
    await saveRunsMutation.mutateAsync(
      (runs || []).map((r) =>
        r === run || r?.id === run?.id
          ? { ...r, orderId: order.id, orderNo: order.orderNo || order.id, project: order.projectName, customer: order.customerName }
          : r
      )
    );
  };

  const unlinkedRuns = (runs || []).filter((r) => !r?.orderId);

  const sortedRuns = [...(runs || [])].sort((a, b) =>
    String(b?.date || "").localeCompare(String(a?.date || ""))
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <View style={{ alignItems: "center", marginBottom: 18, marginTop: 6 }}>
          <Text style={{ color: "#1E293B", fontSize: 19, fontWeight: "900" }}>إدارة الإنتاج والجودة</Text>
          <Text style={{ color: ACCENT, fontSize: 12, fontWeight: "800", letterSpacing: 3, marginTop: 6 }}>PRODUCTION</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
          <Kpi value={String(s?.productionRuns ?? runs?.length ?? 0)} label="دفعات إنتاج" color={ACCENT} />
          <Kpi value={String(pendingProduction.length)} label="طلبات بانتظار صب" color="#D97706" />
          <Kpi value={String(s?.qc ?? 0)} label="فحوصات جودة" color="#0891B2" />
        </View>

        {/* ── Inventory vs orders readiness ── */}
        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>
          🧱 المخزون مقابل الطلبات
        </Text>
        <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "rgba(5,150,105,0.12)" }}>
          {stockRows.map((r) => {
            const short = r.need > r.have;
            const pct = r.need > 0 ? Math.min(100, (r.have / r.need) * 100) : 100;
            return (
              <View key={r.key} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: "#334155", fontSize: 12, fontWeight: "700" }}>
                    {INVENTORY_LABELS[r.key] || r.key}
                  </Text>
                  <Text style={{ color: short ? "#DC2626" : "#16A34A", fontSize: 12, fontWeight: "800" }}>
                    {r.have.toLocaleString("ar-EG")} / {r.need.toLocaleString("ar-EG")} {INVENTORY_UNITS[r.key] || ""}
                    {short ? " ⚠️" : ""}
                  </Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(5,150,105,0.1)", overflow: "hidden" }}>
                  <View style={{ width: `${pct}%`, height: "100%", backgroundColor: short ? "#DC2626" : "#059669", borderRadius: 4 }} />
                </View>
              </View>
            );
          })}
          {shortages.length === 0 ? (
            <Text style={{ color: "#16A34A", fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 2 }}>
              ✅ الخامات تكفي لجميع الطلبات المعتمدة
            </Text>
          ) : (
            <Text style={{ color: "#DC2626", fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 2 }}>
              ⛔ نقص خامات — أضف مخزون قبل بدء الصب
            </Text>
          )}
        </View>

        {/* ── Batch ↔ order linking ── */}
        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 }}>
          🏭 ربط الدفعات بالطلبات
        </Text>

        {pendingProduction.length === 0 ? (
          <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "rgba(5,150,105,0.12)" }}>
            <Text style={{ color: "#94A3B8", textAlign: "center", fontSize: 13 }}>
              {concreteOrders.length === 0
                ? "لا توجد طلبات خرسانة معتمدة بانتظار الإنتاج"
                : "كل الطلبات المعتمدة لها دفعة إنتاج ✓"}
            </Text>
          </View>
        ) : (
          pendingProduction.map((o) => (
            <View key={o.id} style={{ backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "rgba(5,150,105,0.15)" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: "#1E293B", fontSize: 14, fontWeight: "800" }}>
                  {o.orderNo || o.id}
                </Text>
                <Text style={{ color: "#059669", fontSize: 13, fontWeight: "900" }}>
                  {o.quantity} م³ · {recipeFor(o.concreteType)}
                </Text>
              </View>
              <Text style={{ color: "#64748B", fontSize: 12, marginBottom: 8 }}>
                {o.customerName} · {o.projectName} · {o.orderDate}
              </Text>
              <TouchableOpacity
                onPress={() => createRunForOrder(o)}
                disabled={saveRunsMutation.isPending}
                style={{ backgroundColor: "#059669", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: saveRunsMutation.isPending ? 0.6 : 1 }}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                  {saveRunsMutation.isPending ? "جارٍ..." : "🛠️ أنشئ دفعة مرتبطة (يخصم الخامات)"}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* ── Unlinked runs → link to an order ── */}
        {unlinkedRuns.length > 0 && (
          <>
            <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 6 }}>
              دفعات غير مرتبطة بطلب — اختر الطلب لربطها:
            </Text>
            {unlinkedRuns.map((r, i) => (
              <View key={i} style={{ backgroundColor: "#FFFBEB", borderRadius: 14, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "rgba(217,119,6,0.25)" }}>
                <Text style={{ color: "#92400E", fontSize: 13, fontWeight: "800", marginBottom: 6 }}>
                  دفعة {r.batch || r.id} — {r.product || "—"} · {r.qty} م³
                </Text>
                {concreteOrders.length === 0 ? (
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>لا توجد طلبات معتمدة للربط</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {concreteOrders.map((o) => (
                      <TouchableOpacity
                        key={o.id}
                        onPress={() => linkRunToOrder(r, o)}
                        style={{ backgroundColor: "#059669", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                      >
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                          {o.orderNo || o.id} · {o.quantity} م³
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── Recent production runs ── */}
        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 8 }}>
          📋 آخر الدفعات
        </Text>
        {sortedRuns.length === 0 ? (
          <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "rgba(5,150,105,0.12)" }}>
            <Text style={{ color: "#94A3B8", textAlign: "center", fontSize: 13 }}>لا توجد دفعات إنتاج بعد</Text>
          </View>
        ) : (
          sortedRuns.slice(0, 6).map((r, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "rgba(5,150,105,0.12)" }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: "#1E293B", fontSize: 13, fontWeight: "800" }}>دفعة {r.batch || r.id}</Text>
                  {r.status ? (
                    <View style={{ backgroundColor: "rgba(5,150,105,0.1)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: "#059669", fontSize: 9, fontWeight: "800" }}>{r.status}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>
                  {r.date || "—"} · {r.product || "—"} · {r.qty ?? ""} م³{r.machine ? ` · ${r.machine}` : ""}
                </Text>
                <Text style={{ color: r.orderNo ? "#059669" : "#B45309", fontSize: 11, marginTop: 2, fontWeight: "700" }}>
                  {r.orderNo ? `🔗 مرتبطة بالطلب ${r.orderNo}${r.customer ? " — " + r.customer : ""}` : "⚡ غير مرتبطة بطلب"}
                </Text>
              </View>
            </View>
          ))
        )}

        <Text style={{ color: "#334155", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 10 }}>وحداتي</Text>

        <ModuleLink
          emoji="🏭" en="Production" ar="الإنتاج" desc="الخلط والمخزون"
          color={ACCENT}
          onPress={() => router.push("/(dashboard)/production" as any)}
        />
        <ModuleLink
          emoji="🧪" en="Mixing & Quality" ar="المختبر والجودة" desc="الفحوصات والمعايرة"
          color="#0891B2"
          onPress={() => router.push("/(dashboard)/mixing" as any)}
        />
        <ModuleLink
          emoji="🔧" en="Workshop" ar="الورشة" desc="الصيانة والأسطول"
          color="#7C3AED"
          onPress={() => router.push("/(dashboard)/workshop" as any)}
        />
        <ModuleLink
          emoji="⚙️" en="Batch plant" ar="المصنع — تشغيل الباتش"
          desc="اشتغل خلطة + سجّل الاستهلاك الفعلي"
          color="#B45309"
          onPress={() => router.push("/(prodmgr)/batch-plant" as any)}
        />

        <View style={{ marginTop: 10, backgroundColor: "#D1FAE5", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(5,150,105,0.2)" }}>
          <Text style={{ color: "#065F46", fontSize: 13, fontWeight: "800", marginBottom: 4 }}>⚙️ نصائح إنتاجية</Text>
          <Text style={{ color: "#064E3B", fontSize: 12, lineHeight: 18 }}>
            أنشئ دفعة مرتبطة بكل طلب معتمد لتخصم الخامات تلقائياً، وراقب 🧱 المخزون مقابل الطلبات قبل بدء الوردية.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
