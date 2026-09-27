/**
 * E-invoicing (ZATCA) — configuration, connection test and compliance status.
 *
 * The screen exists so the accountant never discovers a broken CSID at 23:00
 * with a customer invoice waiting: the "اختبار الاتصال" button performs the
 * real handshake with Fatoora and the result is stored on the server.
 *
 * Secrets are write-only: the screen can set the CSID/secret but never reads
 * them back, matching what the API exposes.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

interface ZatcaConfig {
  sellerName: string;
  vatNumber: string;
  street?: string;
  city?: string;
  branchName?: string;
  env: "sandbox" | "simulation" | "production";
  configured: boolean;
  credentialStatus: "UNCONFIGURED" | "INCOMPLETE" | "CONFIGURED" | "CORRUPTED";
}

const ENVS: { key: ZatcaConfig["env"]; label: string }[] = [
  { key: "simulation", label: "محاكاة (تجربة)" },
  { key: "sandbox", label: "بيئة الاختبار" },
  { key: "production", label: "الإنتاج ✅" },
];

const STATUS_AR: Record<string, { text: string; cls: string }> = {
  UNCONFIGURED: { text: "غير مُعد", cls: "text-slate-500" },
  INCOMPLETE: { text: "ناقص", cls: "text-amber-600" },
  CONFIGURED: { text: "مُعد ✅", cls: "text-emerald-600" },
  CORRUPTED: { text: "تشفير تالف ⛔", cls: "text-red-600" },
};

const inputCls =
  "bg-slate-50 rounded-2xl border-2 border-slate-200 px-4 py-3 text-base text-slate-800";

export function ZatcaPanel() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ZatcaConfig>>({});
  const [binaryToken, setBinaryToken] = useState("");
  const [secret, setSecret] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const config = useQuery({
    queryKey: ["zatca", "config"],
    queryFn: async () => (await api.getZatcaConfig()) as ZatcaConfig,
    enabled: Boolean(user),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (binaryToken.trim()) payload.binaryToken = binaryToken.trim();
      if (secret.trim()) payload.secret = secret.trim();
      if (form.env === "production") payload.confirmProduction = true;
      return api.saveZatcaConfig(payload);
    },
    onSuccess: (res: any) => {
      setFeedback(res?.data?.message ?? "✅ تم الحفظ");
      setBinaryToken("");
      setSecret("");
      void qc.invalidateQueries({ queryKey: ["zatca"] });
    },
    onError: (err: Error) => setFeedback(`❌ ${err.message}`),
  });

  const test = useMutation({
    mutationFn: () => api.testZatcaConnection(),
    onSuccess: (res: any) => {
      setFeedback(
        res?.data?.ok
          ? `✅ ${res.data.message}`
          : `⚠️ ${res.data?.message ?? "الاتصال فشل"}`
      );
      void qc.invalidateQueries({ queryKey: ["zatca"] });
    },
    onError: (err: Error) => {
      // 409 is the "not configured yet" answer and carries the missing list.
      setFeedback(`⚠️ ${err.message}`);
    },
  });

  const status = useQuery({
    queryKey: ["zatca", "status"],
    queryFn: async () => (await api.getZatcaStatus()) as any,
    enabled: Boolean(user),
  });

  const c = config.data;
  const value = (k: keyof ZatcaConfig) =>
    (form[k] as string | undefined) ?? (c?.[k] as string | undefined) ?? "";

  if (config.isLoading) {
    return (
      <View className="p-8 items-center">
        <ActivityIndicator color="#F97316" />
        <Text className="text-slate-500 mt-2">جارِ تحميل إعدادات الفوترة…</Text>
      </View>
    );
  }

  return (
    <ScrollView className="p-3" contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="rounded-2xl border border-slate-200 bg-white p-3 mb-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-slate-700 font-bold">حالة الربط</Text>
          <Text className={`font-bold ${STATUS_AR[c?.credentialStatus ?? "UNCONFIGURED"]?.cls}`}>
            {STATUS_AR[c?.credentialStatus ?? "UNCONFIGURED"]?.text}
          </Text>
        </View>
        <Text className="text-slate-400 text-xs mt-1">
          {c?.configured
            ? "الإعداد كامل — تقدر تُصدر فواتير إلكترونية."
            : "أكمل البيانات وابدأ بالبيئة المحاكاة لتجربة الفوترة بأمان."}
        </Text>
        {status.data?.summary ? (
          <View className="flex-row gap-3 mt-2">
            <Text className="text-slate-600 text-xs">
              صادرة: {status.data.summary.total ?? 0}
            </Text>
            <Text className="text-emerald-600 text-xs">
              مُبلَّغ: {status.data.summary.reported ?? 0}
            </Text>
            <Text className="text-amber-600 text-xs">
              تحذيرات: {status.data.summary.warnings ?? 0}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="text-slate-700 font-bold mb-2">بيانات البائع</Text>
      <TextInput
        className={`${inputCls} mb-2`}
        placeholder="اسم المنشأة / المورّد"
        placeholderTextColor="#94A3B8"
        value={value("sellerName")}
        onChangeText={(t) => setForm((f) => ({ ...f, sellerName: t }))}
      />
      <TextInput
        className={`${inputCls} mb-2`}
        placeholder="الرقم الضريبي (15 رقم يبدأ بـ3)"
        placeholderTextColor="#94A3B8"
        keyboardType="number-pad"
        value={value("vatNumber")}
        onChangeText={(t) => setForm((f) => ({ ...f, vatNumber: t }))}
      />
      <TextInput
        className={`${inputCls} mb-2`}
        placeholder="العنوان"
        placeholderTextColor="#94A3B8"
        value={value("street")}
        onChangeText={(t) => setForm((f) => ({ ...f, street: t }))}
      />
      <TextInput
        className={`${inputCls} mb-2`}
        placeholder="المدينة"
        placeholderTextColor="#94A3B8"
        value={value("city")}
        onChangeText={(t) => setForm((f) => ({ ...f, city: t }))}
      />

      <Text className="text-slate-700 font-bold mb-2 mt-2">البيئة</Text>
      <View className="flex-row gap-2 mb-3">
        {ENVS.map((e) => {
          const active = (form.env ?? c?.env ?? "simulation") === e.key;
          return (
            <TouchableOpacity
              key={e.key}
              onPress={() => setForm((f) => ({ ...f, env: e.key }))}
              className={`flex-1 rounded-full px-2 py-2 ${
                active
                  ? e.key === "production"
                    ? "bg-emerald-600"
                    : "bg-amber-500"
                  : "bg-white border border-slate-200"
              }`}
            >
              <Text
                className={`text-center text-[11px] font-bold ${
                  active ? "text-white" : "text-slate-600"
                }`}
                numberOfLines={1}
              >
                {e.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text className="text-slate-700 font-bold mb-2">بيانات الربط (للقراءة فقط بعد الحفظ)</Text>
      <TextInput
        className={`${inputCls} mb-2`}
        placeholder="CSID / Binary Token"
        placeholderTextColor="#94A3B8"
        autoCapitalize="none"
        secureTextEntry
        value={binaryToken}
        onChangeText={setBinaryToken}
      />
      <TextInput
        className={`${inputCls} mb-3`}
        placeholder="Secret"
        placeholderTextColor="#94A3B8"
        autoCapitalize="none"
        secureTextEntry
        value={secret}
        onChangeText={setSecret}
      />

      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => save.mutate()}
          disabled={save.isPending}
          className="flex-1 rounded-2xl bg-amber-500 py-3 items-center"
        >
          <Text className="text-white font-bold">
            {save.isPending ? "جارِ الحفظ…" : "💾 حفظ"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => test.mutate()}
          disabled={test.isPending}
          className="flex-1 rounded-2xl bg-slate-800 py-3 items-center"
        >
          <Text className="text-white font-bold">
            {test.isPending ? "جارِ الاختبار…" : "🔌 اختبار الاتصال"}
          </Text>
        </TouchableOpacity>
      </View>

      {feedback ? (
        <View className="rounded-2xl border border-slate-200 bg-white p-3 mt-3">
          <Text className="text-slate-700 text-xs">{feedback}</Text>
        </View>
      ) : null}

      <View className="rounded-2xl border border-amber-200 bg-amber-50 p-3 mt-3">
        <Text className="text-amber-800 text-xs font-bold">ℹ️ إزاي تفعّلها</Text>
        <Text className="text-amber-700 text-xs mt-1">
          1) افتح بوابة هيئة الزكاة واطلب CSID للـAPI (Onboarding).{`\n`}
          2) ابدأ ببيئة «محاكاة» وجرّب فاتورة، وبعدها «بيئة الاختبار»،{`\n`}
          3) آخر خطوة بس: «الإنتاج» — وتحتاج CTR (Certificate) للربط الحقيقي.
        </Text>
      </View>
    </ScrollView>
  );
}
