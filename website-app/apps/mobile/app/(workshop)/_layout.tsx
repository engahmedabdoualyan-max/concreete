/**
 * Workshop Manager Layout (مدير ورشة)
 */

import { Stack } from "expo-router";

export default function WorkshopLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#6D28D9" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen name="index" options={{ title: "الورشة والصيانة" }} />
    </Stack>
  );
}
