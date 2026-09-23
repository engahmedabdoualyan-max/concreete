/**
 * Budget Planning Screen
 * Financial items per plan (equipment, training, marketing, HR...)
 * with finance approval workflow.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { rndApi } from "@/lib/rnd-api";
import { useAuthStore, canAccessFinance } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import type { BudgetPlan, BudgetItem, BudgetCategory } from "@/types/rnd";

const CATEGORIES: { key: BudgetCategory; emoji: string }[] = [
  { key: "equipment", emoji: "🚜" },
  { key: "software", emoji: "💻" },
  { key: "training", emoji: "🎓" },
  { key: "consulting", emoji: "🧑‍💼" },
  { key: "marketing", emoji: "📣" },
  { key: "hr", emoji: "👥" },
  { key: "materials", emoji: "🧪" },
  { key: "other", emoji: "📦" },
];

export default function BudgetPlanningScreen() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { t } = useT();
  const { user } = useAuthStore();
  const isFinance = canAccessFinance(user);

  const [budgets, setBudgets] = useState<BudgetPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [itemName, setItemName] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [category, setCategory] = useState<BudgetCategory>("equipment");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rndApi.getBudgetPlans(planId);
      setBudgets(data);
    } catch {
      // Offline — empty list
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const items: BudgetItem[] = budgets.flatMap((b) => b.items ?? []);
  const totalEstimated = items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0);
  const totalActual = items.reduce((s, i) => s + (i.actualCost ?? 0), 0);
  const approvedCount = items.filter((i) => i.status === "approved").length;

  const addItem = async () => {
    if (!itemName.trim()) {
      Alert.alert(t("common.error"), t("rnd.budget.itemName"));
      return;
    }
    setSaving(true);
    try {
      // Ensure a budget container exists for this plan context
      let container = budgets[0];
      if (!container) {
        container = await rndApi.createBudgetPlan({
          planId: planId ?? undefined,
          totalBudget: 0,
          fiscalYear: String(new Date().getFullYear()),
        });
        setBudgets([container]);
      }
      const updated = await rndApi.updateBudgetPlan(container.id, {
        items: [
          ...(container.items ?? []),
          {
            name: itemName.trim(),
            description: itemDesc.trim(),
            category,
            estimatedCost: parseFloat(estimatedCost) || 0,
            vendor: vendor.trim() || undefined,
            status: "planned",
            financeApprovalRequired: true,
          },
        ] as Partial<BudgetPlan>["items"],
      });
      setBudgets(budgets.length > 0 ? budgets.map((b) => (b.id === updated.id ? updated : b)) : [updated]);
      setItemName("");
      setItemDesc("");
      setEstimatedCost("");
      setVendor("");
      setShowForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Summary */}
      <Card variant="default" className="mb-3 bg-amber-500">
        <Text className="text-white font-bold text-base">
          💰 {t("rnd.budget.totalBudget")}: {totalEstimated.toLocaleString()} SAR
        </Text>
        <Text className="text-amber-100 text-sm mt-1">
          {t("rnd.budget.actualCost")}: {totalActual.toLocaleString()} SAR
        </Text>
        <Text className="text-amber-100 text-xs mt-1">
          ✅ {approvedCount}/{items.length} • {t("rnd.budget.approvalStatus")}
        </Text>
      </Card>

      {isFinance ? (
        <Card variant="default" className="mb-3 bg-emerald-50 border border-emerald-200">
          <Text className="text-emerald-800 text-sm text-center font-bold">
            🧾 {t("rnd.budget.financeApproval")} — {t("rnd.plan.status.pending_finance")}
          </Text>
        </Card>
      ) : null}

      {!showForm ? (
        <Button
          title={`➕ ${t("rnd.budget.addItem")}`}
          onPress={() => setShowForm(true)}
          size="medium"
          className="mb-3"
        />
      ) : (
        <Card variant="elevated" className="mb-3">
          <Input label={t("rnd.budget.itemName")} value={itemName} onChangeText={setItemName} />
          <Input
            label={t("rnd.plan.description")}
            value={itemDesc}
            onChangeText={setItemDesc}
            multiline
          />
          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.budget.category")}</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategory(c.key)}
                className={`px-3 py-2 rounded-xl ${
                  category === c.key ? "bg-amber-500" : "bg-slate-100"
                }`}
              >
                <Text className={category === c.key ? "text-white font-bold" : "text-slate-600"}>
                  {c.emoji} {t(`rnd.budget.category.${c.key}` as never)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input
            label={t("rnd.budget.estimatedCost")}
            value={estimatedCost}
            onChangeText={setEstimatedCost}
            keyboardType="numeric"
            placeholder="10000"
          />
          <Input label={t("rnd.budget.vendor")} value={vendor} onChangeText={setVendor} />
          <View className="gap-2">
            <Button title={t("rnd.budget.addItem")} onPress={addItem} loading={saving} variant="success" />
            <Button title={t("common.cancel")} onPress={() => setShowForm(false)} variant="secondary" size="small" />
          </View>
        </Card>
      )}

      <Text className="text-lg font-bold text-slate-800 mb-2">
        💰 {t("rnd.budget.title")} ({items.length})
      </Text>
      {items.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        items.map((item, idx) => (
          <Card key={item.id ?? `idx-${idx}`} variant="default" className="mb-2">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-slate-800 font-bold">
                  {CATEGORIES.find((c) => c.key === item.category)?.emoji} {item.name}
                </Text>
                {item.description ? (
                  <Text className="text-slate-500 text-xs mt-1">{item.description}</Text>
                ) : null}
                <Text className="text-slate-500 text-xs mt-1">
                  {(item.estimatedCost ?? 0).toLocaleString()} SAR
                  {item.vendor ? ` • 🏭 ${item.vendor}` : ""}
                </Text>
              </View>
              <View className="bg-slate-100 rounded-full px-2 py-1 ml-2">
                <Text className="text-[10px] font-bold text-slate-700">{item.status}</Text>
              </View>
            </View>
          </Card>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
