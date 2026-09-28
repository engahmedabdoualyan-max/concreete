/**
 * Sales Home Screen
 * Main screen for sales reps: booking form + orders list.
 * Reads/writes the SAME Firestore `orders` collection as the website
 * (userData/{username}/orders) so orders sync instantly.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert } from "react-native";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { BookingForm, type SalesOrder } from "@/components/sales/BookingForm";
import { OrderCard } from "@/components/sales/OrderCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { erp, dataUsername } from "@/lib/firestore";
import { PortalRequestsPanel } from "./portal-requests";
import { useAuthStore } from "@/store/auth-store";
import { playAlertSound } from "@/lib/sound";
import { api } from "@/lib/api";
import { geolocation } from "@/lib/geolocation";

/** Task assigned by مدير المناديب (rep_tasks collection). */
interface RepTask {
  id: string; date: string; repId: string; repName: string;
  title: string; client?: string; details?: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "doing" | "done" | "cancelled";
}

const ORDER_STATUS_AR: Record<string, string> = {
  pending: "⏳ انتظار",
  approved: "✅ موافق",
  scheduled: "📅 مجدول",
  in_progress: "🏭 قيد التنفيذ",
  completed: "✅ مكتمل",
  cancelled: "🚫 ملغي",
};

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "pending", label: "⏳ انتظار" },
  { key: "approved", label: "✅ موافق" },
  { key: "in_progress", label: "🏭 تنفيذ" },
  { key: "completed", label: "✅ مكتمل" },
  { key: "cancelled", label: "🚫 ملغي" },
];

const CAN_CANCEL_STATUSES = new Set(["pending", "approved", "scheduled"]);

export default function SalesHomeScreen() {
  const { user } = useAuthStore();
  const u = dataUsername(user);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  // "orders" = the rep's own bookings, "portal" = what customers asked for
  const [view, setView] = useState<"orders" | "portal">("orders");
  const prevStatuses = useRef<Record<string, string>>({});
  const alerted = useRef<Set<string>>(new Set());

  // Attendance ping on duty (Epic 12b) — best-effort, once per visit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await geolocation.requestForegroundPermission();
        const loc = await geolocation.getCurrentLocation();
        if (!cancelled && loc) {
          await api.pingAttendance(loc.latitude, loc.longitude);
        }
      } catch {
        // Attendance must never disturb sales flow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch orders from the SAME Firestore collection as the website
  const { data: orders, isLoading } = useQuery<SalesOrder[]>({
    queryKey: ["sales-orders", u],
    queryFn: async () => (await erp.loadOrders(u)) || [],
    refetchInterval: 30000, // Refresh every 30s
  });

  // ── مدير المناديب: my daily tasks + live route sharing ──────────────────────
  const { data: repTasks } = useQuery<RepTask[]>({
    queryKey: ["sales-rep-tasks", u],
    queryFn: async () => (await erp.loadRepTasks(u)) || [],
    refetchInterval: 30000,
  });

  // Share live position (foreground) so the reps manager can track خط السير
  useEffect(() => {
    if (!user || !u) return;
    const myId = String(user.email || user.employeeCode || "").trim().toLowerCase();
    if (!myId) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    const displayName = [user.fullName, user.employeeCode]
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i)
      .join(" · ");
    const report = async (lat: number, lng: number) => {
      try {
        const list = (await erp.loadRepPositions(u)) || [];
        if (cancelled) return;
        const ts = Date.now();
        const prev = list.find((e: any) => String(e?.repId || "").toLowerCase() === myId);
        const entry = {
          repId: myId,
          name: displayName,
          lat,
          lng,
          ts,
          trail: [...(prev?.trail || []), { lat, lng, ts }].slice(-40),
        };
        await erp.saveRepPositions(
          u,
          [...list.filter((e: any) => String(e?.repId || "").toLowerCase() !== myId), entry]
        );
      } catch {}
    };
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) await report(pos.coords.latitude, pos.coords.longitude);
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 90_000, distanceInterval: 50 },
          (loc) => {
            if (!cancelled) report(loc.coords.latitude, loc.coords.longitude).catch(() => {});
          }
        );
      } catch {}
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [user?.id, u]);

  const taskStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RepTask["status"] }) => {
      const list = (repTasks || []).map((x) =>
        x.id === id
          ? {
              ...x,
              status,
              ...(status === "doing" ? { startedAt: new Date().toISOString() } : {}),
              ...(status === "done" ? { doneAt: new Date().toISOString() } : {}),
            }
          : x
      );
      const ok = await erp.saveRepTasks(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-rep-tasks", u] }),
  });

  // Beep when an order's account decision arrives (accountStatus changes)
  useEffect(() => {
    if (!orders) return;
    for (const o of orders) {
      const prev = prevStatuses.current[o.id];
      const cur = o.accountStatus || "pending";
      if (prev && prev === "pending" && cur !== "pending") {
        if (!alerted.current.has(o.id)) {
          alerted.current.add(o.id);
          playAlertSound().catch(() => {});
        }
      }
      prevStatuses.current[o.id] = cur;
    }
  }, [orders]);

  // Save order list to Firestore (with server-stamped created time for new orders)
  const saveMutation = useMutation({
    mutationFn: async (args: { list: SalesOrder[]; stamps?: Record<string, { createdAt?: boolean; approvedAt?: boolean; updatedAt?: boolean }> }) => {
      const ok = await erp.saveOrders(u, args.list, args.stamps);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders", u] });
      setShowForm(false);
      setEditingOrder(null);
    },
  });

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["sales-orders", u] });
    setRefreshing(false);
  }, [queryClient, u]);

  // Create a new order (append to website orders collection + notify owner)
  const handleCreateOrder = async (order: SalesOrder) => {
    const list = orders || [];
    const maxNum = list.reduce(
      (m, o) =>
        Math.max(m, parseInt(String(o.orderNo || "").replace("ORD-", ""), 10) || 0),
      0
    );
    const newOrder: SalesOrder = {
      ...order,
      orderNo: "ORD-" + String(maxNum + 1).padStart(4, "0"),
    };
    await saveMutation.mutateAsync({
      list: [...list, newOrder],
      stamps: { [newOrder.id]: { createdAt: true } },
    });
    erp
      .addNotification(u, {
        level: "info",
        title: "📦 طلب جديد " + newOrder.orderNo,
        body: `${newOrder.customerName} · ${newOrder.projectName} · بانتظار مراجعة الحسابات`,
      })
      .catch(() => {});
  };

  // Stats
  const pendingCount =
    orders?.filter(
      (o) => o.status === "pending" || o.accountStatus === "pending"
    ).length ?? 0;
  const approvedCount =
    orders?.filter((o) => o.status === "approved" || o.status === "scheduled")
      .length ?? 0;
  const completedCount =
    orders?.filter((o) => o.status === "completed").length ?? 0;

  // مهامي من مدير المناديب (اليوم + غير المنجزة)
  const myId = String(user?.email || user?.employeeCode || "").trim().toLowerCase();
  const myName = String(user?.fullName || "").trim();
  const myMatches = useCallback(
    (x: RepTask) =>
      (!!myId && String(x.repId || "").toLowerCase() === myId) ||
      (!!myName && String(x.repName || "").trim() === myName),
    [myId, myName]
  );
  const todayStr = new Date().toISOString().split("T")[0];
  const myActive = useMemo(
    () =>
      (repTasks || []).filter(
        (x) =>
          (x.status === "pending" || x.status === "doing") &&
          (x.date === todayStr || x.date >= todayStr) &&
          myMatches(x)
      ),
    [repTasks, myMatches, todayStr]
  );
  const myDoneToday = useMemo(
    () => (repTasks || []).filter((x) => x.status === "done" && x.date === todayStr && myMatches(x)).length,
    [repTasks, myMatches, todayStr]
  );

  const sorted = (orders || [])
    .slice()
    .sort((a, b) =>
      String(b.orderDate || "").localeCompare(String(a.orderDate || ""))
    );

  // Apply search + status filter
  const filtered = sorted.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [o.orderNo, o.customerName, o.projectName, o.customerPhone]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const startEdit = (order: SalesOrder) => {
    if (order.status === "completed" || order.status === "cancelled") {
      Alert.alert("⚠️", "لا يمكن تعديل طلب مكتمل أو ملغي");
      return;
    }
    setShowForm(false);
    setEditingOrder(order);
  };

  const handleCancelOrder = (order: SalesOrder) => {
    if (!CAN_CANCEL_STATUSES.has(order.status)) return;
    Alert.alert(
      "🚫 إلغاء الطلب",
      `هل أنت متأكد من إلغاء الطلب ${order.orderNo || order.id}؟`,
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "نعم، ألغِ",
          style: "destructive",
          onPress: async () => {
            const list: SalesOrder[] = (orders || []).map((o) =>
              o.id === order.id ? { ...o, status: "cancelled" as const } : o
            );
            try {
              await saveMutation.mutateAsync({ list });
              erp
                .addNotification(u, {
                  level: "info",
                  title: "🚫 إلغاء طلب " + order.orderNo,
                  body: `تم إلغاء الطلب ${order.orderNo || order.id} للمشروع ${order.projectName}`,
                })
                .catch(() => {});
            } catch (e) {
              Alert.alert("خطأ", "تعذر إلغاء الطلب");
            }
          },
        },
      ]
    );
  };

  const handleEditOrder = async (order: SalesOrder) => {
    const list = (orders || []).map((o) =>
      o.id === order.id ? { ...order, serverUpdatedAt: undefined } : o
    );
    try {
      await saveMutation.mutateAsync({
        list,
        stamps: { [order.id]: { updatedAt: true } },
      });
      erp
        .addNotification(u, {
          level: "info",
          title: "✏️ تعديل طلب " + order.orderNo,
          body: `تم تعديل الطلب ${order.orderNo || order.id} للمشروع ${order.projectName}`,
        })
        .catch(() => {});
    } catch (e) {
      Alert.alert("خطأ", "تعذر حفظ التعديلات");
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      {view === "portal" ? (
        <PortalRequestsPanel />
      ) : (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 20 }}
    >
      {/* Stats Cards */}
      <View className="flex-row gap-3 mb-4">
        <Card variant="default" className="flex-1 bg-orange-50">
          <Text className="text-3xl font-bold text-orange-600 text-center">
            {pendingCount}
          </Text>
          <Text className="text-orange-700 text-sm text-center mt-1">
            بانتظار الحسابات
          </Text>
        </Card>
        <Card variant="default" className="flex-1 bg-emerald-50">
          <Text className="text-3xl font-bold text-emerald-600 text-center">
            {approvedCount}
          </Text>
          <Text className="text-emerald-700 text-sm text-center mt-1">
            معتمد / مجدول
          </Text>
        </Card>
        <Card variant="default" className="flex-1 bg-sky-50">
          <Text className="text-3xl font-bold text-sky-600 text-center">
            {completedCount}
          </Text>
          <Text className="text-sky-700 text-sm text-center mt-1">
            مكتمل
          </Text>
        </Card>
      </View>

      {/* 🎯 مهامي اليوم — من مدير المناديب */}
      {(myActive.length > 0 || myDoneToday > 0) && (
        <View className="bg-white rounded-2xl border-2 border-blue-100 p-4 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-slate-800 font-bold text-base">🎯 مهامي اليوم</Text>
            <Text className="text-emerald-600 text-xs font-bold">✅ منجزة: {myDoneToday}</Text>
          </View>
          {myActive.length === 0 && (
            <Text className="text-slate-500 text-sm text-center py-2">
              🎉 أنهيت كل مهامك — بانتظار مهمة جديدة من المدير
            </Text>
          )}
          {myActive.map((x) => (
            <View key={x.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-slate-800 font-bold" numberOfLines={2}>
                  {x.status === "doing" ? "🔄" : "⏳"} {x.title}
                </Text>
                {x.priority === "high" && (
                  <Text className="text-red-500 text-xs font-bold">🔴 عالية</Text>
                )}
              </View>
              {!!x.client && <Text className="text-slate-500 text-xs mt-1">🏢 {x.client}</Text>}
              {!!x.details && <Text className="text-slate-400 text-xs mt-1">{x.details}</Text>}
              <View className="flex-row gap-2 mt-2">
                {x.status === "pending" && (
                  <TouchableOpacity
                    onPress={() => taskStatusMutation.mutate({ id: x.id, status: "doing" })}
                    disabled={taskStatusMutation.isPending}
                    className="bg-cyan-100 border border-cyan-300 rounded-lg px-4 py-2"
                  >
                    <Text className="text-cyan-700 font-bold text-sm">▶️ بدء التنفيذ</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert("إنهاء المهمة", `هل أنهيت "${x.title}"؟`, [
                      { text: "تراجع", style: "cancel" },
                      {
                        text: "نعم، تم",
                        onPress: () => taskStatusMutation.mutate({ id: x.id, status: "done" }),
                      },
                    ])
                  }
                  disabled={taskStatusMutation.isPending}
                  className="bg-emerald-100 border border-emerald-300 rounded-lg px-4 py-2"
                >
                  <Text className="text-emerald-700 font-bold text-sm">✅ تمت المهمة</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* New Order Button */}
      {!showForm && !editingOrder && (
        <Button
          title="➕ طلب جديد"
          onPress={() => setShowForm(true)}
          size="large"
          className="mb-4"
        />
      )}

      {/* Booking Form */}
      {(showForm || editingOrder) && (
        <View className="mb-4">
          <Button
            title="❌ إلغاء"
            onPress={() => {
              setShowForm(false);
              setEditingOrder(null);
            }}
            variant="secondary"
            size="small"
            className="mb-2"
          />
          <BookingForm
            key={editingOrder?.id || "new"}
            order={editingOrder ?? undefined}
            onSubmit={editingOrder ? handleEditOrder : handleCreateOrder}
            loading={saveMutation.isPending}
          />
        </View>
      )}

      {/* Search + Filters */}
      {!showForm && !editingOrder && (
        <View className="mb-4">
          <View className="bg-white rounded-2xl border-2 border-slate-200 px-4 py-3 mb-3 flex-row items-center">
            <Text className="text-slate-400 text-lg">🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث برقم الطلب، العميل، المشروع، الهاتف..."
              placeholderTextColor="#94A3B8"
              className="flex-1 mr-2 text-slate-800"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Text className="text-slate-400 text-lg">✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-row"
            contentContainerStyle={{ gap: 8 }}
          >
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-full border-2 ${
                  filter === f.key
                    ? "bg-orange-500 border-orange-500"
                    : "bg-white border-slate-200"
                }`}
              >
                <Text
                  className={`font-semibold text-sm ${
                    filter === f.key ? "text-white" : "text-slate-700"
                  }`}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Which list am I looking at? */}
      <View className="flex-row gap-2 mb-3">
        {(
          [
            ["orders", "📋 طلباتي"],
            ["portal", "📨 طلبات العملاء"],
          ] as const
        ).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setView(k)}
            className={`flex-1 rounded-full py-2.5 border-2 ${
              view === k
                ? "bg-orange-500 border-orange-500"
                : "bg-white border-slate-200"
            }`}
          >
            <Text
              className={`text-center font-semibold text-sm ${
                view === k ? "text-white" : "text-slate-700"
              }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Orders List */}
      <View>
        <Text className="text-xl font-bold text-slate-800 mb-3">طلباتي</Text>

        {isLoading ? (
          <Card variant="default">
            <Text className="text-slate-600 text-center py-4">
              جارِ التحميل...
            </Text>
          </Card>
        ) : filtered.length > 0 ? (
          filtered.map((order) => (
            <View key={order.id}>
              <OrderCard
                order={order}
                onPress={() =>
                  router.push({
                    pathname: "/(sales)/track",
                    params: { orderId: order.id },
                  })
                }
              />
              {!showForm && !editingOrder && (
                <View className="flex-row gap-2 mb-4 -mt-1">
                  {order.status !== "completed" &&
                    order.status !== "cancelled" && (
                      <TouchableOpacity
                        onPress={() => startEdit(order)}
                        className="flex-1 bg-sky-50 rounded-xl py-2 items-center border-2 border-sky-200"
                      >
                        <Text className="text-sky-600 font-bold text-sm">
                          ✏️ تعديل
                        </Text>
                      </TouchableOpacity>
                    )}
                  {CAN_CANCEL_STATUSES.has(order.status) && (
                    <TouchableOpacity
                      onPress={() => handleCancelOrder(order)}
                      className="flex-1 bg-red-50 rounded-xl py-2 items-center border-2 border-red-200"
                    >
                      <Text className="text-red-600 font-bold text-sm">
                        🚫 إلغاء الطلب
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))
        ) : (
          <Card variant="default">
            <Text className="text-slate-600 text-center py-8">
              {search || filter !== "all"
                ? "لا توجد طلبات مطابقة"
                : "لا توجد طلبات حالياً"}
            </Text>
          </Card>
        )}
      </View>
    </ScrollView>
      )}
    </View>
  );
}
