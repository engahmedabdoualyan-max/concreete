/**
 * Customer requests queue (sales).
 *
 * Every request a customer started from the magic-link portal lands here. The
 * screen is deliberately a work list, not a feed: pending first, oldest first,
 * with the two decisions that matter (approve → becomes a real DRAFT order that
 * still goes through credit + finance; reject → tell the customer why).
 *
 * Without this screen the portal would be a mailbox nobody opens, which is the
 * difference between self-service and a support burden.
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

interface PortalRequest {
  id: string;
  type: "NEW_ORDER" | "AMENDMENT" | "CANCELLATION";
  status: "PENDING" | "APPROVED" | "REJECTED";
  orderId: string | null;
  orderNumber: string | null;
  client: { id: string; name: string };
  volumeM3: number | null;
  date: string | null;
  site: string | null;
  mix: { code: string; grade: string | null } | null;
  note: string | null;
  handledBy: string | null;
  decisionNote: string | null;
  createdAt: string;
}

const TYPE_AR: Record<string, string> = {
  NEW_ORDER: "🆕 طلب جديد",
  AMENDMENT: "✏️ تعديل",
  CANCELLATION: "❌ إلغاء",
};

const STATUS_AR: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "⏳ بانتظارك", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { text: "✅ معتمد", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { text: "🚫 مرفوض", cls: "bg-red-100 text-red-700" },
};

const inputCls =
  "bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800";

export function PortalRequestsPanel() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [openNote, setOpenNote] = useState<Record<string, string>>({});
  const [onlyPending, setOnlyPending] = useState(true);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["portal", "requests", onlyPending],
    queryFn: async () =>
      (await api.getPortalRequests({ status: onlyPending ? "PENDING" : undefined, limit: 100 })) as {
        items: PortalRequest[];
        counts: { pending: number; approved: number; rejected: number };
      },
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "APPROVED" | "REJECTED"; note?: string }) =>
      api.decidePortalRequest(id, { decision, note }),
    onSuccess: () => {
      setOpenNote({});
      void qc.invalidateQueries({ queryKey: ["portal", "requests"] });
    },
  });

  if (isLoading) {
    return (
      <View className="p-8 items-center">
        <ActivityIndicator color="#F97316" />
        <Text className="text-slate-500 mt-2">جارِ تحميل طلبات العملاء…</Text>
      </View>
    );
  }
  if (error || !data) {
    return (
      <View className="p-4">
        <View className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <Text className="text-red-700 font-bold">تعذّر تحميل الطلبات</Text>
          <Text className="text-red-600 text-xs mt-1">{(error as Error)?.message}</Text>
          <TouchableOpacity onPress={() => refetch()} className="mt-3">
            <Text className="text-amber-600 font-bold">إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-row gap-2 px-3 pt-2">
        <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
          <Text className="text-slate-500 text-xs">بانتظارك</Text>
          <Text className="text-lg font-bold text-amber-600 mt-1">
            {data.counts.pending}
          </Text>
        </View>
        <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-3">
          <Text className="text-slate-500 text-xs">معتمد / مرفوض</Text>
          <Text className="text-lg font-bold text-slate-800 mt-1">
            {data.counts.approved} / {data.counts.rejected}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setOnlyPending((v) => !v)}
          className="rounded-2xl border border-slate-200 bg-white px-3 items-center justify-center"
        >
          <Text className="text-[11px] font-bold text-slate-600">
            {onlyPending ? "الكل" : "المعلّقة"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {data.items.length === 0 ? (
          <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 items-center">
            <Text className="text-emerald-700 font-bold">مفيش طلبات معلّقة 👌</Text>
            <Text className="text-emerald-600 text-xs mt-1">
              أي طلب جديد من بوابة العميل هيظهر هنا فورًا.
            </Text>
          </View>
        ) : null}

        {data.items.map((r) => {
          const st = STATUS_AR[r.status] ?? STATUS_AR.PENDING;
          return (
            <View key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3 mb-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-slate-800 font-bold text-sm">
                  {TYPE_AR[r.type] ?? r.type} · {r.client.name}
                </Text>
                <View className={`rounded-full px-2 py-0.5 ${st.cls}`}>
                  <Text className="text-[10px] font-bold">{st.text}</Text>
                </View>
              </View>

              <View className="flex-row gap-3 mt-2 flex-wrap">
                {r.volumeM3 != null ? (
                  <Text className="text-slate-600 text-xs">{r.volumeM3} م³</Text>
                ) : null}
                {r.mix ? (
                  <Text className="text-slate-600 text-xs">
                    {r.mix.code}
                    {r.mix.grade ? ` — ${r.mix.grade}` : ""}
                  </Text>
                ) : null}
                {r.site ? <Text className="text-slate-600 text-xs">📍 {r.site}</Text> : null}
                {r.date ? (
                  <Text className="text-slate-500 text-xs">
                    {new Date(r.date).toISOString().slice(0, 10)}
                  </Text>
                ) : null}
                {r.orderNumber ? (
                  <Text className="text-slate-500 text-xs">طلب {r.orderNumber}</Text>
                ) : null}
              </View>

              {r.note ? (
                <Text className="text-slate-500 text-xs mt-2">📝 {r.note}</Text>
              ) : null}

              {r.status === "PENDING" ? (
                <View className="mt-3">
                  {openNote[r.id] !== undefined ? (
                    <TextInput
                      className={`${inputCls} mb-2`}
                      placeholder="سبب الرفض أو ملاحظة للعميل"
                      placeholderTextColor="#94A3B8"
                      value={openNote[r.id]}
                      onChangeText={(t) => setOpenNote((n) => ({ ...n, [r.id]: t }))}
                    />
                  ) : null}
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() =>
                        decide.mutate({
                          id: r.id,
                          decision: "APPROVED",
                          note: openNote[r.id] || undefined,
                        })
                      }
                      disabled={decide.isPending}
                      className="flex-1 rounded-xl bg-emerald-600 py-2.5 items-center disabled:opacity-50"
                    >
                      <Text className="text-white font-bold text-xs">
                        {r.type === "NEW_ORDER" ? "✅ اعتمد (يصبح طلبًا)" : "✅ موافق"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (openNote[r.id] === undefined) {
                          setOpenNote((n) => ({ ...n, [r.id]: "" }));
                          return;
                        }
                        decide.mutate({
                          id: r.id,
                          decision: "REJECTED",
                          note: openNote[r.id] || undefined,
                        });
                      }}
                      disabled={decide.isPending}
                      className="flex-1 rounded-xl border border-red-300 bg-red-50 py-2.5 items-center"
                    >
                      <Text className="text-red-700 font-bold text-xs">🚫 ارفض</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Text className="text-slate-400 text-xs mt-2">
                  {r.handledBy ? `تعامل معاه: ${r.handledBy}` : "تم التعامل"}
                  {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
