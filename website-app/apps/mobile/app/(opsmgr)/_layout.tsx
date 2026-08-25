/**
 * Operations Manager Layout
 * Dedicated home for the operations manager: KPIs + module shortcuts
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";

export default function OperationsMgrLayout() {
  const { user } = useAuthStore();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#EA580C" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "لوحة مدير التشغيل",
          headerLeft: () => (
            <View className="ml-2">
              <Text className="text-white text-sm">
                مرحباً، {user?.fullName.split(" ")[0]}
              </Text>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(dashboard)/operations" as any)}
              className="mr-2"
            >
              <Text className="text-white text-sm font-bold">التشغيل</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
