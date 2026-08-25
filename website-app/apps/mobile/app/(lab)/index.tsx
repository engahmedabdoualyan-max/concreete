/**
 * مدير مختبر — Lab Manager Screen
 * =========================================================
 * Dedicated mobile screen for the concrete plant lab manager.
 *  • عينات خرسانية: cube/cylinder samples linked to orders/batches with
 *    7-day and 28-day compressive strength decisions (accept/reject).
 *  • فحوصات جودة: slump / temperature / strength checks per truck.
 *  • معايرة معدات: scale calibration logs (target vs measured vs dev%).
 *  • وصفات خلط: mix-design recipes (cement / sand / gravel / water / admixture).
 *
 * Reads/writes the same Firestore collections as the website (MixingQuality):
 *   userData/{username}/qcRecords/data
 *   userData/{username}/calibrationLogs/data
 *   userData/{username}/recipes/data
 *   userData/{username}/productionRuns/data
 */

import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { erp, dataUsername } from "@/lib/firestore";
import CalendarPicker from "@/components/ui/CalendarPicker";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.10)";
const ACCENT = "#38BDF8";
const INPUT = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 10, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };

// ─── Types (Firestore collections shared with the website) ─────────────────────

export interface SampleRecord {
  id: string;
  date: string;
  sampleId: string;
  truck: string;
  design: string;
  slump: number;
  temp: number;
  break7d: number;
  break28d: number;
  customer: string;
  site: string;
  mixDesignCode: string;
  orderId: string;
  bonNo: string;
  batch: string;
  status: "pending" | "passed" | "failed";
  takenBy: string;
  notes: string;
}

export interface CalibrationRecord {
  id: string;
  date: string;
  scaleType: string;
  target: number;
  measured: number;
  dev: number;
  status: "Passed" | "Warning" | "Failed";
  notes: string;
}

export interface RecipeRecord {
  id: string;
  code: string;
  cement: number;
  sand: number;
  gravel: number;
  water: number;
  admixture: number;
}

const SCALE_TYPES = [
  { key: "Cement Scale (500kg)", target: 500 },
  { key: "Aggregate Scale (1000kg)", target: 1000 },
  { key: "Water Scale (200kg)", target: 200 },
];

const DESIGNS = ["C25", "C30", "C35", "C40"];

const today = () => new Date().toISOString().split("T")[0];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ─── Small UI helpers ───────────────────────────────────────────────────────────

function Pill({ s, c }: { s: string; c: string }) {
  return <Text style={{ color: c, fontSize: 10, fontWeight: "900", backgroundColor: `${c}22`, borderColor: `${c}55`, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: "hidden", textAlign: "center" }}>{s}</Text>;
}

function statusPill(status: string): string {
  switch (status) {
    case "passed": return "#34D399";
    case "ok": return "#34D399";
    case "failed": return "#F87171";
    case "rejected": return "#F87171";
    case "pending": return "#FBBF24";
    case "warning": return "#FBBF24";
    default: return "#94A3B8";
  }
}

function Field({ label, value, onChange, placeholder, multiline = false, numeric = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; numeric?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder || label} placeholderTextColor="#64748B" multiline={multiline} keyboardType={numeric ? "numeric" : "default"} style={[INPUT, multiline ? { minHeight: 70, textAlignVertical: "top" } : null]} />
    </View>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
          <TouchableOpacity key={o} onPress={() => onChange(o)} style={{ backgroundColor: value === o ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.04)", borderColor: value === o ? "rgba(56,189,248,0.5)" : BORDER, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
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

type Tab = "home" | "samples" | "qc" | "calibration" | "recipes";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: "الرئيسية", emoji: "🏠" },
  { id: "samples", label: "عينات خرسانية", emoji: "🧊" },
  { id: "qc", label: "فحوصات الجودة", emoji: "🔬" },
  { id: "calibration", label: "معايرة المعدات", emoji: "⚖️" },
  { id: "recipes", label: "وصفات الخلط", emoji: "🧪" },
];

export default function LabManagerScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);
  const labName = user?.fullName || user?.employeeCode || "مختبر";

  const [tab, setTab] = useState<Tab>("home");
  const [refreshing, setRefreshing] = useState(false);

  const { data: data, isLoading } = useQuery({
    queryKey: ["lab-all", u],
    queryFn: async () => {
      const [samples, qcRecords, calib, recipes, orders] = await Promise.all([
        erp.loadSamples(u).catch(() => null),
        erp.loadQCRecords(u).catch(() => null),
        erp.loadCalibrationLogs(u).catch(() => null),
        erp.loadRecipes(u).catch(() => null),
        erp.loadOrders(u).catch(() => null),
      ]);
      return { samples, qcRecords, calib, recipes, orders };
    },
  });

  const list = (v: any) => (Array.isArray(v) ? v : []);
  const samples = list(data?.samples) as SampleRecord[];
  const qcRecords = list(data?.qcRecords) as SampleRecord[];
  const calib = list(data?.calib) as CalibrationRecord[];
  const recipes = list(data?.recipes) as RecipeRecord[];
  const orders = list(data?.orders) as any[];

  const saveMutation = useMutation({
    mutationFn: async ({ collection, values }: { collection: string; values: any[] }) => {
      if (collection === "samples") return erp.saveSamples(u, values);
      if (collection === "qc") return erp.saveQCRecords(u, values);
      if (collection === "calibration") return erp.saveCalibrationLogs(u, values);
      return erp.saveRecipes(u, values);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lab-all", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.refetchQueries({ queryKey: ["lab-all", u] });
    setRefreshing(false);
  }, [qc, u]);

  // ── Sample form (عينات خرسانية) ──
  const [showSample, setShowSample] = useState(false);
  const [sForm, setSForm] = useState({ sampleId: "", truck: "", design: "C30", slump: "", temp: "", break7d: "", break28d: "", orderId: "", bonNo: "", batch: "", customer: "", site: "", notes: "" });

  const submitSample = () => {
    if (!sForm.sampleId.trim() && !sForm.bonNo.trim()) {
      Alert.alert("تنبيه", "أدخل رقم العينة أو رقم البون");
      return;
    }
    const target = parseInt(sForm.design.replace("C", ""), 10);
    const b28 = Number(sForm.break28d) || 0;
    const status: SampleRecord["status"] = b28 === 0 ? "pending" : b28 >= target ? "passed" : "failed";
    const rec: SampleRecord = {
      id: uid(),
      date: today(),
      sampleId: sForm.sampleId.trim() || sForm.bonNo.trim(),
      truck: sForm.truck,
      design: sForm.design,
      slump: Number(sForm.slump) || 0,
      temp: Number(sForm.temp) || 0,
      break7d: Number(sForm.break7d) || 0,
      break28d: b28,
      customer: sForm.customer,
      site: sForm.site,
      mixDesignCode: sForm.design,
      orderId: sForm.orderId,
      bonNo: sForm.bonNo,
      batch: sForm.batch,
      status,
      takenBy: labName,
      notes: sForm.notes,
    };
    saveMutation.mutate({ collection: "samples", values: [rec, ...samples] });
    setShowSample(false);
    setSForm({ sampleId: "", truck: "", design: "C30", slump: "", temp: "", break7d: "", break28d: "", orderId: "", bonNo: "", batch: "", customer: "", site: "", notes: "" });
  };

  const setSampleStatus = (id: string, status: SampleRecord["status"]) => {
    saveMutation.mutate({ collection: "samples", values: samples.map((s) => (s.id === id ? { ...s, status } : s)) });
  };

  // ── QC record form (فحوصات الجودة) ──
  const [showQc, setShowQc] = useState(false);
  const [qForm, setQForm] = useState({ sample: "", truck: "", design: "C30", slump: "", temp: "", break7d: "", break28d: "", orderId: "", bonNo: "", customer: "", site: "", status: "PENDING" });

  const submitQc = () => {
    const rec: any = {
      id: uid(),
      date: today(),
      sample: qForm.sample || qForm.bonNo || uid(),
      truck: qForm.truck,
      design: qForm.design,
      slump: Number(qForm.slump) || 0,
      temp: Number(qForm.temp) || 0,
      break7d: Number(qForm.break7d) || 0,
      break28d: Number(qForm.break28d) || 0,
      orderId: qForm.orderId,
      bonNo: qForm.bonNo,
      customer: qForm.customer,
      site: qForm.site,
      grade: qForm.design,
      status: qForm.status,
      createdBy: labName,
    };
    saveMutation.mutate({ collection: "qc", values: [rec, ...qcRecords] });
    setShowQc(false);
    setQForm({ sample: "", truck: "", design: "C30", slump: "", temp: "", break7d: "", break28d: "", orderId: "", bonNo: "", customer: "", site: "", status: "PENDING" });
  };

  const setQcStatus = (id: string, status: string) => {
    saveMutation.mutate({ collection: "qc", values: qcRecords.map((r: any) => (String(r.id) === String(id) ? { ...r, status } : r)) });
  };

  // ── Calibration form (معايرة المعدات) ──
  const [showCal, setShowCal] = useState(false);
  const [cForm, setCForm] = useState({ scaleType: SCALE_TYPES[0].key, measured: "", notes: "" });

  const submitCal = () => {
    const sc = SCALE_TYPES.find((s) => s.key === cForm.scaleType) || SCALE_TYPES[0];
    const measured = Number(cForm.measured);
    if (!measured) {
      Alert.alert("تنبيه", "أدخل الوزن المقاس");
      return;
    }
    const dev = ((measured - sc.target) / sc.target) * 100;
    const status: CalibrationRecord["status"] = Math.abs(dev) > 1.5 ? "Failed" : Math.abs(dev) > 0.8 ? "Warning" : "Passed";
    const rec: CalibrationRecord = {
      id: uid(),
      date: today(),
      scaleType: cForm.scaleType,
      target: sc.target,
      measured,
      dev,
      status,
      notes: cForm.notes,
    };
    saveMutation.mutate({ collection: "calibration", values: [rec, ...calib] });
    setShowCal(false);
    setCForm({ scaleType: SCALE_TYPES[0].key, measured: "", notes: "" });
  };

  // ── Recipe form (وصفات الخلط) ──
  const [showRecipe, setShowRecipe] = useState(false);
  const [rForm, setRForm] = useState({ code: "", cement: "350", sand: "750", gravel: "1100", water: "160", admixture: "5.5" });

  const submitRecipe = () => {
    const code = rForm.code.trim().toUpperCase();
    if (!code) {
      Alert.alert("تنبيه", "أدخل كود الوصفة (مثل C30)");
      return;
    }
    if (recipes.some((r) => r.code === code)) {
      Alert.alert("تنبيه", "هذه الوصفة موجودة بالفعل");
      return;
    }
    const rec: RecipeRecord = {
      id: uid(),
      code,
      cement: Number(rForm.cement) || 0,
      sand: Number(rForm.sand) || 0,
      gravel: Number(rForm.gravel) || 0,
      water: Number(rForm.water) || 0,
      admixture: Number(rForm.admixture) || 0,
    };
    saveMutation.mutate({ collection: "recipes", values: [...recipes, rec] });
    setShowRecipe(false);
    setRForm({ code: "", cement: "350", sand: "750", gravel: "1100", water: "160", admixture: "5.5" });
  };

  const deleteRecipe = (id: string) => {
    Alert.alert("حذف وصفة", "حذف هذه الوصفة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => saveMutation.mutate({ collection: "recipes", values: recipes.filter((r) => r.id !== id) }) },
    ]);
  };

  // ── Derived KPIs ──
  const todayStr = today();
  const samplesToday = samples.filter((s) => s.date === todayStr).length;
  const pendingSamples = samples.filter((s) => s.status === "pending").length;
  const failedSamples = samples.filter((s) => s.status === "failed").length;
  const calibFailed = calib.filter((c) => c.status !== "Passed").length;
  const passed28 = samples.filter((s) => s.status === "passed").length;

  const sampleTarget = (s: SampleRecord) => parseInt((s.design || "C30").replace("C", ""), 10) || 0;

  const orderLabel = (id: string) => {
    const o = orders.find((x) => String(x.id) === String(id));
    return o ? `${o.orderNo || o.id} · ${o.customerName || ""}` : "";
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab bar */}
      <View style={{ flexDirection: "row", paddingHorizontal: 10, paddingTop: 8, gap: 6 }}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: tab === t.id ? "rgba(56,189,248,0.15)" : "transparent", borderWidth: 1, borderColor: tab === t.id ? "rgba(56,189,248,0.4)" : "transparent" }}>
            <Text style={{ fontSize: 15 }}>{t.emoji}</Text>
            <Text style={{ color: tab === t.id ? ACCENT : "#94A3B8", fontSize: 9, fontWeight: "800", marginTop: 2 }}>{t.label}</Text>
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
              <Kpi label="عينات اليوم" value={`${samplesToday}`} color={ACCENT} />
              <Kpi label="عينات معلقة" value={`${pendingSamples}`} color="#FBBF24" />
              <Kpi label="ناجحة 28 يوم" value={`${passed28}`} color="#34D399" />
              <Kpi label="رافضة" value={`${failedSamples}`} color="#F87171" />
              <Kpi label="معايرة تنبيه" value={`${calibFailed}`} color="#FBBF24" />
              <Kpi label="وصفات" value={`${recipes.length}`} color="#A78BFA" />
            </View>

            <Row title="🧊 تسجيل عينة خرسانية" sub="عينة مكعبات/أسطوانات مربوطة بالطلب أو الدفعة — مع فحص 7 و28 يوم" onPress={() => setShowSample(true)} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} border="rgba(56,189,248,0.4)" />
            <Row title="🔬 فحص جودة (Slump / حرارة / مقاومة)" sub="فحص شاحنة جاهزية الخلطة قبل الصب" onPress={() => setShowQc(true)} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} />
            <Row title="⚖️ معايرة ميزان" sub="موازين الأسمنت / الركام / الماء — مع حساب الانحراف" onPress={() => setShowCal(true)} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} />
            <Row title="🧪 إضافة وصفة خلط" sub="تصميم خلطة (أسمنت / رمل / زلط / ماء / إضافات)" onPress={() => setShowRecipe(true)} right={<Text style={{ color: ACCENT, fontSize: 20 }}>+</Text>} />

            {pendingSamples > 0 ? (
              <View style={{ marginTop: 10, backgroundColor: "rgba(251,191,36,0.08)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(251,191,36,0.25)" }}>
                <Text style={{ color: "#FBBF24", fontSize: 13, fontWeight: "800", marginBottom: 4 }}>⏳ عينات بانتظار نتيجة 28 يوم ({pendingSamples})</Text>
                <Text style={{ color: "#A16207", fontSize: 12 }}>سجّل نتيجة الفحص عند ظهورها لتحديد القبول/الرفض تلقائياً مقابل مقاومة التصميم.</Text>
              </View>
            ) : null}
          </View>
        ) : tab === "samples" ? (
          <View>
            <TouchableOpacity onPress={() => setShowSample(true)} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ تسجيل عينة جديدة</Text>
            </TouchableOpacity>
            {samples.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد عينات مسجلة بعد</Text>
            ) : (
              [...samples].sort((a, b) => b.date.localeCompare(a.date)).map((s) => (
                <Row key={s.id} title={`${s.sampleId} — ${s.design}`} sub={`${s.date} · ${s.customer || "—"} · ${s.site || "—"}${s.truck ? " · شاحنة " + s.truck : ""}${orderLabel(s.orderId) ? " · " + orderLabel(s.orderId) : ""}`} right={
                  <View style={{ gap: 5, alignItems: "flex-end" }}>
                    <Pill s={s.status === "passed" ? "✅ ناجحة" : s.status === "failed" ? "❌ رافضة" : "⏳ قيد الانتظار"} c={statusPill(s.status)} />
                    <Text style={{ color: "#94A3B8", fontSize: 10 }}>7d: {s.break7d || "—"} · 28d: {s.break28d || "—"} (هدف {sampleTarget(s)})</Text>
                    {s.status === "pending" && s.break28d > 0 ? (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity onPress={() => setSampleStatus(s.id, "passed")}><Text style={{ color: "#34D399", fontSize: 11, fontWeight: "800" }}>قبول</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setSampleStatus(s.id, "failed")}><Text style={{ color: "#F87171", fontSize: 11, fontWeight: "800" }}>رفض</Text></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                } />
              ))
            )}
          </View>
        ) : tab === "qc" ? (
          <View>
            <TouchableOpacity onPress={() => setShowQc(true)} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ تسجيل فحص جودة</Text>
            </TouchableOpacity>
            {qcRecords.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد فحوصات جودة</Text>
            ) : (
              [...qcRecords].sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || ""))).map((r: any) => (
                <Row key={r.id} title={`${r.sample || r.bonNo || r.id} — ${r.design || r.grade || ""}`} sub={`${r.date || "—"} · ${r.customer || "—"} · ${r.site || "—"} · Slump ${r.slump ?? ""} · ${r.temp ?? ""}°C`} right={
                  <View style={{ gap: 5, alignItems: "flex-end" }}>
                    <Pill s={{ PENDING: "قيد الفحص", PASS: "مطابقة", FAIL: "غير مطابقة", pass: "مطابقة", fail: "غير مطابقة", matched: "مطابقة" }[String(r.status)] || r.status} c={statusPill(String(r.status || "").toLowerCase())} />
                    <Text style={{ color: "#94A3B8", fontSize: 10 }}>7d: {r.break7d || "—"} · 28d: {r.break28d || "—"}</Text>
                    {r.status === "PENDING" ? (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <TouchableOpacity onPress={() => setQcStatus(r.id, "PASS")}><Text style={{ color: "#34D399", fontSize: 11, fontWeight: "800" }}>مطابقة</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setQcStatus(r.id, "FAIL")}><Text style={{ color: "#F87171", fontSize: 11, fontWeight: "800" }}>غير مطابقة</Text></TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                } />
              ))
            )}
          </View>
        ) : tab === "calibration" ? (
          <View>
            <TouchableOpacity onPress={() => setShowCal(true)} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ تسجيل معايرة</Text>
            </TouchableOpacity>
            {calib.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد سجلات معايرة</Text>
            ) : (
              [...calib].sort((a, b) => b.date.localeCompare(a.date)).map((c) => (
                <Row key={c.id} title={`${c.scaleType} · ${c.date}`} sub={`مقاس ${c.measured} كجم مقابل هدف ${c.target} كجم · انحراف ${c.dev.toFixed(2)}%${c.notes ? " · " + c.notes : ""}`} right={<Pill s={c.status === "Passed" ? "✅ سليم" : c.status === "Warning" ? "⚠️ تنبيه" : "❌ فشل"} c={statusPill(c.status === "Passed" ? "ok" : c.status === "Warning" ? "warning" : "failed")} />} />
              ))
            )}
          </View>
        ) : (
          <View>
            <TouchableOpacity onPress={() => setShowRecipe(true)} style={{ backgroundColor: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.5)", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 }}>
              <Text style={{ color: ACCENT, fontWeight: "900", fontSize: 14 }}>+ إضافة وصفة</Text>
            </TouchableOpacity>
            {recipes.length === 0 ? (
              <Text style={{ color: "#64748B", textAlign: "center", marginTop: 30 }}>لا توجد وصفات خلط</Text>
            ) : (
              recipes.map((r) => (
                <Row key={r.id} title={r.code} sub={`أسمنت ${r.cement} · رمل ${r.sand} · زلط ${r.gravel} · ماء ${r.water} · إضافات ${r.admixture}`} onPress={() => deleteRecipe(r.id)} right={<Text style={{ color: "#F87171", fontSize: 11, fontWeight: "800" }}>حذف</Text>} />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Sample form ── */}
      {showSample ? (
        <FormSheet title="🧊 تسجيل عينة خرسانية" onClose={() => setShowSample(false)} onSubmit={submitSample} pending={saveMutation.isPending}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="رقم العينة" value={sForm.sampleId} onChange={(v) => setSForm((p) => ({ ...p, sampleId: v }))} placeholder="SMP-001" />
            <Field label="رقم البون / التذكرة" value={sForm.bonNo} onChange={(v) => setSForm((p) => ({ ...p, bonNo: v }))} placeholder="BON-1024" />
            <Field label="الشاحنة" value={sForm.truck} onChange={(v) => setSForm((p) => ({ ...p, truck: v }))} placeholder="m01" />
            <Field label="دفعة الإنتاج (اختياري)" value={sForm.batch} onChange={(v) => setSForm((p) => ({ ...p, batch: v }))} placeholder="BATCH-5" />
          </View>
          <Chips label="التصميم / قوة الخرسانة" options={DESIGNS} value={sForm.design} onChange={(v) => setSForm((p) => ({ ...p, design: v }))} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="Slump (مم)" value={sForm.slump} onChange={(v) => setSForm((p) => ({ ...p, slump: v }))} numeric />
            <Field label="الحرارة °C" value={sForm.temp} onChange={(v) => setSForm((p) => ({ ...p, temp: v }))} numeric />
            <Field label="مقاومة 7 أيام (MPa)" value={sForm.break7d} onChange={(v) => setSForm((p) => ({ ...p, break7d: v }))} numeric />
            <Field label="مقاومة 28 يوم (MPa)" value={sForm.break28d} onChange={(v) => setSForm((p) => ({ ...p, break28d: v }))} numeric />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="العميل" value={sForm.customer} onChange={(v) => setSForm((p) => ({ ...p, customer: v }))} />
            <Field label="الموقع / المشروع" value={sForm.site} onChange={(v) => setSForm((p) => ({ ...p, site: v }))} />
          </View>
          <Field label="ملاحظات" value={sForm.notes} onChange={(v) => setSForm((p) => ({ ...p, notes: v }))} multiline />
        </FormSheet>
      ) : null}

      {/* ── QC form ── */}
      {showQc ? (
        <FormSheet title="🔬 فحص جودة" onClose={() => setShowQc(false)} onSubmit={submitQc} pending={saveMutation.isPending}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="رقم الفحص / العينة" value={qForm.sample} onChange={(v) => setQForm((p) => ({ ...p, sample: v }))} placeholder="QC-001" />
            <Field label="رقم البون" value={qForm.bonNo} onChange={(v) => setQForm((p) => ({ ...p, bonNo: v }))} placeholder="BON-1024" />
            <Field label="الشاحنة" value={qForm.truck} onChange={(v) => setQForm((p) => ({ ...p, truck: v }))} placeholder="m01" />
          </View>
          <Chips label="التصميم" options={DESIGNS} value={qForm.design} onChange={(v) => setQForm((p) => ({ ...p, design: v }))} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="Slump (مم)" value={qForm.slump} onChange={(v) => setQForm((p) => ({ ...p, slump: v }))} numeric />
            <Field label="الحرارة °C" value={qForm.temp} onChange={(v) => setQForm((p) => ({ ...p, temp: v }))} numeric />
            <Field label="7 أيام (MPa)" value={qForm.break7d} onChange={(v) => setQForm((p) => ({ ...p, break7d: v }))} numeric />
            <Field label="28 يوم (MPa)" value={qForm.break28d} onChange={(v) => setQForm((p) => ({ ...p, break28d: v }))} numeric />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="العميل" value={qForm.customer} onChange={(v) => setQForm((p) => ({ ...p, customer: v }))} />
            <Field label="الموقع" value={qForm.site} onChange={(v) => setQForm((p) => ({ ...p, site: v }))} />
          </View>
          <Chips label="النتيجة" options={["PENDING", "PASS", "FAIL"]} value={qForm.status} onChange={(v) => setQForm((p) => ({ ...p, status: v }))} />
        </FormSheet>
      ) : null}

      {/* ── Calibration form ── */}
      {showCal ? (
        <FormSheet title="⚖️ معايرة ميزان" onClose={() => setShowCal(false)} onSubmit={submitCal} pending={saveMutation.isPending}>
          <Chips label="نوع الميزان" options={SCALE_TYPES.map((s) => s.key)} value={cForm.scaleType} onChange={(v) => setCForm((p) => ({ ...p, scaleType: v }))} />
          <Field label="الوزن المقاس (كجم)" value={cForm.measured} onChange={(v) => setCForm((p) => ({ ...p, measured: v }))} numeric />
          <Field label="ملاحظات" value={cForm.notes} onChange={(v) => setCForm((p) => ({ ...p, notes: v }))} multiline />
        </FormSheet>
      ) : null}

      {/* ── Recipe form ── */}
      {showRecipe ? (
        <FormSheet title="🧪 إضافة وصفة خلط" onClose={() => setShowRecipe(false)} onSubmit={submitRecipe} pending={saveMutation.isPending}>
          <Field label="كود الوصفة" value={rForm.code} onChange={(v) => setRForm((p) => ({ ...p, code: v }))} placeholder="C30" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <Field label="أسمنت (كجم)" value={rForm.cement} onChange={(v) => setRForm((p) => ({ ...p, cement: v }))} numeric />
            <Field label="رمل (كجم)" value={rForm.sand} onChange={(v) => setRForm((p) => ({ ...p, sand: v }))} numeric />
            <Field label="زلط (كجم)" value={rForm.gravel} onChange={(v) => setRForm((p) => ({ ...p, gravel: v }))} numeric />
            <Field label="ماء (لتر)" value={rForm.water} onChange={(v) => setRForm((p) => ({ ...p, water: v }))} numeric />
            <Field label="إضافات (كجم)" value={rForm.admixture} onChange={(v) => setRForm((p) => ({ ...p, admixture: v }))} numeric />
          </View>
        </FormSheet>
      ) : null}
    </View>
  );
}
