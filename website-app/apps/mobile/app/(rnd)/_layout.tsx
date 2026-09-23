/**
 * R&D Layout
 * Root layout for R&D Manager screens.
 * Every screen: HeaderActions (profile + logout) + HrFab (HR bridge).
 */

import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { HeaderActions } from "@/components/HeaderActions";
import { HrFab } from "@/components/HrFab";

export default function RndLayout() {
  const { user } = useAuthStore();
  const { t } = useT();

  return (
    <View className="flex-1">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0EA5E9" }, // Sky blue for R&D
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "bold", fontSize: 18 },
          headerTitleAlign: "center",
          headerRight: () => <HeaderActions />,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: t("rnd.title"),
            headerLeft: () => (
              <View className="ml-2">
                <Text className="text-white text-sm">
                  {t("common.welcome")}، {user?.fullName.split(" ")[0]}
                </Text>
              </View>
            ),
          }}
        />
        <Stack.Screen name="current-state" options={{ title: t("rnd.currentState") }} />
        <Stack.Screen name="development-plan" options={{ title: t("rnd.developmentPlan") }} />
        <Stack.Screen name="plan-detail" options={{ title: t("rnd.planDetail") }} />
        <Stack.Screen name="task-assignment" options={{ title: t("rnd.taskAssignment") }} />
        <Stack.Screen name="budget-planning" options={{ title: t("rnd.budgetPlanning") }} />
        <Stack.Screen name="weekly-tracking" options={{ title: t("rnd.weeklyTracking") }} />
        <Stack.Screen name="external-tasks" options={{ title: t("rnd.externalTasks") }} />
        <Stack.Screen name="competitor-analysis" options={{ title: t("rnd.competitors") }} />
        <Stack.Screen name="employee-evaluation" options={{ title: t("rnd.employeeEvaluation") }} />
        <Stack.Screen name="reports" options={{ title: t("rnd.reports") }} />
        <Stack.Screen name="profile" options={{ title: t("profile.title") }} />
      </Stack>
      <HrFab />
    </View>
  );
}
