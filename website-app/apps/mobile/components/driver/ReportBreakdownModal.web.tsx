/**
 * ReportBreakdownModal.web — web/desktop fallback for the driver breakdown
 * report.
 *
 * The native version records a voice note with `expo-av` (no web support) and
 * takes the photo through expo-camera. Here the photo uses the browser picker
 * (same `PhotoCapture` fallback as the rest of the app) and the voice note is
 * left to the phone build — the report itself is submitted unchanged, so the
 * workshop screen sees the same record.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as geolocation from "expo-location";
import { api } from "@/lib/api";
import { offlineSync } from "@/lib/offline-sync";
import { PhotoCapture } from "@/components/ui/PhotoCapture";
import { PhotoThumb } from "@/components/ui/PhotoCapture";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITIES: { key: Severity; label: string; emoji: string }[] = [
  { key: "LOW", label: "بسيط", emoji: "🟢" },
  { key: "MEDIUM", label: "متوسط", emoji: "🟡" },
  { key: "HIGH", label: "عالي", emoji: "🟠" },
  { key: "CRITICAL", label: "حرج", emoji: "🔴" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  vehicleId?: string;
  vehicleCode?: string;
  tripId?: string;
  vehicleType?: string;
}

export default function ReportBreakdownModal({
  visible,
  onClose,
  vehicleId,
  vehicleCode,
  tripId,
  vehicleType,
}: Props) {
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const reset = () => {
    setSeverity("MEDIUM");
    setDescription("");
    setError("");
    setSent(false);
    setPhotoUri(null);
    setShowCamera(false);
  };

  const submit = async () => {
    const desc = description.trim();
    if (!desc) {
      setError("اكتب وصف العطل");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const location = await geolocation.getCurrentPositionAsync({}).catch(() => null);
      const payload: Record<string, unknown> = {
        description: desc,
        severity,
        vehicleId,
        vehicleCode,
        tripId,
        vehicleType,
        latitude: location?.coords.latitude ?? null,
        longitude: location?.coords.longitude ?? null,
        photoBase64: photoUri,
        audioBase64: null,
        capturedAt: new Date().toISOString(),
      };

      if (!offlineSync.getIsConnected()) {
        await offlineSync.enqueue("BREAKDOWN_REPORT", payload);
      } else {
        try {
          await api.reportBreakdown(payload as never);
        } catch {
          await offlineSync.enqueue("BREAKDOWN_REPORT", payload);
        }
      }
      setSent(true);
      setTimeout(() => {
        reset();
        onClose();
      }, 1200);
    } catch {
      setError("تعذّر الإرسال — تم الحفظ محليًا وإرساله لاحقًا");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-100">
        <View className="bg-orange-500 px-4 py-4 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Text className="text-white font-bold">إلغاء</Text>
          </TouchableOpacity>
          <Text className="text-white font-bold text-base">⚠️ بلاغ عطل</Text>
          <View className="w-10" />
        </View>

        <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 32 }}>
          {sent ? (
            <View className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 items-center">
              <Text className="text-emerald-700 font-bold text-lg">✅ تم الإرسال</Text>
            </View>
          ) : (
            <>
              <Text className="text-slate-700 font-bold mb-2">درجة العطل</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {SEVERITIES.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => setSeverity(s.key)}
                    className={`px-3 py-2 rounded-full border ${
                      severity === s.key
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white border-slate-300"
                    }`}
                  >
                    <Text className={severity === s.key ? "text-white font-bold" : "text-slate-700 font-bold"}>
                      {s.emoji} {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-slate-700 font-bold mb-2">وصف العطل</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder="اكتب تفاصيل العطل…"
                placeholderTextColor="#94A3B8"
                className="bg-white border border-slate-300 rounded-2xl p-3 min-h-28"
                style={{ minHeight: 110, textAlignVertical: "top" }}
              />

              <Text className="text-slate-700 font-bold mt-4 mb-2">صورة</Text>
              <View className="flex-row items-center gap-3">
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    style={{ width: 72, height: 72, borderRadius: 12 }}
                  />
                ) : (
                  <PhotoThumb size={72} />
                )}
                <TouchableOpacity
                  onPress={() => setShowCamera(true)}
                  className="bg-slate-800 rounded-xl px-4 py-3"
                >
                  <Text className="text-white font-bold">{photoUri ? "تغيير" : "📷 إضافة صورة"}</Text>
                </TouchableOpacity>
                {photoUri ? (
                  <TouchableOpacity onPress={() => setPhotoUri(null)} className="bg-white border border-slate-300 rounded-xl px-4 py-3">
                    <Text className="text-slate-700 font-bold">حذف</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text className="text-slate-400 text-xs mt-3">
                🎙 التسجيل الصوتي متاح في تطبيق الموبايل — على الديسكتوب يُرسل البلاغ بالصورة والوصف.
              </Text>

              {error ? <Text className="text-red-600 font-bold mt-3">{error}</Text> : null}

              <TouchableOpacity
                onPress={submit}
                disabled={saving}
                className="bg-orange-500 rounded-2xl py-4 items-center mt-5"
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-lg">إرسال البلاغ</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <PhotoCapture
          visible={showCamera}
          onClose={() => setShowCamera(false)}
          onCapture={(uri) => setPhotoUri(uri)}
        />
      </View>
    </Modal>
  );
}
