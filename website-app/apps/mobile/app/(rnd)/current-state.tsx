/**
 * Current State Screen
 * Records the factory's current reality vs targets:
 * production (m³), efficiency, staff, cost/m³ + key issues.
 * This is the baseline every development plan builds on.
 */

import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRndStore } from "@/store/rnd-store";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { KeyIssue } from "@/types/rnd";

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default function CurrentStateScreen() {
  const { t } = useT();
  const { currentState, setCurrentState } = useRndStore();

  const [period, setPeriod] = useState("2026-Q1");
  const [currentCapacity, setCurrentCapacity] = useState("");
  const [targetCapacity, setTargetCapacity] = useState("");
  const [currentEff, setCurrentEff] = useState("");
  const [targetEff, setTargetEff] = useState("");
  const [currentStaff, setCurrentStaff] = useState("");
  const [targetStaff, setTargetStaff] = useState("");
  const [currentCost, setCurrentCost] = useState("");
  const [targetCost, setTargetCost] = useState("");
  const [issues, setIssues] = useState<KeyIssue[]>([]);

  // New issue form
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueSeverity, setIssueSeverity] =
    useState<KeyIssue["severity"]>("medium");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentState) {
      setPeriod(currentState.period);
      setCurrentCapacity(String(currentState.currentProductionCapacity));
      setTargetCapacity(String(currentState.targetProductionCapacity));
      setCurrentEff(String(currentState.currentEfficiency));
      setTargetEff(String(currentState.targetEfficiency));
      setCurrentStaff(String(currentState.currentStaffCount));
      setTargetStaff(String(currentState.targetStaffCount));
      setCurrentCost(String(currentState.currentCostPerM3));
      setTargetCost(String(currentState.targetCostPerM3));
      setIssues(currentState.keyIssues ?? []);
    }
  }, [currentState]);

  const addIssue = () => {
    if (!issueTitle.trim()) {
      Alert.alert(t("common.error"), t("rnd.currentState.addIssue"));
      return;
    }
    const issue: KeyIssue = {
      id: `local-${Date.now()}`,
      title: issueTitle.trim(),
      description: issueDesc.trim(),
      category: "other",
      severity: issueSeverity,
      impact: "",
      reportedAt: new Date().toISOString(),
      reportedBy: "",
    };
    setIssues([issue, ...issues]);
    setIssueTitle("");
    setIssueDesc("");
  };

  const removeIssue = (id: string) => {
    setIssues(issues.filter((i) => i.id !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        period,
        currentProductionCapacity: num(currentCapacity),
        targetProductionCapacity: num(targetCapacity),
        currentEfficiency: num(currentEff),
        targetEfficiency: num(targetEff),
        currentStaffCount: Math.round(num(currentStaff)),
        targetStaffCount: Math.round(num(targetStaff)),
        currentCostPerM3: num(currentCost),
        targetCostPerM3: num(targetCost),
        keyIssues: issues,
      };
      const saved = await rndApi.saveCurrentState(payload);
      setCurrentState(saved);
      Alert.alert(t("common.ok"), t("rnd.currentState.save"));
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  const severities: KeyIssue["severity"][] = ["critical", "high", "medium", "low"];
  const severityEmoji: Record<KeyIssue["severity"], string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-lg font-bold text-slate-800 mb-2">
        📊 {t("rnd.currentState.title")}
      </Text>

      <Card variant="default" className="mb-3">
        <Input
          label={t("rnd.eval.period")}
          value={period}
          onChangeText={setPeriod}
          placeholder="2026-Q1"
        />
      </Card>

      {/* Production */}
      <Card variant="default" className="mb-3 bg-sky-50">
        <Text className="text-base font-bold text-sky-800 mb-2">🏭 m³</Text>
        <Input
          label={t("rnd.currentState.productionCapacity")}
          value={currentCapacity}
          onChangeText={setCurrentCapacity}
          keyboardType="numeric"
          placeholder="5000"
        />
        <Input
          label={t("rnd.currentState.targetCapacity")}
          value={targetCapacity}
          onChangeText={setTargetCapacity}
          keyboardType="numeric"
          placeholder="5200"
        />
      </Card>

      {/* Efficiency */}
      <Card variant="default" className="mb-3 bg-emerald-50">
        <Text className="text-base font-bold text-emerald-800 mb-2">⚙️ %</Text>
        <Input
          label={t("rnd.currentState.currentEfficiency")}
          value={currentEff}
          onChangeText={setCurrentEff}
          keyboardType="numeric"
          placeholder="75"
        />
        <Input
          label={t("rnd.currentState.targetEfficiency")}
          value={targetEff}
          onChangeText={setTargetEff}
          keyboardType="numeric"
          placeholder="85"
        />
      </Card>

      {/* Staff */}
      <Card variant="default" className="mb-3 bg-violet-50">
        <Text className="text-base font-bold text-violet-800 mb-2">👥</Text>
        <Input
          label={t("rnd.currentState.currentStaff")}
          value={currentStaff}
          onChangeText={setCurrentStaff}
          keyboardType="numeric"
          placeholder="40"
        />
        <Input
          label={t("rnd.currentState.targetStaff")}
          value={targetStaff}
          onChangeText={setTargetStaff}
          keyboardType="numeric"
          placeholder="45"
        />
      </Card>

      {/* Cost */}
      <Card variant="default" className="mb-3 bg-amber-50">
        <Text className="text-base font-bold text-amber-800 mb-2">💰 SAR/m³</Text>
        <Input
          label={t("rnd.currentState.currentCostPerM3")}
          value={currentCost}
          onChangeText={setCurrentCost}
          keyboardType="numeric"
          placeholder="180"
        />
        <Input
          label={t("rnd.currentState.targetCostPerM3")}
          value={targetCost}
          onChangeText={setTargetCost}
          keyboardType="numeric"
          placeholder="170"
        />
      </Card>

      {/* Key issues */}
      <Text className="text-base font-bold text-slate-800 mb-2">
        ⚠️ {t("rnd.currentState.keyIssues")} ({issues.length})
      </Text>
      <Card variant="default" className="mb-3">
        <Input
          label={t("rnd.external.issueTitle")}
          value={issueTitle}
          onChangeText={setIssueTitle}
        />
        <Input
          label={t("rnd.external.issueDescription")}
          value={issueDesc}
          onChangeText={setIssueDesc}
          multiline
        />
        <View className="flex-row gap-2 mb-3">
          {severities.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setIssueSeverity(s)}
              className={`flex-1 py-2 rounded-xl items-center ${
                issueSeverity === s ? "bg-slate-800" : "bg-slate-100"
              }`}
            >
              <Text className={issueSeverity === s ? "text-white font-bold" : "text-slate-600"}>
                {severityEmoji[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button
          title={`➕ ${t("rnd.currentState.addIssue")}`}
          onPress={addIssue}
          variant="secondary"
          size="small"
        />
      </Card>

      {issues.map((issue) => (
        <Card key={issue.id} variant="default" className="mb-2">
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="text-slate-800 font-bold">
                {severityEmoji[issue.severity]} {issue.title}
              </Text>
              {issue.description ? (
                <Text className="text-slate-500 text-sm mt-1">{issue.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => removeIssue(issue.id)} className="ml-2">
              <Text className="text-red-500 text-lg">🗑️</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ))}

      <Button
        title={`💾 ${t("rnd.currentState.save")}`}
        onPress={save}
        loading={saving}
        size="large"
        className="mt-2 mb-8"
      />
    </ScrollView>
  );
}
