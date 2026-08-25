/**
 * Reps Manager Screen (مدير المناديب)
 * ============================================================
 * Tracks the live routes (خط السير) of the company sales reps and
 * manages their daily field tasks: assign → follow → reassign when done.
 *
 * Data (per-company userData, same storage the website uses):
 *   • rep_positions — [{ repId, name, lat, lng, ts, trail[] }] latest pos per rep
 *   • rep_tasks     — [{ id, repId, repName, date, title, client, details,
 *                        priority, status(pending|doing|done|cancelled), ... }]
 */

import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform, Dimensions } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { erp, dataUsername } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";

const BG = "#F1F5F9";
const CARD = "#FFFFFF";
const BORDER = "#E2E8F0";
const ACCENT = "#2563EB";

type Tab = "track" | "tasks";

interface TrailPt { lat: number; lng: number; ts: number }
interface RepPos { repId: string; name: string; lat: number; lng: number; ts: number; trail?: TrailPt[] }
interface RepTask {
  id: string; date: string; repId: string; repName: string;
  title: string; client?: string; details?: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "doing" | "done" | "cancelled";
  createdAt: string; startedAt?: string; doneAt?: string;
}

const PRIORITY_AR: Record<string, string> = { high: "🔴 عالية", medium: "🟡 متوسطة", low: "🟢 منخفضة" };
const STATUS_AR: Record<string, string> = { pending: "⏳ بانتظار", doing: "🔄 جارية", done: "✅ منجزة", cancelled: "🗑️ ملغاة" };
const PRIORITIES = ["high", "medium", "low"] as const;

const today = () => new Date().toISOString().split("T")[0];

// ── Route map (projection-based, no Google Maps key needed) ────────────────────
function RepsMap({ points, plant, tall }: {
  points: (RepPos & { live: boolean })[];
  plant: { lat: number; lng: number } | null;
  tall?: boolean;
}) {
  const W = Dimensions.get("window").width - 40;
  const H = tall ? 360 : 220;
  const padX = 26, padTop = 26, padBottom = 20;

  const coords: { lat: number; lng: number }[] = [];
  points.forEach((p) => {
    coords.push({ lat: p.lat, lng: p.lng });
    (p.trail || []).slice(-30).forEach((t) => coords.push({ lat: t.lat, lng: t.lng }));
  });
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
    grid.push(
      <View key={`v${i}`} style={{ position: "absolute", left: (W / 4) * i, top: 0, width: 1, height: H, backgroundColor: "rgba(37,99,235,0.06)" }} />,
      <View key={`h${i}`} style={{ position: "absolute", left: 0, top: (H / 4) * i, width: W, height: 1, backgroundColor: "rgba(37,99,235,0.06)" }} />
    );
  }

  return (
    <View style={{ height: H, borderRadius: 16, backgroundColor: "#DBEAFE", overflow: "hidden", borderWidth: 1, borderColor: "rgba(37,99,235,0.15)" }}>
      {grid}
      {plant && (
        <View style={{ position: "absolute", left: x(plant.lng) - 14, top: y(plant.lat) - 28, alignItems: "center" }}>
          <Text style={{ fontSize: 22 }}>🏭</Text>
          <Text style={{ color: "#1E40AF", fontSize: 9, fontWeight: "800", marginTop: 1 }}>المصنع</Text>
        </View>
      )}
      {/* خط السير — trail breadcrumbs */}
      {points.map((p) =>
        (p.trail || []).slice(-30).map((t, i) => (
          <View key={`${p.repId}-t${i}`} style={{ position: "absolute", left: x(t.lng) - 2, top: y(t.lat) - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: p.live ? "rgba(37,99,235,0.35)" : "rgba(100,116,139,0.3)" }} />
        ))
      )}
      {/* المندوبون */}
      {points.map((p) => (
        <View key={p.repId} style={{ position: "absolute", left: x(p.lng) - 13, top: y(p.lat) - 13, alignItems: "center" }}>
          <Text style={{ fontSize: 20 }}>🧑‍💼</Text>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.live ? "#22C55E" : "#94A3B8", borderWidth: 1.5, borderColor: "#fff", marginTop: 1 }} />
          {tall && (
            <Text style={{ color: "#1E3A8A", fontSize: 9, fontWeight: "800", marginTop: 2, textAlign: "center", width: 92 }} numberOfLines={1}>
              {p.name}
            </Text>
          )}
        </View>
      ))}
      {points.length === 0 && (
        <Text style={{ color: "#1E40AF", fontSize: 12, position: "absolute", top: H / 2 - 8, left: 0, right: 0, textAlign: "center", fontWeight: "700" }}>
          لا توجد مواقع بعد — يظهر المندوبون هنا تلقائياً من تطبيق المبيعات
        </Text>
      )}
    </View>
  );
}

// ── Small building blocks ──────────────────────────────────────────────────────
function Kpi({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER, alignItems: "center" }}>
      <Text style={{ color, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

function Field({ label, value, onChange, numeric = false, multiline = false }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; multiline?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "800", marginBottom: 5 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#94A3B8"
        keyboardType={numeric ? "numeric" : "default"}
        multiline={multiline}
        style={{ backgroundColor: "#F8FAFC", borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 12, color: "#0F172A", fontSize: 14, minHeight: multiline ? 64 : undefined, textAlignVertical: multiline ? "top" : "center" }}
      />
    </View>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "800", marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map((o) => (
          <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} style={{ backgroundColor: value === o.value ? "rgba(37,99,235,0.12)" : "#F8FAFC", borderColor: value === o.value ? ACCENT : BORDER, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 }}>
            <Text style={{ color: value === o.value ? ACCENT : "#64748B", fontSize: 12, fontWeight: "800" }}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function ActBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ backgroundColor: `${color}18`, borderColor: `${color}55`, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "900" }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function RepsMgrScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);

  const [tab, setTab] = useState<Tab>("track");
  const [refreshing, setRefreshing] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [formShow, setFormShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ date: today(), repId: "", repName: "", title: "", client: "", details: "", priority: "medium" });

  const { data: positions, refetch: refetchPos } = useQuery<RepPos[]>({
    queryKey: ["repsmgr-pos", u],
    queryFn: async () => (await erp.loadRepPositions(u)) || [],
    refetchInterval: 30000,
  });

  const { data: tasks, refetch: refetchTasks } = useQuery<RepTask[]>({
    queryKey: ["repsmgr-tasks", u],
    queryFn: async () => (await erp.loadRepTasks(u)) || [],
    refetchInterval: 30000,
  });

  const { data: tree } = useQuery<any>({
    queryKey: ["repsmgr-tree", u],
    queryFn: async () => (await erp.loadCompanyTree(u)) || null,
  });

  const { data: plantProfile } = useQuery<any>({
    queryKey: ["repsmgr-plant", u],
    queryFn: async () => (await erp.loadPlantProfile(u)) || null,
  });

  const saveMutation = useMutation({
    mutationFn: async (list: RepTask[]) => {
      const ok = await erp.saveRepTasks(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repsmgr-tasks", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchPos(), refetchTasks()]);
    setRefreshing(false);
  }, [refetchPos, refetchTasks]);

  const t = today();

  // ── Rep roster: tree sales accounts + names seen in positions/tasks ──────────
  const repOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    const accounts: any[] = Array.isArray(tree?.accounts) ? tree.accounts : [];
    for (const a of accounts) {
      if (String(a.role) !== "sales") continue;
      const id = String(a.email || a.phone || "").trim();
      if (!id || seen.has(id.toLowerCase())) continue;
      seen.add(id.toLowerCase());
      opts.push({ value: id, label: `🧑‍💼 ${a.phone || a.email}` });
    }
    for (const p of positions || []) {
      const id = String(p.repId || "").trim();
      if (!id || seen.has(id.toLowerCase())) continue;
      seen.add(id.toLowerCase());
      opts.push({ value: id, label: `🧑‍💼 ${p.name || id}` });
    }
    return opts;
  }, [tree, positions]);

  const openNew = (repId = "", repName = "") => {
    setEditId(null);
    setF({ date: t, repId, repName, title: "", client: "", details: "", priority: "medium" });
    setFormShow(true);
  };

  const openEdit = (task: RepTask) => {
    setEditId(task.id);
    setF({ date: task.date, repId: task.repId, repName: task.repName, title: task.title, client: task.client || "", details: task.details || "", priority: task.priority });
    setFormShow(true);
  };

  const submitTask = () => {
    const repId = f.repId.trim() || f.repName.trim();
    const repName = f.repName.trim() || f.repId.trim();
    if (!repId) { Alert.alert("تنبيه", "اختر المندوب أولاً"); return; }
    if (!f.title.trim()) { Alert.alert("تنبيه", "اكتب نص المهمة"); return; }
    const base: RepTask = {
      id: editId ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: f.date || t,
      repId: repId.toLowerCase(),
      repName,
      title: f.title.trim(),
      client: f.client.trim(),
      details: f.details.trim(),
      priority: (f.priority as RepTask["priority"]) || "medium",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    let list: RepTask[];
    if (editId) {
      list = (tasks || []).map((x) => (x.id === editId ? { ...x, ...base, createdAt: x.createdAt, startedAt: x.startedAt, doneAt: x.doneAt, status: x.status === "done" ? "done" : "pending" } : x));
    } else {
      list = [...(tasks || []), base];
    }
    saveMutation.mutate(list, {
      onSuccess: () => {
        setFormShow(false);
        setEditId(null);
        Alert.alert("تم", editId ? "تم تعديل المهمة ✓" : `تم إسناد المهمة إلى ${base.repName} ✓`);
      },
      onError: (e: any) => Alert.alert("خطأ", e?.message || "تعذر الحفظ"),
    });
  };

  const setStatus = (id: string, status: RepTask["status"]) => {
    const patch: Partial<RepTask> = { status };
    if (status === "doing") patch.startedAt = new Date().toISOString();
    if (status === "done") patch.doneAt = new Date().toISOString();
    saveMutation.mutate((tasks || []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeTask = (task: RepTask) => {
    Alert.alert("حذف مهمة", `حذف "${task.title}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => saveMutation.mutate((tasks || []).filter((x) => x.id !== task.id)) },
    ]);
  };

  // ── Derived views ─────────────────────────────────────────────────────────────
  const now = Date.now();
  const mapPoints = useMemo(
    () =>
      (positions || []).map((p) => ({
        ...p,
        live: typeof p.ts === "number" && now - p.ts < 10 * 60 * 1000,
      })),
    [positions, now]
  );

  const todaysTasks = useMemo(() => (tasks || []).filter((x) => x.date === t || (x.status !== "done" && x.status !== "cancelled")), [tasks, t]);
  const activeTasks = todaysTasks.filter((x) => x.status === "pending" || x.status === "doing");
  const doneToday = todaysTasks.filter((x) => x.status === "done");
  const onlineReps = mapPoints.filter((p) => p.live).length;

  // Group active tasks per rep (positions + assigned reps)
  const repSections = useMemo(() => {
    const map = new Map<string, { name: string; tasks: RepTask[] }>();
    const put = (id: string, name: string) => {
      const k = id.toLowerCase();
      if (!map.has(k)) map.set(k, { name: name || id, tasks: [] });
      else if (name && map.get(k)!.name === id) map.get(k)!.name = name;
    };
    for (const p of positions || []) put(String(p.repId), String(p.name || ""));
    for (const x of todaysTasks) put(x.repId, x.repName);
    for (const x of todaysTasks) map.get(x.repId.toLowerCase())?.tasks.push(x);
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.tasks.filter((x) => x.status !== "done").length - a.tasks.filter((x) => x.status !== "done").length);
  }, [positions, todaysTasks]);

  const plant =
    plantProfile && typeof plantProfile.gpsLat === "number" && typeof plantProfile.gpsLng === "number"
      ? { lat: plantProfile.gpsLat, lng: plantProfile.gpsLng }
      : null;

  const fmtTime = (iso?: string | number) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  };

  const renderTaskRow = (x: RepTask) => (
    <View key={x.id} style={{ backgroundColor: "#F8FAFC", borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: "#0F172A", fontSize: 14, fontWeight: "900" }}>{x.title}</Text>
        <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "800" }}>{PRIORITY_AR[x.priority]}</Text>
      </View>
      {!!x.client && <Text style={{ color: "#334155", fontSize: 12, marginTop: 3 }}>🏢 العميل: {x.client}</Text>}
      {!!x.details && <Text style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{x.details}</Text>}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Text style={{ color: x.status === "done" ? "#16A34A" : x.status === "doing" ? "#0891B2" : x.status === "cancelled" ? "#94A3B8" : "#D97706", fontSize: 11, fontWeight: "900" }}>
          {STATUS_AR[x.status]}{x.status === "done" && x.doneAt ? ` ${fmtTime(x.doneAt)}` : ""}
        </Text>
        <View style={{ flex: 1 }} />
        {x.status === "pending" && <ActBtn label="▶️ بدء" color="#0891B2" onPress={() => setStatus(x.id, "doing")} />}
        {(x.status === "pending" || x.status === "doing") && <ActBtn label="✅ إنهاء" color="#16A34A" onPress={() => setStatus(x.id, "done")} />}
        {(x.status === "pending" || x.status === "doing") && <ActBtn label="✏️" color="#2563EB" onPress={() => openEdit(x)} />}
        {x.status !== "cancelled" && x.status !== "done" && <ActBtn label="🗑️" color="#DC2626" onPress={() => removeTask(x)} />}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ backgroundColor: "#1D4ED8", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <TouchableOpacity onPress={() => router.replace("/(dashboard)" as any)} style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>→ رجوع</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 17 }}>🎯 مدير المناديب</Text>
              <Text style={{ color: "#BFDBFE", fontSize: 11 }} numberOfLines={1}>{user?.fullName} · @{u}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => logout()} style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>🚪 خروج</Text>
          </TouchableOpacity>
        </View>
        {/* Tabs */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {([
            { id: "track", label: "🗺️ التتبع المباشر" },
            { id: "tasks", label: "📋 المهام" },
          ] as { id: Tab; label: string }[]).map((x) => (
            <TouchableOpacity key={x.id} onPress={() => setTab(x.id)} style={{ flex: 1, backgroundColor: tab === x.id ? "#fff" : "rgba(255,255,255,0.12)", paddingVertical: 9, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: tab === x.id ? "#1D4ED8" : "#DBEAFE", fontWeight: "900", fontSize: 13 }}>{x.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {tab === "track" && (
          <>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <Kpi value={String(mapPoints.length)} label="مناديب مسجلون" color="#2563EB" />
              <Kpi value={String(onlineReps)} label="متصل الآن 🟢" color="#16A34A" />
              <Kpi value={String(activeTasks.length)} label="مهام جارية" color="#D97706" />
            </View>

            <TouchableOpacity activeOpacity={0.9} onPress={() => setShowMap((v) => !v)}>
              <RepsMap points={mapPoints} plant={plant} tall={showMap} />
            </TouchableOpacity>
            <Text style={{ color: "#64748B", fontSize: 11, textAlign: "center", marginTop: 6, marginBottom: 14 }}>
              🟢 موقع حديث (أقل من 10 دقائق) · ⚪ غير متصل — اضغط على الخريطة للتكبير وعرض الأسماء
            </Text>

            <Text style={{ color: "#334155", fontSize: 14, fontWeight: "900", marginBottom: 10 }}>المناديب</Text>
            {mapPoints.length === 0 && (
              <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 16 }}>
                <Text style={{ color: "#64748B", fontSize: 13, textAlign: "center" }}>
                  عندما يفتح المنادوب تطبيق المبيعات سيشارك موقعه تلقائياً ويظهر خط سيره هنا.
                </Text>
              </View>
            )}
            {mapPoints
              .slice()
              .sort((a, b) => Number(b.live) - Number(a.live) || b.ts - a.ts)
              .map((p) => {
                const repActive = todaysTasks.filter((x) => x.repId.toLowerCase() === String(p.repId).toLowerCase() && (x.status === "pending" || x.status === "doing")).length;
                const repDone = todaysTasks.filter((x) => x.repId.toLowerCase() === String(p.repId).toLowerCase() && x.status === "done").length;
                return (
                  <View key={p.repId} style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 22 }}>🧑‍💼</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#0F172A", fontSize: 14, fontWeight: "900" }} numberOfLines={1}>{p.name || p.repId}</Text>
                        <Text style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>
                          آخر تحديث: {fmtTime(p.ts) || "—"} · نقاط المسار: {(p.trail || []).length}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: p.live ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.15)", borderColor: p.live ? "rgba(34,197,94,0.5)" : BORDER, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: p.live ? "#16A34A" : "#64748B", fontSize: 10, fontWeight: "900" }}>{p.live ? "🟢 مباشر" : "⚪ غير متصل"}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <Text style={{ color: "#334155", fontSize: 12, fontWeight: "800", flex: 1 }}>📋 جارية: {repActive} · منجزة اليوم: {repDone}</Text>
                      {repActive === 0 && repDone > 0 && (
                        <ActBtn label="🎉 أنهى مهامه — عيّن جديد" color="#16A34A" onPress={() => { setTab("tasks"); openNew(p.repId, p.name || ""); }} />
                      )}
                      {repActive === 0 && repDone === 0 && (
                        <ActBtn label="➕ إسناد مهمة" color="#2563EB" onPress={() => { setTab("tasks"); openNew(p.repId, p.name || ""); }} />
                      )}
                    </View>
                  </View>
                );
              })}
          </>
        )}

        {tab === "tasks" && (
          <>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <Kpi value={String(activeTasks.length)} label="مهام جارية" color="#D97706" />
              <Kpi value={String(doneToday.length)} label="منجزة اليوم" color="#16A34A" />
              <Kpi value={String(repSections.length)} label="مناديب" color="#2563EB" />
            </View>

            <TouchableOpacity onPress={() => openNew()} style={{ backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>➕ مهمة جديدة</Text>
            </TouchableOpacity>

            {repSections.length === 0 && (
              <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 16 }}>
                <Text style={{ color: "#64748B", fontSize: 13, textAlign: "center" }}>لا توجد مهام بعد — ابدأ بإسناد مهمة لأحد المناديب.</Text>
              </View>
            )}

            {repSections.map((sec) => {
              const act = sec.tasks.filter((x) => x.status === "pending" || x.status === "doing");
              const dn = sec.tasks.filter((x) => x.status === "done");
              const allDone = act.length === 0 && dn.length > 0;
              return (
                <View key={sec.id} style={{ backgroundColor: CARD, borderColor: allDone ? "rgba(34,197,94,0.5)" : BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Text style={{ fontSize: 20 }}>🧑‍💼</Text>
                    <Text style={{ flex: 1, color: "#0F172A", fontSize: 15, fontWeight: "900" }} numberOfLines={1}>{sec.name}</Text>
                    {allDone && <ActBtn label="🎉 خلص — مهمة جديدة" color="#16A34A" onPress={() => openNew(sec.id, sec.name)} />}
                    {!allDone && <ActBtn label="➕ مهمة" color="#2563EB" onPress={() => openNew(sec.id, sec.name)} />}
                  </View>
                  {act.length === 0 && dn.length > 0 && (
                    <Text style={{ color: "#16A34A", fontSize: 12, fontWeight: "900", marginBottom: 8 }}>✓ أنهى كل مهامه اليوم — اسند له مهام جديدة</Text>
                  )}
                  {sec.tasks.length === 0 && <Text style={{ color: "#94A3B8", fontSize: 12 }}>لا توجد مهام مسندة لهذا اليوم.</Text>}
                  {[...act, ...dn].map(renderTaskRow)}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ── New / edit task sheet ── */}
      <Modal visible={formShow} animationType="slide" transparent onRequestClose={() => setFormShow(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setFormShow(false)}>
            <Pressable style={{ backgroundColor: "#0B111E", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "92%" }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "900", textAlign: "center" }}>{editId ? "✏️ تعديل مهمة" : "➕ مهمة جديدة"}</Text>
                <TouchableOpacity onPress={() => setFormShow(false)} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20 }}>
                  <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "900" }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                  <Field label="التاريخ" value={f.date} onChange={(v) => setF((p) => ({ ...p, date: v }))} />
                  <Field label="نص المهمة *" value={f.title} onChange={(v) => setF((p) => ({ ...p, title: v }))} />
                  <Field label="العميل / الموقع" value={f.client} onChange={(v) => setF((p) => ({ ...p, client: v }))} />
                  <Field label="تفاصيل" value={f.details} onChange={(v) => setF((p) => ({ ...p, details: v }))} multiline />
                </View>
                <Chips
                  label="المندوب *"
                  options={repOptions.length ? repOptions : [{ value: "__manual", label: "✍️ إدخال يدوي" }]}
                  value={f.repId}
                  onChange={(v) => {
                    if (v === "__manual") { setF((p) => ({ ...p, repId: "", repName: "" })); return; }
                    const opt = repOptions.find((o) => o.value === v);
                    setF((p) => ({ ...p, repId: v, repName: opt?.label.replace("🧑‍💼 ", "") || v }));
                  }}
                />
                {!f.repId && (
                  <Field label="اسم المندوب (يدوي)" value={f.repName} onChange={(v) => setF((p) => ({ ...p, repName: v }))} />
                )}
                <Chips label="الأولوية" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_AR[p] }))} value={f.priority} onChange={(v) => setF((p) => ({ ...p, priority: v }))} />
                <TouchableOpacity onPress={submitTask} disabled={saveMutation.isPending} style={{ backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saveMutation.isPending ? 0.6 : 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{saveMutation.isPending ? "جارِ الحفظ..." : editId ? "💾 حفظ التعديل" : "📤 إسناد المهمة"}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
