/**
 * Accountant Home Screen (شاشة المحاسب)
 * Full ERP for the accountant in one place:
 *   1) 📋 الطلبات      — order approval (approve / reject / postpone + comment)
 *   2) 🧾 فواتير العملاء — auto-generated invoices from APPROVED orders
 *   3) 💰 التحصيلات    — client payments (mada / bank / cash) tied to orders
 *   4) 🧾 فواتير الموردين — supplier purchase orders
 *   5) 👥 العملاء      — approve customers brought by the sales rep (credit hold)
 * Reads/writes the SAME Firestore collections as the website (orders, payments,
 * purchaseOrders, customers) so the owner sees the accountant's work live.
 */

import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
} from "react-native";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { erp, dataUsername } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { ELEMENT_TYPES, type SalesOrder } from "@/components/sales/BookingForm";
import { playAlertSound } from "@/lib/sound";

const ELEMENT_LABELS = Object.fromEntries(ELEMENT_TYPES.map((e) => [e.value, e.label]));

/** Unit prices — identical to the website EInvoice component. */
const UNIT_PRICES: Record<string, number> = {
  "2000": 2100,
  "2500": 2400,
  "3000": 2700,
  "3500": 3000,
  "4000": 3300,
  "5000": 4000,
};
const BLOCK_PRICE = 5;
const VAT_RATE = 15;

interface Payment {
  id: string;
  date: string;
  client: string;
  orderNo: string;
  amount: number;
  method: string;
  status: "paid" | "partial" | "pending";
  note: string;
}

interface PO {
  id: string;
  date: string;
  material: string;
  qty: number;
  unit: string;
  supplier: string;
  unitPrice: number;
  total: number;
  status: "open" | "delivered";
  reason: string;
}

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  creditHold?: boolean;
  createdAt: string;
}

const ACCOUNT_META: Record<
  string,
  { label: string; chip: string; text: string }
> = {
  pending: {
    label: "⏳ بانتظار المراجعة",
    chip: "bg-orange-100",
    text: "text-orange-700",
  },
  approved: {
    label: "✅ موافق عليه",
    chip: "bg-emerald-100",
    text: "text-emerald-700",
  },
  rejected: {
    label: "❌ مرفوض",
    chip: "bg-red-100",
    text: "text-red-700",
  },
  postponed: {
    label: "⏸️ مؤجل",
    chip: "bg-yellow-100",
    text: "text-yellow-700",
  },
};

type Decision = "approved" | "rejected" | "postponed";

function fmtServerTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function unitPriceFor(o: SalesOrder): number {
  return o.orderType === "concrete"
    ? UNIT_PRICES[o.concreteType] ?? UNIT_PRICES["3000"]
    : BLOCK_PRICE;
}

const TAB_KEYS = [
  { key: "orders", label: "📋 الطلبات" },
  { key: "invoices", label: "🧾 فواتير العملاء" },
  { key: "collections", label: "💰 التحصيلات" },
  { key: "suppliers", label: "🧾 فواتير الموردين" },
  { key: "customers", label: "👥 العملاء" },
  { key: "statement", label: "📊 كشف حساب" },
] as const;

type TabKey = (typeof TAB_KEYS)[number]["key"];

const inputCls =
  "bg-slate-50 rounded-2xl border-2 border-slate-200 px-4 py-3 text-lg text-slate-800";

export default function AccountantHomeScreen() {
  const { user } = useAuthStore();
  const u = dataUsername(user);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "decided">("all");
  const [tab, setTab] = useState<TabKey>("orders");

  // New-customer approval
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // Collection form
  const [payForm, setPayForm] = useState({
    client: "",
    orderNo: "",
    amount: "",
    method: "bank" as Payment["method"] extends string ? string : never,
    note: "",
  });
  const [editingPayId, setEditingPayId] = useState<string | null>(null);

  // Customer statement
  const [stmtQuery, setStmtQuery] = useState("");
  const [stmtCustomer, setStmtCustomer] = useState<string | null>(null);

  // Supplier invoice form
  const [poForm, setPoForm] = useState({
    material: "",
    supplier: "",
    qty: "",
    unit: "t",
    unitPrice: "",
  });

  const { data: orders, isLoading } = useQuery<SalesOrder[]>({
    queryKey: ["sales-orders", u],
    queryFn: async () => (await erp.loadOrders(u)) || [],
    refetchInterval: 30000,
  });

  const { data: payments } = useQuery<Payment[]>({
    queryKey: ["payments", u],
    queryFn: async () => (await erp.loadPayments(u)) || [],
  });

  const { data: pos } = useQuery<PO[]>({
    queryKey: ["purchase-orders", u],
    queryFn: async () => (await erp.loadPurchaseOrders(u)) || [],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["customers", u],
    queryFn: async () => (await erp.loadCustomers(u)) || [],
  });

  // Beep when a NEW pending order arrives from a sales rep
  const knownIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!orders) return;
    const current = new Set<string>();
    for (const o of orders) {
      current.add(o.id);
      if (o.accountStatus === "pending" && !knownIds.current.has(o.id)) {
        playAlertSound().catch(() => {});
      }
    }
    knownIds.current = current;
  }, [orders]);

  const saveMutation = useMutation({
    mutationFn: async (args: { list: SalesOrder[]; stamps?: Record<string, { createdAt?: boolean; approvedAt?: boolean; updatedAt?: boolean }> }) => {
      const ok = await erp.saveOrders(u, args.list, args.stamps);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders", u] });
    },
  });

  const savePaymentsMutation = useMutation({
    mutationFn: async (list: Payment[]) => {
      const ok = await erp.savePayments(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments", u] }),
  });

  const savePosMutation = useMutation({
    mutationFn: async (list: PO[]) => {
      const ok = await erp.savePurchaseOrders(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders", u] }),
  });

  const saveCustomersMutation = useMutation({
    mutationFn: async (list: Customer[]) => {
      const ok = await erp.saveCustomers(u, list);
      if (!ok) throw new Error("مساحة التخزين ممتلئة");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers", u] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sales-orders", u] }),
      queryClient.invalidateQueries({ queryKey: ["payments", u] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", u] }),
      queryClient.invalidateQueries({ queryKey: ["customers", u] }),
    ]);
    setRefreshing(false);
  }, [queryClient, u]);

  // Approve / reject / postpone with an optional comment
  const handleDecide = async (order: SalesOrder, decision: Decision) => {
    const comment = (comments[order.id] || "").trim();
    const list = (orders || []).map((o) =>
      o.id === order.id
        ? {
            ...o,
            accountant: user?.fullName || user?.id || "المحاسب",
            accountStatus: decision,
            accountantDecision:
              decision === "approved"
                ? ("execute" as const)
                : decision === "postponed"
                  ? ("postpone" as const)
                  : ("cancel" as const),
            accountComment: comment,
          }
        : o
    );
    await saveMutation.mutateAsync({
      list,
      stamps: { [order.id]: { approvedAt: true } },
    });
    setComments((c) => ({ ...c, [order.id]: "" }));
    setSelectedId(null);
    erp
      .addNotification(u, {
        level:
          decision === "approved"
            ? "success"
            : decision === "rejected"
              ? "error"
              : "warning",
        title:
          decision === "approved"
            ? "✅ موافقة الحسابات " + (order.orderNo || order.id)
            : decision === "rejected"
              ? "❌ رفض الحسابات " + (order.orderNo || order.id)
              : "⏸️ تأجيل الطلب " + (order.orderNo || order.id),
        body: `${order.customerName} · ${order.projectName}${comment ? " · " + comment : ""}`,
      })
      .catch(() => {});
  };

  // ===== Collections =====
  const addPayment = async () => {
    const amount = Number(payForm.amount);
    if (!payForm.client || !amount || amount <= 0) return;
    if (editingPayId) {
      const list = (payments || []).map((p) =>
        p.id === editingPayId
          ? {
              ...p,
              client: payForm.client.trim(),
              orderNo: payForm.orderNo.trim() || "—",
              amount,
              method: payForm.method,
              note: payForm.note.trim(),
            }
          : p
      );
      await savePaymentsMutation.mutateAsync(list);
      setEditingPayId(null);
      setPayForm({ client: "", orderNo: "", amount: "", method: "bank", note: "" });
      return;
    }
    const rec: Payment = {
      id: "p-" + Date.now().toString(36),
      date: new Date().toISOString().split("T")[0],
      client: payForm.client.trim(),
      orderNo: payForm.orderNo.trim() || "—",
      amount,
      method: payForm.method,
      status: "paid",
      note: payForm.note.trim(),
    };
    await savePaymentsMutation.mutateAsync([...(payments || []), rec]);
    setPayForm({ client: "", orderNo: "", amount: "", method: "bank", note: "" });
  };

  const startEditPayment = (p: Payment) => {
    setEditingPayId(p.id);
    setPayForm({
      client: p.client,
      orderNo: p.orderNo === "—" ? "" : p.orderNo,
      amount: String(p.amount),
      method: p.method,
      note: p.note || "",
    });
  };

  const deletePayment = (p: Payment) => {
    Alert.alert(
      "🗑️ حذف التحصيل",
      `هل أنت متأكد من حذف تحصيل ${p.client} (${Number(p.amount).toLocaleString("ar-EG")} ريال)؟`,
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "نعم، احذف",
          style: "destructive",
          onPress: async () => {
            await savePaymentsMutation.mutateAsync(
              (payments || []).filter((x) => x.id !== p.id)
            );
            if (editingPayId === p.id) {
              setEditingPayId(null);
              setPayForm({ client: "", orderNo: "", amount: "", method: "bank", note: "" });
            }
          },
        },
      ]
    );
  };

  // ===== Share invoice via WhatsApp / messages =====
  const shareInvoice = async (o: SalesOrder) => {
    const price = unitPriceFor(o);
    const qty = Number(o.quantity) || 0;
    const totalExVat = price * qty;
    const vat = totalExVat * (VAT_RATE / 100);
    const total = totalExVat + vat;
    const invNo = "INV-" + (o.orderNo || o.id).replace("ORD-", "").toUpperCase();
    const lines = [
      `🧾 *فاتورة ${invNo}*`,
      `شركة الخليج للخرسانة الجاهزة`,
      `━━━━━━━━━━━━━━━━━`,
      `العميل: ${o.customerName} (${o.customerCode || "—"})`,
      `المشروع: ${o.projectName}`,
      `الصنف: ${o.orderType === "concrete" ? `خرسانة ${o.concreteType} psi` : "بلوك"}`,
      `الكمية: ${qty} ${o.orderType === "concrete" ? "م³" : "بلوك"} × ${price} ريال`,
      `الإجمالي قبل الضريبة: ${totalExVat.toLocaleString("ar-EG")} ريال`,
      `ضريبة القيمة المضافة (${VAT_RATE}%): ${vat.toLocaleString("ar-EG")} ريال`,
      `━━━━━━━━━━━━━━━━━`,
      `*الإجمالي: ${total.toLocaleString("ar-EG")} ريال*`,
      `التاريخ: ${o.orderDate}`,
    ];
    try {
      await Share.share({ message: lines.join("\n") });
    } catch (e) {
      /* user cancelled */
    }
  };

  // ===== Supplier invoices =====
  const addPO = async () => {
    const qty = Number(poForm.qty);
    const unitPrice = Number(poForm.unitPrice);
    if (!poForm.material || !qty || qty <= 0) return;
    const rec: PO = {
      id: "po-" + Date.now().toString(36),
      date: new Date().toISOString().split("T")[0],
      material: poForm.material.trim(),
      qty,
      unit: poForm.unit || "t",
      supplier: poForm.supplier.trim() || "—",
      unitPrice,
      total: qty * unitPrice,
      status: "open",
      reason: "",
    };
    await savePosMutation.mutateAsync([...(pos || []), rec]);
    setPoForm({ material: "", supplier: "", qty: "", unit: "t", unitPrice: "" });
  };

  // ===== Customer approval =====
  const nextCustomerCode = () => {
    const n = (customers || []).reduce(
      (m, c) => Math.max(m, parseInt((c.code || "C-0000").replace("C-", ""), 10) || 0),
      0
    );
    return "C-" + String(n + 1).padStart(4, "0");
  };

  const addCustomer = async () => {
    if (!customerForm.name.trim() || !customerForm.phone.trim()) return;
    const c: Customer = {
      id: "c-" + Date.now().toString(36),
      code: nextCustomerCode(),
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim(),
      address: customerForm.address.trim(),
      createdAt: new Date().toISOString(),
    };
    await saveCustomersMutation.mutateAsync([...(customers || []), c]);
    setCustomerForm({ name: "", phone: "", address: "" });
    setShowAddCustomer(false);
  };

  const toggleCreditHold = async (c: Customer) => {
    const list = (customers || []).map((x) =>
      x.id === c.id ? { ...x, creditHold: !x.creditHold } : x
    );
    await saveCustomersMutation.mutateAsync(list);
  };

  // New customers brought by sales reps but not yet in the customers list
  const pendingCustomers = (orders || [])
    .map((o) => ({
      name: String(o.customerName || "").trim(),
      phone: String(o.customerPhone || "").trim(),
    }))
    .filter((c) => c.name)
    .filter(
      (c, i, arr) =>
        arr.findIndex((x) => x.name === c.name) === i
    )
    .filter(
      (c) =>
        !(customers || []).some(
          (x) => x.name === c.name || x.phone === c.phone
        )
    );

  const approvePendingCustomer = async (name: string, phone: string) => {
    const c: Customer = {
      id: "c-" + Date.now().toString(36),
      code: nextCustomerCode(),
      name,
      phone: phone || "—",
      address: "",
      createdAt: new Date().toISOString(),
    };
    await saveCustomersMutation.mutateAsync([...(customers || []), c]);
  };

  const rejectPendingCustomer = async (name: string, phone: string) => {
    const list = (orders || []).map((o) => {
      const matches =
        String(o.customerName || "").trim() === name &&
        String(o.customerPhone || "").trim() === phone;
      return matches
        ? { ...o, debtStatus: ("blocked" as const), accountComment: "تم حظر العميل من الحسابات" }
        : o;
    });
    await saveMutation.mutateAsync({ list });
  };

  const stats = {
    pending: orders?.filter((o) => o.accountStatus === "pending").length ?? 0,
    approved: orders?.filter((o) => o.accountStatus === "approved").length ?? 0,
    rejected:
      orders?.filter(
        (o) => o.accountStatus === "rejected" || o.accountStatus === "postponed"
      ).length ?? 0,
  };

  const approvedOrders = (orders || []).filter((o) => o.accountStatus === "approved");

  const totalCollected =
    payments?.filter((p) => p.status !== "pending").reduce((s, p) => s + (Number(p.amount) || 0), 0) ?? 0;
  const openPOs = pos?.filter((p) => p.status === "open").length ?? 0;

  // ===== Customer statement =====
  const stmtNames = [...new Set(
    (orders || [])
      .map((o) => String(o.customerName || "").trim())
      .filter(Boolean)
      .concat((payments || []).map((p) => String(p.client || "").trim()).filter(Boolean))
  )].sort((a, b) => a.localeCompare(b, "ar"));
  const stmtFilteredNames = stmtNames.filter((n) =>
    n.toLowerCase().includes(stmtQuery.trim().toLowerCase())
  );
  const stmtOrders = stmtCustomer
    ? (orders || []).filter(
        (o) => o.customerName === stmtCustomer && o.accountStatus === "approved"
      )
    : [];
  const stmtPayments = stmtCustomer
    ? (payments || []).filter((p) => p.client === stmtCustomer && p.status !== "pending")
    : [];
  const stmtBilled = stmtOrders.reduce(
    (s, o) => s + unitPriceFor(o) * (Number(o.quantity) || 0),
    0
  );
  const stmtVat = stmtBilled * (VAT_RATE / 100);
  const stmtPaid = stmtPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const stmtOutstanding = stmtBilled + stmtVat - stmtPaid;

  const filtered = (orders || [])
    .slice()
    .sort((a, b) =>
      String(b.orderDate || "").localeCompare(String(a.orderDate || ""))
    )
    .filter((o) => {
      if (filter === "all") return true;
      if (filter === "pending") return o.accountStatus === "pending";
      return o.accountStatus !== "pending";
    });

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
    >
      {/* Stats */}
      <View className="flex-row gap-3 mb-4">
        <Card variant="default" className="flex-1 bg-orange-50">
          <Text className="text-3xl font-bold text-orange-600 text-center">
            {stats.pending}
          </Text>
          <Text className="text-orange-700 text-sm text-center mt-1">
            بانتظار المراجعة
          </Text>
        </Card>
        <Card variant="default" className="flex-1 bg-emerald-50">
          <Text className="text-3xl font-bold text-emerald-600 text-center">
            {totalCollected.toLocaleString("ar-EG")}
          </Text>
          <Text className="text-emerald-700 text-sm text-center mt-1">
            إجمالي التحصيلات
          </Text>
        </Card>
        <Card variant="default" className="flex-1 bg-red-50">
          <Text className="text-3xl font-bold text-red-600 text-center">
            {stats.rejected}
          </Text>
          <Text className="text-red-700 text-sm text-center mt-1">مرفوض / مؤجل</Text>
        </Card>
      </View>

      {/* Tabs */}
      <View className="flex-row flex-wrap gap-2 mb-4">
        {TAB_KEYS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setTab(key)}
            className={`px-4 py-2 rounded-full ${
              tab === key ? "bg-amber-500" : "bg-white border border-slate-200"
            }`}
          >
            <Text
              className={`font-bold text-sm ${
                tab === key ? "text-white" : "text-slate-600"
              }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ================= TAB 1: Orders ================= */}
      {tab === "orders" && (
        <>
          <View className="flex-row gap-2 mb-4">
            {(
              [
                ["all", "الكل"],
                ["pending", "بانتظار المراجعة"],
                ["decided", "تم البت فيه"],
              ] as const
            ).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                onPress={() => setFilter(k)}
                className={`px-4 py-2 rounded-full ${
                  filter === k ? "bg-amber-500" : "bg-white border border-slate-200"
                }`}
              >
                <Text
                  className={`font-bold text-sm ${
                    filter === k ? "text-white" : "text-slate-600"
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-4">جارِ التحميل...</Text>
            </Card>
          ) : filtered.length > 0 ? (
            filtered.map((order) => {
              const meta = ACCOUNT_META[order.accountStatus] ?? ACCOUNT_META.pending;
              const expanded = selectedId === order.id;
              return (
                <Card key={order.id} variant="elevated" className="mb-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-slate-800">
                        {order.orderNo || order.id}
                      </Text>
                      <Text className="text-slate-500 text-sm mt-0.5">
                        {order.customerName}
                      </Text>
                    </View>
                    <View className={`px-3 py-1.5 rounded-full ${meta.chip}`}>
                      <Text className={`font-bold text-xs ${meta.text}`}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  <View className="bg-slate-50 rounded-2xl p-4 mb-3">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">المشروع</Text>
                      <Text className="text-slate-800 font-semibold flex-1 text-right">
                        {order.projectName}
                      </Text>
                    </View>
                    {order.projectLocation ? (
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-slate-600">العنوان</Text>
                        <Text className="text-slate-800 font-semibold flex-1 text-right">
                          {order.projectLocation}
                        </Text>
                      </View>
                    ) : null}
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">نوع العنصر</Text>
                      <Text className="text-slate-800 font-semibold">
                        {ELEMENT_LABELS[order.elementType] ?? order.elementType ?? "—"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">الكمية</Text>
                      <Text className="text-slate-800 font-semibold">
                        {order.quantity}{" "}
                        {order.orderType === "concrete" ? "م³" : "بلوك"}
                      </Text>
                    </View>
                    {order.concreteType ? (
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-slate-600">قوة الخرسانة</Text>
                        <Text className="text-slate-800 font-semibold">
                          {order.concreteType} · Slump {order.slump} cm
                        </Text>
                      </View>
                    ) : null}
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">تاريخ الصب</Text>
                      <Text className="text-slate-800 font-semibold">
                        {order.orderDate} {order.orderTime || ""}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">المندوب</Text>
                      <Text className="text-slate-800 font-semibold">
                        {order.salesRep || "—"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">حالة الائتمان</Text>
                      <Text className="text-slate-800 font-semibold">
                        {order.debtStatus === "clear"
                          ? "✅ واضح"
                          : order.debtStatus === "has_debt"
                            ? "⚠️ عليه ديون"
                            : "🚫 محظور"}
                      </Text>
                    </View>
                    {order.serverCreatedAt ? (
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-slate-600">تاريخ الإنشاء (الخادم)</Text>
                        <Text className="text-slate-800 font-semibold">
                          {fmtServerTime(order.serverCreatedAt)}
                        </Text>
                      </View>
                    ) : null}
                    {order.serverApprovedAt ? (
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-slate-600">تاريخ القرار (الخادم)</Text>
                        <Text className="text-slate-800 font-semibold">
                          {fmtServerTime(order.serverApprovedAt)}
                        </Text>
                      </View>
                    ) : null}
                    {order.accountComment ? (
                      <View className="mt-2 bg-amber-100 rounded-xl p-3">
                        <Text className="text-amber-800 font-bold text-sm mb-1">
                          💬 ملاحظة المحاسب
                        </Text>
                        <Text className="text-amber-900 text-sm">{order.accountComment}</Text>
                      </View>
                    ) : null}
                  </View>

                  {order.accountStatus === "pending" ? (
                    expanded ? (
                      <View>
                        <TextInput
                          className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3 text-right"
                          placeholder="ملاحظة (اختياري) — تظهر للمندوب والعميل"
                          placeholderTextColor="#94a3b8"
                          value={comments[order.id] || ""}
                          onChangeText={(t) =>
                            setComments((c) => ({ ...c, [order.id]: t }))
                          }
                          multiline
                        />
                        <View className="flex-row gap-2 mb-2">
                          <Button
                            title="✅ موافقة"
                            variant="success"
                            size="small"
                            className="flex-1"
                            loading={saveMutation.isPending}
                            onPress={() => handleDecide(order, "approved")}
                          />
                          <Button
                            title="⏸️ تأجيل"
                            variant="warning"
                            size="small"
                            className="flex-1"
                            loading={saveMutation.isPending}
                            onPress={() => handleDecide(order, "postponed")}
                          />
                        </View>
                        <Button
                          title="❌ رفض"
                          variant="danger"
                          size="small"
                          loading={saveMutation.isPending}
                          onPress={() => handleDecide(order, "rejected")}
                        />
                      </View>
                    ) : (
                      <Button
                        title="🖊️ المراجعة والبت"
                        variant="primary"
                        size="small"
                        onPress={() => setSelectedId(order.id)}
                      />
                    )
                  ) : (
                    <Text className="text-slate-400 text-center text-sm py-1">
                      {meta.label} — طلب مغلق من الحسابات
                    </Text>
                  )}
                </Card>
              );
            })
          ) : (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-8">
                لا توجد طلبات في هذه القائمة
              </Text>
            </Card>
          )}
        </>
      )}

      {/* ================= TAB 2: Customer invoices ================= */}
      {tab === "invoices" && (
        <>
          <Card variant="elevated" className="mb-4">
            <Text className="text-slate-800 font-bold text-lg mb-1">
              🧾 فواتير العملاء
            </Text>
            <Text className="text-slate-500 text-sm mb-3">
              تُولَّد تلقائياً من الطلبات المعتمدة (نفس أسعار الموقع + ضريبة {VAT_RATE}%).
            </Text>
            <View className="flex-row justify-between bg-slate-50 rounded-2xl p-3 mb-1">
              <Text className="text-slate-600">عدد الفواتير المعتمدة</Text>
              <Text className="font-bold text-slate-800">{approvedOrders.length}</Text>
            </View>
            <View className="flex-row justify-between bg-slate-50 rounded-2xl p-3">
              <Text className="text-slate-600">إجمالي قيمة الفواتير</Text>
              <Text className="font-bold text-emerald-600">
                {approvedOrders
                  .reduce((s, o) => s + unitPriceFor(o) * (Number(o.quantity) || 0), 0)
                  .toLocaleString("ar-EG")}{" "}
                ريال
              </Text>
            </View>
          </Card>

          {approvedOrders.length === 0 ? (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-8">
                لا توجد فواتير بعد — اعتمد الطلبات أولاً
              </Text>
            </Card>
          ) : (
            approvedOrders.map((o) => {
              const price = unitPriceFor(o);
              const qty = Number(o.quantity) || 0;
              const totalExVat = price * qty;
              const vat = totalExVat * (VAT_RATE / 100);
              const total = totalExVat + vat;
              return (
                <Card key={o.id} variant="elevated" className="mb-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-slate-800">
                        INV-{(o.orderNo || o.id).replace("ORD-", "").toUpperCase()}
                      </Text>
                      <Text className="text-slate-500 text-sm mt-0.5">
                        {o.customerName} · {o.customerCode || "—"}
                      </Text>
                    </View>
                    <View className="px-3 py-1.5 rounded-full bg-emerald-100">
                      <Text className="font-bold text-xs text-emerald-700">✅ معتمد</Text>
                    </View>
                  </View>

                  <View className="bg-slate-50 rounded-2xl p-4 mb-3">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">المشروع</Text>
                      <Text className="text-slate-800 font-semibold flex-1 text-right">
                        {o.projectName}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">الصنف</Text>
                      <Text className="text-slate-800 font-semibold">
                        {o.orderType === "concrete"
                          ? `خرسانة ${o.concreteType} psi`
                          : "بلوك"}
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">الكمية</Text>
                      <Text className="text-slate-800 font-semibold">
                        {qty} {o.orderType === "concrete" ? "م³" : "بلوك"} × {price} ريال
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">الإجمالي قبل الضريبة</Text>
                      <Text className="text-slate-800 font-semibold">
                        {totalExVat.toLocaleString("ar-EG")} ريال
                      </Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-slate-600">ضريبة القيمة المضافة ({VAT_RATE}%)</Text>
                      <Text className="text-slate-800 font-semibold">
                        {vat.toLocaleString("ar-EG")} ريال
                      </Text>
                    </View>
                    <View className="flex-row justify-between pt-2 border-t border-slate-200">
                      <Text className="text-slate-800 font-bold">الإجمالي</Text>
                      <Text className="text-emerald-600 font-bold">
                        {total.toLocaleString("ar-EG")} ريال
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2">
                    <Button
                      title="📤 مشاركة الفاتورة"
                      variant="secondary"
                      size="small"
                      className="flex-1"
                      onPress={() => shareInvoice(o)}
                    />
                    <Button
                      title="💰 تسجيل تحصيل"
                      variant="primary"
                      size="small"
                      className="flex-1"
                      onPress={() => {
                        setPayForm({
                          client: o.customerName || "",
                          orderNo: o.orderNo || "",
                          amount: String(total),
                          method: "bank",
                          note: "",
                        });
                        setEditingPayId(null);
                        setTab("collections");
                      }}
                    />
                  </View>
                </Card>
              );
            })
          )}
        </>
      )}

      {/* ================= TAB 3: Collections ================= */}
      {tab === "collections" && (
        <>
          <Card variant="elevated" className="mb-4">
            <Text className="text-slate-800 font-bold text-lg mb-1">
              💰 التحصيلات
            </Text>
            <Text className="text-slate-500 text-sm mb-4">
              تسجيل مدفوعات العملاء (تحويل / مدى / نقداً) ومرتبطة بأرقام الطلبات.
            </Text>

            <Text className="text-slate-600 font-semibold mb-2">
              {editingPayId ? "✏️ تعديل التحصيل" : "تسجيل تحصيل جديد"}
            </Text>
            <View className="gap-3 mb-4">
              <TextInput
                className={inputCls}
                placeholder="اسم العميل"
                placeholderTextColor="#94a3b8"
                value={payForm.client}
                onChangeText={(t) => setPayForm((f) => ({ ...f, client: t }))}
              />
              <TextInput
                className={inputCls}
                placeholder="رقم الطلب / الفاتورة"
                placeholderTextColor="#94a3b8"
                value={payForm.orderNo}
                onChangeText={(t) => setPayForm((f) => ({ ...f, orderNo: t }))}
              />
              <TextInput
                className={inputCls}
                placeholder="المبلغ (ريال)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={payForm.amount}
                onChangeText={(t) => setPayForm((f) => ({ ...f, amount: t }))}
              />
              <View className="flex-row gap-2">
                {(
                  [
                    ["bank", "🏦 تحويل"],
                    ["mada", "💳 مدى"],
                    ["cash", "💵 نقداً"],
                  ] as const
                ).map(([k, label]) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setPayForm((f) => ({ ...f, method: k }))}
                    className={`px-4 py-2 rounded-full ${
                      payForm.method === k
                        ? "bg-amber-500"
                        : "bg-white border border-slate-200"
                    }`}
                  >
                    <Text
                      className={`font-bold text-sm ${
                        payForm.method === k ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                className={inputCls}
                placeholder="ملاحظة (اختياري)"
                placeholderTextColor="#94a3b8"
                value={payForm.note}
                onChangeText={(t) => setPayForm((f) => ({ ...f, note: t }))}
              />
            </View>
            <Button
              title={editingPayId ? "💾 حفظ التعديلات" : "➕ تسجيل التحصيل"}
              variant="success"
              loading={savePaymentsMutation.isPending}
              onPress={addPayment}
            />
            {editingPayId ? (
              <Button
                title="❌ إلغاء التعديل"
                variant="secondary"
                size="small"
                className="mt-2"
                onPress={() => {
                  setEditingPayId(null);
                  setPayForm({ client: "", orderNo: "", amount: "", method: "bank", note: "" });
                }}
              />
            ) : null}
          </Card>

          <View className="flex-row justify-between bg-white rounded-2xl p-4 mb-4 border border-slate-200">
            <Text className="text-slate-600">إجمالي المحصّل</Text>
            <Text className="font-bold text-emerald-600">
              {totalCollected.toLocaleString("ar-EG")} ريال
            </Text>
          </View>

          {(payments || []).length === 0 ? (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-8">
                لا توجد تحصيلات بعد
              </Text>
            </Card>
          ) : (
            [...(payments || [])]
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .map((p) => (
                <Card key={p.id} variant="default" className="mb-3">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800">{p.client}</Text>
                      <Text className="text-slate-500 text-sm">
                        {p.orderNo} · {p.date}
                      </Text>
                    </View>
                    <Text className="font-bold text-emerald-600">
                      {Number(p.amount).toLocaleString("ar-EG")} ريال
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-slate-500 text-sm">
                      {p.method === "bank" ? "🏦 تحويل" : p.method === "mada" ? "💳 مدى" : "💵 نقداً"}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        onPress={() => startEditPayment(p)}
                        className="px-3 py-1.5 rounded-full bg-sky-100"
                      >
                        <Text className="font-bold text-xs text-sky-700">✏️ تعديل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deletePayment(p)}
                        className="px-3 py-1.5 rounded-full bg-red-100"
                      >
                        <Text className="font-bold text-xs text-red-700">🗑️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          savePaymentsMutation.mutateAsync(
                            (payments || []).map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    status: x.status === "paid" ? ("pending" as const) : ("paid" as const),
                                  }
                                : x
                            )
                          )
                        }
                        className={`px-3 py-1.5 rounded-full ${
                          p.status === "paid" ? "bg-emerald-100" : "bg-orange-100"
                        }`}
                      >
                        <Text
                          className={`font-bold text-xs ${
                            p.status === "paid" ? "text-emerald-700" : "text-orange-700"
                          }`}
                        >
                          {p.status === "paid" ? "✅ محصّل" : "⏳ معلّق"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {p.note ? <Text className="text-slate-500 text-sm mt-1">{p.note}</Text> : null}
                </Card>
              ))
          )}
        </>
      )}

      {/* ================= TAB 4: Supplier invoices ================= */}
      {tab === "suppliers" && (
        <>
          <Card variant="elevated" className="mb-4">
            <Text className="text-slate-800 font-bold text-lg mb-1">
              🧾 فواتير الموردين
            </Text>
            <Text className="text-slate-500 text-sm mb-4">
              تسجيل مشتريات الخامات (اسمنت / رمل / سن / إضافات) من الموردين.
            </Text>

            <Text className="text-slate-600 font-semibold mb-2">فاتورة مورد جديدة</Text>
            <View className="gap-3 mb-4">
              <TextInput
                className={inputCls}
                placeholder="الخامة (مثال: اسمنت)"
                placeholderTextColor="#94a3b8"
                value={poForm.material}
                onChangeText={(t) => setPoForm((f) => ({ ...f, material: t }))}
              />
              <TextInput
                className={inputCls}
                placeholder="المورد"
                placeholderTextColor="#94a3b8"
                value={poForm.supplier}
                onChangeText={(t) => setPoForm((f) => ({ ...f, supplier: t }))}
              />
              <View className="flex-row gap-3">
                <TextInput
                  className={`${inputCls} flex-1`}
                  placeholder="الكمية"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={poForm.qty}
                  onChangeText={(t) => setPoForm((f) => ({ ...f, qty: t }))}
                />
                <TextInput
                  className={`${inputCls} flex-1`}
                  placeholder="الوحدة (طن/لتر)"
                  placeholderTextColor="#94a3b8"
                  value={poForm.unit}
                  onChangeText={(t) => setPoForm((f) => ({ ...f, unit: t }))}
                />
              </View>
              <TextInput
                className={inputCls}
                placeholder="سعر الوحدة (ريال)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={poForm.unitPrice}
                onChangeText={(t) => setPoForm((f) => ({ ...f, unitPrice: t }))}
              />
            </View>
            <Button
              title="➕ إضافة فاتورة المورد"
              variant="primary"
              loading={savePosMutation.isPending}
              onPress={addPO}
            />
          </Card>

          <View className="flex-row gap-3 mb-4">
            <Card variant="default" className="flex-1 bg-amber-50">
              <Text className="text-2xl font-bold text-amber-600 text-center">
                {openPOs}
              </Text>
              <Text className="text-amber-700 text-sm text-center mt-1">مفتوحة</Text>
            </Card>
            <Card variant="default" className="flex-1 bg-emerald-50">
              <Text className="text-2xl font-bold text-emerald-600 text-center">
                {(pos || []).length}
              </Text>
              <Text className="text-emerald-700 text-sm text-center mt-1">إجمالي الفواتير</Text>
            </Card>
          </View>

          {(pos || []).length === 0 ? (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-8">
                لا توجد فواتير موردين بعد
              </Text>
            </Card>
          ) : (
            [...(pos || [])]
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .map((p) => (
                <Card key={p.id} variant="default" className="mb-3">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800">
                        {p.material} · {p.supplier}
                      </Text>
                      <Text className="text-slate-500 text-sm">
                        {p.date}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-bold text-slate-800">
                        {p.total.toLocaleString("ar-EG")} ريال
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          savePosMutation.mutateAsync(
                            (pos || []).map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    status: x.status === "open" ? ("delivered" as const) : ("open" as const),
                                  }
                                : x
                            )
                          )
                        }
                        className={`px-3 py-1.5 rounded-full mt-1 ${
                          p.status === "delivered" ? "bg-emerald-100" : "bg-orange-100"
                        }`}
                      >
                        <Text
                          className={`font-bold text-xs ${
                            p.status === "delivered" ? "text-emerald-700" : "text-orange-700"
                          }`}
                        >
                          {p.status === "delivered" ? "📦 تم الاستلام" : "⏳ مفتوحة"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text className="text-slate-500 text-sm">
                    {p.qty} {p.unit} × {p.unitPrice} ريال
                  </Text>
                </Card>
              ))
          )}
        </>
      )}

      {/* ================= TAB 5: Customers ================= */}
      {tab === "customers" && (
        <>
          <Card variant="elevated" className="mb-4">
            <Text className="text-slate-800 font-bold text-lg mb-1">
              👥 العملاء القادمون مع المندوب
            </Text>
            <Text className="text-slate-500 text-sm mb-4">
              وافق على العملاء الجدد اللي المندوبين ضافوهم، أو احظرهم (تجميد ائتماني).
            </Text>

            {pendingCustomers.length > 0 ? (
              pendingCustomers.map((c, i) => (
                <Card key={i} variant="outlined" className="mb-3">
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1">
                      <Text className="font-bold text-slate-800">{c.name}</Text>
                      <Text className="text-slate-500 text-sm">{c.phone || "—"}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={() => approvePendingCustomer(c.name, c.phone)}
                        className="px-3 py-2 rounded-full bg-emerald-100"
                      >
                        <Text className="font-bold text-xs text-emerald-700">
                          ✅ موافقة
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => rejectPendingCustomer(c.name, c.phone)}
                        className="px-3 py-2 rounded-full bg-red-100"
                      >
                        <Text className="font-bold text-xs text-red-700">🚫 حظر</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))
            ) : (
              <Text className="text-slate-500 text-center text-sm py-3">
                لا يوجد عملاء جدد بانتظار الموافقة
              </Text>
            )}
          </Card>

          <Card variant="default" className="mb-4">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="font-bold text-slate-800 text-lg">
                📒 العملاء ({customers?.length ?? 0})
              </Text>
              <Button
                title={showAddCustomer ? "إغلاق" : "➕ إضافة"}
                variant={showAddCustomer ? "secondary" : "primary"}
                size="small"
                onPress={() => setShowAddCustomer((s) => !s)}
              />
            </View>

            {showAddCustomer && (
              <View className="gap-3 mb-4">
                <TextInput
                  className={inputCls}
                  placeholder="اسم العميل"
                  placeholderTextColor="#94a3b8"
                  value={customerForm.name}
                  onChangeText={(t) => setCustomerForm((f) => ({ ...f, name: t }))}
                />
                <TextInput
                  className={inputCls}
                  placeholder="رقم الهاتف"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  value={customerForm.phone}
                  onChangeText={(t) => setCustomerForm((f) => ({ ...f, phone: t }))}
                />
                <TextInput
                  className={inputCls}
                  placeholder="العنوان (اختياري)"
                  placeholderTextColor="#94a3b8"
                  value={customerForm.address}
                  onChangeText={(t) => setCustomerForm((f) => ({ ...f, address: t }))}
                />
                <Button
                  title="حفظ العميل"
                  variant="success"
                  size="small"
                  loading={saveCustomersMutation.isPending}
                  onPress={addCustomer}
                />
              </View>
            )}

            {(customers || []).length === 0 ? (
              <Text className="text-slate-500 text-center py-6">
                لا يوجد عملاء مسجلون بعد
              </Text>
            ) : (
              (customers || []).map((c) => (
                <Card key={c.id} variant="outlined" className="mb-3">
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-bold text-slate-800">{c.name}</Text>
                        <Text className="text-slate-400 text-xs bg-slate-100 px-2 py-0.5 rounded-full">
                          {c.code}
                        </Text>
                      </View>
                      <Text className="text-slate-500 text-sm mt-0.5">
                        {c.phone}
                        {c.address ? ` · ${c.address}` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleCreditHold(c)}
                      className={`px-3 py-2 rounded-full ${
                        c.creditHold ? "bg-red-100" : "bg-emerald-100"
                      }`}
                    >
                      <Text
                        className={`font-bold text-xs ${
                          c.creditHold ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {c.creditHold ? "⛔ تجميد ائتماني" : "🔓 ائتمان مفتوح"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </Card>
        </>
      )}

      {/* ================= TAB 6: Customer statement ================= */}
      {tab === "statement" && (
        <>
          <Card variant="elevated" className="mb-4">
            <Text className="text-slate-800 font-bold text-lg mb-1">
              📊 كشف حساب العميل
            </Text>
            <Text className="text-slate-500 text-sm mb-4">
              فواتير معتمدة + مدفوعات + الرصيد المتبقي لكل عميل.
            </Text>

            <View className="bg-white rounded-2xl border-2 border-slate-200 px-4 py-3 mb-3 flex-row items-center">
              <Text className="text-slate-400 text-lg">🔍</Text>
              <TextInput
                className="flex-1 mr-2 text-slate-800"
                placeholder="ابحث عن العميل..."
                placeholderTextColor="#94a3b8"
                value={stmtQuery}
                onChangeText={setStmtQuery}
              />
              {stmtQuery ? (
                <TouchableOpacity onPress={() => setStmtQuery("")}>
                  <Text className="text-slate-400 text-lg">✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {stmtFilteredNames.length === 0 ? (
              <Text className="text-slate-500 text-center text-sm py-3">
                لا يوجد عملاء مطابقون
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {stmtFilteredNames.map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setStmtCustomer(stmtCustomer === n ? null : n)}
                    className={`px-4 py-2 rounded-full border-2 ${
                      stmtCustomer === n
                        ? "bg-amber-500 border-amber-500"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`font-bold text-sm ${
                        stmtCustomer === n ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Card>

          {stmtCustomer ? (
            <>
              <Card variant="default" className="mb-4">
                <Text className="font-bold text-slate-800 text-lg mb-2">
                  {stmtCustomer}
                </Text>
                <View className="gap-2">
                  <View className="flex-row justify-between bg-slate-50 rounded-xl p-3">
                    <Text className="text-slate-600">إجمالي الفواتير (بدون ضريبة)</Text>
                    <Text className="font-bold text-slate-800">
                      {stmtBilled.toLocaleString("ar-EG")} ريال
                    </Text>
                  </View>
                  <View className="flex-row justify-between bg-slate-50 rounded-xl p-3">
                    <Text className="text-slate-600">ضريبة القيمة المضافة ({VAT_RATE}%)</Text>
                    <Text className="font-bold text-slate-800">
                      {stmtVat.toLocaleString("ar-EG")} ريال
                    </Text>
                  </View>
                  <View className="flex-row justify-between bg-emerald-50 rounded-xl p-3">
                    <Text className="text-emerald-700">المدفوع</Text>
                    <Text className="font-bold text-emerald-700">
                      {stmtPaid.toLocaleString("ar-EG")} ريال
                    </Text>
                  </View>
                  <View className="flex-row justify-between rounded-xl p-3 border-2 border-amber-300 bg-amber-50">
                    <Text className="text-amber-800 font-bold">الرصيد المتبقي</Text>
                    <Text
                      className={`font-bold ${
                        stmtOutstanding > 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {stmtOutstanding.toLocaleString("ar-EG")} ريال
                    </Text>
                  </View>
                </View>
              </Card>

              {stmtOrders.length > 0 ? (
                <>
                  <Text className="text-slate-800 font-bold mb-2 mt-2">
                    🧾 الفواتير المعتمدة
                  </Text>
                  {stmtOrders.map((o) => {
                    const price = unitPriceFor(o);
                    const qty = Number(o.quantity) || 0;
                    return (
                      <Card key={o.id} variant="outlined" className="mb-3">
                        <View className="flex-row justify-between items-start mb-1">
                          <Text className="font-bold text-slate-800">
                            {o.orderNo || o.id}
                          </Text>
                          <Text className="font-bold text-slate-800">
                            {(price * qty * (1 + VAT_RATE / 100)).toLocaleString("ar-EG")} ريال
                          </Text>
                        </View>
                        <Text className="text-slate-500 text-sm">
                          {o.projectName} · {qty} {o.orderType === "concrete" ? "م³" : "بلوك"} ·{" "}
                          {o.orderDate}
                        </Text>
                      </Card>
                    );
                  })}
                </>
              ) : (
                <Text className="text-slate-500 text-center text-sm py-3">
                  لا توجد فواتير معتمدة لهذا العميل
                </Text>
              )}

              {stmtPayments.length > 0 ? (
                <>
                  <Text className="text-slate-800 font-bold mb-2 mt-3">
                    💰 المدفوعات
                  </Text>
                  {stmtPayments.map((p) => (
                    <Card key={p.id} variant="outlined" className="mb-3">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-slate-500 text-sm">
                          {p.date} ·{" "}
                          {p.method === "bank" ? "🏦 تحويل" : p.method === "mada" ? "💳 مدى" : "💵 نقداً"}
                        </Text>
                        <Text className="font-bold text-emerald-600">
                          {Number(p.amount).toLocaleString("ar-EG")} ريال
                        </Text>
                      </View>
                      {p.note ? (
                        <Text className="text-slate-500 text-sm mt-1">{p.note}</Text>
                      ) : null}
                    </Card>
                  ))}
                </>
              ) : (
                <Text className="text-slate-500 text-center text-sm py-3">
                  لا توجد مدفوعات لهذا العميل
                </Text>
              )}
            </>
          ) : (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-6">
                اختر عميلاً لعرض كشف الحساب
              </Text>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
