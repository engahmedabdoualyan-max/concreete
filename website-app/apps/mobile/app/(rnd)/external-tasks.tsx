/**
 * External Issues Screen
 * Tracks factory problems OUTSIDE any development plan:
 * equipment, quality, safety, staff, supplier — with
 * severity, assignment, root cause, and resolution.
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRndStore } from "@/store/rnd-store";
import { rndApi } from "@/lib/rnd-api";
import { useT } from "@/lib/i18n";
import type { ExternalIssue, IssueSeverity, IssueCategory, IssueStatus } from "@/types/rnd";

const SEVERITIES: { key: IssueSeverity; emoji: string }[] = [
  { key: "critical", emoji: "🔴" },
  { key: "high", emoji: "🟠" },
  { key: "medium", emoji: "🟡" },
  { key: "low", emoji: "🟢" },
];

const CATEGORIES: { key: IssueCategory; emoji: string }[] = [
  { key: "equipment", emoji: "🚜" },
  { key: "quality", emoji: "🔬" },
  { key: "safety", emoji: "🦺" },
  { key: "staff", emoji: "👥" },
  { key: "supplier", emoji: "🏭" },
  { key: "other", emoji: "📦" },
];

const STATUS_FLOW: IssueStatus[] = ["open", "investigating", "resolving", "resolved", "closed"];

const STATUS_BG: Record<IssueStatus, string> = {
  open: "bg-red-100",
  investigating: "bg-amber-100",
  resolving: "bg-sky-100",
  resolved: "bg-emerald-100",
  closed: "bg-slate-200",
};

export default function ExternalTasksScreen() {
  const { t } = useT();
  const { issues, upsertIssue, refreshAll, isRefreshing } = useRndStore();

  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [category, setCategory] = useState<IssueCategory>("equipment");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Resolution form state (per issue expanded)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState("");
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const report = async () => {
    if (!title.trim()) {
      Alert.alert(t("common.error"), t("rnd.external.issueTitle"));
      return;
    }
    setSaving(true);
    try {
      const issue = await rndApi.createExternalIssue({
        title: title.trim(),
        description: description.trim(),
        severity,
        category,
        assignedToName: assignee.trim() || undefined,
        status: "open",
      });
      upsertIssue(issue);
      setTitle("");
      setDescription("");
      setAssignee("");
      setShowForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (issue: ExternalIssue) => {
    const idx = STATUS_FLOW.indexOf(issue.status);
    const next = STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, idx + 1)];
    if (next === issue.status) return;
    setUpdatingId(issue.id);
    try {
      const updated = await rndApi.updateExternalIssue(issue.id, { status: next });
      upsertIssue(updated);
    } catch {
      upsertIssue({ ...issue, status: next });
    } finally {
      setUpdatingId(null);
    }
  };

  const saveResolution = async (issue: ExternalIssue) => {
    setUpdatingId(issue.id);
    try {
      const updated = await rndApi.updateExternalIssue(issue.id, {
        rootCause: rootCause.trim() || undefined,
        resolution: resolution.trim() || undefined,
        status: resolution.trim() ? "resolved" : issue.status,
      });
      upsertIssue(updated);
      setExpandedId(null);
      setRootCause("");
      setResolution("");
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setUpdatingId(null);
    }
  };

  const visible = issues.filter((i) => {
    if (filter === "open") return i.status !== "resolved" && i.status !== "closed";
    if (filter === "resolved") return i.status === "resolved" || i.status === "closed";
    return true;
  });

  const criticalCount = issues.filter(
    (i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "closed"
  ).length;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {criticalCount > 0 ? (
        <Card variant="default" className="mb-3 bg-red-500">
          <Text className="text-white font-bold text-center">
            🔴 {criticalCount} {t("rnd.external.severity.critical")}
          </Text>
        </Card>
      ) : null}

      {!showForm ? (
        <Button
          title={`➕ ${t("rnd.external.addIssue")}`}
          onPress={() => setShowForm(true)}
          size="medium"
          className="mb-3"
        />
      ) : (
        <Card variant="elevated" className="mb-3">
          <Input label={t("rnd.external.issueTitle")} value={title} onChangeText={setTitle} />
          <Input
            label={t("rnd.external.issueDescription")}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.external.severity")}</Text>
          <View className="flex-row gap-2 mb-3">
            {SEVERITIES.map((s) => (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSeverity(s.key)}
                className={`flex-1 py-2 rounded-xl items-center ${
                  severity === s.key ? "bg-slate-800" : "bg-slate-100"
                }`}
              >
                <Text className="text-lg">{s.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.external.category")}</Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategory(c.key)}
                className={`px-3 py-2 rounded-xl ${
                  category === c.key ? "bg-red-500" : "bg-slate-100"
                }`}
              >
                <Text className={category === c.key ? "text-white font-bold" : "text-slate-600"}>
                  {c.emoji} {t(`rnd.external.category.${c.key}` as never)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label={t("rnd.external.assignedTo")} value={assignee} onChangeText={setAssignee} />
          <View className="gap-2">
            <Button title={t("rnd.external.addIssue")} onPress={report} loading={saving} variant="danger" />
            <Button title={t("common.cancel")} onPress={() => setShowForm(false)} variant="secondary" size="small" />
          </View>
        </Card>
      )}

      {/* Filter */}
      <View className="flex-row gap-2 mb-3">
        {(["open", "resolved", "all"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl items-center ${
              filter === f ? "bg-slate-800" : "bg-white border border-slate-200"
            }`}
          >
            <Text className={`text-sm font-bold ${filter === f ? "text-white" : "text-slate-600"}`}>
              {f === "open" ? `🔓 (${issues.filter((i) => i.status !== "resolved" && i.status !== "closed").length})` : f === "resolved" ? "✅" : `📦 (${issues.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {visible.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        visible.map((issue) => (
          <Card key={issue.id} variant="default" className="mb-2">
            <TouchableOpacity
              onPress={() => {
                setExpandedId(expandedId === issue.id ? null : issue.id);
                setRootCause(issue.rootCause ?? "");
                setResolution(issue.resolution ?? "");
              }}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-slate-800 font-bold">
                    {SEVERITIES.find((s) => s.key === issue.severity)?.emoji} {issue.title}
                  </Text>
                  <Text className="text-slate-500 text-xs mt-1" numberOfLines={2}>
                    {issue.description}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-1">
                    {CATEGORIES.find((c) => c.key === issue.category)?.emoji}{" "}
                    {issue.assignedToName ?? issue.reportedByName} • {issue.reportedAt?.slice(0, 10)}
                  </Text>
                </View>
                <View className={`rounded-full px-2 py-1 ml-2 ${STATUS_BG[issue.status]}`}>
                  <Text className="text-[10px] font-bold text-slate-700">
                    {t(`rnd.external.status.${issue.status}` as never)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {expandedId === issue.id ? (
              <View className="mt-3 pt-3 border-t border-slate-100">
                <Input label={t("rnd.external.rootCause")} value={rootCause} onChangeText={setRootCause} multiline />
                <Input label={t("rnd.external.resolution")} value={resolution} onChangeText={setResolution} multiline />
                <View className="gap-2">
                  <Button
                    title={t("common.save")}
                    onPress={() => saveResolution(issue)}
                    loading={updatingId === issue.id}
                    variant="success"
                    size="small"
                  />
                  <Button
                    title={`⏭ ${t(`rnd.external.status.${STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, STATUS_FLOW.indexOf(issue.status) + 1)]}` as never)}`}
                    onPress={() => advanceStatus(issue)}
                    loading={updatingId === issue.id}
                    variant="secondary"
                    size="small"
                  />
                </View>
              </View>
            ) : null}
          </Card>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
