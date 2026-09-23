/**
 * Driver Layout
 * Root layout for driver-specific screens.
 * Every screen: HeaderActions (profile + logout) + HrFab (HR bridge).
 */

import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { HeaderActions } from "@/components/HeaderActions";
import { HrFab } from "@/components/HrFab";

export default function DriverLayout() {
  const { user } = useAuthStore();
  const { t } = useT();

  return (
    <View className="flex-1">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#F97316" },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
          headerTitleAlign: "center",
          headerRight: () => <HeaderActions />,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "رحلة السائق",
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
        <Stack.Screen name="sign" options={{ title: "✍️ توقيع العميل" }} />
        <Stack.Screen name="profile" options={{ title: t("profile.title") }} />
      </Stack>
      <HrFab />
    </View>
  );
}
