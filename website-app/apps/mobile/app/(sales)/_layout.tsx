/**
 * Sales Layout
 * Root layout for sales rep screens
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";

export default function SalesLayout() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { t } = useT();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#F97316" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "طلبات المبيعات",
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push("/(sales)/profile")} className="mr-2">
              <Text className="text-white text-lg">👤</Text>
            </TouchableOpacity>
          ),
          headerLeft: () => (
            <View className="ml-2">
              <Text className="text-white text-sm">
                مرحباً، {user?.fullName.split(" ")[0]}
              </Text>
              {user?.plantName ? (
                <Text className="text-white/80 text-xs">
                  🏭 {user.plantName}
                </Text>
              ) : null}
            </View>
          ),
        }}
      />
      <Stack.Screen name="track" options={{ title: "متابعة الطلبات" }} />
      <Stack.Screen name="profile" options={{ title: t("profile.title") }} />
    </Stack>
  );
}
