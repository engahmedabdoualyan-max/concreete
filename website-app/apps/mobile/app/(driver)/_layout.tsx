/**
 * Driver Layout
 * Root layout for driver-specific screens
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";

export default function DriverLayout() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { t } = useT();

  return (
    <>
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
            title: "رحلة السائق",
            headerRight: () => (
              <TouchableOpacity onPress={() => router.push("/(driver)/profile")} className="mr-2">
                <Text className="text-white text-lg">👤</Text>
              </TouchableOpacity>
            ),
            headerLeft: () => (
              <View className="ml-2">
                <Text className="text-white text-sm">
                  مرحباً، {user?.fullName.split(" ")[0]}
                </Text>
              </View>
            ),
          }}
        />
        <Stack.Screen
          name="history"
          options={{ title: "سجل الرحلات" }}
        />
        <Stack.Screen name="profile" options={{ title: t("profile.title") }} />
      </Stack>
    </>
  );
}
