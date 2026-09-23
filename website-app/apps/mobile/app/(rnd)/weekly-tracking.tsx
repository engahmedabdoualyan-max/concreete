/**
 * Weekly Tracking Screen
 * Weekly check-in per plan: planned vs actual, variance,
 * blockers, actions taken, next-week plan.
 * This is the heartbeat of plan follow-up.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRndStore } from "@/store/rnd-store";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { WeeklyTracking } from "@/types/rnd";

function currentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return Math.ceil((days + start.getDay() + 1) / 7);
}

export default function WeeklyTrackingScreen() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { t } = useT();
  const { plans } = useRndStore();

  const [entries, setEntries] = useState<WeeklyTracking[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [selectedPlanId, setSelectedPlanId] = useState(planId ?? "");
  const [plannedTarget, setPlannedTarget] = useState("");
  const [actualAchieved, setActualAchieved] = useState("");
  const [blockers, setBlockers] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [nextWeekPlan, setNextWeekPlan] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const pid = selectedPlanId || planId;
    if (!pid) return;
    setLoading(true);
    try {
      const data = await rndApi.getWeeklyEntries(pid);
      setEntries(data.sort((a, b) => b.weekNumber - a.weekNumber));
    } catch {
      // Offline
    } finally {
      setLoading(false);
    }
  }, [selectedPlanId, planId]);

  useEffect(() => {
    if (planId) setSelectedPlanId(planId);
  }, [planId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  const submit = async () => {
    const pid = selectedPlanId || planId;
    if (!pid) {
      Alert.alert(t("common.error"), t("rnd.developmentPlan"));
      return;
    }
    const planned = parseFloat(plannedTarget) || 0;
    const actual = parseFloat(actualAchieved) || 0;
    const variance = planned > 0 ? Math.round(((actual - planned) / planned) * 100) : 0;
    const week = currentWeekNumber();
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    setSaving(true);
    try {
      const entry = await rndApi.createWeeklyEntry({
        planId: pid,
        weekNumber: week,
        year: today.getFullYear(),
        weekStartDate: iso(monday),
        weekEndDate: iso(sunday),
        plannedTarget: planned,
        actualAchieved: actual,
        variance,
        isOnTrack: variance >= -10,
        blockers: blockers.trim(),
        actionsTaken: actionsTaken.trim(),
        nextWeekPlan: nextWeekPlan.trim(),
      });
      setEntries([entry, ...entries]);
      setPlannedTarget("");
      setActualAchieved("");
      setBlockers("");
      setActionsTaken("");
      setNextWeekPlan("");
      setShowForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  const onTrackCount = entries.filter((e) => e.isOnTrack).length;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Plan picker */}
      {!planId ? (
        <Card variant="default" className="mb-3">
          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.developmentPlan")}</Text>
          <View className="gap-2">
            {plans.slice(0, 10).map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setSelectedPlanId(p.id)}
                className={`px-3 py-2 rounded-xl ${
                  selectedPlanId === p.id ? "bg-violet-600" : "bg-slate-100"
                }`}
              >
                <Text
                  className={selectedPlanId === p.id ? "text-white font-bold" : "text-slate-700"}
                  numberOfLines={1}
                >
                  📋 {p.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      ) : null}

      {selectedPlanId || planId ? (
        <Card variant="default" className="mb-3 bg-violet-600">
          <Text className="text-white font-bold">
            📅 {t("rnd.weekly.title")}: {onTrackCount}/{entries.length} ✅
          </Text>
        </Card>
      ) : null}

      {(selectedPlanId || planId) && !showForm ? (
        <Button
          title={`➕ ${t("rnd.weekly.addEntry")}`}
          onPress={() => setShowForm(true)}
          size="medium"
          className="mb-3"
        />
      ) : null}

      {showForm ? (
        <Card variant="elevated" className="mb-3">
          <Input
            label={t("rnd.weekly.plannedTarget")}
            value={plannedTarget}
            onChangeText={setPlannedTarget}
            keyboardType="numeric"
            placeholder="1250"
          />
          <Input
            label={t("rnd.weekly.actualAchieved")}
            value={actualAchieved}
            onChangeText={setActualAchieved}
            keyboardType="numeric"
            placeholder="1180"
          />
          <Input
            label={t("rnd.weekly.blockers")}
            value={blockers}
            onChangeText={setBlockers}
            multiline
            placeholder="..."
          />
          <Input
            label={t("rnd.weekly.actionsTaken")}
            value={actionsTaken}
            onChangeText={setActionsTaken}
            multiline
            placeholder="..."
          />
          <Input
            label={t("rnd.weekly.nextWeekPlan")}
            value={nextWeekPlan}
            onChangeText={setNextWeekPlan}
            multiline
            placeholder="..."
          />
          <View className="gap-2">
            <Button title={t("rnd.weekly.addEntry")} onPress={submit} loading={saving} variant="success" />
            <Button title={t("common.cancel")} onPress={() => setShowForm(false)} variant="secondary" size="small" />
          </View>
        </Card>
      ) : null}

      {entries.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        entries.map((e) => (
          <Card key={e.id} variant="default" className="mb-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-slate-800 font-bold">
                {t("rnd.weekly.week")} {e.weekNumber} • {e.weekStartDate}
              </Text>
              <Text className="text-xl">{e.isOnTrack ? "✅" : "🔴"}</Text>
            </View>
            <View className="flex-row gap-2 mt-2">
              <View className="flex-1 bg-slate-50 rounded-xl p-2">
                <Text className="text-slate-500 text-[10px]">{t("rnd.weekly.plannedTarget")}</Text>
                <Text className="text-slate-800 font-bold">{e.plannedTarget}</Text>
              </View>
              <View className="flex-1 bg-slate-50 rounded-xl p-2">
                <Text className="text-slate-500 text-[10px]">{t("rnd.weekly.actualAchieved")}</Text>
                <Text className={`font-bold ${e.variance < -10 ? "text-red-600" : "text-emerald-600"}`}>
                  {e.actualAchieved} ({e.variance}%)
                </Text>
              </View>
            </View>
            {e.blockers ? (
              <Text className="text-red-600 text-xs mt-2">⚠️ {t("rnd.weekly.blockers")}: {e.blockers}</Text>
            ) : null}
            {e.actionsTaken ? (
              <Text className="text-slate-600 text-xs mt-1">🔧 {t("rnd.weekly.actionsTaken")}: {e.actionsTaken}</Text>
            ) : null}
            {e.nextWeekPlan ? (
              <Text className="text-sky-700 text-xs mt-1">📅 {t("rnd.weekly.nextWeekPlan")}: {e.nextWeekPlan}</Text>
            ) : null}
          </Card>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
