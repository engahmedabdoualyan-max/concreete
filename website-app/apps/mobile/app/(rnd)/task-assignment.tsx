/**
 * Task Assignment Screen
 * Assigns plan tasks to employees with due dates,
 * tracks progress, and lets assignees update status.
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
import type { RnDTask, TaskStatus, TaskPriority } from "@/types/rnd";

const TASK_STATUSES: { key: TaskStatus; emoji: string }[] = [
  { key: "todo", emoji: "📝" },
  { key: "in_progress", emoji: "🔄" },
  { key: "review", emoji: "👀" },
  { key: "done", emoji: "✅" },
  { key: "blocked", emoji: "⛔" },
];

const STATUS_BG: Record<TaskStatus, string> = {
  todo: "bg-slate-100",
  in_progress: "bg-sky-100",
  review: "bg-amber-100",
  done: "bg-emerald-100",
  blocked: "bg-red-100",
};

export default function TaskAssignmentScreen() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { t } = useT();
  const { upsertTask } = useRndStore();

  const [tasks, setTasks] = useState<RnDTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = planId ? await rndApi.getTasks(planId) : await rndApi.getMyTasks();
      setTasks(data);
    } catch {
      // Offline — keep empty, store sync will refill on reconnect
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const createTask = async () => {
    if (!title.trim() || !assigneeName.trim()) {
      Alert.alert(t("common.error"), `${t("rnd.task.title")} + ${t("rnd.task.assignee")}`);
      return;
    }
    setSaving(true);
    try {
      const task = await rndApi.createTask({
        planId: planId ?? undefined,
        title: title.trim(),
        description: description.trim(),
        assigneeName: assigneeName.trim(),
        dueDate: dueDate || new Date().toISOString().slice(0, 10),
        priority,
        status: "todo",
        progress: 0,
      });
      setTasks([task, ...tasks]);
      upsertTask(task);
      setTitle("");
      setDescription("");
      setAssigneeName("");
      setDueDate("");
      setShowForm(false);
    } catch {
      Alert.alert(t("common.error"), t("rnd.common.loading"));
    } finally {
      setSaving(false);
    }
  };

  const setProgress = async (task: RnDTask, progress: number) => {
    const status: TaskStatus =
      progress >= 100 ? "done" : progress > 0 ? "in_progress" : "todo";
    setUpdatingId(task.id);
    try {
      const updated = await rndApi.updateTaskProgress(task.id, progress, status);
      setTasks(tasks.map((x) => (x.id === task.id ? updated : x)));
      upsertTask(updated);
    } catch {
      // Optimistic fallback when offline
      const updated = { ...task, progress, status };
      setTasks(tasks.map((x) => (x.id === task.id ? updated : x)));
    } finally {
      setUpdatingId(null);
    }
  };

  const setStatus = async (task: RnDTask, status: TaskStatus) => {
    setUpdatingId(task.id);
    try {
      const updated = await rndApi.updateTask(task.id, { status });
      setTasks(tasks.map((x) => (x.id === task.id ? updated : x)));
      upsertTask(updated);
    } catch {
      const updated = { ...task, status };
      setTasks(tasks.map((x) => (x.id === task.id ? updated : x)));
    } finally {
      setUpdatingId(null);
    }
  };

  const progressSteps = [0, 25, 50, 75, 100];

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      {!showForm ? (
        <Button
          title={`➕ ${t("rnd.task.assign")}`}
          onPress={() => setShowForm(true)}
          size="medium"
          className="mb-3"
        />
      ) : (
        <Card variant="elevated" className="mb-3">
          <Input label={t("rnd.task.title")} value={title} onChangeText={setTitle} />
          <Input
            label={t("rnd.task.description")}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <Input
            label={t("rnd.task.assignee")}
            value={assigneeName}
            onChangeText={setAssigneeName}
            placeholder="م. محمد"
          />
          <Input
            label={t("rnd.task.dueDate")}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-03-01"
          />
          <Text className="text-slate-600 font-semibold mb-2">{t("rnd.task.priority")}</Text>
          <View className="flex-row gap-2 mb-4">
            {(["high", "medium", "low"] as TaskPriority[]).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPriority(p)}
                className={`flex-1 py-2 rounded-xl items-center ${
                  priority === p ? "bg-slate-800" : "bg-slate-100"
                }`}
              >
                <Text className={priority === p ? "text-white font-bold" : "text-slate-600"}>
                  {p === "high" ? "🔴" : p === "medium" ? "🟡" : "🟢"} {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="gap-2">
            <Button title={t("rnd.task.assign")} onPress={createTask} loading={saving} variant="success" />
            <Button title={t("common.cancel")} onPress={() => setShowForm(false)} variant="secondary" size="small" />
          </View>
        </Card>
      )}

      <Text className="text-lg font-bold text-slate-800 mb-2">
        👷 {t("rnd.taskAssignment")} ({tasks.length})
      </Text>

      {tasks.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        tasks.map((task) => (
          <Card key={task.id} variant="default" className="mb-2">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-slate-800 font-bold">{task.title}</Text>
                <Text className="text-slate-500 text-xs mt-1">
                  👤 {task.assigneeName} • 📅 {task.dueDate}
                </Text>
              </View>
              <View className={`rounded-full px-2 py-1 ml-2 ${STATUS_BG[task.status]}`}>
                <Text className="text-[10px] font-bold text-slate-700">
                  {TASK_STATUSES.find((s) => s.key === task.status)?.emoji}{" "}
                  {t(`rnd.task.status.${task.status}` as never)}
                </Text>
              </View>
            </View>

            {/* Progress stepper */}
            <Text className="text-slate-600 text-xs mt-2 mb-1">
              {t("rnd.task.progress")}: {task.progress}%
            </Text>
            <View className="flex-row gap-1">
              {progressSteps.map((p) => (
                <TouchableOpacity
                  key={p}
                  disabled={updatingId === task.id}
                  onPress={() => setProgress(task, p)}
                  className={`flex-1 py-1.5 rounded-lg items-center ${
                    task.progress >= p ? "bg-sky-500" : "bg-slate-100"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      task.progress >= p ? "text-white" : "text-slate-500"
                    }`}
                  >
                    {p}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status quick switch */}
            <View className="flex-row gap-1 mt-2">
              {TASK_STATUSES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  disabled={updatingId === task.id}
                  onPress={() => setStatus(task, s.key)}
                  className={`flex-1 py-1.5 rounded-lg items-center ${
                    task.status === s.key ? "bg-slate-800" : "bg-slate-50 border border-slate-200"
                  }`}
                >
                  <Text className="text-sm">{s.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
