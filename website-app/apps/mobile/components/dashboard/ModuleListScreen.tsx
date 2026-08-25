/**
 * Generic Native ERP Module screen
 * List + search + add/edit/delete over a Firestore collection.
 * Used by Orders, Production, Workshop, Mixing, Schedule, Evaluation, R&D, Admin.
 */

import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, Alert, KeyboardAvoidingView, Platform, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import CalendarPicker from "@/components/ui/CalendarPicker";
import TimePicker from "@/components/ui/TimePicker";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.10)";
const INPUT = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 10, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };

export interface FieldDef {
  key: string;
  label: string;
  numeric?: boolean;
  /** "date" → calendar picker; "time" → HH:mm picker; "select" → chips from options */
  type?: "date" | "time" | "select";
  /** Options for type "select" */
  options?: string[];
}

export interface ModuleProps {
  title: string;
  emoji: string;
  accent: string;
  addLabel?: string;
  emptyLabel?: string;
  load: (u: string) => Promise<any[] | null>;
  save: (u: string, v: any[]) => Promise<boolean>;
  fields: FieldDef[];
  listTitle: (r: any) => string;
  listSub: (r: any) => string;
  summaries?: (list: any[]) => { label: string; value: string; color: string }[];
  newRecord: () => any;
  /** Extra header buttons (e.g. nested admin screens). */
  headerActions?: { label: string; emoji?: string; onPress: () => void }[];
}

export default function ModuleListScreen(props: ModuleProps) {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { title, emoji, accent, load, save, fields, listTitle, listSub, summaries, newRecord, headerActions } = props;

  // u is passed from the screen wrapper via props.load binding; we derive from user here.
  const u = (user?.zone || user?.email?.split("@")[0] || "elkhaleej").toLowerCase();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [pickerField, setPickerField] = useState<FieldDef | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["erp-module", props.title, u],
    queryFn: async () => (await load(u)) || [],
  });

  const saveMutation = useMutation({
    mutationFn: async (list: any[]) => {
      const ok = await save(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp-module", props.title, u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["erp-module", props.title, u] });
    setRefreshing(false);
  }, [qc, u, props.title]);

  const list = (rows || []).slice().sort((a, b) => String(b.date || b.id || "").localeCompare(String(a.date || a.id || "")));
  const filtered = list.filter((r) =>
    !search ||
    JSON.stringify(Object.values(r)).toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditId(null);
    setForm(newRecord());
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditId(String(r.id));
    const f: Record<string, string> = {};
    for (const fd of fields) f[fd.key] = String(r[fd.key] ?? "");
    setForm(f);
    setShowForm(true);
  };

  const submit = () => {
    const base = rows || [];
    const toNum = (s: string) => (s === "" ? 0 : Number(s));
    if (editId !== null) {
      saveMutation.mutate(
        base.map((r) => {
          if (String(r.id) !== editId) return r;
          const next = { ...r, ...form };
          for (const fd of fields) if (fd.numeric) next[fd.key] = toNum(form[fd.key]);
          return next;
        })
      );
    } else {
      const newId = base.length ? Math.max(...base.map((r) => Number(r.id) || 0)) + 1 : 1;
      const rec: Record<string, any> = { ...form, id: newId };
      for (const fd of fields) if (fd.numeric) rec[fd.key] = toNum(form[fd.key]);
      saveMutation.mutate([...base, rec]);
    }
    setShowForm(false);
  };

  const del = (r: any) => {
    Alert.alert("حذف", `حذف "${listTitle(r)}"؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: () => saveMutation.mutate((rows || []).filter((x) => String(x.id) !== String(r.id))) },
    ]);
  };

  const stats = summaries ? summaries(list) : [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: "rgba(11,17,30,0.9)" }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/(dashboard)" as any))} style={{ padding: 6 }}>
            <Text style={{ color: accent, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>{emoji} {title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {headerActions?.map((a) => (
              <TouchableOpacity key={a.label} onPress={a.onPress} style={{ backgroundColor: `${accent}26`, borderColor: `${accent}66`, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}>
                <Text style={{ color: accent, fontSize: 13, fontWeight: "800" }}>{a.emoji} {a.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={openAdd} style={{ backgroundColor: `${accent}26`, borderColor: `${accent}66`, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}>
              <Text style={{ color: accent, fontSize: 13, fontWeight: "800" }}>+ إضافة</Text>
            </TouchableOpacity>
          </View>
        </View>
        {stats.length > 0 && (
          <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingBottom: 10, gap: 8 }}>
            {stats.map((s) => (
              <View key={s.label} style={{ flex: 1, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: "center" }}>
                <Text style={{ color: s.color, fontSize: 15, fontWeight: "900" }}>{s.value}</Text>
                <Text style={{ color: "#94A3B8", fontSize: 10 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`🔍 بحث في ${title}...`}
          placeholderTextColor="#64748B"
          style={INPUT}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {isLoading && <Text style={{ color: "#64748B", textAlign: "center", marginTop: 40 }}>جارِ التحميل...</Text>}
        {!isLoading && filtered.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>{emoji}</Text>
            <Text style={{ color: "#94A3B8", fontSize: 14 }}>{props.emptyLabel || "لا توجد بيانات"}</Text>
            <TouchableOpacity onPress={openAdd} style={{ marginTop: 14, backgroundColor: `${accent}26`, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}>
              <Text style={{ color: accent, fontWeight: "700" }}>{props.addLabel || "إضافة أول سجل"}</Text>
            </TouchableOpacity>
          </View>
        )}
        {filtered.map((r) => (
          <View key={r.id} style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900", flex: 1 }}>{listTitle(r)}</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={() => openEdit(r)}><Text style={{ color: accent, fontSize: 13, fontWeight: "700" }}>تعديل</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => del(r)}><Text style={{ color: "#F87171", fontSize: 13, fontWeight: "700" }}>حذف</Text></TouchableOpacity>
              </View>
            </View>
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>{listSub(r)}</Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }} onPress={() => setShowForm(false)}>
            <Pressable style={{ backgroundColor: "#0B111E", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "92%" }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ flex: 1, color: "#fff", fontSize: 17, fontWeight: "900", textAlign: "center" }}>
                  {editId !== null ? "✏️ تعديل" : `➕ ${props.addLabel || "إضافة"}`}
                </Text>
                <TouchableOpacity onPress={() => setShowForm(false)} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20 }}>
                  <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "900" }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                  {fields.map((fd) => (
                    <View key={fd.key} style={{ flex: 1, minWidth: "47%", marginBottom: 12 }}>
                      <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", marginBottom: 5 }}>{fd.label}</Text>
                      {fd.type === "date" || fd.type === "time" ? (
                        <TouchableOpacity onPress={() => setPickerField(fd)} style={[INPUT, { justifyContent: "center" }]}>
                          <Text style={{ color: form[fd.key] ? "#E2E8F0" : "#64748B" }}>
                            {form[fd.key] ? (fd.type === "date" ? `📅 ${form[fd.key]}` : `🕐 ${form[fd.key]}`) : fd.type === "date" ? "📅 اختر التاريخ" : "🕐 اختر الوقت"}
                          </Text>
                        </TouchableOpacity>
                      ) : fd.type === "select" ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          {(fd.options || []).map((opt) => {
                            const active = form[fd.key] === opt;
                            return (
                              <TouchableOpacity
                                key={opt}
                                onPress={() => setForm((p) => ({ ...p, [fd.key]: opt }))}
                                style={{
                                  backgroundColor: active ? `${accent}30` : "rgba(255,255,255,0.05)",
                                  borderColor: active ? accent : BORDER,
                                  borderWidth: 1,
                                  borderRadius: 20,
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                }}
                              >
                                <Text style={{ color: active ? accent : "#CBD5E1", fontSize: 12, fontWeight: "800" }}>{opt}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <TextInput
                          value={form[fd.key] ?? ""}
                          onChangeText={(v) => setForm((p) => ({ ...p, [fd.key]: v }))}
                          placeholder={fd.label}
                          placeholderTextColor="#64748B"
                          keyboardType={fd.numeric ? "numeric" : "default"}
                          style={INPUT}
                        />
                      )}
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={submit}
                  disabled={saveMutation.isPending}
                  style={{ backgroundColor: accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: saveMutation.isPending ? 0.6 : 1 }}
                >
                  <Text style={{ color: "#0B111E", fontWeight: "900", fontSize: 15 }}>{saveMutation.isPending ? "جارِ الحفظ..." : "💾 حفظ"}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {pickerField?.type === "date" ? (
        <CalendarPicker
          visible={!!pickerField}
          value={form[pickerField.key] || new Date().toISOString().slice(0, 10)}
          onChange={(d) => {
            setForm((p) => ({ ...p, [pickerField.key]: d }));
            setPickerField(null);
          }}
          onClose={() => setPickerField(null)}
          accent={accent}
        />
      ) : pickerField?.type === "time" ? (
        <TimePicker
          visible={!!pickerField}
          value={form[pickerField.key] || "08:00"}
          onChange={(t) => {
            setForm((p) => ({ ...p, [pickerField.key]: t }));
            setPickerField(null);
          }}
          onClose={() => setPickerField(null)}
          accent={accent}
        />
      ) : null}
    </View>
  );
}
