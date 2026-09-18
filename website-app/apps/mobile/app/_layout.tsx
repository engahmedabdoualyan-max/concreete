/**
 * Root Layout
 * Handles authentication state and role-based routing
 */

import { Stack, Redirect, useSegments } from "expo-router";
import { useEffect, type ReactElement } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore, isDriver, isSalesRep, isOperationsMgr, isProductionMgr, isStationTech, isAccountant, isScheduleMgr, isLabTech, isWorkshopManager, isRepsManager } from "@/store/auth-store";
import { isSubscriptionExpired } from "@/lib/tree-auth";
import { reportPresence } from "@/lib/firestore";
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function RootLayout() {
  const { isAuthenticated, isLoading, user, initialize } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    initialize();
  }, []);

  // Online presence heartbeat — mirrors the website PresenceTracker so mobile
  // users appear under the Console/Admin "المتواجدون الآن" panel (5-min window).
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const presenceId = (user.email || user.zone || "").trim().toLowerCase();
    if (!presenceId) return;
    void reportPresence(presenceId);
    const timer = setInterval(() => void reportPresence(presenceId), 30_000);
    return () => clearInterval(timer);
  }, [isAuthenticated, user]);

  // The Stack (navigator) must stay mounted on the first render and on every
  // render after, otherwise expo-router throws
  // "Attempted to navigate before mounting the Root Layout component".
  // Redirects are rendered as siblings and fire once the navigator is ready.
  let redirect: ReactElement | null = null;

  if (!isLoading) {
    if (isAuthenticated && user) {
      // Locked company — expired subscription blocks every user (owner included)
      // until it is renewed in the website Console.
      if (isSubscriptionExpired(user)) {
        if ((segments[0] as any) !== "(subscription)") {
          redirect = <Redirect href={"/(subscription)" as any} />;
        }
      } else {
        const home = isDriver(user)
          ? "/(driver)"
          : isSalesRep(user)
            ? "/(sales)"
            : isAccountant(user)
              ? "/(accountant)"
              : isScheduleMgr(user)
                ? "/(schedule)"
                : isStationTech(user)
                ? "/(stationtech)"
                : isOperationsMgr(user)
                  ? "/(opsmgr)"
                  : isProductionMgr(user)
                    ? "/(prodmgr)"
                : isLabTech(user)
                  ? "/(lab)"
                  : isWorkshopManager(user)
                    ? "/(workshop)"
                    : isRepsManager(user)
                      ? "/(repsmgr)"
                      : "/(dashboard)";
        if (segments[0] === "(auth)" || segments[0] === undefined) {
          redirect = <Redirect href={home as any} />;
        }
      }
    } else if (segments[0] !== "(auth)") {
      redirect = <Redirect href="/(auth)/login" />;
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F8FAFC" },
        }}
      >
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(subscription)" />
        <Stack.Screen name="(driver)" />
        <Stack.Screen name="(sales)" />
        <Stack.Screen name="(accountant)" />
        <Stack.Screen name="(schedule)" />
        <Stack.Screen name="(stationtech)" />
        <Stack.Screen name="(opsmgr)" />
        <Stack.Screen name="(prodmgr)" />
        <Stack.Screen name="(lab)" />
        <Stack.Screen name="(workshop)" />
        <Stack.Screen name="(repsmgr)" />
        <Stack.Screen name="(dashboard)" />
      </Stack>
      {redirect}
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center bg-white">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-4 text-slate-600 text-lg">جارِ التحميل...</Text>
        </View>
      )}
    </QueryClientProvider>
  );
}
