/**
 * Cost & margin screen (accountant / finance).
 *
 * Answers the question a ready-mix owner asks first — "am I making money on
 * this, and where?" — from data the plant already records: the mix recipe × the
 * silo price per tonne, plus whatever delivery cost the trips carry.
 *
 * Deliberately a separate screen (not a dashboard tile) because it is a
 * decision tool, and it reuses the same visual language as the other finance
 * screens: white cards, amber accents, Arabic labels with the number formatting
 * the plant expects.
 */

import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";

interface CostItem {
  orderId: string;
  orderNumber: string;
  scheduledDate: string;
  status: string;
  client: { id: string; name: string };
  mix: { id: string; code: string; grade: string };
  volumeM3: number;
  revenueSar: number;
  materialCostSar: number;
  transportCostSar: number;
  totalCostSar: number;
  marginSar: number;
  marginPerM3: number;
  marginPct: number;
  transportIsCosted: boolean;
  /** trips in this order with no recorded delivery cost */
  uncostedTrips?: number;
  costBreakdown: { material: string; kgPerM3: number; sarPerTonne: number; costSarPerM3: number }[];
}

interface CostResponse {
  period: { from: string; to: string };
  totals: {
    volumeM3: number;
    totalCostSar: number;
    revenueSar: number;
    materialCostSar: number;
    transportCostSar: number;
    marginSar: number;
    marginPerM3: number;
    marginPct: number;
  };
  items: CostItem[];
  dataQuality: {
    missingMaterialPrices: string[];
    transportNotCosted: boolean;
  };
}

const money = (v: number) =>
  `${Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`;
const num = (v: number, digits = 1) => Number(v ?? 0).toFixed(digits);

const RANGES = [
  { key: "month", label: "هذا الشهر" },
  { key: "quarter", label: "3 شهور" },
  { key: "year", label: "سنة" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function rangeFor(key: RangeKey) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (key === "quarter") from.setMonth(from.getMonth() - 3);
  if (key === "year") from.setFullYear(from.getFullYear() - 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

const MATERIAL_AR: Record<string, string> = {
  CEMENT: "أسمنت",
  SAND: "رمل",
  GRAVEL_10MM: "زلط 10",
  GRAVEL_20MM: "زلط 20",
  GRAVEL_40MM: "زلط 40",
  WATER: "مياه",
  FLY_ASH: "رماد طائر",
  SILICA_FUME: "سيليكا",
  ADMIXTURE_PLASTICIZER: "ملدن",
  ADMIXTURE_RETARDER: "مؤخر",
};

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "red" | "amber";
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-800",
    emerald: "text-emerald-600",
    red: "text-red-600",
    amber: "text-amber-600",
  };
  return (
    <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
      <Text className="text-slate-500 text-xs">{label}</Text>
      <Text className={`text-lg font-bold mt-1 ${tones[tone]}`}>{value}</Text>
    </View>
  );
}

export function CostMarginPanel() {
  const { user } = useAuthStore();
  const { locale } = useT();
  const [range, setRange] = useState<RangeKey>("month");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { from, to } = useMemo(() => rangeFor(range), [range]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["finance", "cost-margin", from, to],
    queryFn: async () => {
      return (await api.getCostMargin({ from, to, limit: 50 })) as CostResponse;
    },
    enabled: Boolean(user),
  });

  if (isLoading) {
    return (
      <View className="p-8 items-center">
        <ActivityIndicator color="#F97316" />
        <Text className="text-slate-500 mt-2">جارِ حساب التكلفة…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="p-4">
        <View className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <Text className="text-red-700 font-bold">تعذّر تحميل تقرير التكلفة</Text>
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

  const t = data.totals;
  const marginTone = t.marginSar >= 0 ? "emerald" : "red";
  const missing = data.dataQuality?.missingMaterialPrices ?? [];

  return (
    <ScrollView className="p-3" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* range */}
      <View className="flex-row gap-2 mb-3">
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.key}
            onPress={() => setRange(r.key)}
            className={`flex-1 rounded-full px-3 py-2 ${
              range === r.key ? "bg-amber-500" : "bg-white border border-slate-200"
            }`}
          >
            <Text
              className={`text-center text-xs font-bold ${
                range === r.key ? "text-white" : "text-slate-600"
              }`}
            >
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text className="text-slate-400 text-xs mb-2">
        {data.period.from} → {data.period.to} · {data.items?.length ?? 0} طلب
      </Text>

      {/* headline numbers */}
      <View className="flex-row gap-2 mb-2">
        <Stat label="الإيرادات" value={money(t.revenueSar)} />
        <Stat label="التكلفة" value={money(t.totalCostSar)} tone="amber" />
      </View>
      <View className="flex-row gap-2 mb-2">
        <Stat label="الربح" value={money(t.marginSar)} tone={marginTone} />
        <Stat
          label="ربح/م³"
          value={`${num(t.marginPerM3)} ر.س`}
          tone={marginTone}
        />
      </View>
      <View className="flex-row gap-2 mb-3">
        <Stat label="الهامش %" value={`${num(t.marginPct)}%`} tone={marginTone} />
        <Stat label="الحجم" value={`${num(t.volumeM3)} م³`} />
      </View>

      {/* data quality — a report you cannot trust is worse than no report */}
      {missing.length > 0 || data.dataQuality?.transportNotCosted ? (
        <View className="rounded-2xl border border-amber-200 bg-amber-50 p-3 mb-3">
          <Text className="text-amber-800 font-bold text-xs">
            ⚠️ التقرير ناقص — أضف الأسعار عشان يبقى دقيق
          </Text>
          {missing.length > 0 ? (
            <Text className="text-amber-700 text-xs mt-1">
              أسعار المواد الناقصة:{" "}
              {missing.map((m: string) => MATERIAL_AR[m] ?? m).join("، ")}
            </Text>
          ) : null}
          {data.dataQuality?.transportNotCosted ? (
            <Text className="text-amber-700 text-xs mt-1">
              تكلفة النقل لسه مش متسجّلة على الرحلات (الربح الحالي للمواد بس).
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* per order */}
      <Text className="text-slate-700 font-bold mt-2 mb-2">
        📋 تفاصيل الطلبات
      </Text>
      {(data.items ?? []).map((it: CostItem) => (
        <TouchableOpacity
          key={it.orderId}
          onPress={() => setExpanded(expanded === it.orderId ? null : it.orderId)}
          className="rounded-2xl border border-slate-200 bg-white p-3 mb-2"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-slate-800 font-bold text-sm">
              {it.orderNumber}
            </Text>
            <Text
              className={`font-bold text-sm ${
                it.marginSar >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {num(it.marginPerM3)} ر.س/م³
            </Text>
          </View>
          <Text className="text-slate-500 text-xs mt-1">
            {it.client.name} · {it.mix.code} {it.mix.grade} · {num(it.volumeM3)} م³
          </Text>
          <View className="flex-row gap-3 mt-2">
            <Text className="text-slate-600 text-xs">
              إيراد {money(it.revenueSar)}
            </Text>
            <Text className="text-slate-600 text-xs">
              مواد {money(it.materialCostSar)}
            </Text>
            <Text className="text-slate-600 text-xs">
              نقل {money(it.transportCostSar)}
            </Text>
            <Text className="text-slate-400 text-xs">{num(it.marginPct)}%</Text>
          </View>

          {expanded === it.orderId ? (
            <View className="mt-2 pt-2 border-t border-slate-100">
              {it.costBreakdown.map((line: CostItem["costBreakdown"][number]) => (
                <View
                  key={line.material}
                  className="flex-row items-center justify-between"
                >
                  <Text className="text-slate-600 text-xs">
                    {MATERIAL_AR[line.material] ?? line.material} ·{" "}
                    {num(line.kgPerM3, 0)} كجم
                    {line.sarPerTonne > 0
                      ? ` @ ${num(line.sarPerTonne, 0)} ر.س/طن`
                      : " · ⚠️ بدون سعر"}
                  </Text>
                  <Text className="text-slate-500 text-xs">
                    {num(line.costSarPerM3, 2)} ر.س/م³
                  </Text>
                </View>
              ))}
              {it.uncostedTrips ? (
                <Text className="text-amber-600 text-xs mt-1">
                  {it.uncostedTrips} رحلة بدون تكلفة نقل مسجّلة
                </Text>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
      ))}

      {(data.items ?? []).length === 0 ? (
        <View className="rounded-2xl border border-slate-200 bg-white p-6 items-center">
          <Text className="text-slate-500">
            مفيش طلبات في الفترة دي — جرّب مدى أطول.
          </Text>
        </View>
      ) : null}

      <Text className="text-slate-300 text-[10px] mt-4 text-center">
        هامش المساهمة = الإيراد − مواد − نقل (مش التكاليف الثابتة) · {locale}
      </Text>
    </ScrollView>
  );
}
