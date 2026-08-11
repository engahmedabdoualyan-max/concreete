/**
 * ProfileScreen — User Profile & Settings
 * Includes the Google Play compliant "Delete My Account & Personal Data" flow
 * plus a placeholder link to the external web deletion form for non-logged-in
 * web users.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/auth-store";
import { useT } from "@/lib/i18n";
import { WEB_ACCOUNT_DELETION_URL } from "@/types";

export function ProfileScreen() {
  const { user, logout, deleteAccount } = useAuthStore();
  const { t, isRtl } = useT();
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const align = isRtl ? "right" : "left";

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== "DELETE") return;
    setBusy(true);
    try {
      await deleteAccount("User requested in-app account deletion");
      Alert.alert("✅", t("profile.deleteSuccess"));
      router.replace("/(auth)/login");
    } catch {
      Alert.alert("⚠️", t("profile.deleteError"));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      setConfirmText("");
    }
  };

  const openWebDeletion = () => {
    Linking.openURL(WEB_ACCOUNT_DELETION_URL).catch(() => {
      Alert.alert("⚠️", WEB_ACCOUNT_DELETION_URL);
    });
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 20 }}>
      {/* User card */}
      <View className="bg-white rounded-3xl p-5 mb-5 shadow-sm">
        <Text className="text-xs uppercase tracking-widest text-slate-400 mb-1">
          {t("profile.account")}
        </Text>
        <Text className="text-2xl font-bold text-slate-900" style={{ textAlign: align }}>
          {user?.fullName ?? "—"}
        </Text>
        <Text className="text-slate-500 mt-1" style={{ textAlign: align }}>
          {user?.email ?? ""}
        </Text>
        {user?.role ? (
          <View className="self-start mt-3 bg-orange-100 rounded-full px-3 py-1">
            <Text className="text-orange-700 font-semibold text-xs">{user.role}</Text>
          </View>
        ) : null}
      </View>

      {/* Sign out */}
      <TouchableOpacity
        onPress={logout}
        activeOpacity={0.8}
        className="bg-white rounded-2xl px-5 py-4 mb-8 flex-row items-center justify-between shadow-sm"
      >
        <Text className="text-slate-800 font-semibold text-base">{t("common.logout")}</Text>
        <Text className="text-lg">🚪</Text>
      </TouchableOpacity>

      {/* ── DANGER ZONE: Account deletion ─────────────────────────────── */}
      <View className="rounded-3xl border-2 border-red-200 bg-red-50 p-5">
        <TouchableOpacity
          onPress={() => setConfirmOpen((v) => !v)}
          activeOpacity={0.85}
          className="flex-row items-center justify-between"
        >
          <Text className="text-red-700 font-bold text-base flex-1" style={{ textAlign: align }}>
            🗑️ {t("profile.deleteAccount")}
          </Text>
          <Text className="text-red-400 text-xl">{confirmOpen ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {confirmOpen && (
          <View className="mt-4">
            <Text className="text-red-800 font-bold text-base mb-2" style={{ textAlign: align }}>
              {t("profile.deleteWarningTitle")}
            </Text>
            <Text
              className="text-red-700 text-sm leading-5 mb-4"
              style={{ textAlign: align, writingDirection: isRtl ? "rtl" : "ltr" }}
            >
              {t("profile.deleteWarning")}
            </Text>

            <Text className="text-red-800 font-semibold text-sm mb-2" style={{ textAlign: align }}>
              {t("profile.deleteConfirmLabel")}
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={t("profile.deleteConfirmPlaceholder")}
              autoCapitalize="characters"
              autoCorrect={false}
              className="bg-white border-2 border-red-300 rounded-2xl px-4 py-3 text-lg text-slate-900 mb-4"
              style={{ textAlign: align }}
            />

            <TouchableOpacity
              onPress={handleDelete}
              disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
              activeOpacity={0.85}
              className={`rounded-2xl py-4 items-center mb-3 ${
                confirmText.trim().toUpperCase() === "DELETE" && !busy
                  ? "bg-red-600"
                  : "bg-red-300"
              }`}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">
                  {t("profile.deleteConfirmButton")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              className="py-2 items-center"
            >
              <Text className="text-slate-500 font-semibold">{t("profile.deleteCancel")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Placeholder routing flag → external web deletion form (non-logged-in) */}
      <View className="mt-6 items-center">
        <Text className="text-slate-400 text-xs text-center mb-2 px-4">
          {t("profile.webDeletionInfo")}
        </Text>
        <TouchableOpacity onPress={openWebDeletion} activeOpacity={0.7}>
          <Text className="text-orange-600 font-semibold underline">
            {t("profile.webDeletionLink")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
