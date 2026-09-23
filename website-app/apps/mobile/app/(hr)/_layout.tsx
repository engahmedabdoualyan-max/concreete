/**
 * HR Layout
 * Root layout for HR officer screens (teal header).
 * Every screen: HeaderActions (profile + logout) + HrFab.
 */

import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { HeaderActions } from "@/components/HeaderActions";
import { HrFab } from "@/components/HrFab";

export default function HrLayout() {
  const { user } = useAuthStore();
  const { t } = useT();

  return (
    <View className="flex-1">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0D9488" },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
          headerTitleAlign: "center",
          headerRight: () => <HeaderActions />,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: t("hr.title"),
            headerLeft: () => (
              <View className="ml-2">
                <Text className="text-white text-sm">
                  {t("common.welcome")}، {user?.fullName.split(" ")[0]}
                </Text>
              </View>
            ),
          }}
        />
        <Stack.Screen
          name="attendance"
          options={{ title: t("hr.attendance") }}
        />
        <Stack.Screen
          name="profile"
          options={{ title: t("profile.title") }}
        />
      </Stack>
      <HrFab />
    </View>
  );
}
