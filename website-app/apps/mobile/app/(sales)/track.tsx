/**
 * Order Tracking Screen
 * Shows detailed status of a specific order
 */

import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import type { Order } from "@/types";

export default function TrackOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["order", orderId],
    queryFn: () => api.getOrderStatus(orderId!),
    enabled: !!orderId,
  });

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

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 20 }}>
      <Card variant="elevated" className="mb-4">
        <View className="flex-row justify-between items-start mb-4">
          <View className="flex-1">
            <Text className="text-slate-500 text-sm mb-1">رقم الطلب</Text>
            <Text className="text-2xl font-bold text-slate-800">
              {order.orderNumber}
            </Text>
          </View>
          <StatusBadge status={order.status} size="large" />
        </View>

        <View className="bg-slate-50 rounded-2xl p-4">
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">العميل</Text>
            <Text className="text-slate-800 font-semibold">
              {order.companyName}
            </Text>
          </View>
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">الموقع</Text>
            <Text className="text-slate-800 font-semibold">
              {order.siteName}
            </Text>
          </View>
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">الكمية</Text>
            <Text className="text-slate-800 font-semibold">
              {order.totalVolumeM3} م³
            </Text>
          </View>
          <View className="flex-row justify-between mb-3">
            <Text className="text-slate-600">تاريخ الصب</Text>
            <Text className="text-slate-800 font-semibold">
              {new Date(order.scheduledDate).toLocaleDateString("ar-SA")}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-slate-600">تاريخ الطلب</Text>
            <Text className="text-slate-800 font-semibold">
              {new Date(order.createdAt).toLocaleDateString("ar-SA")}
            </Text>
          </View>
        </View>
      </Card>

      {/* Status Timeline */}
      <Card variant="elevated">
        <Text className="text-xl font-bold text-slate-800 mb-4">
          مراحل الطلب
        </Text>

        <View className="space-y-3">
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-emerald-500 rounded-full mr-3" />
            <Text className="text-slate-800 font-semibold">
              تم إنشاء الطلب
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                ["PENDING_FINANCE", "CREDIT_HOLD", "APPROVED", "APPROVED_SCHEDULED", "IN_PRODUCTION", "IN_TRANSIT", "DELIVERED"].includes(order.status)
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
                ["APPROVED", "APPROVED_SCHEDULED", "IN_PRODUCTION", "IN_TRANSIT", "DELIVERED"].includes(order.status)
                  ? "bg-blue-500"
                  : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">
              معتمد من الحسابات
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                ["IN_PRODUCTION", "IN_TRANSIT", "DELIVERED"].includes(order.status)
                  ? "bg-indigo-500"
                  : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">
              قيد الإنتاج
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                ["IN_TRANSIT", "DELIVERED"].includes(order.status)
                  ? "bg-blue-500"
                  : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">
              في الطريق للموقع
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className={`w-3 h-3 rounded-full mr-3 ${
                order.status === "DELIVERED" ? "bg-emerald-500" : "bg-slate-200"
              }`}
            />
            <Text className="text-slate-800 font-semibold">
              تم التسليم
            </Text>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}
