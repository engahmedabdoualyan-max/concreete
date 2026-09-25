/**
 * Root Layout
 * Handles authentication state and role-based routing
 */

import { Stack, Redirect, useSegments } from "expo-router";
import { useEffect, type ReactElement } from "react";
import { ActivityIndicator, AppState, View, Text, Platform } from "react-native";
import * as Updates from "expo-updates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore, isDriver, isSalesRep, isOperationsMgr, isProductionMgr, isStationTech, isAccountant, isScheduleMgr, isLabTech, isWorkshopManager, isRepsManager, isRndManager, isHrOfficer, isBatchOperator } from "@/store/auth-store";
import { isSubscriptionExpired } from "@/lib/tree-auth";
import { reportPresence } from "@/lib/firestore";
import "../global.css";

/** Route groups that belong to a specific role (used by the cross-group guard). */
const ROLE_HOME_GROUPS = [
  "driver",
  "sales",
  "accountant",
  "schedule",
  "stationtech",
  "opsmgr",
  "prodmgr",
  "lab",
  "workshop",
  "repsmgr",
  "rnd",
  "hr",
  "dashboard",
  "governance",
];

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

  // OTA: check on launch and whenever the app returns to the foreground.
  // JS/assets update in place; local storage and remote Firestore data stay intact.
  useEffect(() => {
    let cancelled = false;
    let checking = false;

    const checkForOtaUpdate = async () => {
      if (checking || cancelled) return;
      checking = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable && !cancelled) {
          await Updates.fetchUpdateAsync();
          if (!cancelled) await Updates.reloadAsync();
        }
      } catch {
        // Offline/stale update checks must never block normal app startup.
      } finally {
        checking = false;
      }
    };

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkForOtaUpdate();
    });
    void checkForOtaUpdate();

    return () => {
      cancelled = true;
      subscription.remove();
    };
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
                  : isProductionMgr(user) || isBatchOperator(user)
                    ? "/(prodmgr)"
                : isLabTech(user)
                  ? "/(lab)"
                  : isWorkshopManager(user)
                    ? "/(workshop)"
                    : isRepsManager(user)
                      ? "/(repsmgr)"
                      : user.role === "RND_MANAGER"
                        ? "/(rnd)"
                        : user.role === "HR_OFFICER"
                          ? "/(hr)"
                          : "/(dashboard)";
        if (segments[0] === "(auth)" || segments[0] === undefined) {
          redirect = <Redirect href={home as any} />;
        } else if (
          user.role !== "SUPER_ADMIN" &&
          segments[0] !== "(subscription)" &&
          ROLE_HOME_GROUPS.includes(segments[0] as string) &&
          segments[0] !== home.slice(2, -1)
        ) {
          // Authenticated non-owners stay inside their own role group —
          // deep links into other roles bounce back to the role home.
          redirect = <Redirect href={home as any} />;
        }
      }
    } else if (segments[0] !== "(auth)") {
      redirect = <Redirect href="/(auth)/login" />;
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, alignItems: "center", backgroundColor: "#0B111E" }}>
      <View
        style={
          Platform.OS === "web"
            ? {
                flex: 1,
                width: "100%",
                maxWidth: 640,
                backgroundColor: "#F8FAFC",
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }
            : { flex: 1 }
        }
      >
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
        <Stack.Screen name="(rnd)" />
        <Stack.Screen name="(hr)" />
      </Stack>
      {redirect}
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center bg-white">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-4 text-slate-600 text-lg">جارِ التحميل...</Text>
        </View>
      )}
      </View>
      </View>
    </QueryClientProvider>
  );
}
