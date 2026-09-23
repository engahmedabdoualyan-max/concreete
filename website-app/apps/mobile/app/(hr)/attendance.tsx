/**
 * HR Attendance Reports Screen (Epic 12b)
 * Geofence attendance rows + driver overtime evidence (trips for الإضافي).
 */

import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface AttRow {
  userId: string;
  fullName: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  minutesWorked: number | null;
  source: string;
}

interface OtRow {
  driverId: string;
  driverName: string;
  tripsCount: number;
  deliveredM3: number;
  attendanceMinutes: number | null;
  overtimeMinutes: number;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDur(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function HrAttendanceScreen() {
  const { t } = useT();
  const [tab, setTab] = useState<"attendance" | "overtime">("attendance");
  const [rows, setRows] = useState<AttRow[]>([]);
  const [ot, setOt] = useState<OtRow[]>([]);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o] = await Promise.all([
        api.getAttendanceReport(weekAgo, today),
        api.getDriverOvertime(weekAgo, today),
      ]);
      setRows(a);
      setOt(o);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={{ padding: 16 }}
    >
      <View className="flex-row gap-2 mb-3">
        <TouchableOpacity
          onPress={() => setTab("attendance")}
          className={`flex-1 py-2.5 rounded-xl items-center ${tab === "attendance" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
        >
          <Text className={`font-bold ${tab === "attendance" ? "text-white" : "text-slate-600"}`}>
            🕐 {t("hr.attendance")} ({rows.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("overtime")}
          className={`flex-1 py-2.5 rounded-xl items-center ${tab === "overtime" ? "bg-teal-600" : "bg-white border border-slate-200"}`}
        >
          <Text className={`font-bold ${tab === "overtime" ? "text-white" : "text-slate-600"}`}>
            🚚 {t("hr.overtime")} ({ot.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === "attendance" ? (
        rows.length === 0 ? (
          <Card variant="default">
            <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
          </Card>
        ) : (
          rows.map((r, i) => (
            <Card key={`${r.userId}-${r.workDate}-${i}`} variant="default" className="mb-2">
              <View className="flex-row justify-between items-center">
                <View className="flex-1">
                  <Text className="text-slate-800 font-bold">{r.fullName}</Text>
                  <Text className="text-slate-400 text-xs">{r.workDate}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-slate-700 text-sm font-bold">
                    {fmtTime(r.checkInAt)} → {fmtTime(r.checkOutAt)}
                  </Text>
                  <Text className="text-teal-700 text-xs font-bold">{fmtDur(r.minutesWorked)}</Text>
                </View>
              </View>
            </Card>
          ))
        )
      ) : ot.length === 0 ? (
        <Card variant="default">
          <Text className="text-slate-500 text-center py-6">{t("rnd.common.noData")}</Text>
        </Card>
      ) : (
        ot.map((d) => (
          <Card key={d.driverId} variant="default" className="mb-2">
            <View className="flex-row justify-between items-center">
              <View className="flex-1">
                <Text className="text-slate-800 font-bold">🚚 {d.driverName}</Text>
                <Text className="text-slate-500 text-xs mt-1">
                  {t("hr.trips")}: {d.tripsCount} • {d.deliveredM3} م³
                  {d.attendanceMinutes !== null ? ` • 🕐 ${fmtDur(d.attendanceMinutes)}` : ""}
                </Text>
              </View>
              <View
                className={`rounded-full px-3 py-1.5 ${d.overtimeMinutes > 0 ? "bg-amber-100" : "bg-slate-100"}`}
              >
                <Text
                  className={`text-xs font-bold ${d.overtimeMinutes > 0 ? "text-amber-700" : "text-slate-500"}`}
                >
                  +{fmtDur(d.overtimeMinutes)}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
