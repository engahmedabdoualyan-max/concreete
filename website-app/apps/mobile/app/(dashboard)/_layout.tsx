/**
 * Dashboard Layout — native ERP dashboard stack
 */

import { Stack } from "expo-router";

export default function DashboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#080C14" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="operations" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="production" />
      <Stack.Screen name="workshop" />
      <Stack.Screen name="mixing" />
      <Stack.Screen name="schedule" />
      <Stack.Screen name="evaluation" />
      <Stack.Screen name="rnd" />
      <Stack.Screen name="owner" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="admin-stations" />
      <Stack.Screen name="admin-assets" />
    </Stack>
  );
}
