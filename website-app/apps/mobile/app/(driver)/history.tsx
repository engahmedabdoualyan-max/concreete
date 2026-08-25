/**
 * Driver History Screen
 * Shows past (completed / cancelled) trips from the live API
 */

import { View, Text, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import ChallanModal from "@/components/driver/ChallanModal";
import { api } from "@/lib/api";
import type { Trip } from "@/types";

export default function DriverHistoryScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [challanTrip, setChallanTrip] = useState<Trip | null>(null);

  const { data: trips, isLoading } = useQuery<Trip[]>({
    queryKey: ["my-trip-history"],
    queryFn: () => api.getMyTripHistory(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["my-trip-history"] });
    setRefreshing(false);
  }, [queryClient]);

  const renderItem = ({ item }: { item: Trip }) => (
    <Card variant="elevated" className="mb-3">
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1">
          <Text className="text-slate-500 text-sm mb-1">رقم الرحلة</Text>
          <Text className="text-xl font-bold text-slate-800">
            {item.tripNumber}
          </Text>
        </View>
        <StatusBadge status={item.isCompleted ? "DELIVERED" : "CANCELLED"} size="small" />
      </View>

      <View className="bg-slate-50 rounded-2xl p-3">
        {item.createdAt ? (
          <View className="flex-row justify-between mb-2">
            <Text className="text-slate-600 text-sm">التاريخ</Text>
            <Text className="text-slate-800 font-semibold text-sm">
              {new Date(item.createdAt).toLocaleDateString("ar-EG")}
            </Text>
          </View>
        ) : null}
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">العميل</Text>
          <Text className="text-slate-800 font-semibold text-sm">
            {item.clientName ?? "-"}
          </Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">الموقع</Text>
          <Text className="text-slate-800 font-semibold text-sm">
            {item.siteName ?? "-"}
          </Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-slate-600 text-sm">الكمية</Text>
          <Text className="text-slate-800 font-semibold text-sm">
            {item.totalVolumeM3 ?? "-"} م³
          </Text>
        </View>
        {item.cycleTimeMin ? (
          <View className="flex-row justify-between">
            <Text className="text-slate-600 text-sm">زمن الدورة</Text>
            <Text className="text-slate-800 font-semibold text-sm">
              {item.cycleTimeMin} دقيقة
            </Text>
          </View>
        ) : null}
      </View>

      {item.isCompleted ? (
        <TouchableOpacity
          onPress={() => setChallanTrip(item)}
          className={`mt-3 rounded-xl py-3 items-center ${item.hasChallan ? "bg-emerald-100" : "bg-orange-500"}`}
        >
          <Text
            className={`font-bold text-sm ${item.hasChallan ? "text-emerald-700" : "text-white"}`}
          >
            {item.hasChallan ? "✅ الشيكارة محفوظة — تعديل" : "🧾 إصدار شيكارة"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );

  return (
    <>
      <FlatList
        className="flex-1 bg-slate-50"
        contentContainerStyle={{ padding: 16 }}
        data={trips ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <Text className="text-2xl font-bold text-slate-800 mb-4">
            سجل الرحلات
          </Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-8">
                جارِ التحميل...
              </Text>
            </Card>
          ) : (
            <Card variant="default">
              <Text className="text-slate-600 text-center py-12">
                لا توجد رحلات سابقة بعد
              </Text>
            </Card>
          )
        }
      />
      <ChallanModal
        tripId={challanTrip?.id ?? ""}
        visible={!!challanTrip}
        onClose={() => setChallanTrip(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["my-trip-history"] })}
      />
    </>
  );
}
