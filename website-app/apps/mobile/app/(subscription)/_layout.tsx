/**
 * Subscription Layout
 */

import { Stack } from "expo-router";

export default function SubscriptionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
