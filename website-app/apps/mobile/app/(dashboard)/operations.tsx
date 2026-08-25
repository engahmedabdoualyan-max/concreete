/**
 * Native ERP — Operations (Trips)
 * Full trips management: list + search + filters + add/edit/delete.
 * Reads/writes the same Firestore `trips` collection as the website.
 */

import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { erp, dataUsername } from "@/lib/firestore";
import CalendarPicker from "@/components/ui/CalendarPicker";
import TimePicker from "@/components/ui/TimePicker";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.10)";
const INPUT = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 10, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };

const STATUSES = ["SCHEDULED", "LOADING", "IN_TRANSIT", "AT_SITE", "POURING", "RETURNING", "DELAYED", "COMPLETED", "CANCELLED"];

// Site readiness approval (supervisor gives OK before truck/pump moves)
type SiteReady = "pending" | "approved" | "rejected";
const SITE_READY_COLOR: Record<SiteReady, string> = { pending: "#FBBF24", approved: "#34D399", rejected: "#F87171" };
const SITE_READY_AR: Record<SiteReady, string> = { pending: "بانتظار الموافقة", approved: "الموقع جاهز ✓", rejected: "مرفوض" };
const MOVE_STATUSES = ["LOADING", "IN_TRANSIT", "AT_SITE", "POURING", "RETURNING"];

const statusColor = (s: string) =>
  s === "COMPLETED" ? "#34D399" : s === "CANCELLED" ? "#F87171" : s === "IN_TRANSIT" || s === "AT_SITE" ? "#38BDF8" : s === "DELAYED" ? "#FBBF24" : "#F97316";

interface Trip {
  id: number;
  plant?: string;
  date?: string;
  code?: string;
  driver?: string;
  qty?: number;
  pump?: string;
  estTime?: number;
  stationArr?: string;
  stationDep?: string;
  siteArr?: string;
  siteDep?: string;
  siteName?: string;
  projectName?: string;
  status?: string;
  orderId?: string;
  siteReady?: SiteReady;
  vehicleType?: string;
  [k: string]: any;
}

const emptyForm = {
  plant: "PLANT-A", date: "", code: "", driver: "", qty: "10", pump: "p01", estTime: "40",
  stationArr: "", stationDep: "", siteArr: "", siteDep: "",
  siteName: "", projectName: "", status: "SCHEDULED", orderId: "", siteReady: "pending" as SiteReady, vehicleType: "",
};

function fmtTime(t?: string) {
  if (!t || t === "00:00") return "--:--";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "--:--";
  return `${h % 12 || 12}:${m < 10 ? "0" + m : m} ${h >= 12 ? "PM" : "AM"}`;
}

function Field({ label, value, onChange, placeholder, numeric = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || label}
        placeholderTextColor="#64748B"
        keyboardType={numeric ? "numeric" : "default"}
        style={INPUT}
      />
    </View>
  );
}

function TimeField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>{label}</Text>
      <TouchableOpacity onPress={onPress} style={[INPUT, { justifyContent: "center" }]}>
        <Text style={{ color: value ? "#E2E8F0" : "#64748B" }}>{value ? `🕐 ${value}` : "🕐 اختر الوقت"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function TripCard({ trip, onEdit, onDelete, onApprove, onReject }: { trip: Trip; onEdit: () => void; onDelete: () => void; onApprove?: () => void; onReject?: () => void }) {
  const st = (trip.status || "").toUpperCase();
  const sr: SiteReady = trip.siteReady === "approved" || trip.siteReady === "rejected" ? trip.siteReady : "pending";
  return (
    <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>#{trip.code || trip.id}</Text>
          {trip.orderId ? <Text style={{ color: "#38BDF8", fontSize: 11, fontWeight: "700" }}>طلب {trip.orderId}</Text> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <View style={{ backgroundColor: `${SITE_READY_COLOR[sr]}22`, borderColor: `${SITE_READY_COLOR[sr]}66`, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
            <Text style={{ color: SITE_READY_COLOR[sr], fontSize: 10, fontWeight: "800" }}>{SITE_READY_AR[sr]}</Text>
          </View>
          <View style={{ backgroundColor: `${statusColor(st)}22`, borderColor: `${statusColor(st)}66`, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
            <Text style={{ color: statusColor(st), fontSize: 10, fontWeight: "800" }}>{st}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: "#CBD5E1", fontSize: 13 }}>{trip.siteName || "—"} · {trip.projectName || "—"}</Text>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>{trip.date || "—"}{trip.siteArr ? ` · ${fmtTime(trip.siteArr)}` : ""}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>🚚 {trip.driver || "—"}{trip.vehicleType ? ` · ${trip.vehicleType}` : ""}</Text>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>🏭 {trip.plant || "—"} · 🅿️ {trip.pump || "—"}</Text>
        <Text style={{ color: "#38BDF8", fontSize: 13, fontWeight: "800" }}>{trip.qty} م³</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "#64748B", fontSize: 11 }}>المحطة {fmtTime(trip.stationArr)}→{fmtTime(trip.stationDep)} · الموقع {fmtTime(trip.siteArr)}→{fmtTime(trip.siteDep)}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {onApprove ? <TouchableOpacity onPress={onApprove}><Text style={{ color: "#34D399", fontSize: 13, fontWeight: "800" }}>✓ موافقة</Text></TouchableOpacity> : null}
          {onReject ? <TouchableOpacity onPress={onReject}><Text style={{ color: "#F87171", fontSize: 13, fontWeight: "800" }}>✗ رفض</Text></TouchableOpacity> : null}
          <TouchableOpacity onPress={onEdit}><Text style={{ color: "#38BDF8", fontSize: 13, fontWeight: "700" }}>تعديل</Text></TouchableOpacity>
          <TouchableOpacity onPress={onDelete}><Text style={{ color: "#F87171", fontSize: 13, fontWeight: "700" }}>حذف</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function OperationsScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [pickerKind, setPickerKind] = useState<"date" | "time" | null>(null);
  const [pickerField, setPickerField] = useState<keyof typeof emptyForm | null>(null);

  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["erp-trips", u],
    queryFn: async () => (await erp.loadTrips(u)) || [],
  });

  const saveMutation = useMutation({
    mutationFn: async (list: Trip[]) => {
      const ok = await erp.saveTrips(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-trips", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["erp-trips", u] });
    setRefreshing(false);
  }, [qc, u]);

  const list = (trips || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.id || 0) - (a.id || 0));
  const filtered = list.filter(
    (t) =>
      (!statusFilter || String(t.status || "").toUpperCase() === statusFilter) &&
      (!search ||
        String(t.siteName || "").toLowerCase().includes(search.toLowerCase()) ||
        String(t.driver || "").toLowerCase().includes(search.toLowerCase()) ||
        String(t.code || "").toLowerCase().includes(search.toLowerCase()) ||
        String(t.projectName || "").toLowerCase().includes(search.toLowerCase()))
  );
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = list.filter((t) => t.date === today).length;
  const totalVolume = list.reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const pendingReady = list.filter((t) => (t.siteReady ?? "pending") === "pending").length;

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, date: today });
    setShowForm(true);
  };

  const openEdit = (t: Trip) => {
    setEditId(t.id);
    setForm({
      plant: t.plant || "", date: t.date || today, code: t.code || "", driver: t.driver || "",
      qty: String(t.qty ?? ""), pump: t.pump || "", estTime: String(t.estTime ?? ""),
      stationArr: t.stationArr || "", stationDep: t.stationDep || "", siteArr: t.siteArr || "", siteDep: t.siteDep || "",
      siteName: t.siteName || "", projectName: t.projectName || "", status: (t.status || "SCHEDULED").toUpperCase(), orderId: t.orderId || "",
      siteReady: (t.siteReady === "approved" || t.siteReady === "rejected" ? t.siteReady : "pending") as SiteReady,
      vehicleType: t.vehicleType || "",
    });
    setShowForm(true);
  };

  const approveReady = (t: Trip) => {
    saveMutation.mutate((trips || []).map((x) => (x.id === t.id ? { ...x, siteReady: "approved" } : x)));
  };
  const rejectReady = (t: Trip) => {
    Alert.alert("رفض جاهزية الموقع", "هل أنت متأكد من رفض جاهزية الموقع؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "رفض", style: "destructive", onPress: () => saveMutation.mutate((trips || []).map((x) => (x.id === t.id ? { ...x, siteReady: "rejected" } : x))) },
    ]);
  };

  const submit = () => {
    const st = (form.status || "SCHEDULED").toUpperCase();
    const sr = form.siteReady as SiteReady;
    if (MOVE_STATUSES.includes(st) && sr !== "approved") {
      Alert.alert("⚠️ جاهزية الموقع", "لا يمكن تحريك السيارة/البامب قبل موافقة المشرف على جاهزية الموقع.\n\nفعّل الموافقة أولاً من بطاقة الرحلة أو غيّر الحالة إلى SCHEDULED.");
      return;
    }
    const base = trips || [];
    if (editId !== null) {
      saveMutation.mutate(base.map((t) => (t.id === editId ? { ...t, ...form, qty: Number(form.qty) || 0, estTime: Number(form.estTime) || 0, id: editId } : t)));
    } else {
      const newId = base.length ? Math.max(...base.map((t) => Number(t.id) || 0)) + 1 : 1;
      saveMutation.mutate([...base, { ...form, id: newId, qty: Number(form.qty) || 0, estTime: Number(form.estTime) || 0 }]);
    }
    setShowForm(false);
  };

  const del = (t: Trip) => {
    Alert.alert("حذف الرحلة", `حذف الرحلة #${t.code || t.id}؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => saveMutation.mutate((trips || []).filter((x) => x.id !== t.id)) },
    ]);
  };

  const setF = (k: keyof typeof emptyForm) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: "rgba(11,17,30,0.9)" }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/(dashboard)" as any))} style={{ padding: 6 }}>
            <Text style={{ color: "#38BDF8", fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>🚚 التشغيل — الرحلات</Text>
          <TouchableOpacity onPress={openAdd} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.4)", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}>
            <Text style={{ color: "#38BDF8", fontSize: 13, fontWeight: "800" }}>+ إضافة</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingBottom: 10, gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" }}>
            <Text style={{ color: "#38BDF8", fontSize: 16, fontWeight: "900" }}>{todayCount}</Text>
            <Text style={{ color: "#94A3B8", fontSize: 10 }}>رحلات اليوم</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" }}>
            <Text style={{ color: "#34D399", fontSize: 16, fontWeight: "900" }}>{totalVolume}</Text>
            <Text style={{ color: "#94A3B8", fontSize: 10 }}>إجمالي م³</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" }}>
            <Text style={{ color: "#FBBF24", fontSize: 16, fontWeight: "900" }}>{pendingReady}</Text>
            <Text style={{ color: "#94A3B8", fontSize: 10 }}>بانتظار موافقة</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 بحث: موقع، سائق، كود، مشروع"
          placeholderTextColor="#64748B"
          style={INPUT}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
          <FilterChip label="الكل" active={!statusFilter} onPress={() => setStatusFilter("")} />
          {STATUSES.map((s) => (
            <FilterChip key={s} label={s} active={statusFilter === s} onPress={() => setStatusFilter(statusFilter === s ? "" : s)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
      >
        {isLoading && <Text style={{ color: "#64748B", textAlign: "center", marginTop: 40 }}>جارِ تحميل الرحلات...</Text>}
        {!isLoading && filtered.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 44, marginBottom: 8 }}>🚚</Text>
            <Text style={{ color: "#94A3B8", fontSize: 14 }}>لا توجد رحلات</Text>
            <TouchableOpacity onPress={openAdd} style={{ marginTop: 14, backgroundColor: "rgba(56,189,248,0.15)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
              <Text style={{ color: "#38BDF8", fontWeight: "700" }}>إضافة أول رحلة</Text>
            </TouchableOpacity>
          </View>
        )}
        {filtered.map((t) => (
          <TripCard key={t.id} trip={t} onEdit={() => openEdit(t)} onDelete={() => del(t)}
            onApprove={(t.siteReady ?? "pending") === "pending" ? () => approveReady(t) : undefined}
            onReject={(t.siteReady ?? "pending") === "pending" ? () => rejectReady(t) : undefined}
          />
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setShowForm(false)}>
            <Pressable style={{ backgroundColor: "#0B111E", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "92%" }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "900", textAlign: "center" }}>
                  {editId !== null ? "✏️ تعديل رحلة" : "➕ رحلة جديدة"}
                </Text>
                <TouchableOpacity onPress={() => setShowForm(false)} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20 }}>
                  <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "900" }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
                    <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>التاريخ</Text>
                    <TouchableOpacity onPress={() => { setPickerField("date"); setPickerKind("date"); }} style={[INPUT, { justifyContent: "center" }]}>
                      <Text style={{ color: form.date ? "#E2E8F0" : "#64748B" }}>{form.date ? `📅 ${form.date}` : "📅 اختر التاريخ"}</Text>
                    </TouchableOpacity>
                  </View>
                  <Field label="الكود" value={form.code} onChange={setF("code")} placeholder="m01" />
                  <Field label="المصنع" value={form.plant} onChange={setF("plant")} />
                  <Field label="رقم الطلب" value={form.orderId} onChange={setF("orderId")} />
                  <Field label="السائق" value={form.driver} onChange={setF("driver")} />
                  <Field label="الكمية (م³)" value={form.qty} onChange={setF("qty")} numeric />
                  <Field label="البامب" value={form.pump} onChange={setF("pump")} />
                  <Field label="نوع المركبة" value={form.vehicleType} onChange={setF("vehicleType")} placeholder="خلاطة / شاحنة / قلاب / بامب" />
                  <Field label="الوقت المقدر (د)" value={form.estTime} onChange={setF("estTime")} numeric />
                  <Field label="موقع الخرسانة" value={form.siteName} onChange={setF("siteName")} />
                  <Field label="المشروع" value={form.projectName} onChange={setF("projectName")} />
                  <TimeField label="وصول المحطة" value={form.stationArr} onPress={() => { setPickerField("stationArr"); setPickerKind("time"); }} />
                  <TimeField label="مغادرة المحطة" value={form.stationDep} onPress={() => { setPickerField("stationDep"); setPickerKind("time"); }} />
                  <TimeField label="وصول الموقع" value={form.siteArr} onPress={() => { setPickerField("siteArr"); setPickerKind("time"); }} />
                  <TimeField label="مغادرة الموقع" value={form.siteDep} onPress={() => { setPickerField("siteDep"); setPickerKind("time"); }} />
                </View>
                <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>جاهزية الموقع (موافقة المشرف)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 10 }}>
                  {(["pending", "approved", "rejected"] as SiteReady[]).map((s) => (
                    <FilterChip key={s} label={SITE_READY_AR[s]} active={form.siteReady === s} color={SITE_READY_COLOR[s]} onPress={() => setF("siteReady")(s)} />
                  ))}
                </ScrollView>
                <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>الحالة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 18 }}>
                  {STATUSES.map((s) => (
                    <FilterChip key={s} label={s} active={form.status === s} onPress={() => setF("status")(s)} />
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={submit}
                  disabled={saveMutation.isPending}
                  style={{ backgroundColor: "#0284C7", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saveMutation.isPending ? 0.6 : 1 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{saveMutation.isPending ? "جارِ الحفظ..." : "💾 حفظ الرحلة"}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {pickerKind === "date" ? (
        <CalendarPicker
          visible
          value={form.date || today}
          onChange={(d) => setF("date")(d)}
          onClose={() => setPickerKind(null)}
          accent="#38BDF8"
        />
      ) : pickerKind === "time" && pickerField ? (
        <TimePicker
          visible
          value={form[pickerField] || "08:00"}
          onChange={(t) => setF(pickerField)(t)}
          onClose={() => setPickerKind(null)}
          accent="#38BDF8"
        />
      ) : null}
    </View>
  );
}

function FilterChip({ label, active, onPress, color = "#38BDF8" }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? `${color}2B` : "rgba(255,255,255,0.04)",
        borderColor: active ? `${color}80` : BORDER,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
      }}
    >
      <Text style={{ color: active ? color : "#94A3B8", fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
