/**
 * Dispatch board (scheduler / dispatcher).
 *
 * One screen for the four questions of a shift:
 *   1. What must pour today, and is it covered?
 *   2. What is running right now, and where?
 *   3. What is late? (alerts, computed server-side)
 *   4. What can I send next? (idle fleet)
 *
 * It polls every 20 seconds instead of holding a socket, because the free
 * backend has no websocket server and a dispatcher only needs a fresh board,
 * not a stream. Same visual language as the other plant screens: white cards,
 * amber for action, slate for data.
 */

import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

interface BoardAlert {
  severity: "critical" | "warning" | "info";
  code: string;
  messageAr: string;
  ref?: string;
}

interface BoardOrder {
  id: string;
  number: string;
  status: string;
  client: string;
  site: string;
  city: string;
  mix: string;
  grade: string;
  time: string;
  totalM3: number;
  remainingM3: number;
  assignedM3: number;
  deliveredM3: number;
  uncoveredM3: number;
  trips: number;
  activeTrips: number;
  overdueMinutes: number;
  readyToDispatch: boolean;
}

interface BoardTrip {
  id: string;
  number: string;
  orderNumber: string | null;
  checkpointAr: string;
  loadedM3: number;
  deliveredM3: number;
  vehicle: string;
  plate: string;
  driver: string;
  minutesAtCheckpoint: number | null;
  stalled: boolean;
  behind: boolean;
}

interface Board {
  summary: {
    orders: number;
    totalM3: number;
    remainingM3: number;
    uncoveredM3: number;
    activeTrips: number;
    stalledTrips: number;
    deliveredTodayM3: number;
    idleVehicles: number;
    criticalAlerts: number;
  };
  alerts: BoardAlert[];
  orders: BoardOrder[];
  trips: BoardTrip[];
  generatedAt: string;
}

const num = (v: number, d = 1) => Number(v ?? 0).toFixed(d);

const ALERT_STYLE: Record<string, { box: string; text: string; icon: string }> = {
  critical: { box: "border-red-200 bg-red-50", text: "text-red-700", icon: "⛔" },
  warning: { box: "border-amber-200 bg-amber-50", text: "text-amber-800", icon: "⚠️" },
  info: { box: "border-slate-200 bg-slate-50", text: "text-slate-600", icon: "ℹ️" },
};

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
      <Text className="text-slate-500 text-xs">{label}</Text>
      <Text className={`text-lg font-bold mt-1 ${tone}`}>{value}</Text>
    </View>
  );
}

export function DispatchBoard() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"alerts" | "orders" | "trips">("alerts");

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dispatch", "board"],
    queryFn: async () =>
      (await api.getDispatchBoard()) as Board,
    refetchInterval: 20_000,
    enabled: Boolean(user),
  });

  if (isLoading) {
    return (
      <View className="p-8 items-center">
        <ActivityIndicator color="#F97316" />
        <Text className="text-slate-500 mt-2">جارِ تحميل لوحة التوزيع…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="p-4">
        <View className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <Text className="text-red-700 font-bold">تعذّر تحميل لوحة التوزيع</Text>
          <Text className="text-red-600 text-xs mt-1">
            {(error as Error)?.message ?? "خطأ غير معروف"}
          </Text>
          <TouchableOpacity onPress={() => refetch()} className="mt-3">
            <Text className="text-amber-600 font-bold">إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const s = data.summary;
  const tabs = [
    { key: "alerts" as const, label: `🚨 التنبيهات ${data.alerts.length || ""}`, n: data.alerts.length },
    { key: "orders" as const, label: `📋 الطلبات ${s.orders}`, n: s.orders },
    { key: "trips" as const, label: `🚚 الرحلات ${s.activeTrips}`, n: s.activeTrips },
  ];

  return (
    <View className="flex-1">
      {/* summary strip */}
      <View className="px-3 pt-2">
        <View className="flex-row gap-2 mb-2">
          <Stat label="متبقّي اليوم" value={`${num(s.remainingM3)} م³`} tone="text-slate-800" />
          <Stat
            label="غير مغطّى"
            value={`${num(s.uncoveredM3)} م³`}
            tone={s.uncoveredM3 > 0 ? "text-red-600" : "text-emerald-600"}
          />
        </View>
        <View className="flex-row gap-2 mb-2">
          <Stat label="رحلات شغالة" value={String(s.activeTrips)} tone="text-slate-800" />
          <Stat
            label="معدات متاحة"
            value={String(s.idleVehicles)}
            tone={s.idleVehicles > 0 ? "text-emerald-600" : "text-slate-800"}
          />
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-slate-400 text-[10px]">
            آخر تحديث {new Date(dataUpdatedAt).toLocaleTimeString("en-GB")}
            {isFetching ? " · جارِ التحديث…" : ""}
          </Text>
          {s.criticalAlerts > 0 ? (
            <Text className="text-red-600 text-xs font-bold">
              ⛔ {s.criticalAlerts} تنبيه حرج
            </Text>
          ) : (
            <Text className="text-emerald-600 text-xs font-bold">✅ مفيش تأخير حرج</Text>
          )}
        </View>
      </View>

      {/* tabs */}
      <View className="flex-row gap-2 px-3 py-3">
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            className={`flex-1 rounded-full px-2 py-2 ${
              tab === t.key ? "bg-amber-500" : "bg-white border border-slate-200"
            }`}
          >
            <Text
              className={`text-center text-[11px] font-bold ${
                tab === t.key ? "text-white" : "text-slate-600"
              }`}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {tab === "alerts" ? (
          <View className="px-3">
            {data.alerts.length === 0 ? (
              <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 items-center">
                <Text className="text-emerald-700 font-bold">كله تمام 👌</Text>
                <Text className="text-emerald-600 text-xs mt-1">
                  مفيش أخطاء تغطية ولا تأخير في النافذة دي.
                </Text>
              </View>
            ) : (
              data.alerts.map((a, i) => {
                const st = ALERT_STYLE[a.severity] ?? ALERT_STYLE.info;
                return (
                  <View key={`${a.code}-${i}`} className={`rounded-2xl border p-3 mb-2 ${st.box}`}>
                    <Text className={`text-sm font-bold ${st.text}`}>
                      {st.icon} {a.messageAr}
                    </Text>
                    {a.ref ? (
                      <Text className={`text-[10px] mt-1 ${st.text}`}>{a.ref}</Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {tab === "orders" ? (
          <View className="px-3">
            {data.orders.map((o) => (
              <View key={o.id} className="rounded-2xl border border-slate-200 bg-white p-3 mb-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-slate-800 font-bold text-sm">{o.number}</Text>
                  <Text className="text-slate-400 text-xs">
                    {o.time ? `${o.time} · ` : ""}
                    {o.status}
                  </Text>
                </View>
                <Text className="text-slate-600 text-xs mt-1">
                  {o.client} · {o.site}
                  {o.city ? ` — ${o.city}` : ""}
                </Text>
                <Text className="text-slate-400 text-xs mt-0.5">
                  {o.mix} {o.grade} · إجمالي {num(o.totalM3)} م³
                </Text>
                <View className="flex-row gap-3 mt-2 flex-wrap">
                  <Text className="text-slate-600 text-xs">متبقّي {num(o.remainingM3)}</Text>
                  <Text className="text-slate-600 text-xs">محمّل {num(o.assignedM3)}</Text>
                  <Text className="text-slate-600 text-xs">مسلّم {num(o.deliveredM3)}</Text>
                  <Text
                    className={`text-xs font-bold ${
                      o.uncoveredM3 > 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {o.uncoveredM3 > 0 ? `ناقص ${num(o.uncoveredM3)} م³` : "مغطّى ✅"}
                  </Text>
                </View>
                {o.overdueMinutes > 0 ? (
                  <Text className="text-red-600 text-xs font-bold mt-1">
                    ⛔ متأخر {o.overdueMinutes} دقيقة
                  </Text>
                ) : null}
                <Text className="text-slate-400 text-[10px] mt-1">
                  رحلات: {o.trips} (شغالة {o.activeTrips})
                </Text>
              </View>
            ))}
            {data.orders.length === 0 ? (
              <View className="rounded-2xl border border-slate-200 bg-white p-6 items-center">
                <Text className="text-slate-500">مفيش طلبات في النافذة دي.</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === "trips" ? (
          <View className="px-3">
            {data.trips.map((t) => (
              <View
                key={t.id}
                className={`rounded-2xl border p-3 mb-2 ${
                  t.stalled ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-slate-800 font-bold text-sm">{t.number}</Text>
                  <Text className="text-slate-400 text-xs">{t.orderNumber ?? "—"}</Text>
                </View>
                <Text className="text-slate-600 text-xs mt-1">
                  🚚 {t.vehicle} ({t.plate}) · {t.driver}
                </Text>
                <View className="flex-row gap-3 mt-2 flex-wrap">
                  <Text className="text-slate-600 text-xs">📍 {t.checkpointAr}</Text>
                  <Text className="text-slate-600 text-xs">{num(t.loadedM3)} م³</Text>
                  <Text
                    className={`text-xs font-bold ${
                      t.stalled ? "text-amber-700" : t.behind ? "text-slate-600" : "text-emerald-600"
                    }`}
                  >
                    {t.minutesAtCheckpoint ?? 0} دقيقة
                    {t.stalled ? " · واقفة ⚠️" : ""}
                  </Text>
                </View>
              </View>
            ))}
            {data.trips.length === 0 ? (
              <View className="rounded-2xl border border-slate-200 bg-white p-6 items-center">
                <Text className="text-slate-500">مفيش رحلات شغالة دلوقتي.</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
