/**
 * Root Layout
 * Handles authentication state and role-based routing
 */

import { Stack, Redirect, useSegments } from "expo-router";
import { useEffect, type ReactElement } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore, isDriver, isSalesRep } from "@/store/auth-store";
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

  // The Stack (navigator) must stay mounted on the first render and on every
  // render after, otherwise expo-router throws
  // "Attempted to navigate before mounting the Root Layout component".
  // Redirects are rendered as siblings and fire once the navigator is ready.
  let redirect: ReactElement | null = null;

  if (!isLoading) {
    if (isAuthenticated && user) {
      const home = isDriver(user)
        ? "/(driver)"
        : isSalesRep(user)
          ? "/(sales)"
          : "/(driver)";
      if (segments[0] === "(auth)" || segments[0] === undefined) {
        redirect = <Redirect href={home} />;
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
        <Stack.Screen name="(driver)" />
        <Stack.Screen name="(sales)" />
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
