/**
 * Order Tracking Screen
 * Shows detailed status of a specific order (website-format).
 * Loads from the same Firestore `orders` collection as the website.
 */

import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { erp, dataUsername } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { ELEMENT_TYPES, BLOCK_PRODUCTS, INSULATION_TYPES, type SalesOrder } from "@/components/sales/BookingForm";

const blockProductLabel = (v?: string) =>
  BLOCK_PRODUCTS.find((p) => p.value === v)?.label || v || "";
const insulationLabel = (v?: string) =>
  INSULATION_TYPES.find((t) => t.value === v)?.label || v || "";

const STATUS_STYLE: Record<string, { label: string; color: string; emoji: string }> = {
  pending: { label: "بانتظار الحسابات", color: "text-orange-700 bg-orange-100", emoji: "⏳" },
  approved: { label: "معتمد من الحسابات", color: "text-emerald-700 bg-emerald-100", emoji: "✅" },
  scheduled: { label: "مجدول", color: "text-sky-700 bg-sky-100", emoji: "📅" },
  in_progress: { label: "قيد التنفيذ", color: "text-indigo-700 bg-indigo-100", emoji: "🏭" },
  completed: { label: "مكتمل", color: "text-green-700 bg-green-100", emoji: "✅" },
  cancelled: { label: "ملغي", color: "text-slate-600 bg-slate-200", emoji: "🚫" },
};

const ACCOUNT_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "⏳ بانتظار المراجعة", color: "text-orange-700 bg-orange-100" },
  approved: { label: "✅ موافق عليه", color: "text-emerald-700 bg-emerald-100" },
  rejected: { label: "❌ مرفوض", color: "text-red-700 bg-red-100" },
  postponed: { label: "⏸️ مؤجل", color: "text-yellow-700 bg-yellow-100" },
};

const ELEMENT_LABELS = Object.fromEntries(ELEMENT_TYPES.map((e) => [e.value, e.label]));

function fmtTime(iso?: string): string {
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

export default function TrackOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user } = useAuthStore();
  const u = dataUsername(user);

  const { data: orders, isLoading } = useQuery<SalesOrder[]>({
    queryKey: ["sales-orders", u],
    queryFn: async () => (await erp.loadOrders(u)) || [],
  });

  const order = orders?.find((o) => o.id === orderId);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-slate-600">جارِ التحميل...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-slate-600">الطلب غير موجود</Text>
      </View>
    );
  }

  const status = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending;
  const account = ACCOUNT_STATUS[order.accountStatus] ?? ACCOUNT_STATUS.pending;

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 20 }}>
      <Card variant="elevated" className="mb-4">
        <View className="flex-row justify-between items-start mb-4">
          <View className="flex-1">
            <Text className="text-slate-500 text-sm mb-1">رقم الطلب</Text>
            <Text className="text-2xl font-bold text-slate-800">
              {order.orderNo || order.id}
            </Text>
          </View>
          <View className={`px-3 py-1.5 rounded-full ${status.color}`}>
            <Text className="font-bold text-xs">{status.emoji} {status.label}</Text>
          </View>
        </View>

        <View className="bg-slate-50 rounded-2xl p-4">
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">العميل</Text>
            <Text className="text-slate-800 font-semibold">
              {order.customerName}
            </Text>
          </View>
          {order.customerPhone ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">الهاتف</Text>
              <Text className="text-slate-800 font-semibold" style={{ writingDirection: "ltr" }}>
                {order.customerPhone}
              </Text>
            </View>
          ) : null}
          {order.customerCode ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">كود العميل</Text>
              <Text className="text-slate-800 font-semibold">
                {order.customerCode}
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">المشروع</Text>
            <Text className="text-slate-800 font-semibold flex-1 text-right">
              {order.projectName}
            </Text>
          </View>
          {order.projectLocation ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">العنوان</Text>
              <Text className="text-slate-800 font-semibold flex-1 text-right">
                {order.projectLocation}
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">نوع العنصر</Text>
            <Text className="text-slate-800 font-semibold">
              {ELEMENT_LABELS[order.elementType] ?? order.elementType ?? "—"}
            </Text>
          </View>
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">الكمية</Text>
            <Text className="text-slate-800 font-semibold">
              {order.quantity} {order.orderType === "concrete" ? "م³" : "بلوك"}
            </Text>
          </View>
          {order.orderType === "blocks" ? (
            <>
              <View className="flex-row justify-between mb-3">
                <Text className="text-slate-600">مواصفات البلك</Text>
                <Text className="text-slate-800 font-semibold flex-1 text-right">
                  {order.blockProduct
                    ? blockProductLabel(order.blockProduct)
                    : order.blockDimensions
                      ? `${order.blockDimensions} سم`
                      : "—"}
                </Text>
              </View>
              <View className="flex-row justify-between mb-3">
                <Text className="text-slate-600">العزل</Text>
                <Text className="text-slate-800 font-semibold">
                  {order.blockInsulated ? "❄️ معزول" : "بدون عزل"}
                </Text>
              </View>
              {order.blockInsulated && order.insulationType ? (
                <View className="flex-row justify-between mb-3">
                  <Text className="text-slate-600">نوع العزل</Text>
                  <Text className="text-slate-800 font-semibold flex-1 text-right">
                    {insulationLabel(order.insulationType)}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
          {order.concreteType ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">قوة الخرسانة</Text>
              <Text className="text-slate-800 font-semibold">
                {order.concreteType} · Slump {order.slump} cm
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">تاريخ الصب</Text>
            <Text className="text-slate-800 font-semibold">
              {order.orderDate}
            </Text>
          </View>
          {order.locationCoords ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">إحداثيات الصب</Text>
              <Text className="text-slate-800 font-semibold" style={{ writingDirection: "ltr" }}>
                {order.locationCoords}
              </Text>
            </View>
          ) : null}
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">المندوب</Text>
            <Text className="text-slate-800 font-semibold">
              {order.salesRep || "—"}
            </Text>
          </View>
          {order.notes ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">ملاحظات</Text>
              <Text className="text-slate-800 font-semibold flex-1 text-right">
                {order.notes}
              </Text>
            </View>
          ) : null}
          {order.serverCreatedAt ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">تاريخ الإنشاء (الخادم)</Text>
              <Text className="text-slate-800 font-semibold">
                {fmtTime(order.serverCreatedAt)}
              </Text>
            </View>
          ) : null}
          {order.serverUpdatedAt ? (
            <View className="flex-row justify-between mb-3">
              <Text className="text-slate-600">آخر تحديث (الخادم)</Text>
              <Text className="text-slate-800 font-semibold">
                {fmtTime(order.serverUpdatedAt)}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Account status */}
      <Card variant="elevated" className="mb-4">
        <Text className="text-xl font-bold text-slate-800 mb-4">حالة الحسابات</Text>
        <View className="self-start px-4 py-2 rounded-full mb-3 ${account.color}">
          <Text className={`font-bold ${account.color.split(" ")[0]}`}>
            {account.label}
          </Text>
        </View>
        {order.accountant ? (
          <View className="bg-slate-50 rounded-2xl p-4 mb-3">
            <View className="flex-row justify-between">
              <Text className="text-slate-600">مراجعة بواسطة</Text>
              <Text className="text-slate-800 font-semibold">
                {order.accountant}
              </Text>
            </View>
          </View>
        ) : null}
        {order.serverApprovedAt ? (
          <View className="bg-slate-50 rounded-2xl p-4 mb-3">
            <View className="flex-row justify-between">
              <Text className="text-slate-600">تاريخ القرار (الخادم)</Text>
              <Text className="text-slate-800 font-semibold">
                {fmtTime(order.serverApprovedAt)}
              </Text>
            </View>
          </View>
        ) : null}
        {order.accountComment ? (
          <View className="bg-amber-100 rounded-2xl p-4 mb-3">
            <Text className="text-amber-800 font-bold mb-1">
              💬 ملاحظة المحاسب
            </Text>
            <Text className="text-amber-900">{order.accountComment}</Text>
          </View>
        ) : null}
        <View className="bg-slate-50 rounded-2xl p-4">
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">جاهزية الموقع</Text>
            <Text className="text-slate-800 font-semibold">
              {order.siteReady ? "✅ جاهز" : "❌ غير جاهز"}
            </Text>
          </View>
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">وصول المضخة</Text>
            <Text className="text-slate-800 font-semibold">
              {order.pumpAccessible ? "✅ متاح" : "❌ غير متاح"}
            </Text>
          </View>
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">طالب تلج</Text>
            <Text className="text-slate-800 font-semibold">
              {order.requiresPump ? "🚰 نعم" : "لا"}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-slate-600">معمل اختبارات</Text>
            <Text className="text-slate-800 font-semibold">
              {order.requiresLab ? "🧪 نعم" : "لا"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Status Timeline */}
      <Card variant="elevated">
        <Text className="text-xl font-bold text-slate-800 mb-4">مراحل الطلب</Text>

        <View className="space-y-3">
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-emerald-500 rounded-full mr-3" />
            <Text className="text-slate-800 font-semibold">تم إنشاء الطلب</Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                order.accountStatus === "approved" ||
                order.status === "approved" ||
                order.status === "scheduled" ||
                order.status === "in_progress" ||
                order.status === "completed"
                  ? "bg-orange-500"
                  : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">
              بانتظار موافقة الحسابات
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                order.status === "scheduled" ||
                order.status === "in_progress" ||
                order.status === "completed"
                  ? "bg-blue-500"
                  : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">مجدول</Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                order.status === "in_progress" || order.status === "completed"
                  ? "bg-indigo-500"
                  : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">قيد التنفيذ</Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                order.status === "completed" ? "bg-emerald-500" : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">تم التسليم</Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}
