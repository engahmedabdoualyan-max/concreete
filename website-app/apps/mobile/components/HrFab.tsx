/**
 * HrFab — tiny floating HR button present on every employee screen.
 * Opens a compact sheet: [New Request | HR Notifications].
 * Small by design: 52px circle, bottom-right, never steals layout.
 */

import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  Pressable,
} from "react-native";
import { useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type ReqType = "LEAVE" | "ADVANCE" | "SALARY_CONFIRM" | "OTHER";

interface Broadcast {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface MyRequest {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

const REQ_TYPES: { key: ReqType; emoji: string; labelKey: "hr.type.leave" | "hr.type.advance" | "hr.type.salary" | "hr.type.other" }[] = [
  { key: "LEAVE", emoji: "🏖️", labelKey: "hr.type.leave" },
  { key: "ADVANCE", emoji: "💰", labelKey: "hr.type.advance" },
  { key: "SALARY_CONFIRM", emoji: "✅", labelKey: "hr.type.salary" },
  { key: "OTHER", emoji: "📝", labelKey: "hr.type.other" },
];

export function HrFab() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "inbox">("new");
  const [unread, setUnread] = useState(0);

  const [reqType, setReqType] = useState<ReqType>("LEAVE");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [loadingBox, setLoadingBox] = useState(false);

  const refreshBox = useCallback(async () => {
    setLoadingBox(true);
    try {
      const [b, m] = await Promise.all([
        api.getBroadcasts().catch(() => ({ broadcasts: [] as Broadcast[] })),
        api.getMyHrRequests().catch(() => ({ requests: [] as MyRequest[] })),
      ]);
      const list = b.broadcasts ?? [];
      setBroadcasts(list);
      setUnread(list.filter((x) => !x.read).length);
      setMyRequests(m.requests ?? []);
    } finally {
      setLoadingBox(false);
    }
  }, []);

  const openSheet = () => {
    setOpen(true);
    void refreshBox();
  };

  const markRead = async (id: string) => {
    try {
      await api.markBroadcastRead(id);
      setBroadcasts(broadcasts.map((b) => (b.id === id ? { ...b, read: true } : b)));
      setUnread((n) => Math.max(0, n - 1));
    } catch {
      // ignore — will retry next open
    }
  };

  const submit = async () => {
    setSending(true);
    try {
      await api.createHrRequest({
        type: reqType,
        startDate: reqType === "LEAVE" && from ? from : undefined,
        endDate: reqType === "LEAVE" && to ? to : undefined,
        amountSar: reqType === "ADVANCE" && amount ? parseFloat(amount) : undefined,
        reason: reason.trim() || undefined,
      });
      setReason("");
      setFrom("");
      setTo("");
      setAmount("");
      Alert.alert("✅", t("hr.sent"));
      setTab("inbox");
      await refreshBox();
    } catch {
      Alert.alert("⚠️", t("common.error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Tiny floating button — 52px, bottom-right */}
      <TouchableOpacity
        onPress={openSheet}
        activeOpacity={0.85}
        className="absolute bottom-6 right-5 w-[52px] h-[52px] rounded-full bg-teal-600 items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
      >
        <Text className="text-2xl">💬</Text>
        {unread > 0 ? (
          <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1">
            <Text className="text-white text-[10px] font-bold">{unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setOpen(false)}>
          <Pressable
            className="bg-slate-50 rounded-t-3xl p-5"
            style={{ maxHeight: "85%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row gap-2 mb-4">
              <TouchableOpacity
                onPress={() => setTab("new")}
                className={`flex-1 py-2.5 rounded-xl items-center ${tab === "new" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
              >
                <Text className={`font-bold ${tab === "new" ? "text-white" : "text-slate-600"}`}>
                  ➕ {t("hr.newRequest")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTab("inbox")}
                className={`flex-1 py-2.5 rounded-xl items-center ${tab === "inbox" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
              >
                <Text className={`font-bold ${tab === "inbox" ? "text-white" : "text-slate-600"}`}>
                  📢 {t("hr.notifications")}
                  {unread > 0 ? ` (${unread})` : ""}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {tab === "new" ? (
                <View>
                  <View className="flex-row flex-wrap gap-2 mb-3">
                    {REQ_TYPES.map((r) => (
                      <TouchableOpacity
                        key={r.key}
                        onPress={() => setReqType(r.key)}
                        className={`px-3 py-2 rounded-xl ${reqType === r.key ? "bg-teal-600" : "bg-white border border-slate-200"}`}
                      >
                        <Text className={reqType === r.key ? "text-white font-bold" : "text-slate-600"}>
                          {r.emoji} {t(r.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {reqType === "LEAVE" ? (
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Input label={t("hr.from")} value={from} onChangeText={setFrom} placeholder="2026-10-01" />
                      </View>
                      <View className="flex-1">
                        <Input label={t("hr.to")} value={to} onChangeText={setTo} placeholder="2026-10-05" />
                      </View>
                    </View>
                  ) : null}
                  {reqType === "ADVANCE" ? (
                    <Input
                      label={t("hr.amount")}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="numeric"
                      placeholder="2000"
                    />
                  ) : null}
                  <Input
                    label={t("hr.reason")}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    placeholder="..."
                  />
                  <Button title={t("hr.send")} onPress={submit} loading={sending} variant="primary" />
                  {myRequests.length > 0 ? (
                    <View className="mt-3">
                      <Text className="text-slate-700 font-bold mb-2">{t("hr.myRequests")}</Text>
                      {myRequests.slice(0, 5).map((r) => (
                        <Card key={r.id} variant="default" className="mb-1.5 py-3">
                          <View className="flex-row justify-between items-center">
                            <Text className="text-slate-700 text-sm">
                              {REQ_TYPES.find((x) => x.key === r.type)?.emoji} {r.createdAt.slice(0, 10)}
                            </Text>
                            <Text
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                r.status === "PENDING"
                                  ? "bg-amber-100 text-amber-700"
                                  : r.status === "APPROVED"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {r.status}
                            </Text>
                          </View>
                        </Card>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : (
                <View>
                  {loadingBox ? (
                    <Text className="text-slate-500 text-center py-4">{t("common.loading")}</Text>
                  ) : broadcasts.length === 0 ? (
                    <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
                  ) : (
                    broadcasts.map((b) => (
                      <TouchableOpacity key={b.id} onPress={() => markRead(b.id)}>
                        <Card variant="default" className={`mb-2 ${b.read ? "opacity-70" : "border-teal-300"}`}>
                          <View className="flex-row items-start gap-2">
                            {!b.read ? <View className="w-2 h-2 bg-teal-500 rounded-full mt-1.5" /> : null}
                            <View className="flex-1">
                              <Text className="text-slate-800 font-bold">{b.title}</Text>
                              <Text className="text-slate-500 text-sm mt-1">{b.body}</Text>
                              <Text className="text-slate-400 text-[10px] mt-1">{b.createdAt.slice(0, 10)}</Text>
                            </View>
                          </View>
                        </Card>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </ScrollView>

            <Button title={t("common.close")} onPress={() => setOpen(false)} variant="secondary" size="small" className="mt-3" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
