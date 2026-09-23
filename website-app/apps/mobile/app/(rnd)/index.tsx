/**
 * R&D Home Screen — "The Brain" Dashboard
 * Central hub: KPIs + quick navigation to all R&D workflows
 * (current state → plans → tasks → budget → weekly → issues → evaluations)
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import { Card } from "@/components/ui/Card";
import {
  useRndStore,
  selectActivePlans,
  selectPendingFinancePlans,
  selectOpenIssues,
  selectCriticalIssues,
  selectMyPendingTasks,
} from "@/store/rnd-store";
import { useT } from "@/lib/i18n";

interface NavTile {
  route: string;
  emoji: string;
  titleKey:
    | "rnd.currentState"
    | "rnd.developmentPlan"
    | "rnd.taskAssignment"
    | "rnd.budgetPlanning"
    | "rnd.weeklyTracking"
    | "rnd.externalTasks"
    | "rnd.competitors"
    | "rnd.employeeEvaluation"
    | "rnd.reports";
  badge?: number;
  bg: string;
}

export default function RndHomeScreen() {
  const router = useRouter();
  const { t } = useT();
  const store = useRndStore();

  const {
    currentState,
    plans,
    isRefreshing,
    error,
    loadCached,
    refreshAll,
    clearError,
  } = store;

  useEffect(() => {
    void loadCached().then(() => {
      void refreshAll();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const activePlans = selectActivePlans(store);
  const pendingFinance = selectPendingFinancePlans(store);
  const openIssues = selectOpenIssues(store);
  const criticalIssues = selectCriticalIssues(store);
  const myPendingTasks = selectMyPendingTasks(store);

  // KPI: production gap (target - current)
  const productionGap = currentState
    ? currentState.targetProductionCapacity - currentState.currentProductionCapacity
    : null;

  const tiles: NavTile[] = [
    { route: "/(rnd)/current-state", emoji: "📊", titleKey: "rnd.currentState", bg: "bg-sky-50" },
    { route: "/(rnd)/development-plan", emoji: "📋", titleKey: "rnd.developmentPlan", badge: activePlans.length, bg: "bg-indigo-50" },
    { route: "/(rnd)/task-assignment", emoji: "👷", titleKey: "rnd.taskAssignment", badge: myPendingTasks.length, bg: "bg-emerald-50" },
    { route: "/(rnd)/budget-planning", emoji: "💰", titleKey: "rnd.budgetPlanning", badge: pendingFinance.length, bg: "bg-amber-50" },
    { route: "/(rnd)/weekly-tracking", emoji: "📅", titleKey: "rnd.weeklyTracking", bg: "bg-violet-50" },
    { route: "/(rnd)/external-tasks", emoji: "⚠️", titleKey: "rnd.externalTasks", badge: openIssues.length, bg: "bg-red-50" },
    { route: "/(rnd)/competitor-analysis", emoji: "🏭", titleKey: "rnd.competitors", bg: "bg-orange-50" },
    { route: "/(rnd)/employee-evaluation", emoji: "⭐", titleKey: "rnd.employeeEvaluation", bg: "bg-teal-50" },
    { route: "/(rnd)/reports", emoji: "📈", titleKey: "rnd.reports", bg: "bg-slate-100" },
  ];

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Error banner */}
      {error ? (
        <TouchableOpacity onPress={clearError} className="mb-3">
          <Card variant="default" className="bg-red-50 border border-red-200">
            <Text className="text-red-700 text-center">{error}</Text>
          </Card>
        </TouchableOpacity>
      ) : null}

      {/* KPI Row */}
      <View className="flex-row gap-3 mb-3">
        <Card variant="default" className="flex-1 bg-sky-500">
          <Text className="text-3xl font-bold text-white text-center">
            {activePlans.length}
          </Text>
          <Text className="text-sky-100 text-xs text-center mt-1">
            {t("rnd.plan.status.in_progress")}
          </Text>
        </Card>
        <Card variant="default" className="flex-1 bg-amber-500">
          <Text className="text-3xl font-bold text-white text-center">
            {pendingFinance.length}
          </Text>
          <Text className="text-amber-100 text-xs text-center mt-1">
            {t("rnd.plan.status.pending_finance")}
          </Text>
        </Card>
        <Card
          variant="default"
          className={`flex-1 ${criticalIssues.length > 0 ? "bg-red-500" : "bg-emerald-500"}`}
        >
          <Text className="text-3xl font-bold text-white text-center">
            {openIssues.length}
          </Text>
          <Text className="text-white text-xs text-center mt-1 opacity-90">
            {t("rnd.external.title")}
          </Text>
        </Card>
      </View>

      {/* Production gap banner (the factory brain at a glance) */}
      {currentState && productionGap !== null ? (
        <Card variant="default" className="mb-3 bg-indigo-600">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-indigo-100 text-xs">
                {t("rnd.currentState.productionCapacity")} → {t("rnd.currentState.targetCapacity")}
              </Text>
              <Text className="text-white text-xl font-bold mt-1">
                {currentState.currentProductionCapacity.toLocaleString()} →{" "}
                {currentState.targetProductionCapacity.toLocaleString()} م³
              </Text>
              <Text className="text-indigo-200 text-xs mt-1">
                {productionGap > 0
                  ? `+${productionGap.toLocaleString()} م³ ${t("rnd.common.pending")}`
                  : t("rnd.common.completed")}
              </Text>
            </View>
            <Text className="text-4xl">🏭</Text>
          </View>
        </Card>
      ) : null}

      {/* Navigation grid */}
      <Text className="text-lg font-bold text-slate-800 mb-2 mt-1">
        🧠 {t("rnd.title")}
      </Text>
      <View className="flex-row flex-wrap gap-3 mb-4">
        {tiles.map((tile) => (
          <TouchableOpacity
            key={tile.route}
            onPress={() => router.push(tile.route as never)}
            className="w-[48%]"
          >
            <Card variant="default" className={`${tile.bg} relative`}>
              {tile.badge !== undefined && tile.badge > 0 ? (
                <View className="absolute top-2 right-2 bg-red-500 rounded-full min-w-[24px] h-6 items-center justify-center px-1">
                  <Text className="text-white text-xs font-bold">{tile.badge}</Text>
                </View>
              ) : null}
              <Text className="text-3xl text-center">{tile.emoji}</Text>
              <Text className="text-slate-800 text-sm font-bold text-center mt-2">
                {t(tile.titleKey)}
              </Text>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      {/* My pending tasks preview */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-lg font-bold text-slate-800">
          👷 {t("rnd.taskAssignment")} ({myPendingTasks.length})
        </Text>
        <TouchableOpacity onPress={() => router.push("/(rnd)/task-assignment" as never)}>
          <Text className="text-sky-600 text-sm font-bold">
            {t("rnd.report.taskSummary")} ←
          </Text>
        </TouchableOpacity>
      </View>
      {myPendingTasks.length === 0 ? (
        <Card variant="default" className="mb-4">
          <Text className="text-slate-500 text-center py-4">
            {t("rnd.common.noData")}
          </Text>
        </Card>
      ) : (
        myPendingTasks.slice(0, 3).map((task) => (
          <TouchableOpacity
            key={task.id}
            onPress={() => router.push("/(rnd)/task-assignment" as never)}
          >
            <Card variant="default" className="mb-2">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-slate-800 font-bold">{task.title}</Text>
                  <Text className="text-slate-500 text-xs mt-1">
                    {task.assigneeName} • {task.dueDate}
                  </Text>
                </View>
                <View className="bg-sky-100 rounded-full px-3 py-1">
                  <Text className="text-sky-700 text-xs font-bold">
                    {task.progress}%
                  </Text>
                </View>
              </View>
              {/* Progress bar */}
              <View className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-sky-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                />
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}

      {/* Plans count footer */}
      <Text className="text-slate-400 text-xs text-center mt-2 mb-6">
        {t("rnd.plan.create")} • {plans.length} • {t("common.loading")}
      </Text>
    </ScrollView>
  );
}
