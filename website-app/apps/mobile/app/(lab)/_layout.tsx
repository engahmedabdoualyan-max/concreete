/**
 * Lab Manager Layout (مدير مختبر)
 * Dedicated home: quality checks, concrete samples (7d/28d strength),
 * equipment calibration and mix-design recipes.
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";

export default function LabLayout() {
  const { user } = useAuthStore();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0E7490" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "المختبر والجودة",
          headerLeft: () => (
            <View className="ml-2">
              <Text className="text-white text-sm">
                مرحباً، {user?.fullName.split(" ")[0]}
              </Text>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(dashboard)/mixing" as any)}
              className="mr-2"
            >
              <Text className="text-white text-sm font-bold">الوحدة</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
