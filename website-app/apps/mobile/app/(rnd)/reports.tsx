/**
 * R&D Reports Screen
 * Aggregated read-only reports from store data:
 * plan progress, task summary, budget utilization,
 * weekly trends, issue tracking, employee performance.
 */

import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useCallback } from "react";
import { Card } from "@/components/ui/Card";
import {
  useRndStore,
  selectActivePlans,
  selectOpenIssues,
  selectMyPendingTasks,
} from "@/store/rnd-store";
import { useT } from "@/lib/i18n";

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
      <View
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </View>
  );
}

export default function RndReportsScreen() {
  const { t } = useT();
  const store = useRndStore();
  const { plans, myTasks, issues, evaluations, currentState, isRefreshing, refreshAll } = store;

  const onRefresh = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const activePlans = selectActivePlans(store);
  const openIssues = selectOpenIssues(store);
  const pendingTasks = selectMyPendingTasks(store);

  // Plan progress
  const avgPlanProgress =
    plans.length > 0
      ? Math.round(plans.reduce((s, p) => s + (p.overallProgress ?? 0), 0) / plans.length)
      : 0;

  // Task summary
  const doneTasks = myTasks.filter((x) => x.status === "done").length;
  const taskPct = myTasks.length > 0 ? Math.round((doneTasks / myTasks.length) * 100) : 0;

  // Production gap
  const gap =
    currentState
      ? currentState.targetProductionCapacity - currentState.currentProductionCapacity
      : 0;

  // Issues by severity
  const bySeverity = (["critical", "high", "medium", "low"] as const).map((sev) => ({
    sev,
    count: openIssues.filter((i) => i.severity === sev).length,
  }));

  // Team performance
  const avgTeam =
    evaluations.length > 0
      ? Math.round(
          (evaluations.reduce((s, e) => s + (e.overallScore ?? 0), 0) / evaluations.length) * 10
        ) / 10
      : 0;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Plan progress */}
      <Text className="text-base font-bold text-slate-800 mb-2">
        📋 {t("rnd.report.planProgress")}
      </Text>
      <Card variant="default" className="mb-3">
        <Text className="text-slate-700">
          {activePlans.length}/{plans.length} • {avgPlanProgress}%
        </Text>
        <Bar pct={avgPlanProgress} color="bg-indigo-500" />
        {currentState ? (
          <Text className="text-slate-500 text-xs mt-2">
            🏭 {currentState.currentProductionCapacity.toLocaleString()} →{" "}
            {currentState.targetProductionCapacity.toLocaleString()} م³ (
            {gap > 0 ? `+${gap.toLocaleString()}` : "0"})
          </Text>
        ) : null}
      </Card>

      {/* Task summary */}
      <Text className="text-base font-bold text-slate-800 mb-2">
        👷 {t("rnd.report.taskSummary")}
      </Text>
      <Card variant="default" className="mb-3">
        <Text className="text-slate-700">
          {doneTasks}/{myTasks.length} • {taskPct}%
        </Text>
        <Bar pct={taskPct} color="bg-sky-500" />
        <Text className="text-slate-500 text-xs mt-2">
          ⏳ {pendingTasks.length} {t("rnd.common.pending")}
        </Text>
      </Card>

      {/* Issue tracking */}
      <Text className="text-base font-bold text-slate-800 mb-2">
        ⚠️ {t("rnd.report.issueTracking")}
      </Text>
      <Card variant="default" className="mb-3">
        <Text className="text-slate-700 mb-2">
          🔓 {openIssues.length}/{issues.length}
        </Text>
        {bySeverity.map(({ sev, count }) => (
          <View key={sev} className="flex-row items-center gap-2 mb-1">
            <Text className="text-slate-600 text-xs w-20">
              {t(`rnd.external.severity.${sev}` as never)}
            </Text>
            <View className="flex-1">
              <Bar
                pct={openIssues.length > 0 ? (count / openIssues.length) * 100 : 0}
                color={sev === "critical" ? "bg-red-500" : sev === "high" ? "bg-orange-500" : "bg-amber-400"}
              />
            </View>
            <Text className="text-slate-700 text-xs font-bold w-8 text-right">{count}</Text>
          </View>
        ))}
      </Card>

      {/* Employee performance */}
      <Text className="text-base font-bold text-slate-800 mb-2">
        ⭐ {t("rnd.report.employeePerformance")}
      </Text>
      <Card variant="default" className="mb-3">
        <Text className="text-slate-700">
          {avgTeam}/10 ({evaluations.length})
        </Text>
        <Bar pct={avgTeam * 10} color="bg-teal-500" />
        {evaluations.slice(0, 5).map((ev) => (
          <View key={ev.id} className="flex-row items-center justify-between mt-2">
            <Text className="text-slate-600 text-sm flex-1" numberOfLines={1}>
              👤 {ev.employeeName}
            </Text>
            <Text className="text-slate-800 text-sm font-bold">{ev.overallScore}/10</Text>
          </View>
        ))}
      </Card>

      <View className="h-8" />
    </ScrollView>
  );
}
