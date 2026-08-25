/**
 * Station Maintenance Technician Layout
 * Dedicated home for فني صيانة محطات: daily checks (اتشك يومي),
 * follow-up schedule (جدول متابعة) and change requests (طلبات تغيير).
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";

export default function StationTechLayout() {
  const { user } = useAuthStore();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#075985" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "صيانة المحطات",
          headerLeft: () => (
            <View className="ml-2">
              <Text className="text-white text-sm">
                مرحباً، {user?.fullName.split(" ")[0]}
              </Text>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(dashboard)/workshop" as any)}
              className="mr-2"
            >
              <Text className="text-white text-sm font-bold">الورشة</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
