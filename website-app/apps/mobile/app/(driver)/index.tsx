/**
 * Driver Home Screen
 * - Prominent background-location disclosure BEFORE the native prompt
 * - Offline banner + offline-queued checkpoint logging
 * - Resilient socket + background GPS tracking
 */

import { View, Text, ScrollView, RefreshControl, Linking, Alert } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TripCard } from "@/components/driver/TripCard";
import ReportBreakdownModal from "@/components/driver/ReportBreakdownModal";
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
import { CHECKPOINT_SEQUENCE, APK_DOWNLOAD_URL, IOS_DOWNLOAD_URL } from "@/types";

export default function DriverHomeScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [trackingReady, setTrackingReady] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data: trip, isLoading } = useQuery<Trip>({
    queryKey: ["my-active-trip"],
    queryFn: () => api.getMyActiveTrip(),
    refetchInterval: 30000,
  });

  const assignedVehicleType = user?.vehicleType || "";

  // Live drum telemetry + workability countdown while hauling (Epic 5)
  const hauling = !!trip && !trip.isCompleted && trip.currentCheckpoint === "DEP_PLANT";
  const { data: telemetry } = useQuery<any>({
    queryKey: ["trip-telemetry", trip?.id],
    queryFn: () => api.getTripTelemetry(trip!.id),
    enabled: hauling,
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

  // Attendance ping (Epic 12b) — every 5 min while on duty, best-effort.
  // First zone entry = check-in, last exit = check-out (server-derived).
  useEffect(() => {
    if (!trackingReady || !trip || trip.isCompleted) return;
    let cancelled = false;
    const sendPing = async () => {
      try {
        const loc = await geolocation.getCurrentLocation();
        if (!cancelled && loc) {
          await api.pingAttendance(loc.latitude, loc.longitude);
        }
      } catch {
        // Attendance pings must never disturb the trip flow
      }
    };
    void sendPing();
    const timer = setInterval(sendPing, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [trackingReady, trip?.id, trip?.isCompleted]);

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

          <View className="w-full px-4 mb-6">
            <Text className="text-slate-600 font-semibold mb-2 text-center">نوع سيارتك (محدد من الإدارة)</Text>
            <View className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 items-center">
              <Text className="font-bold text-slate-800 text-lg">{assignedVehicleType}</Text>
            </View>
          </View>

          <Button
            title="تحديث"
            onPress={() => queryClient.invalidateQueries({ queryKey: ["my-active-trip"] })}
            variant="primary"
            size="medium"
          />
          <Button
            title="🛠️ إبلاغ عن عطل"
            onPress={() => setShowBreakdown(true)}
            variant="secondary"
            size="medium"
          />
        </Card>
        <ReportBreakdownModal
          visible={showBreakdown}
          onClose={() => setShowBreakdown(false)}
          vehicleType={assignedVehicleType}
        />
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

      {/* Vehicle Type (set by owner in admin) */}
      <View className="bg-white rounded-2xl p-4 mb-4 border-2 border-slate-100">
        <Text className="text-slate-600 font-semibold mb-2 text-center">🚛 نوع سيارتك (محدد من الإدارة)</Text>
        <View className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 items-center">
          <Text className="font-bold text-slate-800 text-lg">{assignedVehicleType}</Text>
        </View>
      </View>

      {/* Drum workability banner (Epic 5) — live while hauling to site */}
      {hauling && telemetry?.workability && telemetry.workability.status !== "UNKNOWN" && (
        <View
          className={`rounded-2xl p-3 mb-4 flex-row items-center ${
            telemetry.workability.status === "EXPIRED"
              ? "bg-red-100"
              : telemetry.workability.status === "AGING"
                ? "bg-amber-100"
                : "bg-sky-100"
          }`}
        >
          <Text className="text-lg mr-2">🥁</Text>
          <Text
            className={`font-semibold text-sm flex-1 ${
              telemetry.workability.status === "EXPIRED"
                ? "text-red-800"
                : telemetry.workability.status === "AGING"
                  ? "text-amber-800"
                  : "text-sky-800"
            }`}
          >
            {t("driver.telemetry.workability")}: {telemetry.workability.remainingMinutes}
            {t("driver.telemetry.minLeft")}
            {telemetry.aggregate?.avgRpm != null ? ` • ${telemetry.aggregate.avgRpm} RPM` : ""}
          </Text>
        </View>
      )}

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

      {/* Customer e-signature prompt (Epic 3) — after pour, before leaving site */}
      {trip.currentCheckpoint === "DEP_SITE" && !trip.hasSignature && (
        <Card variant="elevated" className="mt-4 bg-indigo-50 border border-indigo-200">
          <Text className="text-4xl text-center mb-2">✍️</Text>
          <Text className="text-lg font-bold text-indigo-900 text-center mb-1">
            {t("driver.sign.promptTitle")}
          </Text>
          <Text className="text-indigo-700 text-sm text-center mb-3">
            {t("driver.sign.promptHint")}
          </Text>
          <Button
            title={t("driver.sign.openPad")}
            onPress={() =>
              router.push({ pathname: "/(driver)/sign", params: { tripId: trip.id } } as never)
            }
            variant="primary"
            size="medium"
          />
        </Card>
      )}

      {trip.hasSignature && (
        <Card variant="default" className="mt-4 bg-emerald-50">
          <Text className="text-emerald-700 font-bold text-center">
            ✍️ {t("driver.sign.done")} {trip.signedBy ? `— ${trip.signedBy}` : ""}
          </Text>
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

      <View className="mt-4">
        <Button
          title="🛠️ إبلاغ عن عطل"
          onPress={() => setShowBreakdown(true)}
          variant="secondary"
          size="medium"
        />
      </View>

      <ReportBreakdownModal
        visible={showBreakdown}
        onClose={() => setShowBreakdown(false)}
        vehicleId={trip.vehicleId}
        vehicleCode={trip.vehicleCode}
        tripId={trip.id}
        vehicleType={assignedVehicleType}
      />

      {/* Native app download buttons */}
      <View className="flex-row items-center justify-center gap-3 mt-4 mb-2">
        <Button
          title={t("download.android")}
          onPress={() => {
            Linking.openURL(APK_DOWNLOAD_URL).catch(() =>
              Alert.alert(t("download.failed"), t("download.androidError"))
            );
          }}
          variant="secondary"
          size="medium"
        />
        <Button
          title={t("download.ios")}
          onPress={() => {
            Linking.openURL(IOS_DOWNLOAD_URL).catch(() =>
              Alert.alert(t("download.failed"), t("download.iosError"))
            );
          }}
          variant="secondary"
          size="medium"
        />
      </View>
    </ScrollView>
  );
}
