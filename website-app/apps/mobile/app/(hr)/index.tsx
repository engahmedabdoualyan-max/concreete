/**
 * HR Desk Home Screen
 * Inbox of employee requests (approve/reject) + broadcast composer.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/store/auth-store";

interface HrRequest {
  id: string;
  type: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  amountSar?: string | null;
  reason?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  requesterName: string;
}

const TYPE_META: Record<string, { emoji: string; key: "hr.type.leave" | "hr.type.advance" | "hr.type.salary" | "hr.type.other" }> = {
  LEAVE: { emoji: "🏖️", key: "hr.type.leave" },
  ADVANCE: { emoji: "💰", key: "hr.type.advance" },
  SALARY_CONFIRM: { emoji: "✅", key: "hr.type.salary" },
  OTHER: { emoji: "📝", key: "hr.type.other" },
};

export default function HrHomeScreen() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"inbox" | "compose" | "sent">("inbox");
  const [filter, setFilter] = useState("PENDING");
  const [requests, setRequests] = useState<HrRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [bTitle, setBTitle] = useState("");
  const [bBody, setBBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ id: string; title: string; body: string; createdAt: string }[]>([]);
  const [reads, setReads] = useState<Record<string, number>>({});

  const loadSent = async () => {
    try {
      const res = await api.getBroadcasts();
      const all = res.broadcasts ?? [];
      const mine = all.filter((b: any) => !b.createdById || b.createdById === user?.id);
      // Fallback: backend list is audience-filtered; HR sees everything
      const list = mine.length > 0 ? mine : all;
      setSent(list);
      const counts: Record<string, number> = {};
      await Promise.all(
        list.slice(0, 20).map(async (b: any) => {
          counts[b.id] = await api.getBroadcastReads(b.id);
        })
      );
      setReads(counts);
    } catch {
      // Offline — keep last view
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getHrRequests(filter === "ALL" ? undefined : filter);
      setRequests(res.requests ?? []);
    } catch {
      // Offline — keep last view
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const review = (id: string, decision: "APPROVED" | "REJECTED") => {
    const proceed = async (note?: string) => {
      setActingId(id);
      try {
        await api.reviewHrRequest(id, decision, note);
        setRequests(requests.map((r) => (r.id === id ? { ...r, status: decision } : r)));
      } catch {
        Alert.alert("⚠️", t("common.error"));
      } finally {
        setActingId(null);
      }
    };
    if (decision === "REJECTED") {
      Alert.prompt?.(
        t("hr.reviewNote"),
        undefined,
        [{ text: t("common.cancel"), style: "cancel" }, { text: t("common.ok"), onPress: (note) => void proceed(note) }],
        "plain-text"
      ) ?? void proceed();
    } else {
      void proceed();
    }
  };

  const publish = async () => {
    if (!bTitle.trim() || !bBody.trim()) {
      Alert.alert("⚠️", t("hr.composeHint"));
      return;
    }
    setSending(true);
    try {
      await api.createBroadcast({ title: bTitle.trim(), body: bBody.trim() });
      setBTitle("");
      setBBody("");
      Alert.alert("✅", t("hr.published"));
    } catch {
      Alert.alert("⚠️", t("common.error"));
    } finally {
      setSending(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      <TouchableOpacity
        onPress={() => router.push("/(hr)/attendance" as never)}
        className="mb-3"
      >
        <Card variant="default" className="bg-teal-600">
          <View className="flex-row items-center justify-between">
            <Text className="text-white font-bold">🕐 {t("hr.attendance")} + 🚚 {t("hr.overtime")}</Text>
            <Text className="text-white">←</Text>
          </View>
        </Card>
      </TouchableOpacity>

      <View className="flex-row gap-2 mb-3">
        <TouchableOpacity
          onPress={() => setTab("inbox")}
          className={`flex-1 py-2.5 rounded-xl items-center ${tab === "inbox" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
        >
          <Text className={`font-bold ${tab === "inbox" ? "text-white" : "text-slate-600"}`}>
            📥 {t("hr.inbox")} ({pendingCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("compose")}
          className={`flex-1 py-2.5 rounded-xl items-center ${tab === "compose" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
        >
          <Text className={`font-bold ${tab === "compose" ? "text-white" : "text-slate-600"}`}>
            📢 {t("hr.compose")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setTab("sent");
            void loadSent();
          }}
          className={`flex-1 py-2.5 rounded-xl items-center ${tab === "sent" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
        >
          <Text className={`font-bold ${tab === "sent" ? "text-white" : "text-slate-600"}`}>
            📨 {t("hr.sentTab")}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === "inbox" ? (
        <View>
          <View className="flex-row gap-2 mb-3">
            {["PENDING", "APPROVED", "REJECTED", "ALL"].map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                className={`flex-1 py-2 rounded-xl items-center ${filter === f ? "bg-slate-800" : "bg-white border border-slate-200"}`}
              >
                <Text className={`text-xs font-bold ${filter === f ? "text-white" : "text-slate-600"}`}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {requests.length === 0 ? (
            <Card variant="default">
              <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
            </Card>
          ) : (
            requests.map((r) => {
              const meta = TYPE_META[r.type] ?? TYPE_META.OTHER;
              return (
                <Card key={r.id} variant="default" className="mb-2">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-slate-800 font-bold">
                        {meta.emoji} {t(meta.key)} — {r.requesterName}
                      </Text>
                      {r.reason ? (
                        <Text className="text-slate-500 text-sm mt-1">{r.reason}</Text>
                      ) : null}
                      <Text className="text-slate-400 text-xs mt-1">
                        {r.type === "LEAVE" && r.startDate
                          ? `📅 ${r.startDate.slice(0, 10)} → ${(r.endDate ?? "").slice(0, 10)}`
                          : r.type === "ADVANCE" && r.amountSar
                            ? `💰 ${r.amountSar} SAR`
                            : `🕐 ${r.createdAt.slice(0, 10)}`}
                      </Text>
                      {r.reviewNote ? (
                        <Text className="text-sky-700 text-xs mt-1">💬 {r.reviewNote}</Text>
                      ) : null}
                    </View>
                    <View
                      className={`rounded-full px-2 py-1 ml-2 ${
                        r.status === "PENDING"
                          ? "bg-amber-100"
                          : r.status === "APPROVED"
                            ? "bg-emerald-100"
                            : "bg-red-100"
                      }`}
                    >
                      <Text className="text-[10px] font-bold text-slate-700">{r.status}</Text>
                    </View>
                  </View>
                  {r.status === "PENDING" ? (
                    <View className="flex-row gap-2 mt-3">
                      <View className="flex-1">
                        <Button
                          title={t("rnd.common.approve")}
                          onPress={() => review(r.id, "APPROVED")}
                          loading={actingId === r.id}
                          variant="success"
                          size="small"
                        />
                      </View>
                      <View className="flex-1">
                        <Button
                          title={t("rnd.common.reject")}
                          onPress={() => review(r.id, "REJECTED")}
                          loading={actingId === r.id}
                          variant="danger"
                          size="small"
                        />
                      </View>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </View>
      ) : tab === "compose" ? (
        <Card variant="elevated">
          <Text className="text-slate-800 font-bold mb-1">📢 {t("hr.compose")}</Text>
          <Text className="text-slate-500 text-xs mb-3">{t("hr.composeHint")}</Text>
          <Input label={t("hr.bTitle")} value={bTitle} onChangeText={setBTitle} />
          <Input
            label={t("hr.bBody")}
            value={bBody}
            onChangeText={setBBody}
            multiline
            numberOfLines={4}
          />
          <Button title={t("hr.publish")} onPress={publish} loading={sending} variant="primary" />
        </Card>
      ) : (
        <View>
          {sent.length === 0 ? (
            <Card variant="default">
              <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
            </Card>
          ) : (
            sent.map((b) => (
              <Card key={b.id} variant="default" className="mb-2">
                <Text className="text-slate-800 font-bold">{b.title}</Text>
                <Text className="text-slate-500 text-sm mt-1" numberOfLines={2}>
                  {b.body}
                </Text>
                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-slate-400 text-xs">{b.createdAt.slice(0, 10)}</Text>
                  <View className="bg-teal-100 rounded-full px-3 py-1">
                    <Text className="text-teal-700 text-xs font-bold">
                      👁️ {reads[b.id] ?? 0} {t("hr.reads")}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
