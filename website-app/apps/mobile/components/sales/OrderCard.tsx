/**
 * Order Card Component (Sales Rep View)
 * Displays order with color-coded status
 */

import { View, Text, TouchableOpacity } from "react-native";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Order } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface OrderCardProps {
  order: Order;
  onPress?: () => void;
}

export function OrderCard({ order, onPress }: OrderCardProps) {
  const timeAgo = formatDistanceToNow(new Date(order.createdAt), {
    addSuffix: true,
    locale: ar,
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card variant="default" className="mb-3">
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1">
            <Text className="text-slate-500 text-sm mb-1">رقم الطلب</Text>
            <Text className="text-xl font-bold text-slate-800">
              {order.orderNumber}
            </Text>
          </View>
          <StatusBadge status={order.status} size="medium" />
        </View>

        <View className="bg-slate-50 rounded-2xl p-3 mb-3">
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">العميل</Text>
            <Text className="text-slate-800 font-semibold">
              {order.companyName}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">الموقع</Text>
            <Text className="text-slate-800 font-semibold">
              {order.siteName}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-slate-600 text-sm">الكمية</Text>
            <Text className="text-slate-800 font-semibold">
              {order.totalVolumeM3} م³
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between items-center">
          <Text className="text-slate-500 text-sm">{timeAgo}</Text>
          <Text className="text-orange-500 font-semibold text-sm">
            عرض التفاصيل ←
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}
