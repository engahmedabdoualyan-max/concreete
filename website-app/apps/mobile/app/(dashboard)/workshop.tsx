/**
 * Native ERP — Workshop (الورشة)
 * Full port of the website's Workshop module: all 11 sections.
 * Reads/writes the same Firestore collections the website uses
 * (assets, workshopConfig, ws_fuel, ws_oil, ws_parts, ws_breakdowns,
 *  ws_warehouse, ws_purchreq, ws_stations, ws_maints).
 */

import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { erp, dataUsername } from "@/lib/firestore";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.10)";
const ACCENT = "#A78BFA";
const INPUT = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 10, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };

// ─── Types (mirror website Workshop.tsx) ───────────────────────────────────────
interface Asset { id: string; plate: string; chassis: string; type: string; status: string; driver: string; initOdo: number; engHours: number; regExpiry: string; insExpiry: string; opcardExpiry: string; authExpiry: string; gpsId: string; tare: string; gross: string; [k: string]: any; }
interface FuelLog { id: number; date: string; assetId: string; odoReading: number; liters: number; costPerLiter: number; totalCost: number; fuelType: string; station: string; invoice: string; notes: string; }
interface OilLog { id: number; date: string; assetId: string; oilType: string; brand: string; quantity: number; unit: string; cost: number; odoReading: number; nextChangeOdo: number; notes: string; }
interface SparePartLog { id: number; date: string; assetId: string; partName: string; partNumber: string; quantity: number; unitCost: number; totalCost: number; supplier: string; invoice: string; warranty: string; notes: string; }
interface BreakdownReport { id: number; date: string; assetId: string; reportedBy: string; symptom: string; severity: "Critical" | "Major" | "Minor"; status: "Open" | "In Repair" | "Resolved"; mechanicAssigned: string; repairStart: string; repairEnd: string; repairDesc: string; partsUsed: string; repairCost: number; notes: string; }
interface WarehouseItem { id: number; code: string; name: string; category: string; currentStock: number; minStock: number; safetyStock: number; unit: string; unitCost: number; supplier: string; location: string; lastUpdated: string; notes: string; }
interface PurchaseRequest { id: number; date: string; warehouseItemId: number; itemCode: string; itemName: string; qty: number; reason: string; requestedBy: string; approvedBy: string; status: "Pending" | "Approved" | "Rejected" | "Received"; priority: "High" | "Medium" | "Low"; notes: string; autoRejected: boolean; }
interface MixingStation { id: number; plantId: string; name: string; productType: "concrete" | "blocks" | "both"; operator: string; designCap: number; actualCap: number; unit: string; location: string; installDate: string; status: "Running" | "Maintenance" | "Stopped"; notes: string; }
interface PeriodicMaint { id: number; stationId: number; date: string; taskType: string; description: string; technician: string; nextDue: string; status: "Done" | "Scheduled" | "Overdue"; cost: number; notes: string; }

type Tab = "home" | "fuel" | "oil" | "parts" | "breakdown" | "prs" | "warehouse" | "vehiclereport" | "stations" | "config" | "reports";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: "الرئيسية", emoji: "🏠" },
  { id: "fuel", label: "الوقود", emoji: "⛽" },
  { id: "oil", label: "الزيت", emoji: "🛢️" },
  { id: "parts", label: "قطع الغيار", emoji: "🔩" },
  { id: "breakdown", label: "الأعطال", emoji: "🚨" },
  { id: "prs", label: "طلبات الشراء", emoji: "🛒" },
  { id: "warehouse", label: "المستودع", emoji: "📦" },
  { id: "vehiclereport", label: "تقرير السيارة", emoji: "📊" },
  { id: "stations", label: "محطات الخلط", emoji: "🏭" },
  { id: "config", label: "الإعدادات", emoji: "⚙️" },
  { id: "reports", label: "التقارير", emoji: "🧾" },
];

const DEF_CONFIG = { stationName: "Model Plant", globalBudget: "50000", maintBudget: "15000", tyreBudget: "8000", lightFuelBudget: "4000", heavyFuelBudget: "23000", targetProd: "12000", fuelEffTarget: "2.5" };

const today = () => new Date().toISOString().split("T")[0];

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;

const assetOptions = (assets: Asset[]) => assets.map((a) => ({ value: a.id, label: `${a.id}${a.plate ? " · " + a.plate : ""}` }));
const SEVERITIES = ["Critical", "Major", "Minor"];
const FUEL_TYPES = ["Diesel", "Petrol", "Gas"];

function SevPill({ s }: { s: string }) {
  const c = s === "Critical" ? "#F87171" : s === "Major" ? "#FB923C" : "#FBBF24";
  return <Text style={{ color: c, fontSize: 10, fontWeight: "900", backgroundColor: `${c}22`, borderColor: `${c}55`, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: "hidden", textAlign: "center" }}>{s}</Text>;
}
function StatPill({ s, c }: { s: string; c: string }) {
  return <Text style={{ color: c, fontSize: 10, fontWeight: "900", backgroundColor: `${c}22`, borderColor: `${c}55`, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: "hidden", textAlign: "center" }}>{s}</Text>;
}

// ─── Reusable field components ─────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, numeric = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder || label} placeholderTextColor="#64748B" keyboardType={numeric ? "numeric" : "default"} style={INPUT} />
    </View>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: string[] | { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {items.map((o) => (
          <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} style={{ backgroundColor: value === o.value ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)", borderColor: value === o.value ? "rgba(167,139,250,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
            <Text style={{ color: value === o.value ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: "30%", backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
      <Text style={{ color, fontSize: 16, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: "#94A3B8", fontSize: 10, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

function Row({ title, sub, right, onPress, border }: { title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; border?: string }) {
  return (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={{ backgroundColor: CARD, borderColor: border || BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>{title}</Text>
          {sub ? <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 3 }}>{sub}</Text> : null}
        </View>
        {right}
      </View>
    </TouchableOpacity>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>{children}</View>;
}
function ActBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ backgroundColor: `${color}22`, borderColor: `${color}66`, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Generic form sheet ────────────────────────────────────────────────────────
interface FField { key: string; label: string; numeric?: boolean; }
function FormSheet({ visible, title, fields, values, onChange, onSubmit, onClose, pending, submitLabel = "💾 حفظ", extra }: {
  visible: boolean; title: string; fields: FField[]; values: Record<string, string>; onChange: (k: string, v: string) => void;
  onSubmit: () => void; onClose: () => void; pending?: boolean; submitLabel?: string; extra?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={onClose}>
          <Pressable style={{ backgroundColor: "#0B111E", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "92%" }} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "900", textAlign: "center" }}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20 }}>
                <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "900" }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                {fields.map((f) => (
                  <Field key={f.key} label={f.label} value={values[f.key] ?? ""} onChange={(v) => onChange(f.key, v)} numeric={f.numeric} />
                ))}
              </View>
              {extra}
              <TouchableOpacity onPress={onSubmit} disabled={pending} style={{ backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: pending ? 0.6 : 1 }}>
                <Text style={{ color: "#0B111E", fontWeight: "900", fontSize: 15 }}>{pending ? "جارِ الحفظ..." : submitLabel}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function WorkshopScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);

  const [tab, setTab] = useState<Tab>("home");
  const [refreshing, setRefreshing] = useState(false);

  const { data: ws, isLoading } = useQuery({
    queryKey: ["ws-all", u],
    queryFn: async () => {
      const [assets, config, fuel, oil, parts, breakdowns, warehouse, prs, stations, maints, trips] = await Promise.all([
        erp.loadAssets(u).catch(() => null),
        erp.loadWorkshopConfig(u).catch(() => null),
        erp.loadFuelLogs(u).catch(() => null),
        erp.loadOilLogs(u).catch(() => null),
        erp.loadSparePartLogs(u).catch(() => null),
        erp.loadBreakdowns(u).catch(() => null),
        erp.loadWarehouse(u).catch(() => null),
        erp.loadPurchaseReqs(u).catch(() => null),
        erp.loadStations(u).catch(() => null),
        erp.loadPeriodicMaints(u).catch(() => null),
        erp.loadTrips(u).catch(() => null),
      ]);
      return {
        assets: (assets || []) as Asset[], config: (config || DEF_CONFIG) as any, fuel: (fuel || []) as FuelLog[], oil: (oil || []) as OilLog[],
        parts: (parts || []) as SparePartLog[], breakdowns: (breakdowns || []) as BreakdownReport[], warehouse: (warehouse || []) as WarehouseItem[],
        prs: (prs || []) as PurchaseRequest[], stations: (stations || []) as MixingStation[], maints: (maints || []) as PeriodicMaint[], trips: (trips || []) as any[],
      };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const savers: Record<string, (a: string, b: any) => Promise<boolean>> = {
        assets: erp.saveAssets, config: (a, b) => erp.saveWorkshopConfig(a, b), fuel: erp.saveFuelLogs,
        oil: erp.saveOilLogs, parts: erp.saveSparePartLogs, breakdowns: erp.saveBreakdowns,
        warehouse: erp.saveWarehouse, prs: erp.savePurchaseReqs, stations: erp.saveStations,
        maints: erp.savePeriodicMaints,
      };
      const ok = await savers[key](u, value);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ws-all", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["ws-all", u] });
    setRefreshing(false);
  }, [qc, u]);

  const assets = ws?.assets || [];
  const config = ws?.config || DEF_CONFIG;
  const fuel = ws?.fuel || [];
  const oil = ws?.oil || [];
  const parts = ws?.parts || [];
  const breakdowns = ws?.breakdowns || [];
  const warehouse = ws?.warehouse || [];
  const prs = ws?.prs || [];
  const stations = ws?.stations || [];
  const maints = ws?.maints || [];
  const trips = ws?.trips || [];

  const openBDs = breakdowns.filter((b) => b.status === "Open" || b.status === "In Repair");
  const activeAssets = assets.filter((a) => a.status === "Ready").length;
  const workshopAssets = assets.filter((a) => a.status === "Workshop" || a.status === "In Workshop" || a.status === "MAJOR_BREAKDOWN").length;
  const totalRepairCost = breakdowns.reduce((s, b) => s + (Number(b.repairCost) || 0), 0);

  const setAssets = (list: Asset[]) => saveMutation.mutate({ key: "assets", value: list });
  const setBreakdowns = (list: BreakdownReport[]) => saveMutation.mutate({ key: "breakdowns", value: list });
  const setWarehouse = (list: WarehouseItem[]) => saveMutation.mutate({ key: "warehouse", value: list });
  const setPrs = (list: PurchaseRequest[]) => saveMutation.mutate({ key: "prs", value: list });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: "rgba(11,17,30,0.9)" }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/(dashboard)" as any))} style={{ padding: 6 }}>
            <Text style={{ color: ACCENT, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>🔧 الورشة — إدارة الصيانة</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {TABS.map((tb) => (
              <TouchableOpacity key={tb.id} onPress={() => setTab(tb.id)} style={{ backgroundColor: tab === tb.id ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)", borderColor: tab === tb.id ? "rgba(167,139,250,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}>
                <Text style={{ color: tab === tb.id ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "800" }}>{tb.emoji} {tb.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>
        {isLoading && <Text style={{ color: "#64748B", textAlign: "center", marginTop: 40 }}>جارِ تحميل بيانات الورشة...</Text>}
        {!isLoading && tab === "home" && (
          <HomeTab
            assets={assets} openBDs={openBDs} breakdowns={breakdowns}
            activeAssets={activeAssets} workshopAssets={workshopAssets} totalRepairCost={totalRepairCost}
            onFix={(id) => { setBreakdowns(breakdowns.map((b) => (b.id === id ? { ...b, status: "Resolved" } : b))); const bd = breakdowns.find((b) => b.id === id); if (bd && !breakdowns.some((x) => x.assetId === bd.assetId && x.id !== id && (x.status === "Open" || x.status === "In Repair"))) setAssets(assets.map((a) => (a.id === bd.assetId ? { ...a, status: "Ready" } : a))); }}
            onDelete={(id) => { const bd = breakdowns.find((b) => b.id === id); const list = breakdowns.filter((b) => b.id !== id); setBreakdowns(list); if (bd && !list.some((x) => x.assetId === bd.assetId && (x.status === "Open" || x.status === "In Repair"))) setAssets(assets.map((a) => (a.id === bd.assetId ? { ...a, status: "Ready" } : a))); }}
            onEdit={(b) => { Alert.alert("تحرير عطل", "افتح تبويب الأعطال لتعديل العطل"); }}
          />
        )}
        {!isLoading && tab === "fuel" && <FuelTab fuel={fuel} assets={assets} onSave={(v) => saveMutation.mutate({ key: "fuel", value: v })} />}
        {!isLoading && tab === "oil" && <OilTab oil={oil} assets={assets} onSave={(v) => saveMutation.mutate({ key: "oil", value: v })} />}
        {!isLoading && tab === "parts" && <PartsTab parts={parts} assets={assets} onSave={(v) => saveMutation.mutate({ key: "parts", value: v })} />}
        {!isLoading && tab === "breakdown" && (
          <BreakdownTab breakdowns={breakdowns} assets={assets}
            onSave={(list, assetUpdates?: Asset[]) => { saveMutation.mutate({ key: "breakdowns", value: list }); if (assetUpdates) saveMutation.mutate({ key: "assets", value: assetUpdates }); }} />
        )}
        {!isLoading && tab === "prs" && (
          <PrTab prs={prs} warehouse={warehouse} onSave={(list) => setPrs(list)} onWarehouse={(l) => setWarehouse(l)} />
        )}
        {!isLoading && tab === "warehouse" && (
          <WarehouseTab warehouse={warehouse} onSave={(l) => setWarehouse(l)} />
        )}
        {!isLoading && tab === "vehiclereport" && (
          <VehicleReportTab assets={assets} fuel={fuel} oil={oil} parts={parts} breakdowns={breakdowns} trips={trips} config={config} />
        )}
        {!isLoading && tab === "stations" && (
          <StationsTab stations={stations} maints={maints}
            onStations={(l) => saveMutation.mutate({ key: "stations", value: l })}
            onMaints={(l) => saveMutation.mutate({ key: "maints", value: l })} />
        )}
        {!isLoading && tab === "config" && (
          <ConfigTab assets={assets} config={config}
            onAssets={(l) => saveMutation.mutate({ key: "assets", value: l })}
            onConfig={(c) => saveMutation.mutate({ key: "config", value: c })} />
        )}
        {!isLoading && tab === "reports" && (
          <ReportsTab assets={assets} fuel={fuel} oil={oil} parts={parts} breakdowns={breakdowns} />
        )}
      </ScrollView>
    </View>
  );
}

// ─── HOME ──────────────────────────────────────────────────────────────────────
function HomeTab({ assets, openBDs, breakdowns, activeAssets, workshopAssets, totalRepairCost, onFix, onDelete, onEdit }: {
  assets: Asset[]; openBDs: BreakdownReport[]; breakdowns: BreakdownReport[];
  activeAssets: number; workshopAssets: number; totalRepairCost: number;
  onFix: (id: number) => void; onDelete: (id: number) => void; onEdit: (b: BreakdownReport) => void;
}) {
  const hoursIn = (b: BreakdownReport) => { const diff = new Date().getTime() - new Date(b.date).getTime(); return diff / 3600000; };
  const overdue = openBDs.filter((b) => hoursIn(b) > 12);
  const critical = overdue.filter((b) => hoursIn(b) > 24);
  return (
    <View>
      {openBDs.length > 0 && (
        <View style={{ backgroundColor: "rgba(127,29,29,0.4)", borderColor: "rgba(248,113,113,0.4)", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ color: "#FCA5A5", fontWeight: "900", fontSize: 13 }}>🚨 {openBDs.length} عطل مفتوح — مركبات خارج الخدمة{critical.length > 0 ? ` · ${critical.length} أكثر من 24 ساعة!` : ""}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <Kpi label="إجمالي المعدات" value={String(assets.length)} color="#38BDF8" />
        <Kpi label="جاهزة" value={String(activeAssets)} color="#34D399" />
        <Kpi label="بالورشة" value={String(workshopAssets)} color="#FBBF24" />
        <Kpi label="أعطال مفتوحة" value={String(openBDs.length)} color="#F87171" />
        <Kpi label="تكاليف الإصلاح" value={money(totalRepairCost)} color="#38BDF8" />
      </View>

      {overdue.length > 0 && (
        <View style={{ backgroundColor: critical.length > 0 ? "rgba(127,29,29,0.5)" : "rgba(113,63,18,0.4)", borderColor: critical.length > 0 ? "#EF4444" : "#F59E0B", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ color: "#FDE68A", fontWeight: "900", fontSize: 13 }}>⏱️ تقرير مدة الورشة — {overdue.length} مركبة تجاوزت 12 ساعة{critical.length > 0 ? ` (منها ${critical.length} تجاوزت 24 ساعة)` : ""}</Text>
        </View>
      )}

      <SectionTitle text={`الأعطال المفتوحة (${openBDs.length})`} color="#F87171" />
      {openBDs.length === 0 ? <Empty text="لا توجد أعطال مفتوحة 🎉" /> : openBDs.map((b) => (
        <Row key={b.id} border="rgba(248,113,113,0.35)"
          title={`${b.assetId} — ${b.symptom}`}
          sub={`${b.date} · ${b.reportedBy || "—"} · ${b.mechanicAssigned ? "ميكانيكي: " + b.mechanicAssigned : ""} · مدة: ${hoursIn(b) > 24 ? "24h+" : hoursIn(b) > 12 ? "12h+" : Math.max(0, Math.round(hoursIn(b))) + "h"}`}
          right={<Actions><SevPill s={b.severity} /><ActBtn label="إصلاح" color="#34D399" onPress={() => onFix(b.id)} /><ActBtn label="حذف" color="#F87171" onPress={() => onDelete(b.id)} /></Actions>} />
      ))}

      <SectionTitle text={`نظرة عامة على الأسطول (${assets.length})`} color="#38BDF8" />
      {assets.map((a) => {
        const hasBD = openBDs.some((b) => b.assetId === a.id);
        return (
          <Row key={a.id} title={`${a.id} — ${a.plate || "—"}`}
            sub={`${a.type || "—"} · ${a.driver || "—"} · ${a.initOdo || 0} km`}
            right={<StatPill s={hasBD || a.status === "Workshop" ? "بالورشة" : a.status} c={hasBD || a.status === "Workshop" ? "#FBBF24" : a.status === "Ready" ? "#34D399" : "#F87171"} />} />
        );
      })}
    </View>
  );
}

// ─── FUEL ──────────────────────────────────────────────────────────────────────
function FuelTab({ fuel, assets, onSave }: { fuel: FuelLog[]; assets: Asset[]; onSave: (v: FuelLog[]) => void }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ date: today(), assetId: "", odoReading: "", liters: "", costPerLiter: "", fuelType: "Diesel", station: "", invoice: "", notes: "" });
  const submit = () => {
    if (!f.assetId || !f.liters) { Alert.alert("تنبيه", "اختر المركبة وأدخل اللترات"); return; }
    const L = parseFloat(f.liters) || 0, cpl = parseFloat(f.costPerLiter) || 0;
    onSave([...fuel, { id: Date.now(), ...f, odoReading: parseInt(f.odoReading) || 0, liters: L, costPerLiter: cpl, totalCost: L * cpl } as any]);
    setShow(false);
    setF({ date: today(), assetId: "", odoReading: "", liters: "", costPerLiter: "", fuelType: "Diesel", station: "", invoice: "", notes: "" });
  };
  return (
    <View>
      <View style={{ marginBottom: 8 }}>
        <Kpi label="إجمالي سجلات الوقود" value={String(fuel.length)} color="#FBBF24" />
        <View style={{ height: 8 }} />
      </View>
      <TouchableOpacity onPress={() => setShow(true)} style={{ backgroundColor: "rgba(251,191,36,0.15)", borderColor: "rgba(251,191,36,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16, alignItems: "center" }}>
        <Text style={{ color: "#FBBF24", fontWeight: "900" }}>⛽ تسجيل تموين وقود</Text>
      </TouchableOpacity>
      <FormSheet title="➕ تسجيل تموين" visible={show} fields={[{ key: "date", label: "التاريخ" }, { key: "odoReading", label: "قراءة العداد", numeric: true }, { key: "liters", label: "اللترات", numeric: true }, { key: "costPerLiter", label: "سعر اللتر", numeric: true }, { key: "station", label: "المحطة" }, { key: "invoice", label: "الفاتورة" }, { key: "notes", label: "ملاحظات" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => setShow(false)}
        extra={<>
          <Chips label="المركبة *" options={assetOptions(assets)} value={f.assetId} onChange={(v) => setF((p) => ({ ...p, assetId: v }))} />
          <Chips label="نوع الوقود" options={FUEL_TYPES} value={f.fuelType} onChange={(v) => setF((p) => ({ ...p, fuelType: v }))} />
        </>} />
      {fuel.length === 0 ? <Empty text="لا توجد سجلات وقود" /> : fuel.slice(-30).reverse().map((r) => (
        <Row key={r.id} title={`${r.assetId} · ${r.liters} لتر`} sub={`${r.date} · عداد ${r.odoReading || 0} · ${r.station || "—"}`}
          right={<Text style={{ color: "#FBBF24", fontWeight: "900", fontSize: 13 }}>{money(r.totalCost)}</Text>} />
      ))}
    </View>
  );
}

// ─── OIL ───────────────────────────────────────────────────────────────────────
function OilTab({ oil, assets, onSave }: { oil: OilLog[]; assets: Asset[]; onSave: (v: OilLog[]) => void }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ date: today(), assetId: "", oilType: "Engine Oil", brand: "", quantity: "", unit: "Liters", cost: "", odoReading: "", nextChangeOdo: "", notes: "" });
  const OIL_TYPES = ["Engine Oil", "Hydraulic Oil", "Gear Oil", "Transmission Oil", "Brake Fluid", "Coolant"];
  const submit = () => {
    if (!f.assetId || !f.quantity) { Alert.alert("تنبيه", "اختر المركبة وأدخل الكمية"); return; }
    onSave([...oil, { id: Date.now(), ...f, quantity: parseFloat(f.quantity) || 0, cost: parseFloat(f.cost) || 0, odoReading: parseInt(f.odoReading) || 0, nextChangeOdo: parseInt(f.nextChangeOdo) || 0 } as any]);
    setShow(false);
    setF({ date: today(), assetId: "", oilType: "Engine Oil", brand: "", quantity: "", unit: "Liters", cost: "", odoReading: "", nextChangeOdo: "", notes: "" });
  };
  return (
    <View>
      <Kpi label="إجمالي سجلات الزيت" value={String(oil.length)} color="#38BDF8" />
      <View style={{ height: 12 }} />
      <TouchableOpacity onPress={() => setShow(true)} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16, alignItems: "center" }}>
        <Text style={{ color: "#38BDF8", fontWeight: "900" }}>🛢️ تسجيل زيت / سوائل</Text>
      </TouchableOpacity>
      <FormSheet title="➕ تسجيل زيت" visible={show} fields={[{ key: "date", label: "التاريخ" }, { key: "brand", label: "العلامة" }, { key: "quantity", label: "الكمية", numeric: true }, { key: "cost", label: "التكلفة", numeric: true }, { key: "odoReading", label: "قراءة العداد", numeric: true }, { key: "nextChangeOdo", label: "عداد التغيير القادم", numeric: true }, { key: "notes", label: "ملاحظات" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => setShow(false)}
        extra={<>
          <Chips label="المركبة *" options={assetOptions(assets)} value={f.assetId} onChange={(v) => setF((p) => ({ ...p, assetId: v }))} />
          <Chips label="نوع الزيت" options={OIL_TYPES} value={f.oilType} onChange={(v) => setF((p) => ({ ...p, oilType: v }))} />
        </>} />
      <Text style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}>الوحدة: {f.unit}</Text>
      {oil.length === 0 ? <Empty text="لا توجد سجلات زيت" /> : oil.slice(-30).reverse().map((r) => (
        <Row key={r.id} title={`${r.assetId} · ${r.oilType} · ${r.quantity} ${r.unit}`} sub={`${r.date} · ${r.brand || "—"} · تغيير قادم ${r.nextChangeOdo || "—"}`}
          right={<Text style={{ color: "#38BDF8", fontWeight: "900", fontSize: 13 }}>{money(r.cost)}</Text>} />
      ))}
    </View>
  );
}

// ─── SPARE PARTS ───────────────────────────────────────────────────────────────
function PartsTab({ parts, assets, onSave }: { parts: SparePartLog[]; assets: Asset[]; onSave: (v: SparePartLog[]) => void }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ date: today(), assetId: "", partName: "", partNumber: "", quantity: "1", unitCost: "", supplier: "", invoice: "", warranty: "", notes: "" });
  const submit = () => {
    if (!f.assetId || !f.partName) { Alert.alert("تنبيه", "اختر المركبة وأدخل اسم القطعة"); return; }
    const q = parseInt(f.quantity) || 1, uc = parseFloat(f.unitCost) || 0;
    onSave([...parts, { id: Date.now(), ...f, quantity: q, unitCost: uc, totalCost: q * uc } as any]);
    setShow(false);
    setF({ date: today(), assetId: "", partName: "", partNumber: "", quantity: "1", unitCost: "", supplier: "", invoice: "", warranty: "", notes: "" });
  };
  return (
    <View>
      <Kpi label="إجمالي قطع الغيار" value={String(parts.length)} color="#38BDF8" />
      <View style={{ height: 12 }} />
      <TouchableOpacity onPress={() => setShow(true)} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16, alignItems: "center" }}>
        <Text style={{ color: "#38BDF8", fontWeight: "900" }}>🔩 تسجيل قطعة غيار</Text>
      </TouchableOpacity>
      <FormSheet title="➕ تسجيل قطعة غيار" visible={show} fields={[{ key: "date", label: "التاريخ" }, { key: "partName", label: "اسم القطعة" }, { key: "partNumber", label: "رقم القطعة" }, { key: "quantity", label: "الكمية", numeric: true }, { key: "unitCost", label: "سعر الوحدة", numeric: true }, { key: "supplier", label: "المورد" }, { key: "invoice", label: "الفاتورة" }, { key: "warranty", label: "الضمان" }, { key: "notes", label: "ملاحظات" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => setShow(false)}
        extra={<Chips label="المركبة *" options={assetOptions(assets)} value={f.assetId} onChange={(v) => setF((p) => ({ ...p, assetId: v }))} />} />
      {parts.length === 0 ? <Empty text="لا توجد قطع غيار مسجلة" /> : parts.slice(-30).reverse().map((r) => (
        <Row key={r.id} title={`${r.assetId} · ${r.partName}`} sub={`${r.date} · ${r.partNumber || "—"} · ${r.supplier || "—"} · كمية ${r.quantity}`}
          right={<Text style={{ color: "#38BDF8", fontWeight: "900", fontSize: 13 }}>{money(r.totalCost)}</Text>} />
      ))}
    </View>
  );
}

// ─── BREAKDOWN ─────────────────────────────────────────────────────────────────
function BreakdownTab({ breakdowns, assets, onSave }: { breakdowns: BreakdownReport[]; assets: Asset[]; onSave: (list: BreakdownReport[], assetUpdates?: Asset[]) => void }) {
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [f, setF] = useState<Record<string, string>>({ date: today(), assetId: "", reportedBy: "", symptom: "", severity: "Major", mechanicAssigned: "", repairStart: "", repairEnd: "", repairDesc: "", partsUsed: "", repairCost: "", notes: "" });
  const editing = breakdowns.find((b) => b.id === editId);

  const submit = () => {
    if (!f.assetId || !f.symptom) { Alert.alert("تنبيه", "اختر المركبة وأدخل الوصف"); return; }
    const cost = parseFloat(f.repairCost) || 0;
    if (editId !== null) {
      const list = breakdowns.map((b) => (b.id === editId ? { ...b, ...f, repairCost: cost, status: f.repairDesc ? "Resolved" as const : b.status } : b));
      onSave(list);
    } else {
      onSave([...breakdowns, { id: Date.now(), ...f, repairCost: cost, status: "Open" } as any], assets.map((a) => (a.id === f.assetId ? { ...a, status: "Workshop" } : a)));
    }
    setShow(false); setEditId(null);
    setF({ date: today(), assetId: "", reportedBy: "", symptom: "", severity: "Major", mechanicAssigned: "", repairStart: "", repairEnd: "", repairDesc: "", partsUsed: "", repairCost: "", notes: "" });
  };

  const fix = (id: number) => {
    const bd = breakdowns.find((b) => b.id === id);
    const list: BreakdownReport[] = breakdowns.map((b) => (b.id === id ? { ...b, status: "Resolved" as const } : b));
    let up: Asset[] | undefined;
    if (bd && !list.some((x) => x.assetId === bd.assetId && x.id !== id && (x.status === "Open" || x.status === "In Repair"))) up = assets.map((a) => (a.id === bd.assetId ? { ...a, status: "Ready" } : a));
    onSave(list, up);
  };

  const del = (id: number) => {
    Alert.alert("حذف", "حذف العطل؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => { const bd = breakdowns.find((b) => b.id === id); const list = breakdowns.filter((b) => b.id !== id); let up: Asset[] | undefined; if (bd && !list.some((x) => x.assetId === bd.assetId && (x.status === "Open" || x.status === "In Repair"))) up = assets.map((a) => (a.id === bd.assetId ? { ...a, status: "Ready" } : a)); onSave(list, up); } },
    ]);
  };

  const openEdit = (b: BreakdownReport) => { setEditId(b.id); setF({ date: b.date, assetId: b.assetId, reportedBy: b.reportedBy, symptom: b.symptom, severity: b.severity, mechanicAssigned: b.mechanicAssigned, repairStart: b.repairStart, repairEnd: b.repairEnd, repairDesc: b.repairDesc, partsUsed: b.partsUsed, repairCost: String(b.repairCost || ""), notes: b.notes }); setShow(true); };

  return (
    <View>
      <Kpi label="إجمالي الأعطال" value={String(breakdowns.length)} color="#F87171" />
      <View style={{ height: 12 }} />
      <TouchableOpacity onPress={() => { setEditId(null); setF({ date: today(), assetId: "", reportedBy: "", symptom: "", severity: "Major", mechanicAssigned: "", repairStart: "", repairEnd: "", repairDesc: "", partsUsed: "", repairCost: "", notes: "" }); setShow(true); }} style={{ backgroundColor: "rgba(248,113,113,0.15)", borderColor: "rgba(248,113,113,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16, alignItems: "center" }}>
        <Text style={{ color: "#F87171", fontWeight: "900" }}>🚨 تسجيل عطل جديد</Text>
      </TouchableOpacity>
      <FormSheet title={editId !== null ? "✏️ تعديل العطل" : "➕ عطل جديد"} visible={show} fields={[{ key: "date", label: "التاريخ" }, { key: "reportedBy", label: "المبلغ" }, { key: "symptom", label: "الوصف / الأعراض" }, { key: "mechanicAssigned", label: "الميكانيكي المسؤول" }, { key: "repairStart", label: "بداية الإصلاح" }, { key: "repairEnd", label: "نهاية الإصلاح" }, { key: "partsUsed", label: "القطع المستخدمة" }, { key: "repairCost", label: "تكلفة الإصلاح", numeric: true }, { key: "repairDesc", label: "وصف الإصلاح (إنهاء العطل)" }, { key: "notes", label: "ملاحظات" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => { setShow(false); setEditId(null); }}
        extra={<>
          <Chips label="المركبة *" options={assetOptions(assets)} value={f.assetId} onChange={(v) => setF((p) => ({ ...p, assetId: v }))} />
          <Chips label="الخطورة" options={SEVERITIES} value={f.severity} onChange={(v) => setF((p) => ({ ...p, severity: v }))} />
        </>} />
      <Text style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}>عند فتح عطل جديد تُحوَّل المركبة تلقائياً لحالة "بالورشة"</Text>
      {breakdowns.length === 0 ? <Empty text="لا توجد أعطال مسجلة" /> : breakdowns.slice(-40).reverse().map((b) => (
        <Row key={b.id} border={b.status === "Open" ? "rgba(248,113,113,0.35)" : b.status === "Resolved" ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"}
          title={`${b.assetId} — ${b.symptom}`}
          sub={`${b.date} · ${b.reportedBy || "—"} · الحالة: ${b.status}${b.repairCost ? " · تكلفة: " + money(b.repairCost) : ""}`}
          right={<Actions><SevPill s={b.severity} />{b.status !== "Resolved" && <ActBtn label="إصلاح" color="#34D399" onPress={() => fix(b.id)} />}<ActBtn label="تعديل" color="#38BDF8" onPress={() => openEdit(b)} /><ActBtn label="حذف" color="#F87171" onPress={() => del(b.id)} /></Actions>} />
      ))}
    </View>
  );
}

// ─── PURCHASE REQUESTS ─────────────────────────────────────────────────────────
function PrTab({ prs, warehouse, onSave, onWarehouse }: { prs: PurchaseRequest[]; warehouse: WarehouseItem[]; onSave: (v: PurchaseRequest[]) => void; onWarehouse: (v: WarehouseItem[]) => void }) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ warehouseItemId: "0", itemCode: "", itemName: "", qty: "", reason: "", requestedBy: "", priority: "Medium", notes: "" });

  const submit = () => {
    const id = parseInt(f.warehouseItemId) || 0;
    if (!id || !f.qty) { Alert.alert("تنبيه", "اختر الصنف وأدخل الكمية"); return; }
    const whItem = warehouse.find((w) => w.id === id);
    const requestedQty = parseInt(f.qty) || 0;
    if (!whItem) {
      onSave([...prs, { id: Date.now(), date: today(), warehouseItemId: id, itemCode: f.itemCode, itemName: f.itemName, qty: requestedQty, reason: f.reason, requestedBy: f.requestedBy, approvedBy: "", status: "Pending", priority: f.priority as any, notes: "الصنف غير موجود بالمخزون", autoRejected: false } as any]);
    } else if (whItem.currentStock >= requestedQty) {
      onSave([...prs, { id: Date.now(), date: today(), warehouseItemId: id, itemCode: whItem.code, itemName: whItem.name, qty: requestedQty, reason: f.reason, requestedBy: f.requestedBy, approvedBy: "", status: "Rejected", priority: f.priority as any, notes: `Auto-Rejected: Available (Stock: ${whItem.currentStock}, Safety: ${whItem.safetyStock})`, autoRejected: true } as any]);
      Alert.alert("متوفر في المخزون", `${whItem.name} (${whItem.code})\nالمخزون: ${whItem.currentStock} — الكمية المطلوبة: ${requestedQty} — تم رفض الطلب تلقائياً`);
    } else {
      onSave([...prs, { id: Date.now(), date: today(), warehouseItemId: id, itemCode: whItem.code, itemName: whItem.name, qty: requestedQty, reason: f.reason, requestedBy: f.requestedBy, approvedBy: "", status: "Pending", priority: f.priority as any, notes: `Approved (Deficit: ${requestedQty - whItem.currentStock}, Safety: ${whItem.safetyStock})`, autoRejected: false } as any]);
    }
    setShow(false);
    setF({ warehouseItemId: "0", itemCode: "", itemName: "", qty: "", reason: "", requestedBy: "", priority: "Medium", notes: "" });
  };

  const approve = (id: number) => onSave(prs.map((p) => (p.id === id ? { ...p, status: "Approved", approvedBy: "admin" } : p)));
  const reject = (id: number) => onSave(prs.map((p) => (p.id === id ? { ...p, status: "Rejected" } : p)));
  const receive = (id: number) => {
    const p = prs.find((x) => x.id === id);
    if (!p) return;
    onWarehouse(warehouse.map((w) => (w.id === p.warehouseItemId ? { ...w, currentStock: w.currentStock + p.qty, lastUpdated: today() } : w)));
    onSave(prs.map((x) => (x.id === id ? { ...x, status: "Received" } : x)));
  };
  const statusColor = (s: string) => s === "Pending" ? "#FBBF24" : s === "Approved" ? "#34D399" : s === "Received" ? "#38BDF8" : "#F87171";

  return (
    <View>
      <Kpi label="طلبات الشراء" value={String(prs.length)} color="#FB923C" />
      <View style={{ height: 12 }} />
      <TouchableOpacity onPress={() => setShow(true)} style={{ backgroundColor: "rgba(251,146,60,0.15)", borderColor: "rgba(251,146,60,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16, alignItems: "center" }}>
        <Text style={{ color: "#FB923C", fontWeight: "900" }}>🛒 طلب شراء جديد</Text>
      </TouchableOpacity>
      <FormSheet title="➕ طلب شراء" visible={show} fields={[{ key: "qty", label: "الكمية المطلوبة", numeric: true }, { key: "requestedBy", label: "اسم الطالب" }, { key: "reason", label: "السبب" }, { key: "notes", label: "ملاحظات" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => setShow(false)}
        extra={<>
          <Chips label="الصنف من المخزون *" options={warehouse.map((w) => ({ value: String(w.id), label: `${w.code} — ${w.name} (المخزون: ${w.currentStock})` }))}
            value={f.warehouseItemId !== "0" ? f.warehouseItemId : ""}
            onChange={(v) => { const w = warehouse.find((x) => x.id === parseInt(v)); setF((p) => ({ ...p, warehouseItemId: v, itemCode: w?.code || "", itemName: w?.name || "" })); }} />
          <Chips label="الأولوية" options={["High", "Medium", "Low"]} value={f.priority} onChange={(v) => setF((p) => ({ ...p, priority: v }))} />
        </>} />
      {prs.length === 0 ? <Empty text="لا توجد طلبات شراء" /> : prs.slice(-30).reverse().map((p) => (
        <Row key={p.id} title={`${p.itemCode} — ${p.itemName} · كمية ${p.qty}`}
          sub={`${p.date} · الأولوية: ${p.priority} · ${p.requestedBy || "—"}`}
          right={
            <Actions>
              <StatPill s={p.status} c={statusColor(p.status)} />
              {p.status === "Pending" && <><ActBtn label="اعتماد" color="#34D399" onPress={() => approve(p.id)} /><ActBtn label="رفض" color="#F87171" onPress={() => reject(p.id)} /></>}
              {p.status === "Approved" && <ActBtn label="استلام" color="#38BDF8" onPress={() => receive(p.id)} />}
            </Actions>
          } />
      ))}
    </View>
  );
}

// ─── WAREHOUSE ─────────────────────────────────────────────────────────────────
function WarehouseTab({ warehouse, onSave }: { warehouse: WarehouseItem[]; onSave: (v: WarehouseItem[]) => void }) {
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [f, setF] = useState<Record<string, string>>({ code: "", name: "", category: "Mechanical", currentStock: "", minStock: "", safetyStock: "", unit: "Piece", unitCost: "", supplier: "", location: "", notes: "" });
  const CATS = ["Mechanical", "Electrical", "Hydraulic", "Pneumatic", "Tires", "Filters", "Oils"];
  const UNITS = ["Piece", "Liter", "Kg", "Meter", "Set"];

  const submit = () => {
    if (!f.code || !f.name) { Alert.alert("تنبيه", "أدخل الكود والاسم"); return; }
    const rec = { code: f.code, name: f.name, category: f.category, unit: f.unit, currentStock: parseInt(f.currentStock) || 0, minStock: parseInt(f.minStock) || 0, safetyStock: parseInt(f.safetyStock) || 0, unitCost: parseFloat(f.unitCost) || 0, supplier: f.supplier, location: f.location, notes: f.notes, lastUpdated: today() };
    if (editId !== null) onSave(warehouse.map((w) => (w.id === editId ? { ...w, ...rec } : w)));
    else onSave([...warehouse, { id: Date.now(), ...rec } as any]);
    setShow(false); setEditId(null);
    setF({ code: "", name: "", category: "Mechanical", currentStock: "", minStock: "", safetyStock: "", unit: "Piece", unitCost: "", supplier: "", location: "", notes: "" });
  };

  const belowSafety = warehouse.filter((w) => w.safetyStock > 0 && w.currentStock <= w.safetyStock);
  const lowStock = warehouse.filter((w) => w.currentStock > w.safetyStock && w.currentStock <= w.minStock && w.currentStock > 0);

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Kpi label="أصناف المخزون" value={String(warehouse.length)} color="#34D399" />
        <Kpi label="تحت الأمان" value={String(belowSafety.length)} color="#F87171" />
        <Kpi label="مخزون منخفض" value={String(lowStock.length)} color="#FBBF24" />
      </View>
      {belowSafety.length > 0 && <AlertBox color="#F87171" text={`🚨 حرج: ${belowSafety.length} صنف تحت مستوى الأمان!`} />}
      {lowStock.length > 0 && <AlertBox color="#FBBF24" text={`⚠️ تنبيه: ${lowStock.length} صنف منخفض المخزون`} />}
      <TouchableOpacity onPress={() => { setEditId(null); setF({ code: "", name: "", category: "Mechanical", currentStock: "", minStock: "", safetyStock: "", unit: "Piece", unitCost: "", supplier: "", location: "", notes: "" }); setShow(true); }} style={{ backgroundColor: "rgba(52,211,153,0.15)", borderColor: "rgba(52,211,153,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16, alignItems: "center" }}>
        <Text style={{ color: "#34D399", fontWeight: "900" }}>📦 إضافة صنف مخزون</Text>
      </TouchableOpacity>
      <FormSheet title={editId !== null ? "✏️ تعديل صنف" : "➕ إضافة صنف"} visible={show} fields={[{ key: "code", label: "الكود" }, { key: "name", label: "الاسم" }, { key: "currentStock", label: "المخزون الحالي", numeric: true }, { key: "minStock", label: "الحد الأدنى", numeric: true }, { key: "safetyStock", label: "مستوى الأمان", numeric: true }, { key: "unitCost", label: "سعر الوحدة", numeric: true }, { key: "supplier", label: "المورد" }, { key: "location", label: "الموقع" }, { key: "notes", label: "ملاحظات" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => { setShow(false); setEditId(null); }}
        extra={<>
          <Chips label="الفئة" options={CATS} value={f.category} onChange={(v) => setF((p) => ({ ...p, category: v }))} />
          <Chips label="الوحدة" options={UNITS} value={f.unit} onChange={(v) => setF((p) => ({ ...p, unit: v }))} />
        </>} />
      <Text style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}>الفئات: {CATS.join(" · ")}</Text>
      {warehouse.length === 0 ? <Empty text="لا توجد أصناف بالمخزون" /> : warehouse.map((w) => {
        const out = w.currentStock === 0;
        const bs = w.safetyStock > 0 && w.currentStock <= w.safetyStock;
        const low = !bs && w.currentStock <= w.minStock && w.currentStock > 0;
        return (
          <Row key={w.id} border={bs ? "rgba(249,115,22,0.5)" : low ? "rgba(251,191,36,0.4)" : BORDER}
            title={`${w.code} — ${w.name}`}
            sub={`${w.category} · ${w.supplier || "—"} · ${w.location || "—"}`}
            right={<Actions>
              <Text style={{ color: out ? "#F87171" : bs ? "#FB923C" : low ? "#FBBF24" : "#34D399", fontWeight: "900", fontSize: 15 }}>{w.currentStock}</Text>
              <ActBtn label="تعديل" color="#38BDF8" onPress={() => { setEditId(w.id); setF({ code: w.code, name: w.name, category: w.category, currentStock: String(w.currentStock), minStock: String(w.minStock), safetyStock: String(w.safetyStock), unit: w.unit, unitCost: String(w.unitCost), supplier: w.supplier, location: w.location, notes: w.notes }); setShow(true); }} />
              <ActBtn label="حذف" color="#F87171" onPress={() => { Alert.alert("حذف", `حذف "${w.name}"؟`, [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => onSave(warehouse.filter((x) => x.id !== w.id)) }]); }} />
            </Actions>} />
        );
      })}
    </View>
  );
}

// ─── VEHICLE REPORT ────────────────────────────────────────────────────────────
function VehicleReportTab({ assets, fuel, oil, parts, breakdowns, trips, config }: { assets: Asset[]; fuel: FuelLog[]; oil: OilLog[]; parts: SparePartLog[]; breakdowns: BreakdownReport[]; trips: any[]; config: any }) {
  const [vehicle, setVehicle] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const vf = (i: any) => !vehicle || i.assetId === vehicle;
  const df = (i: any) => (!from || i.date >= from) && (!to || i.date <= to);
  const ff = fuel.filter((x) => vf(x) && df(x));
  const fb = breakdowns.filter((x) => vf(x) && df(x));
  const fs = parts.filter((x) => vf(x) && df(x));
  const vehTrips = trips.filter((t: any) => (!vehicle || t.code === vehicle) && (!from || t.date >= from) && (!to || t.date <= to));
  const vehTotalM3 = vehTrips.reduce((s: number, t: any) => s + (Number(t.qty) || 0), 0);
  const vehTotalFuel = ff.reduce((s, x) => s + x.liters, 0);
  const vehMaintCost = fb.reduce((s, b) => s + (Number(b.repairCost) || 0), 0) + fs.reduce((s, p) => s + (Number(p.totalCost) || 0), 0);
  const asset = assets.find((a) => a.id === vehicle);
  const targets = {
    km: parseInt(config?.fuelEffTarget || "2500") * 2000 || 5000,
    m3: parseInt(config?.targetProd || "12000") / (assets.filter((a) => a.status === "Ready").length || 5) || 2000,
    budget: parseInt(config?.maintBudget || "15000") / (assets.length || 5) || 3000,
  };
  const lastService = oil.filter((o) => o.assetId === vehicle).slice(-1)[0]?.date || "-";
  const eff = vehTotalFuel > 0 ? (vehTotalKm(ff, asset) / vehTotalFuel).toFixed(1) : "-";

  return (
    <View>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>المركبة</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
        <Chip onPress={() => setVehicle("")} label="الكل" active={!vehicle} />
        {assets.map((a) => <Chip key={a.id} onPress={() => setVehicle(a.id)} label={`${a.id} — ${a.plate}`} active={vehicle === a.id} />)}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View style={{ flex: 1 }}><Field label="من" value={from} onChange={setFrom} placeholder="2026-01-01" /></View>
        <View style={{ flex: 1 }}><Field label="إلى" value={to} onChange={setTo} placeholder="2026-12-31" /></View>
      </View>

      {vehicle ? (
        <View>
          <View style={{ backgroundColor: "#0B111E", borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <Text style={{ color: "#38BDF8", fontSize: 11, fontWeight: "900", marginBottom: 8 }}>أهداف المصنع — العملة: ر.س</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <MiniStat label="KM" value={`${targets.km}`} color="#38BDF8" />
              <MiniStat label="M3" value={`${targets.m3}`} color="#34D399" />
              <MiniStat label="ميزانية" value={money(targets.budget)} color="#38BDF8" />
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <Kpi label="م3 مصبوب" value={vehTotalM3.toFixed(0)} color="#34D399" />
            <Kpi label="بلوك" value={String(Math.round(vehTotalM3 * 12.5))} color="#38BDF8" />
            <Kpi label="رحلات" value={String(vehTrips.length)} color="#FBBF24" />
            <Kpi label="وقود (لتر)" value={vehTotalFuel.toFixed(0)} color="#FB923C" />
            <Kpi label="كفاءة" value={`${eff} km/L`} color="#2DD4BF" />
            <Kpi label="تكاليف الصيانة" value={money(vehMaintCost)} color="#F87171" />
            <Kpi label="آخر خدمة زيت" value={lastService} color="#2DD4BF" />
          </View>
          <SectionTitle text="سجل الرحلات" color="#94A3B8" />
          {vehTrips.length === 0 ? <Empty text="لا توجد رحلات لهذه المركبة" /> : vehTrips.slice(-20).reverse().map((t: any, i: number) => (
            <Row key={i} title={`${t.qty} م³ — ${t.siteName || "—"}`} sub={`${t.date} · ${t.projectName || "—"} · ${t.status || "—"}`}
              right={<Text style={{ color: "#34D399", fontWeight: "900" }}>{t.qty} م³</Text>} />
          ))}
        </View>
      ) : <Empty text="اختر مركبة لعرض التقرير" />}
    </View>
  );
}
function vehTotalKm(ff: FuelLog[], asset?: Asset): number { const odo = ff.filter((x) => x.odoReading > 0).slice(-1)[0]; return odo ? odo.odoReading : asset?.initOdo || 0; }

// ─── MIXING STATIONS + PERIODIC MAINT ──────────────────────────────────────────
function StationsTab({ stations, maints, onStations, onMaints }: { stations: MixingStation[]; maints: PeriodicMaint[]; onStations: (v: MixingStation[]) => void; onMaints: (v: PeriodicMaint[]) => void }) {
  const [stShow, setStShow] = useState(false);
  const [pmShow, setPmShow] = useState(false);
  const [stEdit, setStEdit] = useState<number | null>(null);
  const [pmEdit, setPmEdit] = useState<number | null>(null);
  const [st, setSt] = useState<Record<string, string>>({ name: "", productType: "concrete", operator: "", designCap: "", actualCap: "", unit: "m³/h", location: "", installDate: "", status: "Running", notes: "" });
  const [pm, setPm] = useState<Record<string, string>>({ stationId: "0", date: today(), taskType: "Greasing", description: "", technician: "", nextDue: "", status: "Scheduled", cost: "", notes: "" });
  const TASK_TYPES = ["Belts", "Greasing", "Oiling", "Drum Cleaning", "General Hygiene", "Electrical Check", "Control Room", "Software Update", "Pipe Change", "Pipe Welding", "Pump Special Maintenance", "Other"];

  const saveStation = () => {
    if (!st.name) { Alert.alert("تنبيه", "أدخل اسم المحطة"); return; }
    const rec = { name: st.name, productType: st.productType as any, operator: st.operator, designCap: Number(st.designCap) || 0, actualCap: Number(st.actualCap) || 0, unit: st.unit, location: st.location, installDate: st.installDate, status: st.status as any, notes: st.notes };
    if (stEdit !== null) onStations(stations.map((s) => (s.id === stEdit ? { ...s, ...rec } : s)));
    else onStations([...stations, { id: Date.now(), plantId: "", ...rec } as any]);
    setStShow(false); setStEdit(null);
    setSt({ name: "", productType: "concrete", operator: "", designCap: "", actualCap: "", unit: "m³/h", location: "", installDate: "", status: "Running", notes: "" });
  };

  const savePm = () => {
    const sid = parseInt(pm.stationId) || 0;
    if (!sid || !pm.description) { Alert.alert("تنبيه", "اختر المحطة وأدخل الوصف"); return; }
    const rec = { stationId: sid, date: pm.date, taskType: pm.taskType, description: pm.description, technician: pm.technician, nextDue: pm.nextDue, status: pm.status as any, cost: Number(pm.cost) || 0, notes: pm.notes };
    if (pmEdit !== null) onMaints(maints.map((m) => (m.id === pmEdit ? { ...m, ...rec } : m)));
    else onMaints([...maints, { id: Date.now(), ...rec } as any]);
    setPmShow(false); setPmEdit(null);
    setPm({ stationId: "0", date: today(), taskType: "Greasing", description: "", technician: "", nextDue: "", status: "Scheduled", cost: "", notes: "" });
  };

  const overdueMaints = maints.filter((m) => m.status === "Overdue");
  const eff = (s: MixingStation) => Math.round((s.actualCap / (s.designCap || 1)) * 100);
  const stColor = (s: string) => s === "Running" ? "#34D399" : s === "Maintenance" ? "#FBBF24" : "#F87171";
  const pmColor = (s: string) => s === "Done" ? "#34D399" : s === "Scheduled" ? "#FBBF24" : "#F87171";

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Kpi label="محطات" value={String(stations.length)} color="#38BDF8" />
        <Kpi label="قيد التشغيل" value={String(stations.filter((s) => s.status === "Running").length)} color="#34D399" />
        <Kpi label="مهام متأخرة" value={String(overdueMaints.length)} color="#F87171" />
      </View>
      {overdueMaints.length > 0 && <AlertBox color="#F87171" text={`⏰ ${overdueMaints.length} مهمة صيانة دورية متأخرة!`} />}

      <SectionTitle text={`محطات الخلط والبلوك (${stations.length})`} color="#38BDF8" />
      <TouchableOpacity onPress={() => { setStEdit(null); setSt({ name: "", productType: "concrete", operator: "", designCap: "", actualCap: "", unit: "m³/h", location: "", installDate: "", status: "Running", notes: "" }); setStShow(true); }} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 12, alignItems: "center" }}>
        <Text style={{ color: "#38BDF8", fontWeight: "900" }}>🏭 تسجيل محطة خلط / بلوك</Text>
      </TouchableOpacity>
      <FormSheet title={stEdit !== null ? "✏️ تعديل محطة" : "➕ تسجيل محطة"} visible={stShow} fields={[{ key: "name", label: "اسم المحطة" }, { key: "operator", label: "المشغل" }, { key: "designCap", label: "الإنتاجية التصميمية", numeric: true }, { key: "actualCap", label: "الإنتاجية الواقعية", numeric: true }, { key: "unit", label: "الوحدة" }, { key: "location", label: "الموقع" }, { key: "installDate", label: "تاريخ التركيب" }, { key: "notes", label: "ملاحظات" }]}
        values={st} onChange={(k, v) => setSt((p) => ({ ...p, [k]: v }))} onSubmit={saveStation} onClose={() => { setStShow(false); setStEdit(null); }} />
      {stations.length === 0 ? <Empty text="لا توجد محطات مسجلة" /> : stations.map((s) => (
        <Row key={s.id} title={`${s.name}`}
          sub={`${s.productType === "concrete" ? "خرسانة" : s.productType === "blocks" ? "بلوك" : "كلاهما"} · ${s.operator || "—"} · ${s.designCap}/${s.actualCap} ${s.unit} · كفاءة ${eff(s)}%`}
          right={<Actions><StatPill s={s.status} c={stColor(s.status)} /><ActBtn label="تعديل" color="#38BDF8" onPress={() => { setStEdit(s.id); setSt({ name: s.name, productType: s.productType, operator: s.operator, designCap: String(s.designCap), actualCap: String(s.actualCap), unit: s.unit, location: s.location, installDate: s.installDate, status: s.status, notes: s.notes }); setStShow(true); }} /><ActBtn label="حذف" color="#F87171" onPress={() => { Alert.alert("حذف", `حذف "${s.name}"؟`, [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => { onStations(stations.filter((x) => x.id !== s.id)); onMaints(maints.filter((m) => m.stationId !== s.id)); } }]); }} /></Actions>} />
      ))}

      <View style={{ height: 18 }} />
      <SectionTitle text={`الصيانة الدورية (${maints.length})`} color="#FB923C" />
      <TouchableOpacity onPress={() => { setPmEdit(null); setPm({ stationId: "0", date: today(), taskType: "Greasing", description: "", technician: "", nextDue: "", status: "Scheduled", cost: "", notes: "" }); setPmShow(true); }} style={{ backgroundColor: "rgba(251,146,60,0.15)", borderColor: "rgba(251,146,60,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 12, alignItems: "center" }}>
        <Text style={{ color: "#FB923C", fontWeight: "900" }}>🗓️ جدولة صيانة دورية</Text>
      </TouchableOpacity>
      <FormSheet title={pmEdit !== null ? "✏️ تعديل مهمة" : "➕ جدولة صيانة"} visible={pmShow} fields={[{ key: "date", label: "التاريخ" }, { key: "description", label: "الوصف" }, { key: "technician", label: "الفني" }, { key: "nextDue", label: "الاستحقاق القادم" }, { key: "cost", label: "التكلفة", numeric: true }, { key: "notes", label: "ملاحظات" }]}
        values={pm} onChange={(k, v) => setPm((p) => ({ ...p, [k]: v }))} onSubmit={savePm} onClose={() => { setPmShow(false); setPmEdit(null); }}
        extra={<>
          <Chips label="المحطة *" options={stations.map((s) => ({ value: String(s.id), label: s.name }))} value={pm.stationId !== "0" ? pm.stationId : ""} onChange={(v) => setPm((p) => ({ ...p, stationId: v }))} />
          <Chips label="نوع المهمة" options={TASK_TYPES} value={pm.taskType} onChange={(v) => setPm((p) => ({ ...p, taskType: v }))} />
          <Chips label="الحالة" options={["Scheduled", "Done", "Overdue"]} value={pm.status} onChange={(v) => setPm((p) => ({ ...p, status: v }))} />
        </>} />
      <Text style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}>أنواع المهام: {TASK_TYPES.join(" · ")}</Text>
      {maints.length === 0 ? <Empty text="لا توجد مهام صيانة مجدولة" /> : maints.slice(-30).reverse().map((m) => {
        const st = stations.find((s) => s.id === m.stationId);
        return (
          <Row key={m.id} border={m.status === "Overdue" ? "rgba(248,113,113,0.4)" : m.status === "Done" ? "rgba(52,211,153,0.3)" : BORDER}
            title={`${st?.name || "محطة #" + m.stationId} · ${m.taskType}`}
            sub={`${m.date} · ${m.description} · الفني: ${m.technician || "—"} · قادم: ${m.nextDue || "—"}${m.cost ? " · " + money(m.cost) : ""}`}
            right={<Actions><StatPill s={m.status} c={pmColor(m.status)} /><ActBtn label="تم" color="#34D399" onPress={() => onMaints(maints.map((x) => (x.id === m.id ? { ...x, status: "Done" } : x)))} /><ActBtn label="تعديل" color="#38BDF8" onPress={() => { setPmEdit(m.id); setPm({ stationId: String(m.stationId), date: m.date, taskType: m.taskType, description: m.description, technician: m.technician, nextDue: m.nextDue, status: m.status, cost: String(m.cost || ""), notes: m.notes }); setPmShow(true); }} /><ActBtn label="حذف" color="#F87171" onPress={() => { Alert.alert("حذف", "حذف المهمة؟", [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => onMaints(maints.filter((x) => x.id !== m.id)) }]); }} /></Actions>} />
        );
      })}
    </View>
  );
}

// ─── CONFIG: FLEET REGISTRATION + FACTORY SETTINGS ─────────────────────────────
function ConfigTab({ assets, config, onAssets, onConfig }: { assets: Asset[]; config: any; onAssets: (v: Asset[]) => void; onConfig: (v: any) => void }) {
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ id: "", plate: "", chassis: "", type: "Mixer", status: "Ready", driver: "", initOdo: "", engHours: "", regExpiry: "", insExpiry: "", opcardExpiry: "", authExpiry: "", gpsId: "", tare: "", gross: "" });
  const [cfg, setCfg] = useState<Record<string, string>>({});

  const submit = () => {
    if (!f.id || !f.plate) { Alert.alert("تنبيه", "أدخل الكود واللوحة"); return; }
    const rec = { ...f, initOdo: Number(f.initOdo) || 0, engHours: Number(f.engHours) || 0 };
    if (editId !== null) onAssets(assets.map((a) => (a.id === editId ? { ...a, ...rec } : a)));
    else onAssets([...assets, rec as any]);
    setShow(false); setEditId(null);
    setF({ id: "", plate: "", chassis: "", type: "Mixer", status: "Ready", driver: "", initOdo: "", engHours: "", regExpiry: "", insExpiry: "", opcardExpiry: "", authExpiry: "", gpsId: "", tare: "", gross: "" });
  };

  const curCfg = Object.keys(cfg).length ? cfg : Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)]));

  return (
    <View>
      <SectionTitle text={`تسجيل الأسطول (${assets.length})`} color="#38BDF8" />
      <TouchableOpacity onPress={() => { setEditId(null); setF({ id: "", plate: "", chassis: "", type: "Mixer", status: "Ready", driver: "", initOdo: "", engHours: "", regExpiry: "", insExpiry: "", opcardExpiry: "", authExpiry: "", gpsId: "", tare: "", gross: "" }); setShow(true); }} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.4)", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 12, alignItems: "center" }}>
        <Text style={{ color: "#38BDF8", fontWeight: "900" }}>🚛 إضافة معدة / مركبة</Text>
      </TouchableOpacity>
      <FormSheet title={editId !== null ? "✏️ تعديل معدة" : "➕ إضافة معدة"} visible={show} fields={[{ key: "id", label: "الكود" }, { key: "plate", label: "رقم اللوحة" }, { key: "chassis", label: "الشاصي" }, { key: "driver", label: "السائق" }, { key: "initOdo", label: "العداد الحالي", numeric: true }, { key: "engHours", label: "ساعات التشغيل", numeric: true }, { key: "regExpiry", label: "انتهاء الرخص" }, { key: "insExpiry", label: "انتهاء التأمين" }, { key: "opcardExpiry", label: "انتهاء الكارت" }, { key: "authExpiry", label: "انتهاء التصريح" }, { key: "gpsId", label: "GPS ID" }, { key: "tare", label: "الوزن الفارغ" }, { key: "gross", label: "الوزن الكلي" }]}
        values={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} onSubmit={submit} onClose={() => { setShow(false); setEditId(null); }}
        extra={<>
          <Chips label="النوع" options={["Mixer", "Mobile Pump", "Light Vehicle", "Loader"]} value={f.type} onChange={(v) => setF((p) => ({ ...p, type: v }))} />
          <Chips label="الحالة" options={["Ready", "Workshop", "Out of Service", "Scrap"]} value={f.status} onChange={(v) => setF((p) => ({ ...p, status: v }))} />
        </>} />
      <Text style={{ color: "#64748B", fontSize: 11, marginBottom: 8 }}>الحالة تتحكم في ظهور المركبة كجاهزة أو بالورشة</Text>
      {assets.length === 0 ? <Empty text="لا توجد معدات مسجلة" /> : assets.map((a) => (
        <Row key={a.id} title={`${a.id} — ${a.plate || "—"}`}
          sub={`${a.type || "—"} · ${a.driver || "—"} · ${a.initOdo || 0} km · ${a.engHours || 0} ساعة · رخص ${a.regExpiry || "—"} · تأمين ${a.insExpiry || "—"}`}
          right={<Actions><StatPill s={a.status} c={a.status === "Ready" ? "#34D399" : a.status === "Workshop" ? "#FBBF24" : "#F87171"} /><ActBtn label="تعديل" color="#38BDF8" onPress={() => { setEditId(a.id); setF({ id: a.id, plate: a.plate, chassis: a.chassis, type: a.type, status: a.status, driver: a.driver, initOdo: String(a.initOdo || ""), engHours: String(a.engHours || ""), regExpiry: a.regExpiry, insExpiry: a.insExpiry, opcardExpiry: a.opcardExpiry, authExpiry: a.authExpiry, gpsId: a.gpsId, tare: a.tare, gross: a.gross }); setShow(true); }} /><ActBtn label="حذف" color="#F87171" onPress={() => { Alert.alert("حذف", `حذف "${a.id}"؟`, [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: () => onAssets(assets.filter((x) => x.id !== a.id)) }]); }} /></Actions>} />
      ))}

      <View style={{ height: 18 }} />
      <SectionTitle text="إعدادات المصنع" color="#FBBF24" />
      <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {Object.keys(config).map((k) => (
            <Field key={k} label={k.replace(/([A-Z])/g, " $1")} value={curCfg[k] ?? ""} onChange={(v) => setCfg((p) => ({ ...p, [k]: v }))} />
          ))}
        </View>
        <TouchableOpacity onPress={() => { onConfig(Object.fromEntries(Object.entries(curCfg).map(([k, v]) => [k, v]))); Alert.alert("تم", "تم حفظ إعدادات المصنع"); }} style={{ backgroundColor: "#FBBF24", borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
          <Text style={{ color: "#0B111E", fontWeight: "900" }}>💾 حفظ الإعدادات</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── REPORTS ───────────────────────────────────────────────────────────────────
function ReportsTab({ assets, fuel, oil, parts, breakdowns }: { assets: Asset[]; fuel: FuelLog[]; oil: OilLog[]; parts: SparePartLog[]; breakdowns: BreakdownReport[] }) {
  const [vehicle, setVehicle] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const vf = (i: any) => !vehicle || i.assetId === vehicle;
  const df = (i: any) => (!from || i.date >= from) && (!to || i.date <= to);
  const ff = fuel.filter((x) => vf(x) && df(x));
  const fo = oil.filter((x) => vf(x) && df(x));
  const fs = parts.filter((x) => vf(x) && df(x));
  const fb = breakdowns.filter((x) => vf(x) && df(x));
  const totalFuel = ff.reduce((s, x) => s + x.totalCost, 0);
  const totalOil = fo.reduce((s, x) => s + x.cost, 0);
  const totalParts = fs.reduce((s, x) => s + x.totalCost, 0);
  const totalRepair = fb.reduce((s, x) => s + (Number(x.repairCost) || 0), 0);
  const grand = totalFuel + totalOil + totalParts + totalRepair;

  return (
    <View>
      <SectionTitle text="التقرير المالي للورشة" color="#34D399" />
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>المركبة</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
        <Chip onPress={() => setVehicle("")} label="الكل" active={!vehicle} />
        {assets.map((a) => <Chip key={a.id} onPress={() => setVehicle(a.id)} label={`${a.id} — ${a.plate}`} active={vehicle === a.id} />)}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View style={{ flex: 1 }}><Field label="من" value={from} onChange={setFrom} placeholder="2026-01-01" /></View>
        <View style={{ flex: 1 }}><Field label="إلى" value={to} onChange={setTo} placeholder="2026-12-31" /></View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <Kpi label="وقود" value={money(totalFuel)} color="#FBBF24" />
        <Kpi label="زيت" value={money(totalOil)} color="#38BDF8" />
        <Kpi label="قطع غيار" value={money(totalParts)} color="#38BDF8" />
        <Kpi label="إصلاح" value={money(totalRepair)} color="#F87171" />
        <Kpi label="الإجمالي" value={money(grand)} color="#34D399" />
      </View>

      <SectionTitle text={`تقرير الوقود (${ff.length})`} color="#FBBF24" />
      {ff.length === 0 ? <Empty text="لا توجد بيانات وقود" /> : ff.slice(-20).reverse().map((x) => (
        <Row key={x.id} title={`${x.assetId} · ${x.liters} لتر`} sub={x.date} right={<Text style={{ color: "#FBBF24", fontWeight: "900" }}>{money(x.totalCost)}</Text>} />
      ))}
      <SectionTitle text={`تقرير الأعطال (${fb.length})`} color="#F87171" />
      {fb.length === 0 ? <Empty text="لا توجد بيانات أعطال" /> : fb.slice(-20).reverse().map((x) => (
        <Row key={x.id} title={`${x.assetId} · ${x.symptom}`} sub={x.date} right={<Text style={{ color: "#F87171", fontWeight: "900" }}>{money(x.repairCost)}</Text>} />
      ))}
    </View>
  );
}

// ─── Shared small components ───────────────────────────────────────────────────
function SectionTitle({ text, color }: { text: string; color: string }) {
  return <Text style={{ color, fontSize: 14, fontWeight: "900", marginTop: 10, marginBottom: 10 }}>{text}</Text>;
}
function Empty({ text }: { text: string }) {
  return (
    <View style={{ alignItems: "center", marginTop: 30, marginBottom: 30 }}>
      <Text style={{ fontSize: 34, marginBottom: 8 }}>🔧</Text>
      <Text style={{ color: "#94A3B8", fontSize: 13 }}>{text}</Text>
    </View>
  );
}
function AlertBox({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ backgroundColor: `${color}15`, borderColor: `${color}55`, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <Text style={{ color, fontSize: 12, fontWeight: "900" }}>{text}</Text>
    </View>
  );
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ backgroundColor: active ? "rgba(167,139,250,0.18)" : "rgba(255,255,255,0.04)", borderColor: active ? "rgba(167,139,250,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
      <Text style={{ color: active ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 8, alignItems: "center", flex: 1 }}>
      <Text style={{ color: "#94A3B8", fontSize: 9 }}>{label}</Text>
      <Text style={{ color, fontSize: 13, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}
