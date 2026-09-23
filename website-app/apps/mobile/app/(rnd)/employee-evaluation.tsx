/**
 * Employee Evaluation Screen
 * Evaluates staff on R&D task execution:
 * completion rate + quality + initiative + teamwork.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRndStore } from "@/store/rnd-store";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { EmployeeEvaluation } from "@/types/rnd";

function ScorePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="mb-3">
      <Text className="text-slate-600 font-semibold mb-2">
        {label}: <Text className="text-slate-800 font-bold">{value}/10</Text>
      </Text>
      <View className="flex-row gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            className={`flex-1 py-2 rounded-lg items-center ${
              value >= n ? "bg-teal-500" : "bg-slate-100"
            }`}
          >
            <Text className={`text-[10px] font-bold ${value >= n ? "text-white" : "text-slate-500"}`}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function EmployeeEvaluationScreen() {
  const { t } = useT();
  const { evaluations, refreshAll, isRefreshing } = useRndStore();

  const [showForm, setShowForm] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [period, setPeriod] = useState("");
  const [tasksAssigned, setTasksAssigned] = useState("");
  const [tasksCompleted, setTasksCompleted] = useState("");
  const [quality, setQuality] = useState(7);
  const [initiative, setInitiative] = useState(7);
  const [teamwork, setTeamwork] = useState(7);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const submit = async () => {
    if (!employeeName.trim()) {
      Alert.alert(t("common.error"), t("rnd.eval.employee"));
      return;
    }
    const assigned = parseInt(tasksAssigned) || 0;
    const completed = parseInt(tasksCompleted) || 0;
    const completionRate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
    const overall = Math.round(((quality + initiative + teamwork) / 3) * 10) / 10;

    setSaving(true);
    try {
      await rndApi.createEvaluation({
        employeeName: employeeName.trim(),
        periodStart: period || new Date().toISOString().slice(0, 10),
        periodEnd: new Date().toISOString().slice(0, 10),
        tasksAssigned: assigned,
        tasksCompleted: completed,
        completionRate,
        qualityScore: quality,
        initiativeScore: initiative,
        teamworkScore: teamwork,
        overallScore: overall,
        strengths: strengths.trim(),
        improvements: improvements.trim(),
        reviewerComments: comments.trim(),
      });
      await refreshAll();
      setEmployeeName("");
      setPeriod("");
      setTasksAssigned("");
      setTasksCompleted("");
      setStrengths("");
      setImprovements("");
      setComments("");
      setShowForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  const avgOverall =
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
      <Card variant="default" className="mb-3 bg-teal-600">
        <Text className="text-white font-bold text-center">
          ⭐ {t("rnd.eval.overallScore")}: {avgOverall}/10 ({evaluations.length})
        </Text>
      </Card>

      {!showForm ? (
        <Button
          title={`➕ ${t("rnd.eval.addEvaluation")}`}
          onPress={() => setShowForm(true)}
          size="medium"
          className="mb-3"
        />
      ) : (
        <Card variant="elevated" className="mb-3">
          <Input label={t("rnd.eval.employee")} value={employeeName} onChangeText={setEmployeeName} />
          <Input label={t("rnd.eval.period")} value={period} onChangeText={setPeriod} placeholder="2026-Q1" />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Input
                label={t("rnd.eval.tasksAssigned")}
                value={tasksAssigned}
                onChangeText={setTasksAssigned}
                keyboardType="numeric"
              />
            </View>
            <View className="flex-1">
              <Input
                label={t("rnd.eval.tasksCompleted")}
                value={tasksCompleted}
                onChangeText={setTasksCompleted}
                keyboardType="numeric"
              />
            </View>
          </View>
          <ScorePicker label={t("rnd.eval.qualityScore")} value={quality} onChange={setQuality} />
          <ScorePicker label={t("rnd.eval.initiativeScore")} value={initiative} onChange={setInitiative} />
          <ScorePicker label={t("rnd.eval.teamworkScore")} value={teamwork} onChange={setTeamwork} />
          <Input label={t("rnd.eval.strengths")} value={strengths} onChangeText={setStrengths} multiline />
          <Input label={t("rnd.eval.improvements")} value={improvements} onChangeText={setImprovements} multiline />
          <Input label={t("rnd.eval.reviewerComments")} value={comments} onChangeText={setComments} multiline />
          <View className="gap-2">
            <Button title={t("rnd.eval.addEvaluation")} onPress={submit} loading={saving} variant="success" />
            <Button title={t("common.cancel")} onPress={() => setShowForm(false)} variant="secondary" size="small" />
          </View>
        </Card>
      )}

      <Text className="text-lg font-bold text-slate-800 mb-2">
        ⭐ {t("rnd.eval.title")} ({evaluations.length})
      </Text>
      {evaluations.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        evaluations.map((ev: EmployeeEvaluation) => (
          <Card key={ev.id} variant="default" className="mb-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-slate-800 font-bold flex-1">
                👤 {ev.employeeName}
              </Text>
              <View className="bg-teal-100 rounded-full px-3 py-1 ml-2">
                <Text className="text-teal-700 text-xs font-bold">
                  {ev.overallScore}/10
                </Text>
              </View>
            </View>
            <Text className="text-slate-500 text-xs mt-1">
              ✅ {ev.tasksCompleted}/{ev.tasksAssigned} ({ev.completionRate}%) • 🎯 Q:{ev.qualityScore} I:
              {ev.initiativeScore} T:{ev.teamworkScore}
            </Text>
            {ev.strengths ? (
              <Text className="text-emerald-700 text-xs mt-1">💪 {ev.strengths}</Text>
            ) : null}
            {ev.improvements ? (
              <Text className="text-amber-700 text-xs mt-1">🔧 {ev.improvements}</Text>
            ) : null}
          </Card>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
