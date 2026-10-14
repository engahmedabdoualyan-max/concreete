/**
 * Batch plant console (production manager / batch operator).
 *
 * Two jobs, both from the plant floor:
 *   1. Fire a batch for a signed-off mix design. Until the controller is
 *      commissioned for remote writes, the app says so plainly and the operator
 *      presses the panel — that is the safe default, not a limitation.
 *   2. Book the batch the plant reports, which posts the ACTUAL weights to the
 *      silos. This is the step that turns cost per m³ from an estimate into a
 *      measurement, so it is the button the supervisor should care about.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

interface Controller {
  id: string;
  name: string;
  provider: string;
  plantName?: string;
  lastStatus?: unknown;
  lastSeenAt?: string | null;
}

const card = "rounded-2xl border border-slate-200 bg-white p-3 mb-2";

export function BatchPlantPanel() {
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [mixDesignId, setMixDesignId] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const controllers = useQuery({
    queryKey: ["plant", "controllers"],
    queryFn: async () => (await api.listBatchControllers()) as Controller[],
    enabled: Boolean(user),
  });

  const mixes = useQuery({
    queryKey: ["plant", "mix-designs"],
    queryFn: async () => (await api.getMixDesigns()) as { id: string; designCode: string; gradeDescription?: string | null }[],
    enabled: Boolean(user),
  });

  const fire = useMutation({
    mutationFn: () =>
      api.batchAction(selected!, { action: "fire", mixDesignId: mixDesignId!, batchSizeM3: 1 }),
    onSuccess: (res: any) =>
      setResult({
        ok: true,
        text:
          res?.data?.code === "MANUAL_FIRE_REQUIRED"
            ? `🖐️ ${res.data.message}`
            : `✅ ${res?.data?.message ?? "تم الإرسال"}`,
      }),
    onError: (e: Error) => setResult({ ok: false, text: `❌ ${e.message}` }),
  });

  const record = useMutation({
    mutationFn: () =>
      api.batchAction(selected!, {
        action: "record",
        ticketNumber: ticket.trim() || `T${Date.now().toString().slice(-8)}`,
        batchSizeM3: 1,
      }),
    onSuccess: (res: any) => {
      const posted = res?.data?.posted ?? [];
      const shortages = res?.data?.shortages ?? [];
      setResult({
        ok: true,
        text: `📦 ${res?.data?.message ?? "تم التسجيل"}${
          posted.length ? `\nسُجّل: ${posted.map((p: any) => `${p.material} ${p.kg}كجم`).join(" · ")}` : ""
        }${
          shortages.length ? `\n⚠️ ${shortages.join(" · ")}` : ""
        }`,
      });
    },
    onError: (e: Error) => setResult({ ok: false, text: `❌ ${e.message}` }),
  });

  if (controllers.isLoading) {
    return (
      <View className="p-8 items-center">
        <ActivityIndicator color="#F97316" />
        <Text className="text-slate-500 mt-2">جارِ قراءة المصانع…</Text>
      </View>
    );
  }

  const list = controllers.data ?? [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      {list.length === 0 ? (
        <View className={`${card} items-center`}>
          <Text className="text-slate-600 font-bold">مفيش مصنع مربوط</Text>
          <Text className="text-slate-500 text-xs mt-1 text-center">
            أضف مصنع + كنترولر من الإعدادات (MODBUS_TCP أو المحاكي للتجربة).
          </Text>
        </View>
      ) : null}

      {list.map((c) => (
        <View key={c.id} className={card}>
          <View className="flex-row items-center justify-between">
            <Text className="text-slate-800 font-bold text-sm">{c.name}</Text>
            <Text className="text-[10px] text-slate-400">{c.provider}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setSelected(selected === c.id ? null : c.id)}
            className="mt-2"
          >
            <Text className="text-xs font-bold text-amber-600">
              {selected === c.id ? "▲ إخفاء" : "▼ تشغيل / تسجيل"}
            </Text>
          </TouchableOpacity>

          {selected === c.id ? (
            <View className="mt-3 space-y-2">
              <Text className="text-slate-600 text-xs font-bold">1) اشتغل خلطة</Text>
              <View className="flex-row flex-wrap gap-2">
                {(mixes.data ?? []).slice(0, 12).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setMixDesignId(m.id)}
                    className={`rounded-full px-3 py-1.5 border ${
                      mixDesignId === m.id
                        ? "bg-amber-500 border-amber-500"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${
                        mixDesignId === m.id ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {m.designCode}
                      {m.gradeDescription ? ` · ${m.gradeDescription}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => fire.mutate()}
                disabled={!mixDesignId || fire.isPending}
                className="rounded-xl bg-amber-500 py-3 items-center disabled:opacity-40"
              >
                <Text className="text-white font-bold text-sm">
                  {fire.isPending ? "جارِ الإرسال…" : "▶ اشتغل الباتش (1 م³)"}
                </Text>
              </TouchableOpacity>

              <Text className="text-slate-600 text-xs font-bold mt-2">
                2) سجّل الباتش اللي خلص
              </Text>
              <TouchableOpacity
                onPress={() => record.mutate()}
                disabled={record.isPending}
                className="rounded-xl bg-slate-800 py-3 items-center disabled:opacity-40"
              >
                <Text className="text-white font-bold text-sm">
                  {record.isPending ? "جارِ التسجيل…" : "📦 سجّل الاستهلاك الفعلي"}
                </Text>
              </TouchableOpacity>

              {result ? (
                <View
                  className={`rounded-xl p-3 ${
                    result.ok ? "bg-emerald-50" : "bg-red-50"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      result.ok ? "text-emerald-800" : "text-red-700"
                    }`}
                  >
                    {result.text}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}

      <View className={`${card} mt-2 bg-amber-50 border-amber-200`}>
        <Text className="text-amber-800 text-xs font-bold">ℹ️ ليش «اشتغل الباتش» ممكن يرفض؟</Text>
        <Text className="text-amber-700 text-xs mt-1">
          الكتابة عن بُعد مقفولة افتراضيًا: لازم الكنترولر يكون اتCommission مع مهندس
          المصنع (deploy/BATCHING-COMMISSIONING.md). غير كده المشغّل يشتغل من اللوحة
          والتطبيق بسيسجّل النتيجة — وده آمن.
        </Text>
      </View>
    </ScrollView>
  );
}
