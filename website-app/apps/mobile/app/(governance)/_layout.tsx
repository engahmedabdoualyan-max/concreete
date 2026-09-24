import { Stack } from "expo-router";

export default function GovernanceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#080C14" } }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
