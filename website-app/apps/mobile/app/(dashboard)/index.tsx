/**
 * Native ERP Dashboard Home
 * Mirrors the website dashboard design (dark #080C14 + sky accents).
 * Shows the module grid + live Firestore counters for the owner's data.
 */

import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore, isCompanyOwner } from "@/store/auth-store";
import { MODULES, loadDashboardStats, moduleStat, type DashboardStats } from "@/lib/dashboard";
import { dataUsername } from "@/lib/firestore";

const BG = "#080C14";

function ModuleCard({
  emoji,
  en,
  ar,
  desc,
  color,
  stat,
  onPress,
}: {
  emoji: string;
  en: string;
  ar: string;
  desc: string;
  color: string;
  stat: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        backgroundColor: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <View style={{ width: 88, alignItems: "center", justifyContent: "center", backgroundColor: `${color}18`, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.08)" }}>
        <Text style={{ fontSize: 34 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, padding: 14, justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.3 }}>{en}</Text>
        <Text style={{ color, fontSize: 12, fontWeight: "700", marginTop: 2 }}>{ar}</Text>
        <Text style={{ color: "#CBD5E1", fontSize: 11, marginTop: 4 }}>{desc}</Text>
        {stat ? <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600", marginTop: 6 }}>{stat}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardHome() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, refetch } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", dataUsername(user)],
    queryFn: () => loadDashboardStats(user),
    staleTime: 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const modules = MODULES.filter((m) => {
    if (m.adminOnly) return isCompanyOwner(user);
    const mods = user?.mods;
    return !mods || mods.length === 0 || mods.includes(m.key);
  });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: insets.top, backgroundColor: "rgba(11,17,30,0.9)" }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>
              CONCRETE <Text style={{ color: "#38BDF8" }}>ERP</Text>
            </Text>
            <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 2 }}>
              {user?.fullName} · @{dataUsername(user)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => logout()}
            style={{ backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}
          >
            <Text style={{ color: "#F87171", fontSize: 12, fontWeight: "700" }}>تسجيل خروج</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38BDF8" />}
      >
        <View style={{ alignItems: "center", marginBottom: 18, marginTop: 6 }}>
          <Text style={{ color: "#fff", fontSize: 19, fontWeight: "900" }}>برنامج إدارة محطات الخرسانة</Text>
          <Text style={{ color: "#38BDF8", fontSize: 12, fontWeight: "800", letterSpacing: 4, marginTop: 6 }}>CONCRETE</Text>
        </View>

        {modules.map((m) => (
          <ModuleCard
            key={m.key}
            emoji={m.icon}
            en={m.en}
            ar={m.ar}
            desc={m.desc}
            color={m.color}
            stat={stats ? moduleStat(m, stats) : ""}
            onPress={() => router.push(m.path as any)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
