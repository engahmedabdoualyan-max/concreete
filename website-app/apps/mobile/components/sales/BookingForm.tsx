/**
 * Booking Form Component (Sales Rep View)
 * Matches the website Orders page: customer name/phone/code, project,
 * pour location chosen from a real Google map, order type, element type
 * (نوع العنصر), free quantity input, concrete specs, site readiness.
 * Reads/writes the SAME Firestore `orders` collection as the website.
 */

import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { format, isToday } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import CalendarPicker from "@/components/ui/CalendarPicker";
import TimePicker from "@/components/ui/TimePicker";
import { erp, dataUsername } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { MapLocationPicker, type LatLng } from "@/components/sales/MapLocationPicker";

export interface CustomerRef {
  id: string;
  code: string;
  name: string;
  phone: string;
  address?: string;
  creditHold?: boolean;
}

export interface SalesOrder {
  id: string;
  orderNo?: string;
  customerId?: string;
  orderDate: string;
  orderTime: string;
  customerName: string;
  customerPhone: string;
  customerCode: string;
  projectName: string;
  projectLocation: string;
  locationCoords: string;
  orderType: "concrete" | "blocks";
  elementType: string;
  quantity: number;
  concreteType: string;
  slump: string;
  cementType: "ordinary" | "resistant";
  /** Block order specs (only for orderType === "blocks"). */
  blockProduct?: string;
  blockDimensions?: string;
  blockInsulated?: boolean;
  insulationType?: string;
  siteReady: boolean;
  pumpAccessible: boolean;
  requiresPump: boolean;
  requiresLab: boolean;
  /** Payment capture (used when the order is registered by the schedule team). */
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  salesRep: string;
  accountant: string;
  accountStatus: "approved" | "pending" | "rejected" | "postponed";
  accountantDecision: "execute" | "postpone" | "cancel";
  /** Free-text comment from the accountant shown to the sales rep / customer. */
  accountComment?: string;
  debtStatus: "clear" | "has_debt" | "blocked";
  notes: string;
  status: "pending" | "approved" | "scheduled" | "in_progress" | "completed" | "cancelled";
  /** Server-recorded timestamps (Firestore REQUEST_TIME — cannot be forged by the phone). */
  serverCreatedAt?: string;
  serverApprovedAt?: string;
  serverUpdatedAt?: string;
}

export const ELEMENT_TYPES = [
  { value: "foundation", label: "🏗️ قواعد/أساسات" },
  { value: "columns", label: "🏛️ أعمدة" },
  { value: "beams", label: "📏 كمرات" },
  { value: "slab", label: "🏠 سقف/بلاطة" },
  { value: "walls", label: "🧱 حوائط" },
  { value: "stairs", label: "🪜 سلالم" },
  { value: "cleaning_layer", label: "🧹 فرشة نظافة" },
  { value: "other", label: "📦 أخرى" },
];

export const CONCRETE_TYPES = ["2000", "2500", "3000", "3500", "4000", "5000"];

/** جاهز البلك — منتجات مسبقة التعريف */
export const BLOCK_PRODUCTS = [
  { value: "hollow_10", label: "بلوك عادي 10×20×40 سم" },
  { value: "hollow_15", label: "بلوك عادي 15×20×40 سم" },
  { value: "hollow_20", label: "بلوك عادي 20×20×40 سم" },
  { value: "insulated_15", label: "بلوك معزول 15×20×40 سم" },
  { value: "insulated_20", label: "بلوك معزول 20×20×40 سم" },
  { value: "solid", label: "بلوك مصمت 20×20×40 سم" },
];

/** أنواع العزل المتوفرة للبلك المعزول */
export const INSULATION_TYPES = [
  { value: "eps", label: "عزل EPS (بوليسترين)" },
  { value: "pu", label: "عزل بولي يوريثان (PU)" },
  { value: "mineral", label: "عزل صوف صخري" },
  { value: "perlite", label: "عزل بيرلايت" },
];

interface BookingFormProps {
  onSubmit: (order: SalesOrder) => Promise<void>;
  loading?: boolean;
  /** Existing order to edit — prefills the form and preserves id/orderNo/status. */
  order?: SalesOrder;
  /** Show the payment section (paid/remaining) — used by the schedule team. */
  showPayment?: boolean;
}

const inputCls =
  "bg-slate-50 rounded-2xl border-2 border-slate-200 px-4 py-3 text-lg text-slate-800";

function coordsToLatLng(coords?: string): LatLng | null {
  if (!coords) return null;
  const parts = coords.split(",").map((p) => parseFloat(p.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return { latitude: parts[0], longitude: parts[1] };
}

export function BookingForm({ onSubmit, loading, order, showPayment }: BookingFormProps) {
  const { user } = useAuthStore();
  const u = dataUsername(user);
  const isEdit = !!order;

  const [customers, setCustomers] = useState<CustomerRef[]>([]);

  // Customer data (free-text like the website, auto-filled from customers list)
  const [customerId, setCustomerId] = useState(order?.customerId || "");
  const [customerName, setCustomerName] = useState(order?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(order?.customerPhone || "");
  const [customerCode, setCustomerCode] = useState(order?.customerCode || "");

  // Project data
  const [projectName, setProjectName] = useState(order?.projectName || "");
  const [projectLocation, setProjectLocation] = useState(order?.projectLocation || "");
  const [location, setLocation] = useState<LatLng | null>(coordsToLatLng(order?.locationCoords));
  const [mapAddress, setMapAddress] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Order details
  const [orderType, setOrderType] = useState<"concrete" | "blocks">(order?.orderType || "concrete");
  const [elementType, setElementType] = useState(order?.elementType || "foundation");
  const [quantity, setQuantity] = useState(order?.quantity ? String(order.quantity) : "");
  const [concreteType, setConcreteType] = useState(order?.concreteType || "3000");
  const [slump, setSlump] = useState(order?.slump || "12");
  const [cementType, setCementType] = useState<"ordinary" | "resistant">(order?.cementType || "ordinary");
  // Block specs (orderType === "blocks")
  const [blockMode, setBlockMode] = useState<"product" | "custom">("product");
  const [blockProduct, setBlockProduct] = useState(order?.blockProduct || "hollow_20");
  const [blockL, setBlockL] = useState(order?.blockDimensions ? order.blockDimensions.split("×")[0]?.trim() || "" : "");
  const [blockH, setBlockH] = useState(order?.blockDimensions ? order.blockDimensions.split("×")[1]?.trim() || "" : "");
  const [blockT, setBlockT] = useState(order?.blockDimensions ? order.blockDimensions.split("×")[2]?.trim() || "" : "");
  const [blockInsulated, setBlockInsulated] = useState(order?.blockInsulated ?? false);
  const [insulationType, setInsulationType] = useState(order?.insulationType || "eps");
  const [siteReady, setSiteReady] = useState(order?.siteReady ?? true);
  const [pumpAccessible, setPumpAccessible] = useState(order?.pumpAccessible ?? true);
  const [requiresPump, setRequiresPump] = useState(order?.requiresPump ?? false);
  const [requiresLab, setRequiresLab] = useState(order?.requiresLab ?? false);
  const [notes, setNotes] = useState(order?.notes || "");
  // Payment capture (schedule team)
  const [totalAmount, setTotalAmount] = useState(order?.totalAmount ? String(order.totalAmount) : "");
  const [paidAmount, setPaidAmount] = useState(order?.paidAmount ? String(order.paidAmount) : "");

  // Date + time
  const [scheduledDate, setScheduledDate] = useState<string>(
    order?.orderDate || new Date().toISOString().split("T")[0]
  );
  const [orderTime, setOrderTime] = useState<string>(order?.orderTime || "08:00");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [dateError, setDateError] = useState<string>("");

  useEffect(() => {
    erp
      .loadCustomers(u)
      .then((d) => {
        if (Array.isArray(d)) setCustomers(d.filter((c) => c && c.name));
      })
      .catch(() => {});
  }, [u]);

  const selectCustomer = (c: CustomerRef) => {
    if (c.creditHold) return;
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || "");
    setCustomerCode(c.code || "");
  };

  const handleSubmit = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !projectName.trim()) {
      Alert.alert("⚠️", "يرجى إدخال اسم العميل ورقم الهاتف واسم المشروع");
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      Alert.alert("⚠️", "يرجى إدخال الكمية");
      return;
    }
    if (orderType === "blocks" && blockMode === "custom") {
      if (!blockL.trim() || !blockH.trim() || !blockT.trim()) {
        Alert.alert("⚠️", "يرجى إدخال مقاسات البلك (طول × ارتفاع × سمك)");
        return;
      }
    }
    if (new Date(scheduledDate) < new Date(new Date().toDateString())) {
      setDateError("لا يمكن اختيار تاريخ ماضٍ");
      return;
    }
    const coordsStr = location
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      : "";

    const blockDimensions =
      orderType === "blocks" && blockMode === "custom"
        ? `${blockL.trim()}×${blockH.trim()}×${blockT.trim()}`
        : order?.blockDimensions || "";
    const finalBlockInsulated = orderType === "blocks" ? blockInsulated : undefined;
    const finalBlockProduct =
      orderType === "blocks" && blockMode === "product" ? blockProduct : order?.blockProduct || "";
    const total = showPayment && totalAmount ? Number(totalAmount) || 0 : 0;
    const paid = showPayment && paidAmount ? Number(paidAmount) || 0 : 0;
    if (paid > total) {
      Alert.alert("⚠️", "المبلغ المسدد لا يمكن أن يتجاوز المبلغ الإجمالي");
      return;
    }

    const editable = {
      customerId: customerId || undefined,
      orderDate: scheduledDate,
      orderTime,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerCode: customerCode.trim(),
      projectName: projectName.trim(),
      projectLocation: projectLocation.trim(),
      locationCoords: coordsStr,
      orderType,
      elementType,
      quantity: qty,
      concreteType: orderType === "concrete" ? concreteType : "",
      slump: orderType === "concrete" ? slump : "",
      cementType: orderType === "concrete" ? cementType : "ordinary",
      blockProduct: finalBlockProduct,
      blockDimensions,
      blockInsulated: finalBlockInsulated,
      insulationType: orderType === "blocks" && blockInsulated ? insulationType : "",
      siteReady,
      pumpAccessible,
      requiresPump,
      requiresLab,
      totalAmount: total || undefined,
      paidAmount: paid || undefined,
      remainingAmount: total > 0 ? total - paid : undefined,
      notes: notes.trim(),
    };

    if (order) {
      // Preserve the id / orderNo / accountant fields — only update editable fields.
      await onSubmit({ ...order, ...editable });
      return;
    }

    const newOrder: SalesOrder = {
      ...editable,
      id: Date.now().toString(),
      salesRep: user?.fullName || "",
      accountant: "",
      accountStatus: "pending",
      accountantDecision: "execute",
      debtStatus: "clear",
      status: "pending",
    };

    await onSubmit(newOrder);
  };

  const required = !customerName.trim() || !customerPhone.trim() || !projectName.trim() || !quantity;

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <Card variant="elevated" className="mb-4">
        <Text className="text-2xl font-bold text-slate-800 mb-6">
          {isEdit ? "✏️ تعديل الطلب" : "طلب جديد"}
        </Text>

        {/* 👤 بيانات العميل */}
        <Text className="text-lg font-bold text-slate-800 mb-1">👤 بيانات العميل</Text>

        {customers.length > 0 && (
          <>
            <Text className="text-slate-500 text-xs mb-2">
              اختر من العملاء المحفوظين (يملأ البيانات تلقائياً)
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => selectCustomer(c)}
                  className={`px-4 py-2 rounded-xl border-2 ${
                    c.creditHold
                      ? "bg-slate-100 border-slate-300 opacity-70"
                      : customerId === c.id
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white border-slate-200"
                  }`}
                >
                  <Text
                    className={`font-semibold ${
                      customerId === c.id ? "text-white" : "text-slate-700"
                    }`}
                  >
                    {c.name}
                  </Text>
                  {c.creditHold ? (
                    <Text className="text-red-500 text-[10px] font-bold mt-0.5">
                      ⚠️ مجمّد ائتمانياً
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View className="mb-3">
          <Text className="text-slate-600 font-semibold mb-2">اسم العميل *</Text>
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="اسم العميل"
            placeholderTextColor="#94A3B8"
            className={inputCls}
          />
        </View>
        <View className="mb-3">
          <Text className="text-slate-600 font-semibold mb-2">رقم الهاتف *</Text>
          <TextInput
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="رقم هاتف العميل"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            className={inputCls}
          />
        </View>
        <View className="mb-4">
          <Text className="text-slate-600 font-semibold mb-2">كود العميل</Text>
          <TextInput
            value={customerCode}
            onChangeText={setCustomerCode}
            placeholder="كود العميل (يحدده المحاسب)"
            placeholderTextColor="#94A3B8"
            className={inputCls}
          />
        </View>

        {/* 🏗️ بيانات المشروع */}
        <Text className="text-lg font-bold text-slate-800 mb-1 mt-4">
          🏗️ بيانات المشروع
        </Text>
        <View className="mb-3">
          <Text className="text-slate-600 font-semibold mb-2">اسم المشروع *</Text>
          <TextInput
            value={projectName}
            onChangeText={setProjectName}
            placeholder="اسم المشروع"
            placeholderTextColor="#94A3B8"
            className={inputCls}
          />
        </View>
        <View className="mb-3">
          <Text className="text-slate-600 font-semibold mb-2">عنوان المشروع</Text>
          <TextInput
            value={projectLocation}
            onChangeText={setProjectLocation}
            placeholder="عنوان المشروع"
            placeholderTextColor="#94A3B8"
            className={inputCls}
          />
        </View>

        {/* 📍 مكان الصب (من الخريطة) */}
        <Text className="text-slate-600 font-semibold mb-2">
          📍 مكان الصب — اختر من الخريطة
        </Text>
        <TouchableOpacity
          onPress={() => setShowMap(true)}
          className="bg-orange-50 rounded-2xl border-2 border-orange-300 p-4 mb-2 items-center"
        >
          <Text className="text-orange-600 font-bold">
            {location
              ? `🗺️ ${mapAddress || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}`
              : "🗺️ اختر مكان الصب من الخريطة"}
          </Text>
        </TouchableOpacity>
        {location ? (
          <Text className="text-slate-500 text-xs mb-4 text-center">
            تم تحديد المكان — اضغط للتعديل
          </Text>
        ) : null}

        {/* 📦 تفاصيل الطلب */}
        <Text className="text-lg font-bold text-slate-800 mb-1 mt-4">
          📦 تفاصيل الطلب
        </Text>

        <Text className="text-slate-600 font-semibold mb-2">نوع الطلب</Text>
        <View className="flex-row gap-2 mb-4">
          <TouchableOpacity
            onPress={() => setOrderType("concrete")}
            className={`flex-1 px-4 py-3 rounded-xl border-2 ${
              orderType === "concrete"
                ? "bg-sky-500 border-sky-500"
                : "bg-white border-slate-200"
            }`}
          >
            <Text className={`font-bold text-center ${orderType === "concrete" ? "text-white" : "text-slate-700"}`}>
              🏗️ خرسانة
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOrderType("blocks")}
            className={`flex-1 px-4 py-3 rounded-xl border-2 ${
              orderType === "blocks"
                ? "bg-cyan-500 border-cyan-500"
                : "bg-white border-slate-200"
            }`}
          >
            <Text className={`font-bold text-center ${orderType === "blocks" ? "text-white" : "text-slate-700"}`}>
              🧱 بلوك
            </Text>
          </TouchableOpacity>
        </View>

        {/* نوع العنصر */}
        <Text className="text-slate-600 font-semibold mb-2">نوع العنصر *</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {ELEMENT_TYPES.map((e) => (
            <TouchableOpacity
              key={e.value}
              onPress={() => setElementType(e.value)}
              className={`px-4 py-2 rounded-xl border-2 ${
                elementType === e.value
                  ? "bg-orange-500 border-orange-500"
                  : "bg-white border-slate-200"
              }`}
            >
              <Text className={`font-semibold ${elementType === e.value ? "text-white" : "text-slate-700"}`}>
                {e.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* الكمية */}
        <Text className="text-slate-600 font-semibold mb-2">
          الكمية * ({orderType === "concrete" ? "م³" : "بلوك"})
        </Text>
        <View className="mb-4">
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder={orderType === "concrete" ? "مثال: 32.5" : "مثال: 500"}
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            className={inputCls}
          />
        </View>

        {orderType === "concrete" && (
          <>
            {/* قوة الخرسانة */}
            <Text className="text-slate-600 font-semibold mb-2">قوة الخرسانة</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {CONCRETE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setConcreteType(t)}
                  className={`px-4 py-2 rounded-xl border-2 ${
                    concreteType === t
                      ? "bg-blue-500 border-blue-500"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <Text className={`font-bold ${concreteType === t ? "text-white" : "text-slate-700"}`}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="mb-3">
              <Text className="text-slate-600 font-semibold mb-2">Slump (cm)</Text>
              <TextInput
                value={slump}
                onChangeText={setSlump}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
                className={inputCls}
              />
            </View>

            {/* نوع الأسمنت */}
            <Text className="text-slate-600 font-semibold mb-2">نوع الأسمنت</Text>
            <View className="flex-row gap-2 mb-4">
              <TouchableOpacity
                onPress={() => setCementType("ordinary")}
                className={`flex-1 px-4 py-3 rounded-xl border-2 ${
                  cementType === "ordinary"
                    ? "bg-slate-700 border-slate-700"
                    : "bg-white border-slate-200"
                }`}
              >
                <Text className={`font-bold text-center ${cementType === "ordinary" ? "text-white" : "text-slate-700"}`}>
                  🏭 عادي (OPC)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCementType("resistant")}
                className={`flex-1 px-4 py-3 rounded-xl border-2 ${
                  cementType === "resistant"
                    ? "bg-emerald-600 border-emerald-600"
                    : "bg-white border-slate-200"
                }`}
              >
                <Text className={`font-bold text-center ${cementType === "resistant" ? "text-white" : "text-slate-700"}`}>
                  🛡️ مقاوم (SRC)
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {orderType === "blocks" && (
          <>
            {/* 🧱 مواصفات البلك */}
            <Text className="text-lg font-bold text-slate-800 mb-2">🧱 مواصفات البلك</Text>

            <Text className="text-slate-600 font-semibold mb-2">طريقة الاختيار</Text>
            <View className="flex-row gap-2 mb-4">
              <TouchableOpacity
                onPress={() => setBlockMode("product")}
                className={`flex-1 px-4 py-3 rounded-xl border-2 ${
                  blockMode === "product" ? "bg-cyan-500 border-cyan-500" : "bg-white border-slate-200"
                }`}
              >
                <Text className={`font-bold text-center ${blockMode === "product" ? "text-white" : "text-slate-700"}`}>
                  📦 اختر منتج بلك
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBlockMode("custom")}
                className={`flex-1 px-4 py-3 rounded-xl border-2 ${
                  blockMode === "custom" ? "bg-cyan-500 border-cyan-500" : "bg-white border-slate-200"
                }`}
              >
                <Text className={`font-bold text-center ${blockMode === "custom" ? "text-white" : "text-slate-700"}`}>
                  📐 إدخال المقاسات
                </Text>
              </TouchableOpacity>
            </View>

            {blockMode === "product" ? (
              <>
                <Text className="text-slate-600 font-semibold mb-2">منتج البلك *</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {BLOCK_PRODUCTS.map((p) => (
                    <TouchableOpacity
                      key={p.value}
                      onPress={() => setBlockProduct(p.value)}
                      className={`px-4 py-2.5 rounded-xl border-2 ${
                        blockProduct === p.value ? "bg-cyan-500 border-cyan-500" : "bg-white border-slate-200"
                      }`}
                    >
                      <Text className={`font-bold ${blockProduct === p.value ? "text-white" : "text-slate-700"}`}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text className="text-slate-600 font-semibold mb-2">مقاسات البلك (سم) *</Text>
                <View className="flex-row gap-2 mb-4">
                  <View className="flex-1">
                    <TextInput value={blockL} onChangeText={setBlockL} keyboardType="numeric" placeholder="الطول" placeholderTextColor="#94A3B8" className={inputCls} />
                  </View>
                  <Text className="self-center text-slate-400 font-bold text-lg">×</Text>
                  <View className="flex-1">
                    <TextInput value={blockH} onChangeText={setBlockH} keyboardType="numeric" placeholder="الارتفاع" placeholderTextColor="#94A3B8" className={inputCls} />
                  </View>
                  <Text className="self-center text-slate-400 font-bold text-lg">×</Text>
                  <View className="flex-1">
                    <TextInput value={blockT} onChangeText={setBlockT} keyboardType="numeric" placeholder="السمك" placeholderTextColor="#94A3B8" className={inputCls} />
                  </View>
                </View>
              </>
            )}

            {/* معزول / بدون عزل */}
            <Text className="text-slate-600 font-semibold mb-2">العزل</Text>
            <View className="flex-row gap-2 mb-4">
              <TouchableOpacity
                onPress={() => setBlockInsulated(false)}
                className={`flex-1 px-4 py-3 rounded-xl border-2 ${
                  !blockInsulated ? "bg-emerald-600 border-emerald-600" : "bg-white border-slate-200"
                }`}
              >
                <Text className={`font-bold text-center ${!blockInsulated ? "text-white" : "text-slate-700"}`}>
                  بدون عزل
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBlockInsulated(true)}
                className={`flex-1 px-4 py-3 rounded-xl border-2 ${
                  blockInsulated ? "bg-sky-500 border-sky-500" : "bg-white border-slate-200"
                }`}
              >
                <Text className={`font-bold text-center ${blockInsulated ? "text-white" : "text-slate-700"}`}>
                  ❄️ معزول
                </Text>
              </TouchableOpacity>
            </View>

            {blockInsulated ? (
              <>
                <Text className="text-slate-600 font-semibold mb-2">نوع العزل *</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {INSULATION_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => setInsulationType(t.value)}
                      className={`px-4 py-2.5 rounded-xl border-2 ${
                        insulationType === t.value ? "bg-sky-500 border-sky-500" : "bg-white border-slate-200"
                      }`}
                    >
                      <Text className={`font-bold ${insulationType === t.value ? "text-white" : "text-slate-700"}`}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}

        {showPayment ? (
          <>
            {/* 💰 السداد */}
            <Text className="text-lg font-bold text-slate-800 mb-2">💰 السداد</Text>
            <Text className="text-slate-500 text-xs mb-3">
              سجّل المبلغ الإجمالي وما سدّده العميل — يظهر كشف حسابه لدى المحاسب
            </Text>
            <View className="flex-row gap-2 mb-3">
              <View className="flex-1">
                <Text className="text-slate-600 font-semibold mb-2">المبلغ الإجمالي (ريال)</Text>
                <TextInput
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                  keyboardType="numeric"
                  placeholder="مثال: 24000"
                  placeholderTextColor="#94A3B8"
                  className={inputCls}
                />
              </View>
              <View className="flex-1">
                <Text className="text-slate-600 font-semibold mb-2">المبلغ المسدد (ريال)</Text>
                <TextInput
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  keyboardType="numeric"
                  placeholder="مثال: 5000"
                  placeholderTextColor="#94A3B8"
                  className={inputCls}
                />
              </View>
            </View>
            {totalAmount && Number(totalAmount) > 0 ? (
              <Text
                className={`text-center font-bold text-sm mb-4 ${
                  Number(paidAmount || 0) > Number(totalAmount) ? "text-red-600" : "text-slate-700"
                }`}
              >
                المتبقي على العميل:{" "}
                {(Number(totalAmount) - Number(paidAmount || 0)).toLocaleString("ar-EG")} ريال
              </Text>
            ) : null}
          </>
        ) : null}

        {/* جاهزية الموقع */}
        <Text className="text-lg font-bold text-slate-800 mb-2 mt-2">
          🏗️ جاهزية الموقع
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          <TouchableOpacity
            onPress={() => setSiteReady(!siteReady)}
            className={`px-4 py-3 rounded-xl border-2 ${siteReady ? "bg-emerald-500 border-emerald-500" : "bg-white border-slate-200"}`}
          >
            <Text className={`font-bold ${siteReady ? "text-white" : "text-slate-700"}`}>
              ✓ الموقع جاهز للصب
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPumpAccessible(!pumpAccessible)}
            className={`px-4 py-3 rounded-xl border-2 ${pumpAccessible ? "bg-emerald-500 border-emerald-500" : "bg-white border-slate-200"}`}
          >
            <Text className={`font-bold ${pumpAccessible ? "text-white" : "text-slate-700"}`}>
              ✓ المضخة تستطيع الوصول
            </Text>
          </TouchableOpacity>
        </View>

        {/* المتطلبات */}
        <Text className="text-lg font-bold text-slate-800 mb-2">📋 المتطلبات</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          <TouchableOpacity
            onPress={() => setRequiresPump(!requiresPump)}
            className={`px-4 py-3 rounded-xl border-2 ${requiresPump ? "bg-sky-500 border-sky-500" : "bg-white border-slate-200"}`}
          >
            <Text className={`font-bold ${requiresPump ? "text-white" : "text-slate-700"}`}>
              🚰 طالب تلج (مضخة)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setRequiresLab(!requiresLab)}
            className={`px-4 py-3 rounded-xl border-2 ${requiresLab ? "bg-sky-500 border-sky-500" : "bg-white border-slate-200"}`}
          >
            <Text className={`font-bold ${requiresLab ? "text-white" : "text-slate-700"}`}>
              🧪 يحتاج معمل
            </Text>
          </TouchableOpacity>
        </View>

        {/* تاريخ الصب + الوقت */}
        <Text className="text-slate-600 font-semibold mb-2">تاريخ الصب</Text>
        <TouchableOpacity
          onPress={() => setShowCalendar(true)}
          className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200 items-center mb-2"
        >
          <Text className="text-slate-800 font-semibold text-lg">
            📅 {format(new Date(scheduledDate), "yyyy-MM-dd")}
          </Text>
          <Text className="text-slate-500 text-xs mt-1">
            {isToday(new Date(scheduledDate))
              ? "اليوم"
              : format(new Date(scheduledDate), "EEEE, d MMMM")}
          </Text>
        </TouchableOpacity>

        <Text className="text-slate-600 font-semibold mb-2">وقت الصب</Text>
        <TouchableOpacity
          onPress={() => setShowTime(true)}
          className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-200 items-center mb-2"
        >
          <Text className="text-slate-800 font-semibold text-lg">🕐 {orderTime}</Text>
          <Text className="text-slate-500 text-xs mt-1">اضغط لاختيار الساعة والدقيقة</Text>
        </TouchableOpacity>
        {dateError ? (
          <Text className="text-red-600 text-sm mb-4">{dateError}</Text>
        ) : null}

        {/* ملاحظات */}
        <Text className="text-slate-600 font-semibold mb-2">ملاحظات إضافية</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل إضافية عن الطلب"
          placeholderTextColor="#94A3B8"
          multiline
          className={`${inputCls} min-h-[80px]`}
        />
      </Card>

      {/* Submit Button */}
      <Button
        title={isEdit ? "💾 حفظ التعديلات" : "إرسال الطلب"}
        onPress={handleSubmit}
        loading={loading}
        disabled={required || loading}
        size="large"
        className="mb-8"
      />

      <MapLocationPicker
        visible={showMap}
        value={location}
        onClose={() => setShowMap(false)}
        onConfirm={(loc) => {
          setLocation(loc);
          setMapAddress(loc.address || null);
          if (loc.address && !projectLocation) {
            setProjectLocation(loc.address.split(",").slice(0, 2).join("، "));
          }
          setShowMap(false);
        }}
      />

      <CalendarPicker
        visible={showCalendar}
        value={scheduledDate}
        minDate={new Date().toISOString().split("T")[0]}
        onChange={(d) => {
          setScheduledDate(d);
          setDateError("");
        }}
        onClose={() => setShowCalendar(false)}
      />

      <TimePicker
        visible={showTime}
        value={orderTime}
        onChange={setOrderTime}
        onClose={() => setShowTime(false)}
      />
    </ScrollView>
  );
}
