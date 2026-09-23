/**
 * HeaderActions — shared header buttons for EVERY mobile screen.
 * Guarantees: profile shortcut + logout on all pages.
 */

import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";

export function HeaderActions() {
  const router = useRouter();
  const segments = useSegments();
  const { logout } = useAuthStore();
  const { t } = useT();

  const group = segments[0] ?? "(driver)";

  const goProfile = () => {
    router.push(`/${group}/profile` as never);
  };

  const confirmLogout = () => {
    Alert.alert(t("common.logout"), t("hr.logoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.logout"),
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } finally {
            router.replace("/(auth)/login" as never);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-row items-center gap-1 mr-1">
      <TouchableOpacity onPress={goProfile} className="p-1.5">
        <Text className="text-white text-lg">👤</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={confirmLogout} className="p-1.5">
        <Text className="text-white text-lg">🚪</Text>
      </TouchableOpacity>
    </View>
  );
}
