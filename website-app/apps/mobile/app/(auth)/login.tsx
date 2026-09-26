/**
 * Login Screen
 * Unified login for all 10 ERP roles
 * Includes a language picker for the 12 supported locales
 */

import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from "react-native";
import { useState } from "react";
import { Stack } from "expo-router";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth-store";
import { useT, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { getServerUrl, setServerUrl } from "@/lib/server-url";

export default function LoginScreen() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showLanguages, setShowLanguages] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(getServerUrl() || "");
  const { login, isLoading, error, clearError } = useAuthStore();
  const { t, locale, setLocale, isRtl } = useT();

  const handleLogin = async () => {
    if (!phone || !password) return;
    await login(phone, password);
  };

  return (
    <>
      <Stack.Screen options={{ title: t("login.title") }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-white"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Language picker toggle (top-right) */}
          <View className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} z-10`}>
            <TouchableOpacity
              onPress={() => setShowLanguages(!showLanguages)}
              className="bg-slate-100 rounded-full px-3 py-2 flex-row items-center"
              activeOpacity={0.7}
            >
              <Text className="text-lg mr-1">🌐</Text>
              <Text className="text-slate-700 font-semibold text-sm">
                {LOCALE_LABELS[locale]}
              </Text>
            </TouchableOpacity>

            {showLanguages && (
              <View className="absolute top-12 right-0 bg-white rounded-2xl shadow-lg border border-slate-200 py-2 w-48">
                {SUPPORTED_LOCALES.map((l) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => {
                      setLocale(l as Locale);
                      setShowLanguages(false);
                    }}
                    className={`px-4 py-2 flex-row items-center ${locale === l ? "bg-orange-50" : ""}`}
                    activeOpacity={0.7}
                  >
                    <Text
                      className={`text-base ${locale === l ? "text-orange-600 font-bold" : "text-slate-700"}`}
                    >
                      {LOCALE_LABELS[l as Locale]}
                    </Text>
                    {locale === l && <Text className="ml-auto text-orange-500">✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Logo & Branding */}
          <View className="items-center mb-12">
            <View className="w-20 h-20 bg-orange-500 rounded-3xl items-center justify-center mb-4">
              <Text className="text-4xl">🏗️</Text>
            </View>
            <Text className="text-3xl font-bold text-slate-800 mb-2">
              {t("login.title")}
            </Text>
            <Text className="text-slate-500 text-base text-center px-6">
              {t("login.subtitle")}
            </Text>
          </View>

          {/* Login Form */}
          <View className="mb-6">
            <Input
              label={t("login.phone")}
              placeholder={t("login.phonePlaceholder")}
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                if (error) clearError();
              }}
              keyboardType="phone-pad"
              icon="📱"
              autoCapitalize="none"
            />

            <Input
              label={t("login.password")}
              placeholder={t("login.passwordPlaceholder")}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) clearError();
              }}
              secureTextEntry
              icon="🔒"
              autoCapitalize="none"
            />
          </View>

          {/* Error Message */}
          {error && (
            <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
              <Text className="text-red-600 text-center font-semibold">
                {error}
              </Text>
            </View>
          )}

          {/* Login Button */}
          <Button
            title={t("login.submit")}
            onPress={handleLogin}
            loading={isLoading}
            disabled={!phone || !password}
            size="large"
          />

          {/* Server (plant) URL — advanced: point the app at another ERP server
              without reinstalling. Empty = use the built-in default. */}
          <View className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <TouchableOpacity
              onPress={() => setShowServer((v) => !v)}
              className="flex-row items-center justify-between"
            >
              <Text className="text-slate-500 text-xs font-bold">🌐 السيرفر (إعدادات متقدمة)</Text>
              <Text className="text-slate-400 text-xs">{showServer ? "إخفاء ▲" : "إظهار ▼"}</Text>
            </TouchableOpacity>
            {showServer ? (
              <View className="mt-2">
                <Input
                  value={serverDraft}
                  onChangeText={setServerDraft}
                  placeholder="https://api.example.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View className="flex-row gap-2 mt-2">
                  <Button
                    title="حفظ"
                    onPress={() => {
                      setServerUrl(serverDraft);
                      setServerDraft(getServerUrl() || "");
                    }}
                    size="small"
                    className="flex-1"
                  />
                  <Button
                    title="افتراضي"
                    onPress={() => {
                      setServerUrl("");
                      setServerDraft("");
                    }}
                    size="small"
                    className="flex-1"
                  />
                </View>
                <Text className="text-slate-400 text-xs mt-2">
                  الحالي: {getServerUrl() || "built-in default"}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Help Text */}
          <View className="mt-8 items-center">
            <Text className="text-slate-400 text-sm text-center px-6">
              {t("login.help")}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
