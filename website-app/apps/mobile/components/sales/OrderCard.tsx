/**
 * Order Card Component (Sales Rep View)
 * Displays website-format order (orderNo, customer, project, location,
 * type, quantity, account status) with color-coded status.
 */

import { View, Text, TouchableOpacity } from "react-native";
import { Card } from "@/components/ui/Card";
import { ELEMENT_TYPES, BLOCK_PRODUCTS, INSULATION_TYPES, type SalesOrder } from "@/components/sales/BookingForm";

const blockProductLabel = (v?: string) =>
  BLOCK_PRODUCTS.find((p) => p.value === v)?.label || v || "";
const insulationLabel = (v?: string) =>
  INSULATION_TYPES.find((t) => t.value === v)?.label || v || "";

interface OrderCardProps {
  order: SalesOrder;
  onPress?: () => void;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending: { label: "⏳ بانتظار الحسابات", cls: "bg-orange-100 text-orange-700" },
  approved: { label: "✅ موافق", cls: "bg-emerald-100 text-emerald-700" },
  scheduled: { label: "📅 مجدول", cls: "bg-sky-100 text-sky-700" },
  in_progress: { label: "🏭 قيد التنفيذ", cls: "bg-indigo-100 text-indigo-700" },
  completed: { label: "✅ مكتمل", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "🚫 ملغي", cls: "bg-slate-200 text-slate-600" },
};

export function OrderCard({ order, onPress }: OrderCardProps) {
  const status = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending;
  const elementLabel =
    ELEMENT_TYPES.find((e) => e.value === order.elementType)?.label ??
    order.elementType ??
    "—";

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card variant="default" className="mb-3">
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1">
            <Text className="text-slate-500 text-sm mb-1">رقم الطلب</Text>
            <Text className="text-xl font-bold text-slate-800">
              {order.orderNo || order.id}
            </Text>
          </View>
          <View className={`px-3 py-1.5 rounded-full ${status.cls}`}>
            <Text className="font-bold text-xs">{status.label}</Text>
          </View>
        </View>

        <View className="bg-slate-50 rounded-2xl p-3 mb-3">
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">العميل</Text>
            <Text className="text-slate-800 font-semibold">
              {order.customerName}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">المشروع</Text>
            <Text className="text-slate-800 font-semibold">
              {order.projectName}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">نوع العنصر</Text>
            <Text className="text-slate-800 font-semibold">
              {elementLabel}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">الكمية</Text>
            <Text className="text-slate-800 font-semibold">
              {order.quantity} {order.orderType === "concrete" ? "م³" : "بلوك"}
              {order.concreteType ? ` · ${order.concreteType}` : ""}
            </Text>
          </View>
          {order.orderType === "concrete" && (
            <View className="flex-row justify-between mb-2">
              <Text className="text-slate-600 text-sm">نوع الأسمنت</Text>
              <Text className="text-slate-800 font-semibold">
                {order.cementType === "resistant" ? "🛡️ مقاوم (SRC)" : "🏭 عادي (OPC)"}
              </Text>
            </View>
          )}
          {order.orderType === "blocks" && (
            <>
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-600 text-sm">مواصفات البلك</Text>
                <Text className="text-slate-800 font-semibold flex-1 text-right">
                  {order.blockProduct
                    ? blockProductLabel(order.blockProduct)
                    : order.blockDimensions
                      ? `${order.blockDimensions} سم`
                      : "—"}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-slate-600 text-sm">العزل</Text>
                <Text className="text-slate-800 font-semibold">
                  {order.blockInsulated
                    ? `❄️ معزول${order.insulationType ? " — " + insulationLabel(order.insulationType) : ""}`
                    : "بدون عزل"}
                </Text>
              </View>
            </>
          )}
        <View className="flex-row justify-between">
          <Text className="text-slate-600 text-sm">المكان</Text>
          <Text className="text-slate-800 font-semibold text-right flex-1">
            {order.projectLocation || order.locationCoords || "—"}
          </Text>
        </View>
      </View>

      {/* Accountant decision + comment (visible to the customer) */}
      {order.accountStatus !== "pending" ? (
        <View
          className={`rounded-xl p-3 mb-3 ${
            order.accountStatus === "approved"
              ? "bg-emerald-50"
              : order.accountStatus === "rejected"
                ? "bg-red-50"
                : "bg-yellow-50"
          }`}
        >
          <Text className="text-slate-600 text-sm mb-1">
            قرار الحسابات:{" "}
            <Text className="font-bold text-slate-800">
              {order.accountStatus === "approved"
                ? "✅ موافق عليه"
                : order.accountStatus === "rejected"
                  ? "❌ مرفوض"
                  : "⏸️ مؤجل"}
            </Text>
            {order.accountant ? ` · ${order.accountant}` : ""}
          </Text>
          {order.serverApprovedAt ? (
            <Text className="text-slate-500 text-xs mt-0.5">
              🕓 القرار بتاريخ {fmtServerTime(order.serverApprovedAt)} (بتوقيت الخادم)
            </Text>
          ) : null}
          {order.accountComment ? (
            <Text className="text-slate-700 text-sm mt-1">
              💬 {order.accountComment}
            </Text>
          ) : null}
        </View>
      ) : null}

        <View className="flex-row justify-between items-center">
          <Text className="text-slate-500 text-sm">
            {order.orderDate}
            {order.serverCreatedAt
              ? ` · أنشئ ${fmtServerTime(order.serverCreatedAt)}`
              : ""}
          </Text>
          <Text className="text-orange-500 font-semibold text-sm">
            عرض التفاصيل ←
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

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
