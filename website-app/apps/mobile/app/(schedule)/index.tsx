/**
 * Schedule Manager Home (مسئول الجدول)
 * Flow: sales rep → accountant approval → SCHEDULE OFFICER approves the daily
 * schedule (adds customers, reorders, brings a pour forward/later) → the
 * schedule is released to all departments → operations dispatches trucks.
 *
 * The schedule lives in the SAME `customers` collection as the website
 * Schedule module; approved orders get `status: "scheduled"` exactly like the
 * website's "استيراد طلبات الجدول" action.
 */

import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
} from "react-native";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { erp, dataUsername } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useRouter } from "expo-router";
import { ELEMENT_TYPES, BLOCK_PRODUCTS, INSULATION_TYPES, BookingForm, type SalesOrder } from "@/components/sales/BookingForm";
import CalendarPicker from "@/components/ui/CalendarPicker";

const ELEMENT_LABELS = Object.fromEntries(ELEMENT_TYPES.map((e) => [e.value, e.label]));
const blockProductLabel = (v?: string) =>
  BLOCK_PRODUCTS.find((p) => p.value === v)?.label || v || "";
const insulationLabel = (v?: string) =>
  INSULATION_TYPES.find((t) => t.value === v)?.label || v || "";

const TODAY = new Date().toISOString().split("T")[0];

/** Warn when two pours are closer than this many minutes. */
const CONFLICT_MINS = 45;

interface ScheduleCustomer {
  id?: string;
  code: string;
  name: string;
  phone: string;
  project: string;
  orderType: string;
  elementType: string;
  paymentType: string;
  category: string;
  priority: number;
  qty: number;
  concreteType: string;
  slump: string;
  blockProduct?: string;
  blockDimensions?: string;
  blockInsulated?: boolean;
  insulationType?: string;
  geo: string;
  locationName: string;
  ignoreRestrictions: boolean;
  time: string;
  orderId?: string;
  /** Pour day (YYYY-MM-DD) — copied from the order. */
  date?: string;
}

const fmtTime = (t: string) => (t || "").slice(0, 5) || "08:00";
const timeToMins = (t: string) => {
  const [h, m] = fmtTime(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const shiftTime = (t: string, mins: number) => {
  const [h, m] = fmtTime(t).split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  d.setMinutes(d.getMinutes() + mins);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Build a schedule record carrying the FULL data the sales rep entered. */
const orderToCustomer = (order: SalesOrder): ScheduleCustomer => ({
  code: order.id || `ORD-${Date.now()}`,
  name: order.customerName,
  phone: order.customerPhone,
  project: order.projectName,
  orderType: order.orderType,
  elementType: order.elementType || "foundation",
  paymentType: order.debtStatus === "clear" ? "cash" : "credit",
  category: "A",
  priority: parseInt(order.id?.slice(-1) || "5", 10),
  qty: order.quantity || 0,
  concreteType: order.concreteType || "C30",
  slump: order.slump || "12",
  blockProduct: order.blockProduct,
  blockDimensions: order.blockDimensions,
  blockInsulated: order.blockInsulated,
  insulationType: order.insulationType,
  geo: order.locationCoords || "",
  locationName: order.projectLocation || "",
  ignoreRestrictions: false,
  time: order.orderTime || "08:00",
  orderId: order.id,
  date: order.orderDate || TODAY,
});

/** Human-readable pour spec (concrete or blocks) for a schedule record. */
const pourSpec = (c: ScheduleCustomer): string => {
  if (c.orderType === "blocks") {
    if (c.blockProduct) return `🧱 ${blockProductLabel(c.blockProduct)}`;
    if (c.blockDimensions) return `🧱 ${c.blockDimensions} سم`;
    return "🧱 بلوك";
  }
  return `🏗️ ${c.concreteType || "C30"}${c.slump ? ` · Slump ${c.slump} سم` : ""}`;
};

export default function ScheduleMgrHome() {
  const { user, logout } = useAuthStore();
  const u = dataUsername(user);
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"queue" | "board">("queue");
  const [day, setDay] = useState<string>(TODAY);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["schedmgr-all", u],
    queryFn: async () => {
      const [orders, customers] = await Promise.all([
        erp.loadOrders(u).catch(() => []),
        erp.loadCustomers(u).catch(() => []),
      ]);
      return { orders: (orders || []) as SalesOrder[], customers: (customers || []) as ScheduleCustomer[] };
    },
    refetchInterval: 30000,
  });

  const orders = data?.orders || [];
  const customers = data?.customers || [];

  // Orders approved by the accountant but not yet in the schedule
  const queueAll = orders.filter(
    (o) => o.accountStatus === "approved" && o.status !== "scheduled" && o.debtStatus !== "blocked"
  );
  const queue = queueAll.filter((o) => !day || o.orderDate === day || !o.orderDate);

  // Available days: next 7 days + any order dates
  const dayOptions = [
    ...new Set([
      ...Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d.toISOString().split("T")[0];
      }),
      ...orders.map((o) => o.orderDate || "").filter(Boolean),
    ]),
  ].sort();

  const saveOrders = useMutation({
    mutationFn: async (list: SalesOrder[]) => {
      const ok = await erp.saveOrders(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedmgr-all", u] }),
  });

  const saveCustomers = useMutation({
    mutationFn: async (list: ScheduleCustomer[]) => {
      const ok = await erp.saveCustomers(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedmgr-all", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["schedmgr-all", u] });
    setRefreshing(false);
  }, [qc, u]);

  const notify = (title: string, body: string) =>
    erp.addNotification(u, { level: "info", title, body }).catch(() => {});

  // Add one approved order to the schedule (like the website "استيراد الجدول")
  const addToSchedule = async (order: SalesOrder) => {
    const cust = orderToCustomer(order);
    await saveCustomers.mutateAsync([...customers, cust]);
    await saveOrders.mutateAsync(
      orders.map((o) => (o.id === order.id ? { ...o, status: "scheduled" as const } : o))
    );
    await notify(`📅 تمت إضافة ${order.customerName} للجدول`, `${order.projectName} · ${fmtTime(order.orderTime)}`);
  };

  // Day-filtered board (missing date = treated as today for legacy rows)
  const boardCustomers = customers.filter((c) => (c.date || TODAY) === day);

  const sortedCustomers = [...boardCustomers].sort((a, b) =>
    fmtTime(a.time).localeCompare(fmtTime(b.time))
  );

  // Reorder a customer up/down (إعادة الترتيب) within the selected day
  const move = (index: number, dir: -1 | 1) => {
    const next = [...boardCustomers];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const ids = new Set(next.map((c) => c.code));
    const global = customers
      .map((c) => (ids.has(c.code) ? next.shift()! : c));
    saveCustomers.mutate(global);
  };

  // تبكير / تأخير صبة (shift the pour time)
  const shiftPour = (index: number, mins: number) => {
    const next = [...boardCustomers];
    const c = next[index];
    const updated = { ...c, time: shiftTime(c.time, mins) };
    saveCustomers.mutate(customers.map((x) => (x.code === c.code ? updated : x)));
  };

  const removeFromBoard = (index: number) => {
    const c = boardCustomers[index];
    Alert.alert("إزالة", "إزالة هذا العميل من الجدول؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "إزالة",
        style: "destructive",
        onPress: () => saveCustomers.mutate(customers.filter((x) => x.code !== c.code)),
      },
    ]);
  };

  // Detect time conflicts (two pours within CONFLICT_MINS of each other)
  const conflicts = sortedCustomers
    .map((c, i) => {
      const clash = sortedCustomers.find(
        (o, j) => j !== i && Math.abs(timeToMins(fmtTime(o.time)) - timeToMins(fmtTime(c.time))) < CONFLICT_MINS
      );
      return clash ? { code: c.code, name: c.name, time: fmtTime(c.time), withName: clash.name } : null;
    })
    .filter(Boolean) as { code: string; name: string; time: string; withName: string }[];

  // اعتماد الجدول ونشره لباقي الأقسام
  const approveSchedule = async () => {    if (queue.length === 0 && customers.length === 0) {
      Alert.alert("لا يوجد جدول", "لا توجد طلبات لاعتمادها بعد");
      return;
    }
    // Add any remaining approved orders to the schedule too
    let nextCustomers = [...customers];
    const pendingOrders = orders.filter(
      (o) => o.accountStatus === "approved" && o.status !== "scheduled" && o.debtStatus !== "blocked"
    );
    for (const o of pendingOrders) {
      if (nextCustomers.some((c) => c.code === o.id)) continue;
      nextCustomers.push(orderToCustomer(o));
    }
    await saveCustomers.mutateAsync(nextCustomers);
    const ids = new Set(nextCustomers.map((c) => c.code).filter(Boolean));
    await saveOrders.mutateAsync(
      orders.map((o) =>
        ids.has(o.id) ? { ...o, status: "scheduled" as const } : o
      )
    );
    await notify(
      `✅ تم اعتماد الجدول (${nextCustomers.length} صبة)`,
      "تم نشر الجدول لباقي الأقسام — يبدأ العمل الآن"
    );
    Alert.alert("تم الاعتماد", `تم نشر الجدول (${nextCustomers.length} صبة) لجميع الأقسام ✓`);
  };

  // تسجيل طلب جديد مباشرة من فريق الجدول (قسم المبيعات) — السداد يظهر لدى المحاسب
  const createOrder = async (order: SalesOrder) => {
    const withDebt = {
      ...order,
      debtStatus:
        (order.remainingAmount ?? 0) > 0 ? ("has_debt" as const) : ("clear" as const),
    };
    await saveOrders.mutateAsync([...orders, withDebt]);
    if (order.paidAmount && order.paidAmount > 0) {
      try {
        const payments = (await erp.loadPayments(u).catch(() => [])) || [];
        await erp.savePayments(u, [
          ...payments,
          {
            id: "p-" + Date.now().toString(36),
            date: new Date().toISOString().split("T")[0],
            client: order.customerName,
            orderNo: order.orderNo || order.id,
            amount: order.paidAmount,
            method: "bank",
            status: "paid",
            note: "سداد عند التسجيل عبر فريق الجدول",
          },        ]);
      } catch {}
    }
    await notify(
      "🆕 طلب جديد من فريق الجدول",
      `${order.customerName} · ${order.projectName} · ${order.quantity} ${order.orderType === "concrete" ? "م³" : "بلوك"}`
    );
    setShowNewOrder(false);
    Alert.alert("تم", "تم تسجيل الطلب وسيظهر لدى المحاسب للمراجعة ✓");
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header: back + logout */}
      <View className="bg-teal-600 px-4 pt-12 pb-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <TouchableOpacity
              onPress={() => router.replace("/(dashboard)" as any)}
              className="bg-white/15 rounded-lg px-3 py-2"
            >
              <Text className="text-white font-bold">→ رجوع</Text>
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-white font-bold text-lg">📋 مسئول الجدول</Text>
              <Text className="text-teal-100 text-xs" numberOfLines={1}>
                {user?.fullName} · @{u}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => logout()} className="bg-white/15 rounded-lg px-3 py-2">
            <Text className="text-white font-bold">🚪 خروج</Text>
          </TouchableOpacity>
        </View>
      </View>

    <ScrollView
      className="flex-1"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
    >
      {/* New order shortcut (schedule team = sales dept) */}
      <Button
        title="🆕 طلب جديد"
        variant="primary"
        size="large"
        className="mb-4"
        onPress={() => setShowNewOrder(true)}
      />

      {/* KPIs */}
      <View className="flex-row gap-3 mb-4">
        <Card variant="default" className="flex-1 bg-teal-50">
          <Text className="text-3xl font-bold text-teal-600 text-center">{queue.length}</Text>
          <Text className="text-teal-700 text-sm text-center mt-1">بانتظار الجدولة</Text>
        </Card>
        <Card variant="default" className="flex-1 bg-sky-50">
          <Text className="text-3xl font-bold text-sky-600 text-center">{sortedCustomers.length}</Text>
          <Text className="text-sky-700 text-sm text-center mt-1">في الجدول</Text>
        </Card>
        <Card variant="default" className="flex-1 bg-emerald-50">
          <Text className="text-3xl font-bold text-emerald-600 text-center">
            {orders.filter((o) => o.status === "scheduled").length}
          </Text>
          <Text className="text-emerald-700 text-sm text-center mt-1">معتمد</Text>
        </Card>
      </View>

      {/* Day picker */}
      <Card variant="default" className="mb-4">
        <Text className="text-slate-600 font-semibold mb-2">📅 يوم الصب</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pr-2">
            {dayOptions.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDay(d)}
                className={`px-4 py-2 rounded-full border-2 ${
                  day === d
                    ? "bg-teal-500 border-teal-500"
                    : "bg-white border-slate-200"
                }`}
              >
                <Text
                  className={`font-bold text-sm ${
                    day === d ? "text-white" : "text-slate-700"
                  }`}
                >
                  {d === TODAY
                    ? "اليوم"
                    : new Date(d + "T12:00:00").toLocaleDateString("ar-EG", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setShowCalendar(true)}
              className="px-4 py-2 rounded-full border-2 border-teal-300 bg-teal-50"
            >
              <Text className="font-bold text-sm text-teal-700">🗓️ تاريخ آخر</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Card>

      {/* Conflicts warning */}
      {tab === "board" && conflicts.length > 0 && (
        <Card variant="default" className="mb-4 bg-red-50 border-red-200">
          <Text className="font-bold text-red-700 mb-1">
            ⚠️ تعارض مواعيد في هذا اليوم
          </Text>
          {[...new Map(conflicts.map((c) => [c.code, c])).values()].map((c) => (
            <Text key={c.code} className="text-red-600 text-sm">
              • {c.name} الساعة {c.time} يتعارض مع {c.withName} (نفس الموعد تقريباً)
            </Text>
          ))}
          <Text className="text-red-500 text-xs mt-1">
            المسافة الزمنية بين الصبات أقل من {CONFLICT_MINS} دقيقة — راجع التوقيتات أو بادر بالتبكير/التأخير.
          </Text>
        </Card>
      )}

      {/* Tabs */}
      <View className="flex-row gap-2 mb-4">
        {(
          [
            ["queue", "⏳ طلبات موافقة المحاسب"],
            ["board", "📋 الجدول والترتيب"],
          ] as const
        ).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setTab(k)}
            className={`px-4 py-2 rounded-full ${
              tab === k ? "bg-teal-500" : "bg-white border border-slate-200"
            }`}
          >
            <Text className={`font-bold text-sm ${tab === k ? "text-white" : "text-slate-600"}`}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "queue" ? (
        <View>
          <Text className="text-slate-700 font-bold mb-3">
            طلبات وافق عليها المحاسب — اختر ما يدخل الجدول
          </Text>
          {isLoading ? (
            <Card><Text className="text-slate-600 text-center py-4">جارِ التحميل...</Text></Card>
          ) : queue.length === 0 ? (
            <Card><Text className="text-slate-600 text-center py-8">لا توجد طلبات بانتظار الجدولة</Text></Card>
          ) : (
            queue.map((order) => (
              <Card key={order.id} variant="elevated" className="mb-3">
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1">
                    <Text className="font-bold text-slate-800">
                      {order.customerName} · {order.customerPhone}
                    </Text>
                    <Text className="text-slate-500 text-sm mt-0.5">
                      {order.orderNo || order.id} · {order.projectName}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="bg-teal-100 text-teal-700 font-bold px-2.5 py-1 rounded-full text-sm">
                      🕐 {fmtTime(order.orderTime)}
                    </Text>
                    <Text className="text-slate-400 text-xs">{order.orderDate}</Text>
                  </View>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-slate-600 text-sm">نوع العنصر</Text>
                  <Text className="text-slate-800 font-semibold text-sm">
                    {ELEMENT_LABELS[order.elementType] ?? order.elementType ?? "—"}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-slate-600 text-sm">الكمية</Text>
                  <Text className="text-slate-800 font-semibold text-sm">
                    {order.quantity} {order.orderType === "concrete" ? "م³" : "بلوك"}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-slate-600 text-sm">المواصفات</Text>
                  <Text className="text-slate-800 font-semibold text-sm flex-1 text-right">
                    {order.orderType === "blocks"
                      ? order.blockProduct
                        ? `🧱 ${blockProductLabel(order.blockProduct)}`
                        : order.blockDimensions
                          ? `🧱 ${order.blockDimensions} سم`
                          : "🧱 بلوك"
                      : `🏗️ ${order.concreteType || "C30"}${order.slump ? ` · Slump ${order.slump} سم` : ""}`}
                    {order.orderType === "blocks" && order.blockInsulated
                      ? order.insulationType
                        ? ` · معزول ${insulationLabel(order.insulationType)}`
                        : " · معزول"
                      : ""}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-slate-600 text-sm">الموقع</Text>
                  <Text className="text-slate-800 font-semibold text-sm flex-1 text-right">
                    {order.projectLocation || order.locationCoords || "—"}
                  </Text>
                </View>
                <Button
                  title="➕ أضف للجدول"
                  variant="primary"
                  size="small"
                  loading={saveCustomers.isPending || saveOrders.isPending}
                  onPress={() => addToSchedule(order)}
                />
              </Card>
            ))
          )}
        </View>
      ) : (
        <View>
          <Button
            title="✅ اعتماد الجدول ونشره لجميع الأقسام"
            variant="success"
            size="large"
            className="mb-4"
            loading={saveCustomers.isPending || saveOrders.isPending}
            onPress={approveSchedule}
          />
          {isLoading ? (
            <Card><Text className="text-slate-600 text-center py-4">جارِ التحميل...</Text></Card>
          ) : sortedCustomers.length === 0 ? (
            <Card><Text className="text-slate-600 text-center py-8">الجدول فارغ — أضف طلبات من التبويب الأول</Text></Card>
          ) : (
            sortedCustomers.map((c, i) => (
              <Card key={c.code} variant="elevated" className="mb-3">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Text className="text-slate-400 font-bold">#{i + 1}</Text>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800">
                        {c.name}{c.phone ? ` · ${c.phone}` : ""}
                      </Text>
                      <Text className="text-slate-500 text-sm">{c.project}</Text>
                    </View>
                  </View>
                  <Text className="bg-teal-100 text-teal-700 font-bold px-3 py-1.5 rounded-full text-sm">
                    🕐 {fmtTime(c.time)}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-slate-600 text-sm">المواصفات</Text>
                  <Text className="text-slate-800 font-semibold text-sm flex-1 text-right">
                    {pourSpec(c)}
                    {c.orderType === "blocks" && c.blockInsulated
                      ? c.insulationType
                        ? ` · معزول ${insulationLabel(c.insulationType)}`
                        : " · معزول"
                      : ""}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-slate-600 text-sm">الكمية</Text>
                  <Text className="text-slate-800 font-semibold text-sm">
                    {c.qty} {c.orderType === "concrete" ? "م³" : "بلوك"}
                    {c.elementType ? ` · ${ELEMENT_LABELS[c.elementType] ?? c.elementType}` : ""}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-slate-600 text-sm">الموقع</Text>
                  <Text className="text-slate-800 font-semibold text-sm flex-1 text-right">
                    {c.locationName || c.geo || "—"}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2 mb-1">
                  <TouchableOpacity
                    onPress={() => move(i, -1)}
                    disabled={i === 0}
                    className="flex-1 bg-slate-100 rounded-xl py-2 items-center disabled:opacity-40"
                  >
                    <Text className="text-slate-700 font-bold">⬆️ تقديم</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => move(i, 1)}
                    disabled={i === sortedCustomers.length - 1}
                    className="flex-1 bg-slate-100 rounded-xl py-2 items-center disabled:opacity-40"
                  >
                    <Text className="text-slate-700 font-bold">⬇️ تأخير</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => shiftPour(i, -30)}
                    className="flex-1 bg-amber-100 rounded-xl py-2 items-center"
                  >
                    <Text className="text-amber-700 font-bold">⏪ تبكير ٣٠د</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => shiftPour(i, 30)}
                    className="flex-1 bg-orange-100 rounded-xl py-2 items-center"
                  >
                    <Text className="text-orange-700 font-bold">⏩ تأخير ٣٠د</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => removeFromBoard(i)} className="py-1">
                  <Text className="text-red-500 text-xs font-bold text-center">حذف من الجدول</Text>
                </TouchableOpacity>
              </Card>
            ))
          )}
        </View>
      )}

      <CalendarPicker
        visible={showCalendar}
        value={day}
        minDate={new Date().toISOString().split("T")[0]}
        onChange={(d) => {
          setDay(d);
          setShowCalendar(false);
        }}
        onClose={() => setShowCalendar(false)}
      />
    </ScrollView>

    {/* 🆕 New order modal (BookingForm with payment capture) */}
    <Modal visible={showNewOrder} animationType="slide" onRequestClose={() => setShowNewOrder(false)}>
      <View className="flex-1 bg-slate-50">
        <View className="bg-teal-600 px-4 pt-12 pb-3">
          <View className="flex-row items-center justify-between">
            <TouchableOpacity onPress={() => setShowNewOrder(false)} className="bg-white/15 rounded-lg px-3 py-2">
              <Text className="text-white font-bold">✕ إلغاء</Text>
            </TouchableOpacity>
            <Text className="text-white font-bold text-lg">🆕 تسجيل طلب جديد</Text>
            <View style={{ width: 64 }} />
          </View>
        </View>
        <BookingForm
          onSubmit={createOrder}
          loading={saveOrders.isPending}
          showPayment
        />
      </View>
    </Modal>
    </View>
  );
}
