/**
 * الحوكمة — Weighbridge + Concrete Returns (mobile port of website Governance).
 * Owner-only: sealed SHA-256 weighings (gross−tare=net, ±3% tolerance check)
 * + returns routing (recycle / blocks ×80 / dispose) + chain integrity badge.
 * Store: userData/{username}/weighbridgeRecords + returnedConcrete (Firestore).
 */
import { View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth-store";
import { erp, dataUsername } from "@/lib/firestore";
import {
  sealWeighing,
  verifyChain,
  blocksFromVolume,
  type WeighRecord,
  type ReturnRecord,
  type ReturnDisposition,
} from "@/lib/governance";

const BG = "#080C14";
const CARD = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.10)";
const ACCENT = "#38BDF8";
const INPUT = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: BORDER, borderWidth: 1, borderRadius: 10, color: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 };

const DISPOSITIONS: { key: ReturnDisposition; ar: string }[] = [
  { key: "recycle", ar: "تدوير" },
  { key: "blocks", ar: "بلوك (×80)" },
  { key: "dispose", ar: "إتلاف" },
];

export default function GovernanceScreen() {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const u = dataUsername(user);
  const [tab, setTab] = useState<"weigh" | "returns">("weigh");
  const [refreshing, setRefreshing] = useState(false);

  const weighQ = useQuery<WeighRecord[]>({
    queryKey: ["weighbridge", u],
    queryFn: async () => (await erp.loadWeighbridgeRecords(u)) ?? [],
    staleTime: 30_000,
  });
  const returnsQ = useQuery<ReturnRecord[]>({
    queryKey: ["returns", u],
    queryFn: async () => (await erp.loadReturns(u)) ?? [],
    staleTime: 30_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([weighQ.refetch(), returnsQ.refetch()]);
    setRefreshing(false);
  }, [weighQ, returnsQ]);

  const weighings = weighQ.data ?? [];
  const returns = returnsQ.data ?? [];
  const brokenId = verifyChain(weighings);

  // ── weigh form state ──
  const [plate, setPlate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [material, setMaterial] = useState("");
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const [expected, setExpected] = useState("");
  const [savingWeigh, setSavingWeigh] = useState(false);

  // ── return form state ──
  const [rPlate, setRPlate] = useState("");
  const [rSite, setRSite] = useState("");
  const [rQty, setRQty] = useState("");
  const [rReason, setRReason] = useState("");
  const [rDisp, setRDisp] = useState<ReturnDisposition>("recycle");
  const [savingReturn, setSavingReturn] = useState(false);

  const saveWeighing = async () => {
    const grossKg = parseFloat(gross);
    const tareKg = parseFloat(tare);
    if (!plate.trim() || !Number.isFinite(grossKg) || !Number.isFinite(tareKg) || grossKg <= tareKg) {
      Alert.alert("بيانات ناقصة", "أدخل اللوحة ووزن قائم أكبر من الفارغ");
      return;
    }
    setSavingWeigh(true);
    try {
      const prev = [...weighings].sort((a, b) => a.seq - b.seq).pop();
      const record = sealWeighing({
        plate: plate.trim(),
        supplier: supplier.trim() || undefined,
        material: material.trim() || undefined,
        grossKg,
        tareKg,
        expectedKg: expected ? parseFloat(expected) : undefined,
        prevHash: prev?.hash,
        seq: (prev?.seq ?? 0) + 1,
        weighedBy: user?.fullName || user?.email,
      });
      await erp.saveWeighbridgeRecords(u, [record, ...weighings]);
      setPlate(""); setSupplier(""); setMaterial("");
      setGross(""); setTare(""); setExpected("");
      await weighQ.refetch();
    } catch {
      Alert.alert("تعذر الحفظ", "تحقق من الاتصال وحاول مجدداً");
    } finally {
      setSavingWeigh(false);
    }
  };

  const saveReturn = async () => {
    const qtyM3 = parseFloat(rQty);
    if (!rPlate.trim() || !Number.isFinite(qtyM3) || qtyM3 <= 0 || !rReason.trim()) {
      Alert.alert("بيانات ناقصة", "أدخل اللوحة والكمية بالمتر وسبب الإرجاع");
      return;
    }
    setSavingReturn(true);
    try {
      const record: ReturnRecord = {
        id: `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`,
        plate: rPlate.trim(),
        site: rSite.trim() || undefined,
        qtyM3: Math.round(qtyM3 * 100) / 100,
        reason: rReason.trim(),
        disposition: rDisp,
        blocksMade: rDisp === "blocks" ? blocksFromVolume(qtyM3) : undefined,
        returnedAt: new Date().toISOString(),
        loggedBy: user?.fullName || user?.email,
      };
      await erp.saveReturns(u, [record, ...returns]);
      setRPlate(""); setRSite(""); setRQty(""); setRReason(""); setRDisp("recycle");
      await returnsQ.refetch();
    } catch {
      Alert.alert("تعذر الحفظ", "تحقق من الاتصال وحاول مجدداً");
    } finally {
      setSavingReturn(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>⚖️ الحوكمة — الميزان والمرتجعات</Text>
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: brokenId ? "rgba(248,113,113,0.10)" : "rgba(52,211,153,0.10)", borderWidth: 1, borderColor: brokenId ? "rgba(248,113,113,0.35)" : "rgba(52,211,153,0.35)" }}>
          <Text style={{ color: brokenId ? "#F87171" : "#34D399", fontSize: 12, fontWeight: "800" }}>
            {brokenId ? `⛔ السلسلة مكسورة عند سجل ${brokenId} — راجع الإدارة` : `✅ سلسلة الهاش سليمة (${weighings.length} وزنات)`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {(["weigh", "returns"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: tab === t ? ACCENT : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: BORDER }}
            >
              <Text style={{ color: tab === t ? "#06202E" : "#E2E8F0", fontWeight: "800", fontSize: 13 }}>
                {t === "weigh" ? `⚖️ الميزان (${weighings.length})` : `↩️ المرتجعات (${returns.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {tab === "weigh" ? (
          <View>
            <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 }}>
              <Text style={{ color: "#fff", fontWeight: "800", marginBottom: 8 }}>وزنة جديدة — الصافي = القائم − الفارغ</Text>
              <TextInput value={plate} onChangeText={setPlate} placeholder="رقم اللوحة" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={supplier} onChangeText={setSupplier} placeholder="المورّد (اختياري)" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={material} onChangeText={setMaterial} placeholder="الخامة (اختياري)" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={gross} onChangeText={setGross} placeholder="الوزن القائم (كجم)" keyboardType="numeric" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={tare} onChangeText={setTare} placeholder="الوزن الفارغ (كجم)" keyboardType="numeric" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={expected} onChangeText={setExpected} placeholder="المتوقع (كجم — للمطابقة ±3%)" keyboardType="numeric" placeholderTextColor="#64748B" style={INPUT} />
              <TouchableOpacity onPress={saveWeighing} disabled={savingWeigh} style={{ marginTop: 10, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: savingWeigh ? 0.6 : 1 }}>
                <Text style={{ color: "#06202E", fontWeight: "900" }}>{savingWeigh ? "⏳ جارٍ الختم..." : "🔒 ختم الوزنة بالهاش"}</Text>
              </TouchableOpacity>
            </View>
            {weighings.map((w) => (
              <View key={w.id} style={{ backgroundColor: CARD, borderColor: w.id === brokenId ? "#F87171" : BORDER, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>#{w.seq} · {w.plate}</Text>
                  <Text style={{ color: w.verdict === "mismatch" ? "#F87171" : w.verdict === "ok" ? "#34D399" : "#94A3B8", fontSize: 12, fontWeight: "800" }}>
                    {w.verdict === "ok" ? "✓ مطابق" : w.verdict === "mismatch" ? "⚠ مخالف" : "بانتظار المتوقع"}
                  </Text>
                </View>
                <Text style={{ color: "#CBD5E1", fontSize: 12, marginTop: 4 }}>
                  قائم {w.grossKg} − فارغ {w.tareKg} = صافي {w.netKg} كجم
                </Text>
                <Text style={{ color: "#64748B", fontSize: 10, marginTop: 4 }}>hash: {String(w.hash).slice(0, 16)}…</Text>
              </View>
            ))}
            {weighings.length === 0 && <Text style={{ color: "#64748B", textAlign: "center", marginTop: 12 }}>لا وزنات مسجلة بعد</Text>}
          </View>
        ) : (
          <View>
            <View style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 }}>
              <Text style={{ color: "#fff", fontWeight: "800", marginBottom: 8 }}>مرتجع خرسانة جديد</Text>
              <TextInput value={rPlate} onChangeText={setRPlate} placeholder="رقم اللوحة" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={rSite} onChangeText={setRSite} placeholder="الموقع (اختياري)" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={rQty} onChangeText={setRQty} placeholder="الكمية (م³)" keyboardType="numeric" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ height: 8 }} />
              <TextInput value={rReason} onChangeText={setRReason} placeholder="سبب الإرجاع" placeholderTextColor="#64748B" style={INPUT} />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {DISPOSITIONS.map((d) => (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => setRDisp(d.key)}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: rDisp === d.key ? ACCENT : "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: BORDER }}
                  >
                    <Text style={{ color: rDisp === d.key ? "#06202E" : "#E2E8F0", fontWeight: "800", fontSize: 12 }}>{d.ar}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {rDisp === "blocks" && rQty ? (
                <Text style={{ color: "#34D399", fontSize: 12, fontWeight: "700", marginTop: 6 }}>
                  ≈ {blocksFromVolume(parseFloat(rQty) || 0)} بلوك
                </Text>
              ) : null}
              <TouchableOpacity onPress={saveReturn} disabled={savingReturn} style={{ marginTop: 10, backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: savingReturn ? 0.6 : 1 }}>
                <Text style={{ color: "#06202E", fontWeight: "900" }}>{savingReturn ? "⏳ جارٍ الحفظ..." : "💾 تسجيل المرتجع"}</Text>
              </TouchableOpacity>
            </View>
            {returns.map((r) => (
              <View key={r.id} style={{ backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>{r.plate} · {r.qtyM3} م³</Text>
                  <Text style={{ color: ACCENT, fontSize: 12, fontWeight: "800" }}>
                    {r.disposition === "recycle" ? "تدوير" : r.disposition === "blocks" ? `بلوك (${r.blocksMade ?? 0})` : "إتلاف"}
                  </Text>
                </View>
                <Text style={{ color: "#CBD5E1", fontSize: 12, marginTop: 4 }}>{r.reason}{r.site ? ` · ${r.site}` : ""}</Text>
              </View>
            ))}
            {returns.length === 0 && <Text style={{ color: "#64748B", textAlign: "center", marginTop: 12 }}>لا مرتجعات مسجلة بعد</Text>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
