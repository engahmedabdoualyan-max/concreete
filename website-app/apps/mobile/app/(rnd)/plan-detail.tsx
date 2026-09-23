/**
 * Plan Detail Screen
 * Full 360° view of one development plan:
 * milestones + tasks + budget summary + weekly tracking.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useRndStore } from "@/store/rnd-store";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { RnDTask, BudgetPlan, WeeklyTracking } from "@/types/rnd";

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const { t } = useT();
  const { plans, upsertPlan } = useRndStore();

  const plan = plans.find((p) => p.id === planId);

  const [tasks, setTasks] = useState<RnDTask[]>([]);
  const [budgets, setBudgets] = useState<BudgetPlan[]>([]);
  const [weekly, setWeekly] = useState<WeeklyTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"milestones" | "tasks" | "budget" | "weekly">("milestones");

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const [t2, b2, w2, fresh] = await Promise.all([
        rndApi.getTasks(planId),
        rndApi.getBudgetPlans(planId),
        rndApi.getWeeklyEntries(planId),
        rndApi.getPlanById(planId).catch(() => null),
      ]);
      setTasks(t2);
      setBudgets(b2);
      setWeekly(w2);
      if (fresh) upsertPlan(fresh);
    } catch {
      // Offline — show cached plan header, empty relations
    } finally {
      setLoading(false);
    }
  }, [planId, upsertPlan]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  if (!plan) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center p-6">
        <Text className="text-slate-500 text-center">{t("rnd.common.noData")}</Text>
        <Button title={t("common.retry")} onPress={() => router.back()} size="small" className="mt-4" />
      </View>
    );
  }

  const totalBudget = budgets.reduce((s, b) => s + (b.totalBudget ?? 0), 0) || plan.budget || 0;
  const spentBudget = budgets.reduce((s, b) => s + (b.spentBudget ?? 0), 0);
  const budgetPct = totalBudget > 0 ? Math.round((spentBudget / totalBudget) * 100) : 0;

  const tabs = [
    { key: "milestones", emoji: "🎯" },
    { key: "tasks", emoji: "👷" },
    { key: "budget", emoji: "💰" },
    { key: "weekly", emoji: "📅" },
  ] as const;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Header */}
      <Card variant="elevated" className="mb-3 bg-indigo-600">
        <Text className="text-white text-lg font-bold">{plan.title}</Text>
        <Text className="text-indigo-200 text-sm mt-1">{plan.description}</Text>
        <Text className="text-indigo-200 text-xs mt-2">
          {plan.startDate} → {plan.endDate} • {t(`rnd.plan.priority.${plan.priority}` as never)}
        </Text>
        <View className="h-2 bg-indigo-400/40 rounded-full mt-3 overflow-hidden">
          <View
            className="h-full bg-white rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, plan.overallProgress ?? 0))}%` }}
          />
        </View>
        <Text className="text-white text-xs mt-1 font-bold">
          {t("rnd.weekly.overallProgress")}: {plan.overallProgress ?? 0}%
        </Text>
      </Card>

      {/* Quick actions */}
      <View className="flex-row gap-2 mb-3">
        <TouchableOpacity
          className="flex-1"
          onPress={() =>
            router.push({
              pathname: "/(rnd)/task-assignment",
              params: { planId: plan.id },
            } as never)
          }
        >
          <Card variant="default" className="bg-emerald-50 items-center">
            <Text className="text-2xl">👷</Text>
            <Text className="text-emerald-800 text-xs font-bold mt-1">{t("rnd.task.assign")}</Text>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1"
          onPress={() =>
            router.push({
              pathname: "/(rnd)/weekly-tracking",
              params: { planId: plan.id },
            } as never)
          }
        >
          <Card variant="default" className="bg-violet-50 items-center">
            <Text className="text-2xl">📅</Text>
            <Text className="text-violet-800 text-xs font-bold mt-1">{t("rnd.weekly.addEntry")}</Text>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1"
          onPress={() =>
            router.push({
              pathname: "/(rnd)/budget-planning",
              params: { planId: plan.id },
            } as never)
          }
        >
          <Card variant="default" className="bg-amber-50 items-center">
            <Text className="text-2xl">💰</Text>
            <Text className="text-amber-800 text-xs font-bold mt-1">{t("rnd.budget.addItem")}</Text>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View className="flex-row gap-2 mb-3">
        {tabs.map((tb) => (
          <TouchableOpacity
            key={tb.key}
            onPress={() => setTab(tb.key)}
            className={`flex-1 py-2 rounded-xl items-center ${
              tab === tb.key ? "bg-slate-800" : "bg-white border border-slate-200"
            }`}
          >
            <Text className={`font-bold ${tab === tb.key ? "text-white" : "text-slate-600"}`}>
              {tb.emoji}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Milestones */}
      {tab === "milestones" &&
        ((plan.milestones ?? []).length === 0 ? (
          <Card variant="default">
            <Text className="text-slate-500 text-center py-4">{t("rnd.common.noData")}</Text>
          </Card>
        ) : (
          (plan.milestones ?? []).map((m) => (
            <Card key={m.id} variant="default" className="mb-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-slate-800 font-bold flex-1">{m.title}</Text>
                <Text className="text-slate-500 text-xs ml-2">🎯 {m.targetDate}</Text>
              </View>
              {m.description ? (
                <Text className="text-slate-500 text-sm mt-1">{m.description}</Text>
              ) : null}
              <View className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, m.progress ?? 0))}%` }}
                />
              </View>
            </Card>
          ))
        ))}

      {/* Tasks */}
      {tab === "tasks" &&
        (tasks.length === 0 ? (
          <Card variant="default">
            <Text className="text-slate-500 text-center py-4">{t("rnd.common.noData")}</Text>
          </Card>
        ) : (
          tasks.map((task) => (
            <Card key={task.id} variant="default" className="mb-2">
              <Text className="text-slate-800 font-bold">{task.title}</Text>
              <Text className="text-slate-500 text-xs mt-1">
                {task.assigneeName} • {t(`rnd.task.status.${task.status}` as never)} •{" "}
                {task.progress}%
              </Text>
            </Card>
          ))
        ))}

      {/* Budget */}
      {tab === "budget" && (
        <View>
          <Card variant="default" className="mb-2 bg-amber-50">
            <Text className="text-amber-800 font-bold">
              {t("rnd.budget.totalBudget")}: {totalBudget.toLocaleString()} SAR
            </Text>
            <Text className="text-amber-700 text-sm mt-1">
              {t("rnd.budget.actualCost")}: {spentBudget.toLocaleString()} SAR ({budgetPct}%)
            </Text>
            <View className="h-2 bg-amber-200 rounded-full mt-2 overflow-hidden">
              <View
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${Math.min(100, budgetPct)}%` }}
              />
            </View>
          </Card>
          {budgets.flatMap((b) => b.items ?? []).map((item) => (
            <Card key={item.id} variant="default" className="mb-2">
              <Text className="text-slate-800 font-bold">{item.name}</Text>
              <Text className="text-slate-500 text-xs mt-1">
                {t(`rnd.budget.category.${item.category}` as never)} •{" "}
                {(item.estimatedCost ?? 0).toLocaleString()} SAR • {item.status}
              </Text>
            </Card>
          ))}
        </View>
      )}

      {/* Weekly */}
      {tab === "weekly" &&
        (weekly.length === 0 ? (
          <Card variant="default">
            <Text className="text-slate-500 text-center py-4">{t("rnd.common.noData")}</Text>
          </Card>
        ) : (
          weekly.map((w) => (
            <Card key={w.id} variant="default" className="mb-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-slate-800 font-bold">
                  {t("rnd.weekly.week")} {w.weekNumber} • {w.weekStartDate}
                </Text>
                <Text className="text-lg">{w.isOnTrack ? "✅" : "🔴"}</Text>
              </View>
              <Text className="text-slate-500 text-sm mt-1">
                {t("rnd.weekly.plannedTarget")}: {w.plannedTarget} →{" "}
                {t("rnd.weekly.actualAchieved")}: {w.actualAchieved} ({w.variance}%)
              </Text>
              {w.blockers ? (
                <Text className="text-red-600 text-xs mt-1">⚠️ {w.blockers}</Text>
              ) : null}
            </Card>
          ))
        ))}

      <View className="h-8" />
    </ScrollView>
  );
}
