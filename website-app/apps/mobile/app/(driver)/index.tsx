/**
 * Driver Home Screen
 * - Prominent background-location disclosure BEFORE the native prompt
 * - Offline banner + offline-queued checkpoint logging
 * - Resilient socket + background GPS tracking
 */

import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripCard } from "@/components/driver/TripCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BackgroundLocationDisclosure } from "@/components/BackgroundLocationDisclosure";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import { geolocation } from "@/lib/geolocation";
import { offlineSync } from "@/lib/offline-sync";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import type { Trip, TripCheckpoint } from "@/types";
import { CHECKPOINT_SEQUENCE } from "@/types";

export default function DriverHomeScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { t } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [trackingReady, setTrackingReady] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const { data: trip, isLoading } = useQuery<Trip>({
    queryKey: ["my-active-trip"],
    queryFn: () => api.getMyActiveTrip(),
    refetchInterval: 30000,
  });

  const updateCheckpointMutation = useMutation({
    mutationFn: async ({
      tripId,
      checkpoint,
      location,
    }: {
      tripId: string;
      checkpoint: TripCheckpoint;
      location?: { latitude: number; longitude: number };
    }) => {
      // Offline corridor → queue locally, auto-syncs on reconnect.
      if (!offlineSync.getIsConnected()) {
        await offlineSync.enqueue("CHECKPOINT", { tripId, checkpoint, location });
        return { queued: true };
      }
      try {
        await api.updateTripCheckpoint(tripId, checkpoint, location);
        return { queued: false };
      } catch {
        await offlineSync.enqueue("CHECKPOINT", { tripId, checkpoint, location });
        return { queued: true };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-active-trip"] });
      void offlineSync.pendingCount().then(setPendingCount);
    },
  });

  // Connect socket once
  useEffect(() => {
    socket.connect();
    return () => socket.disconnect();
  }, []);

  // Init offline engine + connectivity banner
  useEffect(() => {
    offlineSync.init();
    void offlineSync.pendingCount().then(setPendingCount);
    const unsub = offlineSync.onConnectivity((connected) => {
      setIsConnected(connected);
      if (connected) {
        void offlineSync.flush().then((r) => setPendingCount(r.remaining));
      }
    });
    return () => unsub();
  }, []);

  // Prominent disclosure gate → then background permission → then tracking
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trip || trip.isCompleted || !user) {
        setTrackingReady(false);
        return;
      }
      // Foreground first (safe pre-disclosure)
      await geolocation.requestForegroundPermission();
      const needs = await geolocation.needsBackgroundDisclosure();
      if (cancelled) return;
      if (needs) {
        setShowDisclosure(true); // show dialog BEFORE native bg prompt
      } else {
        setTrackingReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip?.id, trip?.isCompleted, user?.id]);

  // Start/stop tracking once the disclosure gate is satisfied
  useEffect(() => {
    if (trackingReady && trip && !trip.isCompleted && user) {
      geolocation.startTracking(trip.id, trip.vehicleId, user.id).catch(console.error);
    } else if (!trip || trip.isCompleted) {
      geolocation.stopTracking().catch(console.error);
    }
    return () => {
      geolocation.stopTracking().catch(console.error);
    };
  }, [trackingReady, trip?.id, trip?.isCompleted, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["my-active-trip"] });
    setRefreshing(false);
  }, [queryClient]);

  const handleCheckpointAction = async () => {
    if (!trip) return;
    const currentIndex = CHECKPOINT_SEQUENCE.indexOf(trip.currentCheckpoint);
    const nextCheckpoint = CHECKPOINT_SEQUENCE[currentIndex + 1];
    if (!nextCheckpoint) return;
    const location = await geolocation.getCurrentLocation();
    updateCheckpointMutation.mutate({
      tripId: trip.id,
      checkpoint: nextCheckpoint,
      location: location
        ? { latitude: location.latitude, longitude: location.longitude }
        : undefined,
    });
  };

  const disclosureDialog = (
    <BackgroundLocationDisclosure
      visible={showDisclosure}
      onAccept={async () => {
        await geolocation.setDisclosureAccepted();
        setShowDisclosure(false);
        // Now safe to trigger the native ACCESS_BACKGROUND_LOCATION prompt.
        await geolocation.requestPermissions();
        setTrackingReady(true);
      }}
      onDecline={() => {
        setShowDisclosure(false);
        setTrackingReady(true); // continues with foreground-only tracking
      }}
    />
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        {disclosureDialog}
        <Text className="text-slate-600 text-lg">جارِ تحميل الرحلة...</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View className="flex-1 bg-slate-50 p-6">
        {disclosureDialog}
        <Card variant="elevated" className="items-center py-12">
          <Text className="text-6xl mb-4">🚚</Text>
          <Text className="text-2xl font-bold text-slate-800 mb-2">لا توجد رحلة نشطة</Text>
          <Text className="text-slate-600 text-center text-base mb-6">
            سيتم إخطارك عند تعيين رحلة جديدة
          </Text>
          <Button
            title="تحديث"
            onPress={() => queryClient.invalidateQueries({ queryKey: ["my-active-trip"] })}
            variant="primary"
            size="medium"
          />
        </Card>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 20 }}
    >
      {disclosureDialog}

      {/* Offline banner (Module 4) */}
      {!isConnected && (
        <View className="bg-amber-100 rounded-2xl p-3 mb-3 flex-row items-center">
          <Text className="text-lg mr-2">📴</Text>
          <Text className="text-amber-800 font-semibold text-sm flex-1">
            {t("offline.banner")}
            {pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Text>
        </View>
      )}
      {isConnected && pendingCount > 0 && (
        <View className="bg-blue-100 rounded-2xl p-3 mb-3 flex-row items-center">
          <Text className="text-lg mr-2">🔄</Text>
          <Text className="text-blue-800 font-semibold text-sm flex-1">
            {t("offline.syncing")} ({pendingCount})
          </Text>
        </View>
      )}

      {/* GPS Status Indicator */}
      <View className="bg-emerald-50 rounded-2xl p-3 mb-4 flex-row items-center">
        <View className="w-3 h-3 bg-emerald-500 rounded-full mr-2" />
        <Text className="text-emerald-700 font-semibold text-sm">
          {t("driver.gpsActive")}
        </Text>
      </View>

      <TripCard
        trip={trip}
        onCheckpointAction={handleCheckpointAction}
        loading={updateCheckpointMutation.isPending}
      />

      {trip.deliveryTicketNumber && (
        <Card variant="default" className="mt-4">
          <Text className="text-slate-600 text-sm mb-1">رقم تذكرة التسليم</Text>
          <Text className="text-xl font-bold text-slate-800">{trip.deliveryTicketNumber}</Text>
        </Card>
      )}

      {trip.isCompleted && (
        <Card variant="elevated" className="mt-4 bg-emerald-50">
          <Text className="text-6xl text-center mb-4">✅</Text>
          <Text className="text-2xl font-bold text-emerald-800 text-center mb-2">
            {t("driver.completed")}
          </Text>
          <Text className="text-emerald-700 text-center">{t("driver.completedHint")}</Text>
        </Card>
      )}
    </ScrollView>
  );
}
