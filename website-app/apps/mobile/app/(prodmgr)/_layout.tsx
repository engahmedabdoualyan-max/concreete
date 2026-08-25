/**
 * Production Manager Layout
 * Dedicated home for the production manager: KPIs + module shortcuts
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";

export default function ProductionMgrLayout() {
  const { user } = useAuthStore();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#059669" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "لوحة مدير الإنتاج",
          headerLeft: () => (
            <View className="ml-2">
              <Text className="text-white text-sm">
                مرحباً، {user?.fullName.split(" ")[0]}
              </Text>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(dashboard)/production" as any)}
              className="mr-2"
            >
              <Text className="text-white text-sm font-bold">الإنتاج</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
