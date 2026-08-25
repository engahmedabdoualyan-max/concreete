/**
 * Reps Manager Layout (مدير المناديب)
 */

import { Stack } from "expo-router";

export default function RepsMgrLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
