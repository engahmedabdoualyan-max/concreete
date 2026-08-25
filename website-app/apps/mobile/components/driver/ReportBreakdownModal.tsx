/**
 * ReportBreakdownModal — driver reports a vehicle breakdown / issue.
 * Supports text description + optional photo (camera) + optional audio note.
 * Submits to /api/workshop/report (visible to the web Workshop screen);
 * falls back to the offline queue when offline.
 */

import { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { api } from "@/lib/api";
import { geolocation } from "@/lib/geolocation";
import { offlineSync } from "@/lib/offline-sync";

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

export default function ReportBreakdownModal({ visible, onClose, vehicleId, vehicleCode, tripId, vehicleType }: Props) {
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // Photo
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();

  // Audio
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [audioError, setAudioError] = useState("");
  const cameraRef = useRef<CameraView | null>(null);

  // Track recording time
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    };
  }, []);

  const reset = () => {
    setSeverity("MEDIUM");
    setDescription("");
    setError("");
    setSent(false);
    setShowCamera(false);
    setPhotoUri(null);
    setAudioUri(null);
    setRecordingSecs(0);
    setAudioError("");
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    stopRecordingSilent();
  };

  const close = () => {
    reset();
    onClose();
  };

  const stopRecordingSilent = async () => {
    const r = recording;
    if (r) {
      try {
        await r.stopAndUnloadAsync();
      } catch {}
      setRecording(null);
    }
  };

  const takePhoto = async () => {
    try {
      if (cameraPerm && !cameraPerm.granted) {
        const res = await requestCameraPerm();
        if (!res.granted) {
          setError("السماح بالوصول للكاميرا مطلوب لتصوير العطل");
          return;
        }
      }
      setShowCamera(true);
    } catch {
      setError("تعذر فتح الكاميرا");
    }
  };

  const capture = async () => {
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.5, base64: false });
      if (pic?.uri) {
        setPhotoUri(pic.uri);
        setShowCamera(false);
      }
    } catch {
      setError("تعذر التقاط الصورة");
      setShowCamera(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) setAudioUri(uri);
        setRecording(null);
        if (recordingTimer.current) {
          clearInterval(recordingTimer.current);
          recordingTimer.current = null;
        }
      } catch (e: any) {
        setAudioError(e?.message ?? "خطأ في إيقاف التسجيل");
      }
      return;
    }

    try {
      const permRes = await Audio.getPermissionsAsync();
      if (!permRes.granted) {
        const req = await Audio.requestPermissionsAsync();
        if (!req.granted) {
          setAudioError("السماح بالميكروفون مطلوب لتسجيل الصوت");
          return;
        }
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY
      );
      setRecording(rec);
      setAudioError("");
      setRecordingSecs(0);
      recordingTimer.current = setInterval(() => setRecordingSecs((s) => s + 1), 1000);
    } catch (e: any) {
      setAudioError(e?.message ?? "تعذر بدء التسجيل الصوتي");
    }
  };

  const fileToBase64 = async (uri: string): Promise<string> => {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return b64;
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
      const location = await geolocation.getCurrentLocation().catch(() => null);

      // Encode photo + audio as base64 for the report (Firestore/API-friendly)
      let photoBase64: string | null = null;
      let audioBase64: string | null = null;
      if (photoUri) {
        photoBase64 = await fileToBase64(photoUri).catch(() => null);
      }
      if (audioUri) {
        audioBase64 = await fileToBase64(audioUri).catch(() => null);
        // Guard: cap audio size so the offline queue (AsyncStorage) can't overflow.
        if (audioBase64 && audioBase64.length > 900_000) {
          setError("التسجيل الصوتي كبير جداً — أعد التسجيل بشكل أقصر");
          setSaving(false);
          return;
        }
      }

      const payload: Record<string, unknown> = {
        description: desc,
        severity,
        vehicleId,
        vehicleCode,
        tripId,
        vehicleType,
        latitude: location ? location.latitude : null,
        longitude: location ? location.longitude : null,
        photoBase64,
        audioBase64,
        capturedAt: new Date().toISOString(),
      };

      if (!offlineSync.getIsConnected()) {
        await offlineSync.enqueue("BREAKDOWN_REPORT", payload);
      } else {
        try {
          await api.reportBreakdown(payload as any);
        } catch {
          await offlineSync.enqueue("BREAKDOWN_REPORT", payload);
        }
      }
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? "حدث خطأ في الإرسال");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Modal visible={visible} animationType="slide" transparent={!showCamera} onRequestClose={close}>
      {showCamera ? (
        <View className="flex-1 bg-black">
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing}>
            <View className="flex-1 justify-between p-5" style={{ paddingTop: 60 }}>
              <View className="flex-row justify-between items-center">
                <TouchableOpacity onPress={() => setShowCamera(false)} className="bg-black/50 rounded-full px-5 py-2.5">
                  <Text className="text-white font-bold">✕ إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))} className="bg-black/50 rounded-full w-11 h-11 items-center justify-center">
                  <Text className="text-white text-xl">🔄</Text>
                </TouchableOpacity>
              </View>
              <View className="items-center pb-8">
                <TouchableOpacity onPress={capture} className="bg-white rounded-full w-20 h-20 items-center justify-center border-4 border-orange-500">
                  <Text className="text-3xl">📷</Text>
                </TouchableOpacity>
                <Text className="text-white/80 font-semibold mt-3">اضغط للتصوير</Text>
              </View>
            </View>
          </CameraView>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/50"
        >
          <View className="bg-white rounded-t-3xl p-5 max-h-[92%]">
            <>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xl font-bold text-slate-800">🛠️ إبلاغ عن عطل</Text>
                <TouchableOpacity onPress={close}>
                  <Text className="text-slate-400 text-lg">✕</Text>
                </TouchableOpacity>
              </View>

              {sent ? (
                <View className="items-center py-10">
                  <Text className="text-6xl mb-4">✅</Text>
                  <Text className="text-xl font-bold text-emerald-800 mb-2">تم إرسال البلاغ</Text>
                  <Text className="text-slate-600 text-center mb-6">
                    وصل البلاغ إلى الورشة وسيتم التعامل معه
                  </Text>
                  <TouchableOpacity
                    onPress={close}
                    className="bg-orange-500 rounded-2xl py-3 px-10"
                  >
                    <Text className="text-white font-bold text-lg">حسناً</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {(vehicleCode || vehicleType) ? (
                    <View className="bg-slate-50 rounded-2xl px-4 py-3 mb-4">
                      {vehicleCode ? <Text className="text-slate-800 font-bold text-lg">{vehicleCode}</Text> : null}
                      {vehicleType ? <Text className="text-slate-500 text-sm">نوع المركبة: {vehicleType}</Text> : null}
                    </View>
                  ) : null}

                  <Text className="text-slate-600 font-semibold mb-2">درجة الخطورة</Text>
                  <View className="flex-row gap-2 mb-4">
                    {SEVERITIES.map((s) => {
                      const active = severity === s.key;
                      return (
                        <TouchableOpacity
                          key={s.key}
                          onPress={() => setSeverity(s.key)}
                          className={`flex-1 rounded-2xl py-3 items-center border-2 ${
                            active ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <Text className="text-lg">{s.emoji}</Text>
                          <Text
                            className={`text-sm font-semibold mt-1 ${
                              active ? "text-orange-600" : "text-slate-600"
                            }`}
                          >
                            {s.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text className="text-slate-600 font-semibold mb-2">وصف العطل *</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="مثال: ضجيج في ناقل الخلاط، تسريب ماء..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-lg text-slate-800 mb-4 min-h-[90px]"
                  />

                  {/* 📷 Photo */}
                  <Text className="text-slate-600 font-semibold mb-2">📷 تصوير العطل / مكانه</Text>
                  {photoUri ? (
                    <View className="mb-4">
                      <Image source={{ uri: photoUri }} className="w-full h-44 rounded-2xl mb-2" resizeMode="cover" />
                      <View className="flex-row gap-2">
                        <TouchableOpacity onPress={takePhoto} className="flex-1 bg-slate-100 rounded-xl py-2.5 items-center">
                          <Text className="text-slate-700 font-semibold">📷 التقاط صورة أخرى</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setPhotoUri(null)} className="bg-red-50 rounded-xl py-2.5 px-4">
                          <Text className="text-red-500 font-semibold">حذف</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={takePhoto} className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl py-4 items-center mb-4">
                      <Text className="text-2xl mb-1">📷</Text>
                      <Text className="text-slate-600 font-semibold">تصوير العطل أو مكانه</Text>
                    </TouchableOpacity>
                  )}

                  {/* 🎙 Audio */}
                  <Text className="text-slate-600 font-semibold mb-2">🎙️ تسجيل صوتي للعطل</Text>
                  <TouchableOpacity
                    onPress={toggleRecording}
                    className={`rounded-2xl py-3.5 items-center mb-1 ${
                      recording ? "bg-red-500" : audioUri ? "bg-emerald-500" : "bg-slate-100"
                    }`}
                  >
                    <Text className={`font-bold ${recording || audioUri ? "text-white" : "text-slate-700"}`}>
                      {recording ? `⏺ جارِ التسجيل... ${fmt(recordingSecs)}` : audioUri ? `✅ تم التسجيل (${fmt(recordingSecs)} ث)` : "🎙️ اضغط لتسجيل وصف صوتي"}
                    </Text>
                  </TouchableOpacity>
                  {audioError ? <Text className="text-red-500 text-sm mb-2">{audioError}</Text> : null}
                  {!recording && audioUri ? (
                    <TouchableOpacity onPress={() => setAudioUri(null)} className="mb-4 self-start">
                      <Text className="text-red-500 text-sm font-semibold">حذف التسجيل الصوتي</Text>
                    </TouchableOpacity>
                  ) : null}

                  {error ? <Text className="text-red-500 text-sm mb-2">{error}</Text> : null}

                  <TouchableOpacity
                    onPress={submit}
                    disabled={saving}
                    className={`bg-orange-500 rounded-2xl py-4 items-center mb-2 ${saving ? "opacity-50" : ""}`}
                  >
                    {saving ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-white font-bold text-lg">إرسال البلاغ</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              )}
            </>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}
