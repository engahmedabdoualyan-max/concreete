/**
 * Driver → Customer Signature Screen (Epic 3)
 * After the pour finishes (DEP_SITE), the site recipient signs
 * on the glass + types their name. Proof of delivery is uploaded
 * and the trip can then be closed.
 */

import { View, Text, ScrollView, Alert } from "react-native";
import { useRef, useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function DriverSignScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useT();
  const padRef = useRef<SignaturePadHandle>(null);
  const params = useLocalSearchParams<{ tripId?: string }>();

  const [signerName, setSignerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);

  // Fallback: resolve the active trip when no param was passed
  useEffect(() => {
    if (tripId) return;
    let cancelled = false;
    void api
      .getMyActiveTrip()
      .then((trip) => {
        if (!cancelled) setTripId(trip?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setTripId(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOK = async (dataUrl: string) => {
    if (!tripId) {
      Alert.alert("⚠️", t("driver.sign.noTrip"));
      return;
    }
    if (!signerName.trim()) {
      Alert.alert("⚠️", t("driver.sign.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      await api.saveTripSignature(tripId, dataUrl, signerName.trim());
      await queryClient.invalidateQueries({ queryKey: ["my-active-trip"] });
      Alert.alert("✅", t("driver.sign.saved"));
      router.back();
    } catch {
      Alert.alert("⚠️", t("driver.sign.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 20 }}>
      <Card variant="elevated" className="mb-4">
        <Text className="text-xl font-bold text-slate-800 mb-1 text-center">
          ✍️ {t("driver.sign.title")}
        </Text>
        <Text className="text-slate-500 text-sm text-center mb-4">
          {t("driver.sign.hint")}
        </Text>

        <SignaturePad
          ref={padRef}
          onOK={handleOK}
          onEmpty={() => Alert.alert("⚠️", t("driver.sign.empty"))}
        />

        <View className="flex-row gap-2 mt-3">
          <View className="flex-1">
            <Button
              title={t("driver.sign.clear")}
              onPress={() => padRef.current?.clearSignature()}
              variant="secondary"
              size="small"
            />
          </View>
          <View className="flex-1">
            <Button
              title={t("driver.sign.save")}
              onPress={() => padRef.current?.readSignature()}
              loading={saving}
              variant="success"
              size="small"
            />
          </View>
        </View>
      </Card>

      <Card variant="default">
        <Input
          label={t("driver.sign.signerName")}
          value={signerName}
          onChangeText={setSignerName}
          placeholder="م. أحمد"
        />
      </Card>
    </ScrollView>
  );
}
