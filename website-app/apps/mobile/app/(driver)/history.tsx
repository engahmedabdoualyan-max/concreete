/**
 * Driver History Screen
 * Shows past trips
 */

import { View, Text, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

export default function DriverHistoryScreen() {
  const { data: trips, isLoading } = useQuery({
    queryKey: ["my-trip-history"],
    queryFn: () => api.getMyActiveTrip(), // TODO: Change to history endpoint
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-slate-600">جارِ التحميل...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 p-4">
      <Text className="text-2xl font-bold text-slate-800 mb-4">
        سجل الرحلات
      </Text>
      <Text className="text-slate-600 text-center py-12">
        سيتم عرض الرحلات السابقة هنا
      </Text>
    </View>
  );
}
