/**
 * Development Plans Screen
 * Lists all plans + creates new ones.
 * Workflow: draft → submit for finance approval → approved → in_progress → completed
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRndStore } from "@/store/rnd-store";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { DevelopmentPlan, PlanCategory, PlanPriority } from "@/types/rnd";

const CATEGORIES: { key: PlanCategory; emoji: string }[] = [
  { key: "production", emoji: "🏭" },
  { key: "quality", emoji: "🔬" },
  { key: "cost", emoji: "💰" },
  { key: "staff", emoji: "👥" },
  { key: "technology", emoji: "💻" },
  { key: "process", emoji: "⚙️" },
];

const STATUS_STYLE: Record<DevelopmentPlan["status"], string> = {
  draft: "bg-slate-100",
  pending_finance: "bg-amber-100",
  approved: "bg-sky-100",
  in_progress: "bg-indigo-100",
  completed: "bg-emerald-100",
  rejected: "bg-red-100",
};

const STATUS_TEXT: Record<DevelopmentPlan["status"], string> = {
  draft: "text-slate-700",
  pending_finance: "text-amber-700",
  approved: "text-sky-700",
  in_progress: "text-indigo-700",
  completed: "text-emerald-700",
  rejected: "text-red-700",
};

export default function DevelopmentPlanScreen() {
  const router = useRouter();
  const { t } = useT();
  const { plans, upsertPlan, isRefreshing, refreshAll } = useRndStore();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PlanCategory>("production");
  const [priority, setPriority] = useState<PlanPriority>("medium");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [expectedROI, setExpectedROI] = useState("");
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory("production");
    setPriority("medium");
    setStartDate("");
    setEndDate("");
    setBudget("");
    setExpectedROI("");
    setShowForm(false);
  };

  const createPlan = async (submit: boolean) => {
    if (!title.trim()) {
      Alert.alert(t("common.error"), t("rnd.plan.title"));
      return;
    }
    setSaving(true);
    try {
      const plan = await rndApi.createPlan({
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        startDate: startDate || new Date().toISOString().slice(0, 10),
        endDate: endDate || new Date().toISOString().slice(0, 10),
        budget: parseFloat(budget) || 0,
        expectedROI: parseFloat(expectedROI) || 0,
        status: "draft",
      });
      upsertPlan(plan);
      if (submit) {
        const submitted = await rndApi.submitForFinanceApproval(plan.id);
        upsertPlan(submitted);
      }
      resetForm();
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async (planId: string) => {
    setSubmittingId(planId);
    try {
      const updated = await rndApi.submitForFinanceApproval(planId);
      upsertPlan(updated);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {!showForm ? (
        <Button
          title={`➕ ${t("rnd.plan.create")}`}
          onPress={() => setShowForm(true)}
          size="medium"
          className="mb-3"
        />
      ) : (
        <Card variant="elevated" className="mb-3">
          <Input label={t("rnd.plan.title")} value={title} onChangeText={setTitle} />
          <Input
            label={t("rnd.plan.description")}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.plan.category")}</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategory(c.key)}
                className={`px-3 py-2 rounded-xl ${
                  category === c.key ? "bg-indigo-600" : "bg-slate-100"
                }`}
              >
                <Text className={category === c.key ? "text-white font-bold" : "text-slate-600"}>
                  {c.emoji} {t(`rnd.plan.category.${c.key}` as never)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.plan.priority")}</Text>
          <View className="flex-row gap-2 mb-4">
            {(["high", "medium", "low"] as PlanPriority[]).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPriority(p)}
                className={`flex-1 py-2 rounded-xl items-center ${
                  priority === p ? "bg-slate-800" : "bg-slate-100"
                }`}
              >
                <Text className={priority === p ? "text-white font-bold" : "text-slate-600"}>
                  {t(`rnd.plan.priority.${p}` as never)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label={t("rnd.plan.startDate")}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-02-01"
          />
          <Input
            label={t("rnd.plan.endDate")}
            value={endDate}
            onChangeText={setEndDate}
            placeholder="2026-03-01"
          />
          <Input
            label={t("rnd.plan.budget")}
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
            placeholder="50000"
          />
          <Input
            label={t("rnd.plan.expectedROI")}
            value={expectedROI}
            onChangeText={setExpectedROI}
            keyboardType="numeric"
            placeholder="15"
          />

          <View className="gap-2">
            <Button
              title={t("rnd.plan.submitForApproval")}
              onPress={() => createPlan(true)}
              loading={saving}
              variant="success"
              size="medium"
            />
            <Button
              title={t("rnd.plan.saveDraft")}
              onPress={() => createPlan(false)}
              loading={saving}
              variant="secondary"
              size="small"
            />
            <Button
              title={t("common.cancel")}
              onPress={resetForm}
              variant="secondary"
              size="small"
            />
          </View>
        </Card>
      )}

      {/* Plans list */}
      <Text className="text-lg font-bold text-slate-800 mb-2">
        📋 {t("rnd.developmentPlan")} ({plans.length})
      </Text>
      {plans.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            onPress={() =>
              router.push({
                pathname: "/(rnd)/plan-detail",
                params: { planId: plan.id },
              } as never)
            }
          >
            <Card variant="default" className="mb-2">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-slate-800 font-bold">{plan.title}</Text>
                  <Text className="text-slate-500 text-xs mt-1" numberOfLines={2}>
                    {plan.description}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-1">
                    {plan.startDate} → {plan.endDate} • 💰{" "}
                    {(plan.budget ?? 0).toLocaleString()} SAR
                  </Text>
                </View>
                <View className={`rounded-full px-2 py-1 ml-2 ${STATUS_STYLE[plan.status]}`}>
                  <Text className={`text-[10px] font-bold ${STATUS_TEXT[plan.status]}`}>
                    {t(`rnd.plan.status.${plan.status}` as never)}
                  </Text>
                </View>
              </View>
              {/* Progress bar */}
              <View className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, plan.overallProgress ?? 0))}%` }}
                />
              </View>
              {plan.status === "draft" ? (
                <Button
                  title={t("rnd.plan.submitForApproval")}
                  onPress={() => submitForApproval(plan.id)}
                  loading={submittingId === plan.id}
                  variant="warning"
                  size="small"
                  className="mt-2"
                />
              ) : null}
            </Card>
          </TouchableOpacity>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
