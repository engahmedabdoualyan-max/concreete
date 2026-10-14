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
import { isRtl, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { getItem } from "@/lib/storage";
import { discoverApiServer } from "@/lib/server-discovery";
import { flushErrorReports, reportError } from "@/lib/error-reporting";
import { reportPresence } from "@/lib/firestore";
import "@/lib/nativewind-interop";
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
  // Desktop/web: the mobile UI fills the whole window like a tablet in
  // landscape. No side gutters, no capped column — the screens are flex
  // layouts, so they use the extra width instead of stretching.
  const frameMaxWidth = "100%";

  useEffect(() => {
    initialize();
    // Web/desktop only: find the current API server (a Render free service or a
    // tunnel can move) unless the user pinned one on the login screen.
    if (Platform.OS === "web") {
      void discoverApiServer();
    }
  }, []);

  // Unhandled errors are otherwise invisible to us: the customer says "the app
  // does nothing" and there is nothing to look at. Hand them to the server log
  // (POST /api/public/client-error) and replay anything queued while offline.
  useEffect(() => {
    const handler = (error: unknown) => {
      void reportError(error, { context: ["unhandled"] });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void reportError(event.reason, { context: ["unhandled-rejection"] });
    };

    // React Native's global JS error hook.
    const errorUtils = (globalThis as any).ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
      void reportError(error, { context: [isFatal ? "fatal" : "js-error"] });
      previousHandler?.(error, isFatal);
    });

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("error", handler);
      window.addEventListener("unhandledrejection", onRejection);
    }
    const onForeground = () => {
      if (AppState.currentState === "active") void flushErrorReports();
    };
    const subscription = AppState.addEventListener("change", onForeground);

    return () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("error", handler);
        window.removeEventListener("unhandledrejection", onRejection);
      }
      if (previousHandler) errorUtils?.setGlobalHandler?.(previousHandler);
      subscription.remove();
    };
  }, []);

  // Text direction follows the selected language: Arabic mirrors the whole UI
  // to the right, English/others lay out from the left. The document direction
  // is what makes react-native-web flip every `flex-direction: row`, so it is
  // set once here and re-applied whenever a screen switches language.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const apply = (locale: string) => {
      const dir = isRtl(locale as Locale) ? "rtl" : "ltr";
      document.documentElement.setAttribute("dir", dir);
      document.documentElement.setAttribute("lang", locale);
      document.getElementById("root")?.setAttribute("dir", dir);
    };
    // The app's own copy is Arabic, so Arabic is the fallback until a language
    // has actually been chosen.
    void getItem("fimto_locale").then((stored) => {
      apply(
        stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)
          ? stored
          : "ar",
      );
    });
    const onLocale = (event: Event) => {
      apply((event as CustomEvent<string>).detail);
    };
    window.addEventListener("fimto:locale", onLocale);
    return () => window.removeEventListener("fimto:locale", onLocale);
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
      {/* `display: flex` is set explicitly on purpose: react-native-web does not
          always emit the flex display for these wrappers, and WebKit then lays
          them out as blocks — which silently killed `alignItems: "center"` and
          dropped the tablet column into the top-left corner. */}
      <View
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: "#E2E8F0",
        }}
      >
      <View
        className={Platform.OS === "web" ? "fimto-frame" : undefined}
        style={
          Platform.OS === "web"
            ? {
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignSelf: "center",
                width: "100%",
                maxWidth: frameMaxWidth,
                position: "relative",
                backgroundColor: "#F8FAFC",
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: "#CBD5E1",
                shadowColor: "#0F172A",
                shadowOpacity: 0.1,
                shadowRadius: 18,
                elevation: 4,
              }
            : { flex: 1 }
        }
      >
      <View
        className={Platform.OS === "web" ? "fimto-content" : undefined}
        style={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
      <Stack
        screenOptions={{
          headerShown: false,
          // No absolute positioning here: taking the scene out of flow made it
          // overlap the header band and start the page halfway down. The
          // navigator's own containers are forced to fill the frame by
          // `.fimto-content` in global.css, so normal flow lays the header out
          // first and the screen underneath it.
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
      </View>
    </QueryClientProvider>
  );
}
