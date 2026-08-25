/**
 * Schedule Manager Layout
 * Root layout for the schedule officer (مسئول الجدول) screen.
 */

import { Stack } from "expo-router";

export default function ScheduleLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0D9488" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen name="index" options={{ title: "مسئول الجدول" }} />
    </Stack>
  );
}
