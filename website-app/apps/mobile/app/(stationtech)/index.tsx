/**
 * فني صيانة محطات — Station Maintenance Technician Screen
 * =========================================================
 * Dedicated mobile screen for the station maintenance tech.
 *  • بيان الفحص اليومي: daily check on station equipment (belts, sensors,
 *    scales, PLC, electrical, operating software).
 *  • جدول متابعة: follow-up maintenance schedule per station.
 *  • طلبات تغيير: change / replacement requests for station items.
 *
 * Reads/writes the same Firestore pattern as the rest of the ERP:
 *   userData/{username}/stn_daily/data
 *   userData/{username}/stn_schedule/data
 *   userData/{username}/stn_requests/data
 */

import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, RefreshControl, Image } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { erp, dataUsername } from "@/lib/firestore";
import CalendarPicker from "@/components/ui/CalendarPicker";
import { PhotoCapture, PhotoThumb } from "@/components/ui/PhotoCapture";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.10)";
const ACCENT = "#2DD4BF";
const INPUT = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 10, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };

// ─── Types (Firestore stn_* collections) ───────────────────────────────────────

export type ItemKey = "belts" | "sensors" | "scales" | "plc" | "electrical" | "software";

export const STATION_ITEMS: { key: ItemKey; ar: string; icon: string }[] = [
  { key: "belts", ar: "سيور النقل", icon: "🎢" },
  { key: "sensors", ar: "الحساسات", icon: "📡" },
  { key: "scales", ar: "الموازين", icon: "⚖️" },
  { key: "plc", ar: "وحدات PLC", icon: "🎛️" },
  { key: "electrical", ar: "الكهرباء", icon: "⚡" },
  { key: "software", ar: "برامج التشغيل", icon: "💻" },
];

export type ItemStatus = "ok" | "issue" | "na";

export interface DailyCheckItem {
  key: ItemKey;
  status: ItemStatus;
  note?: string;
}

export interface StationDailyCheck {
  id: string;
  date: string;
  stationId: string;
  stationName: string;
  checkedBy: string;
  items: DailyCheckItem[];
  overall: "ok" | "issues";
  notes: string;
  createdAt: string;
}

export interface StationScheduleTask {
  id: string;
  date: string;
  stationId: string;
  stationName: string;
  taskType: string;
  description: string;
  dueDate: string;
  status: "pending" | "in_progress" | "done";
  technician: string;
  notes: string;
}

export interface StationChangeRequest {
  id: string;
  date: string;
  stationId: string;
  stationName: string;
  itemType: string;
  itemName: string;
  reason: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "approved" | "rejected" | "done";
  requestedBy: string;
  notes: string;
  /** Small JPEG data-URI captured by the technician (shown in the workshop too). */
  photo?: string;
}

const TASK_TYPES = ["فحص دوري", "استبدال قطعة", "إصلاح", "معايرة", "تحديث برنامج", "صيانة كهربائية", "أخرى"];

// ─── Small UI helpers ───────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

function Pill({ s, c }: { s: string; c: string }) {
  return <Text style={{ color: c, fontSize: 10, fontWeight: "900", backgroundColor: `${c}22`, borderColor: `${c}55`, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: "hidden", textAlign: "center" }}>{s}</Text>;
}

function statusPill(status: string): string {
  switch (status) {
    case "ok": return "#34D399";
    case "issue": return "#F87171";
    case "na": return "#94A3B8";
    case "done": return "#34D399";
    case "approved": return "#34D399";
    case "in_progress": return "#38BDF8";
    case "pending": return "#FBBF24";
    case "rejected": return "#F87171";
    default: return "#94A3B8";
  }
}

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder || label} placeholderTextColor="#64748B" multiline={multiline} style={[INPUT, multiline ? { minHeight: 70, textAlignVertical: "top" } : null]} />
    </View>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
          <TouchableOpacity key={o} onPress={() => onChange(o)} style={{ backgroundColor: value === o ? "rgba(45,212,191,0.18)" : "rgba(255,255,255,0.04)", borderColor: value === o ? "rgba(45,212,191,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
            <Text style={{ color: value === o ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{o}</Text>
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

function FormSheet({ title, onClose, children, onSubmit, pending, submitLabel = "💾 حفظ" }: {
  title: string; onClose: () => void; children: React.ReactNode; onSubmit: () => void; pending?: boolean; submitLabel?: string;
}) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={onClose}>
          <Pressable style={{ backgroundColor: "#0B111E", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "94%" }} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "900", textAlign: "center" }}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20 }}>
                <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "900" }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {children}
              <TouchableOpacity onPress={onSubmit} disabled={pending} style={{ backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: pending ? 0.6 : 1, marginTop: 4 }}>
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

type Tab = "home" | "daily" | "schedule" | "requests";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: "الرئيسية", emoji: "🏠" },
  { id: "daily", label: "بيان الفحص اليومي", emoji: "✅" },
  { id: "schedule", label: "جدول المتابعة", emoji: "📅" },
  { id: "requests", label: "طلبات التغيير", emoji: "🔄" },
];

export default function StationTechScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);
  const techName = user?.fullName || user?.employeeCode || "فني";

  const [tab, setTab] = useState<Tab>("home");
  const [refreshing, setRefreshing] = useState(false);

  const { data: data, isLoading } = useQuery({
    queryKey: ["stn-all", u],
    queryFn: async () => {
      const [checks, schedule, requests, stations] = await Promise.all([
        erp.loadStnDailyChecks(u).catch(() => null),
        erp.loadStnSchedule(u).catch(() => null),
        erp.loadStnRequests(u).catch(() => null),
        erp.loadStations(u).catch(() => null),
      ]);
      return { checks, schedule, requests, stations };
    },
  });

  const list = (v: any) => (Array.isArray(v) ? v : []);
  const checks = list(data?.checks) as StationDailyCheck[];
  const schedule = list(data?.schedule) as StationScheduleTask[];
  const requests = list(data?.requests) as StationChangeRequest[];
  const stations = list(data?.stations) as any[];
  const stationName = (id: string) => {
    const s = stations.find((st) => String(st.id) === String(id));
    return s?.name || "—";
  };

  const saveMutation = useMutation({
    mutationFn: async ({ collection, values }: { collection: string; values: any[] }) => {
      if (collection === "stn_daily") return erp.saveStnDailyChecks(u, values);
      if (collection === "stn_schedule") return erp.saveStnSchedule(u, values);
      return erp.saveStnRequests(u, values);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stn-all", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.refetchQueries({ queryKey: ["stn-all", u] });
    setRefreshing(false);
  }, [qc, u]);

  // ── Daily check form ──
  const [showDaily, setShowDaily] = useState(false);
  const [dStation, setDStation] = useState("");
  const [dItems, setDItems] = useState<DailyCheckItem[]>(STATION_ITEMS.map((it) => ({ key: it.key, status: "ok" as ItemStatus, note: "" })));
  const [dNotes, setDNotes] = useState("");

  const openDaily = (stationId?: string) => {
    setDStation(stationId || "");
    setDItems(STATION_ITEMS.map((it) => ({ key: it.key, status: "ok" as ItemStatus, note: "" })));
    setDNotes("");
    setShowDaily(true);
  };

  const submitDaily = () => {
    const name = stationName(dStation);
    if (!dStation || name === "—") {
      Alert.alert("تنبيه", "اختر المحطة أولاً");
      return;
    }
    const issues = dItems.filter((it) => it.status === "issue").length;
    const rec: StationDailyCheck = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: today(),
      stationId: dStation,
      stationName: name,
      checkedBy: techName,
      items: dItems.map((it) => ({ ...it })),
      overall: issues > 0 ? "issues" : "ok",
      notes: dNotes,
      createdAt: new Date().toISOString(),
    };
    saveMutation.mutate({ collection: "stn_daily", values: [rec, ...checks] });
    setShowDaily(false);
  };

  const setItemStatus = (key: ItemKey, status: ItemStatus) => {
    setDItems((prev) => prev.map((it) => (it.key === key ? { ...it, status } : it)));
  };

  // ── Schedule form ──
  const [showSch, setShowSch] = useState(false);
  const [showDueCal, setShowDueCal] = useState(false);
  const [sForm, setSForm] = useState({ stationId: "", taskType: TASK_TYPES[0], description: "", dueDate: today() });

  const submitSch = () => {
    const name = stationName(sForm.stationId);
    if (!sForm.stationId || name === "—") {
      Alert.alert("تنبيه", "اختر المحطة أولاً");
      return;
    }
    const rec: StationScheduleTask = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: today(),
      stationId: sForm.stationId,
      stationName: name,
      taskType: sForm.taskType,
      description: sForm.description,
      dueDate: sForm.dueDate,
      status: "pending",
      technician: techName,
      notes: "",
    };
    saveMutation.mutate({ collection: "stn_schedule", values: [rec, ...schedule] });
    setShowSch(false);
    setSForm({ stationId: "", taskType: TASK_TYPES[0], description: "", dueDate: today() });
  };

  const setTaskStatus = (id: string, status: StationScheduleTask["status"]) => {
    saveMutation.mutate({ collection: "stn_schedule", values: schedule.map((t) => (t.id === id ? { ...t, status } : t)) });
  };

  // ── Request form ──
  const [showReq, setShowReq] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [rForm, setRForm] = useState({ stationId: "", itemType: "سيور النقل", itemName: "", reason: "", priority: "medium" as StationChangeRequest["priority"] });
  const [rPhoto, setRPhoto] = useState<string | null>(null);

  const submitReq = () => {
    const name = stationName(rForm.stationId);
    if (!rForm.stationId || name === "—") {
      Alert.alert("تنبيه", "اختر المحطة أولاً");
      return;
    }
    const rec: StationChangeRequest = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: today(),
      stationId: rForm.stationId,
      stationName: name,
      itemType: rForm.itemType,
      itemName: rForm.itemName,
      reason: rForm.reason,
      priority: rForm.priority,
      status: "pending",
      requestedBy: techName,
      notes: "",
      photo: rPhoto || undefined,
    };
    saveMutation.mutate({ collection: "stn_requests", values: [rec, ...requests] });
    setShowReq(false);
    setRPhoto(null);
    setRForm({ stationId: "", itemType: "سيور النقل", itemName: "", reason: "", priority: "medium" });
  };

  const setReqStatus = (id: string, status: StationChangeRequest["status"]) => {
    saveMutation.mutate({ collection: "stn_requests", values: requests.map((r) => (r.id === id ? { ...r, status } : r)) });
  };

  // ── Derived KPIs ──
  const todayStr = today();
  const todayChecks = checks.filter((c) => c.date === todayStr);
  const openSchedule = schedule.filter((t) => t.status !== "done").length;
  const pendingReqs = requests.filter((r) => r.status === "pending" || r.status === "approved").length;
  const issuesToday = todayChecks.filter((c) => c.overall === "issues").length;

  const itemLabel = (k: string) => STATION_ITEMS.find((it) => it.key === k)?.ar || k;
  const statusAr = (s: string) => ({ ok: "سليم", issue: "عطل", na: "غير متوفر" }[s] || s);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab bar */}
      <View style={{ flexDirection: "row", paddingHorizontal: 10, paddingTop: 8, gap: 6 }}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: tab === t.id ? "rgba(45,212,191,0.15)" : "transparent", borderWidth: 1, borderColor: tab === t.id ? "rgba(45,212,191,0.4)" : "transparent" }}>
            <Text style={{ fontSize: 16 }}>{t.emoji}</Text>
            <Text style={{ color: tab === t.id ? ACCENT : "#94A3B8", fontSize: 10, fontWeight: "800", marginTop: 2 }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {isLoading ? (
          <Text style={{ color: "#94A3B8", textAlign: "center", marginTop: 40 }}>جارِ التحميل...</Text>
        ) : tab === "home" ? (
          <View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              <Kpi label="فحوصات اليوم" value={`${todayChecks.length}`} color={ACCENT} />
              <Kpi label="مشاكل اليوم" value={`${issuesToday}`} color={issuesToday > 0 ? "#F87171" : ACCENT} />
              <Kpi label="مهام مفتوحة" value={`${openSchedule}`} color="#FBBF24" />
              <Kpi label="طلبات معلقة" value={`${pendingReqs}`} color="#38BDF8" />
              <Kpi label="عدد المحطات" value={`${stations.length}`} color="#A78BFA" />
            </View>

            <Row title="✅ ابدأ بيان الفحص اليومي" sub="فحص سيور النقل، الحساسات، الموازين، PLC، الكهرباء وبرامج التشغيل" onPress={() => openDaily()} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} border="rgba(45,212,191,0.4)" />
            <Row title="📅 أضف مهمة متابعة" sub="جدول صيانة / فحص دوري لمحطة" onPress={() => setShowSch(true)} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} />
            <Row title="🔄 طلب تغيير" sub="طلب استبدال قطعة أو جهاز في محطة" onPress={() => setShowReq(true)} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} />

            {todayChecks.length > 0 ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900", marginBottom: 10 }}>فحص اليوم ({todayStr})</Text>
                {todayChecks.map((c) => (
                  <Row key={c.id} title={c.stationName} sub={`بواسطة ${c.checkedBy}`} right={<Pill s={c.overall === "ok" ? "سليم" : "به مشاكل"} c={statusPill(c.overall === "ok" ? "ok" : "issue")} />} />
                ))}
              </View>
            ) : null}
          </View>
        ) : tab === "daily" ? (
          <View>
            <TouchableOpacity onPress={() => openDaily()} style={{ backgroundColor: "rgba(45,212,191,0.15)", borderColor: "rgba(45,212,191,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ تسجيل فحص يومي جديد</Text>
            </TouchableOpacity>
            {checks.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد فحوصات مسجلة بعد</Text>
            ) : (
              [...checks].sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
                <Row key={c.id} title={`${c.stationName} · ${c.date}`} sub={`${c.items.filter((i) => i.status === "issue").length} مشكلة · ${c.notes || ""}`} right={<Pill s={c.overall === "ok" ? "سليم" : "به مشاكل"} c={statusPill(c.overall === "ok" ? "ok" : "issue")} />} />
              ))
            )}
          </View>
        ) : tab === "schedule" ? (
          <View>
            <TouchableOpacity onPress={() => setShowSch(true)} style={{ backgroundColor: "rgba(45,212,191,0.15)", borderColor: "rgba(45,212,191,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ مهمة متابعة جديدة</Text>
            </TouchableOpacity>
            {schedule.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد مهام متابعة</Text>
            ) : (
              [...schedule].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                <Row key={t.id} title={`${t.stationName} · ${t.taskType}`} sub={`${t.description} · استحقاق ${t.dueDate}`} onPress={() => {}} right={
                  <View style={{ gap: 5, alignItems: "flex-end" }}>
                    <Pill s={{ pending: "قيد الانتظار", in_progress: "قيد التنفيذ", done: "منجزة" }[t.status] || t.status} c={statusPill(t.status)} />
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      {t.status !== "done" ? <Text style={{ color: "#38BDF8", fontSize: 11, fontWeight: "800" }} onPress={() => setTaskStatus(t.id, "done")}>إنهاء</Text> : null}
                    </View>
                  </View>
                } />
              ))
            )}
          </View>
        ) : (
          <View>
            <TouchableOpacity onPress={() => setShowReq(true)} style={{ backgroundColor: "rgba(45,212,191,0.15)", borderColor: "rgba(45,212,191,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ طلب تغيير جديد</Text>
            </TouchableOpacity>
            {requests.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد طلبات تغيير</Text>
            ) : (
              [...requests].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
                <Row key={r.id} title={`${r.stationName} · ${r.itemType}`} sub={`${r.itemName} — ${r.reason || ""} · ${r.date}`} right={
                  <View style={{ gap: 5, alignItems: "flex-end" }}>
                    {r.photo ? <PhotoThumb photo={r.photo} /> : null}
                    <Pill s={r.priority} c={r.priority === "high" ? "#F87171" : r.priority === "medium" ? "#FBBF24" : "#94A3B8"} />
                    <Pill s={{ pending: "قيد الانتظار", approved: "موافق", rejected: "مرفوض", done: "تم" }[r.status] || r.status} c={statusPill(r.status)} />
                  </View>
                } />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Daily check form ── */}
      {showDaily ? (
        <FormSheet title={`✅ بيان الفحص اليومي — ${todayStr}`} onClose={() => setShowDaily(false)} onSubmit={submitDaily} pending={saveMutation.isPending}>
          <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>المحطة *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {stations.map((s) => (
              <TouchableOpacity key={s.id} onPress={() => setDStation(String(s.id))} style={{ backgroundColor: String(dStation) === String(s.id) ? "rgba(45,212,191,0.18)" : "rgba(255,255,255,0.04)", borderColor: String(dStation) === String(s.id) ? "rgba(45,212,191,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ color: String(dStation) === String(s.id) ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {STATION_ITEMS.map((it) => {
            const cur = dItems.find((i) => i.key === it.key);
            return (
              <View key={it.key} style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800", marginBottom: 8 }}>{it.icon} {it.ar}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["ok", "issue", "na"] as ItemStatus[]).map((st) => (
                    <TouchableOpacity key={st} onPress={() => setItemStatus(it.key, st)} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, backgroundColor: cur?.status === st ? (st === "issue" ? "rgba(248,113,113,0.2)" : st === "ok" ? "rgba(52,211,153,0.2)" : "rgba(148,163,184,0.2)") : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: cur?.status === st ? statusPill(st) : BORDER }}>
                      <Text style={{ color: cur?.status === st ? statusPill(st) : "#94A3B8", fontSize: 12, fontWeight: "800" }}>{statusAr(st)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
          <Field label="ملاحظات" value={dNotes} onChange={setDNotes} placeholder="أي ملاحظات عن المحطة اليوم..." multiline />
        </FormSheet>
      ) : null}

      {/* ── Schedule form ── */}
      {showSch ? (
        <FormSheet title="📅 مهمة متابعة جديدة" onClose={() => setShowSch(false)} onSubmit={submitSch} pending={saveMutation.isPending}>
          <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>المحطة *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {stations.map((s) => (
              <TouchableOpacity key={s.id} onPress={() => setSForm((p) => ({ ...p, stationId: String(s.id) }))} style={{ backgroundColor: String(sForm.stationId) === String(s.id) ? "rgba(45,212,191,0.18)" : "rgba(255,255,255,0.04)", borderColor: String(sForm.stationId) === String(s.id) ? "rgba(45,212,191,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ color: String(sForm.stationId) === String(s.id) ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Chips label="نوع المهمة" options={TASK_TYPES} value={sForm.taskType} onChange={(v) => setSForm((p) => ({ ...p, taskType: v }))} />
          <Field label="الوصف" value={sForm.description} onChange={(v) => setSForm((p) => ({ ...p, description: v }))} placeholder="وصف المهمة..." multiline />
          <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>تاريخ الاستحقاق</Text>
          <TouchableOpacity onPress={() => setShowDueCal(true)} style={[INPUT, { justifyContent: "center", marginBottom: 12 }]}>
            <Text style={{ color: "#E2E8F0" }}>📅 {sForm.dueDate}</Text>
          </TouchableOpacity>
        </FormSheet>
      ) : null}

      <CalendarPicker
        visible={showDueCal}
        value={sForm.dueDate}
        onChange={(d) => setSForm((p) => ({ ...p, dueDate: d }))}
        onClose={() => setShowDueCal(false)}
        accent={ACCENT}
      />

      {/* ── Request form ── */}
      {showReq ? (
        <FormSheet title="🔄 طلب تغيير" onClose={() => setShowReq(false)} onSubmit={submitReq} pending={saveMutation.isPending}>
          <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>المحطة *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
            {stations.map((s) => (
              <TouchableOpacity key={s.id} onPress={() => setRForm((p) => ({ ...p, stationId: String(s.id) }))} style={{ backgroundColor: String(rForm.stationId) === String(s.id) ? "rgba(45,212,191,0.18)" : "rgba(255,255,255,0.04)", borderColor: String(rForm.stationId) === String(s.id) ? "rgba(45,212,191,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ color: String(rForm.stationId) === String(s.id) ? ACCENT : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Chips label="نوع العنصر" options={STATION_ITEMS.map((i) => i.ar)} value={rForm.itemType} onChange={(v) => setRForm((p) => ({ ...p, itemType: v }))} />
          <Field label="اسم القطعة / الجهاز" value={rForm.itemName} onChange={(v) => setRForm((p) => ({ ...p, itemName: v }))} placeholder="مثال: سير ناقل رقم 2" />
          <Field label="سبب التغيير" value={rForm.reason} onChange={(v) => setRForm((p) => ({ ...p, reason: v }))} placeholder="سبب الطلب..." multiline />
          <Chips label="الأولوية" options={["high", "medium", "low"]} value={rForm.priority} onChange={(v) => setRForm((p) => ({ ...p, priority: v as StationChangeRequest["priority"] }))} />

          {/* 📷 Photo attachment */}
          <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>صورة القطعة / المشكلة (اختياري)</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
            {rPhoto ? <PhotoThumb photo={rPhoto} size={64} /> : null}
            <TouchableOpacity onPress={() => setShowCam(true)} style={{ backgroundColor: "rgba(45,212,191,0.12)", borderColor: "rgba(45,212,191,0.4)", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: ACCENT, fontWeight: "800", fontSize: 13 }}>{rPhoto ? "📷 إعادة التقاط" : "📷 أضف صورة"}</Text>
            </TouchableOpacity>
            {rPhoto ? (
              <TouchableOpacity onPress={() => setRPhoto(null)} style={{ backgroundColor: "rgba(248,113,113,0.12)", borderColor: "rgba(248,113,113,0.4)", borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: "#F87171", fontWeight: "800", fontSize: 13 }}>إزالة</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </FormSheet>
      ) : null}

      {/* 📷 Camera modal */}
      <PhotoCapture
        visible={showCam}
        onClose={() => setShowCam(false)}
        onCapture={(uri) => {
          setRPhoto(uri || null);
          setShowCam(false);
          if (!uri) Alert.alert("تنبيه", "الصورة كبيرة جداً للحفظ — جرّب إعادة التقاطها أو أرسل بدون صورة");
        }}
      />
    </View>
  );
}
