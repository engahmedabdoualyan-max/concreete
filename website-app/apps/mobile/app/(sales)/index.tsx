/**
 * Sales Home Screen
 * Main screen for sales reps: booking form + orders list
 */

import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookingForm } from "@/components/sales/BookingForm";
import { OrderCard } from "@/components/sales/OrderCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import type { Order } from "@/types";

export default function SalesHomeScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Fetch orders
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["my-orders"],
    queryFn: () => api.getMyOrders(),
    refetchInterval: 30000, // Refresh every 30s
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: {
      clientId: string;
      siteId: string;
      mixDesignId: string;
      volumeM3: number;
      scheduledDate: string;
      location?: { latitude: number; longitude: number };
    }) => api.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      setShowForm(false);
    },
  });

  // Connect to Socket.io for real-time updates
  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    setRefreshing(false);
  }, [queryClient]);

  // Handle order creation
  const handleCreateOrder = async (data: {
    clientId: string;
    siteId: string;
    mixDesignId: string;
    volumeM3: number;
    scheduledDate: string;
    location?: { latitude: number; longitude: number };
  }) => {
    await createOrderMutation.mutateAsync(data);
  };

  // Stats
  const pendingCount = orders?.filter(
    (o) => o.status === "PENDING_FINANCE" || o.status === "CREDIT_HOLD"
  ).length ?? 0;
  const approvedCount = orders?.filter(
    (o) => o.status === "APPROVED" || o.status === "APPROVED_SCHEDULED"
  ).length ?? 0;

  return (
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
            معتمد للإنتاج
          </Text>
        </Card>
      </View>

      {/* New Order Button */}
      {!showForm && (
        <Button
          title="➕ طلب جديد"
          onPress={() => setShowForm(true)}
          size="large"
          className="mb-4"
        />
      )}

      {/* Booking Form */}
      {showForm && (
        <View className="mb-4">
          <Button
            title="❌ إلغاء"
            onPress={() => setShowForm(false)}
            variant="secondary"
            size="small"
            className="mb-2"
          />
          <BookingForm
            onSubmit={handleCreateOrder}
            loading={createOrderMutation.isPending}
          />
        </View>
      )}

      {/* Orders List */}
      <View>
        <Text className="text-xl font-bold text-slate-800 mb-3">
          طلباتي
        </Text>

        {isLoading ? (
          <Card variant="default">
            <Text className="text-slate-600 text-center py-4">
              جارِ التحميل...
            </Text>
          </Card>
        ) : orders && orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onPress={() => {
                // TODO: Navigate to order details
              }}
            />
          ))
        ) : (
          <Card variant="default">
            <Text className="text-slate-600 text-center py-8">
              لا توجد طلبات حالياً
            </Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
