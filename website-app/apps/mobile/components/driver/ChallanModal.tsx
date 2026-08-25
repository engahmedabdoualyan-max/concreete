/**
 * ChallanModal — the driver fills the delivery challan at the site:
 * received-by name + customer signature + slump + temperature.
 * Saves via the challan API (Package 1).
 */

import { useEffect, useState } from "react";
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
} from "react-native";
import { api } from "@/lib/api";
import SignaturePad, { serializeStrokes, parseStrokes, Stroke } from "./SignaturePad";
import type { Challan } from "@/types";

interface Props {
  tripId: string;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ChallanModal({ tripId, visible, onClose, onSaved }: Props) {
  const [receivedBy, setReceivedBy] = useState("");
  const [slump, setSlump] = useState("");
  const [temp, setTemp] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setError("");
    setLoading(true);
    api
      .getTripChallan(tripId)
      .then((d) => {
        const c: Challan | null = d?.challan ?? null;
        setReceivedBy(c?.receivedBy ?? "");
        setSlump(c?.slumpMm != null ? String(c.slumpMm) : "");
        setTemp(c?.temperatureC != null ? String(c.temperatureC) : "");
        setStrokes(parseStrokes(c?.customerSignature));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, tripId]);

  const save = async () => {
    if (!receivedBy.trim()) {
      setError("أدخل اسم المستلم");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.saveTripChallan(tripId, {
        receivedBy: receivedBy.trim(),
        customerSignature: serializeStrokes(strokes),
        slumpMm: slump ? Number(slump) : null,
        temperatureC: temp ? Number(temp) : null,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "حدث خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/50"
      >
        <View className="bg-white rounded-t-3xl p-5 max-h-[92%]">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-slate-800">🧾 شيكارة التوريد</Text>
            <TouchableOpacity onPress={onClose}>
              <Text className="text-slate-400 text-lg">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color="#F97316" size="large" className="py-10" />
            ) : (
              <>
                <Text className="text-slate-600 font-semibold mb-2">اسم المستلم *</Text>
                <TextInput
                  value={receivedBy}
                  onChangeText={setReceivedBy}
                  placeholder="اسم مهندس / مسؤول الموقع"
                  placeholderTextColor="#94A3B8"
                  className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-lg text-slate-800 mb-4"
                />

                <Text className="text-slate-600 font-semibold mb-2">توقيع المستلم</Text>
                <SignaturePad strokes={strokes} onChange={setStrokes} />

                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <Text className="text-slate-600 font-semibold mb-2">الهبوط (Slump مم)</Text>
                    <TextInput
                      value={slump}
                      onChangeText={setSlump}
                      keyboardType="numeric"
                      placeholder="مثال: 100"
                      placeholderTextColor="#94A3B8"
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-lg text-slate-800"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-600 font-semibold mb-2">درجة الحرارة °C</Text>
                    <TextInput
                      value={temp}
                      onChangeText={setTemp}
                      keyboardType="numeric"
                      placeholder="مثال: 32"
                      placeholderTextColor="#94A3B8"
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-lg text-slate-800"
                    />
                  </View>
                </View>

                {error ? <Text className="text-red-500 text-sm mt-3">{error}</Text> : null}

                <TouchableOpacity
                  onPress={save}
                  disabled={saving}
                  className={`bg-orange-500 rounded-2xl py-4 items-center mt-5 ${saving ? "opacity-50" : ""}`}
                >
                  {saving ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-lg">حفظ الشيكارة</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
