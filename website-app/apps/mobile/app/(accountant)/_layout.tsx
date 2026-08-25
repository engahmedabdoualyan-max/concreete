/**
 * Accountant Layout
 * Root layout for the accountant (المحاسب) home — order approvals, invoices,
 * collections, suppliers and customer approval — with back + logout.
 */

import { Stack, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { useAuthStore } from "@/store/auth-store";

export default function AccountantLayout() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#F59E0B" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "شاشة المحاسب",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.replace("/(dashboard)" as any)}
              className="ml-2"
            >
              <Text className="text-white text-base">🏠 الرئيسية</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View className="mr-2 flex-row items-center gap-3">
              {user?.plantName ? (
                <Text className="text-white/90 text-xs">
                  🏭 {user.plantName}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => logout()}
                className="bg-red-500 active:bg-red-600 px-3 py-1.5 rounded-full"
              >
                <Text className="text-white font-bold text-sm">🚪 خروج</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
    </Stack>
  );
}
