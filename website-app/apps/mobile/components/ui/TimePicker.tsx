/**
 * TimePicker — reusable hour:minute picker modal (JS-only, no native dep).
 * Returns "HH:mm" 24h string.
 */

import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from "react-native";
import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

interface Props {
  visible: boolean;
  value: string; // "HH:mm"
  onChange: (t: string) => void;
  onClose: () => void;
  accent?: string;
}

export default function TimePicker({ visible, value, onChange, onClose, accent = "#F97316" }: Props) {
  const [hour, setHour] = useState<number>(() => {
    const h = parseInt((value || "").split(":")[0], 10);
    return isNaN(h) ? 8 : h;
  });
  const [minute, setMinute] = useState<number>(() => {
    const m = parseInt((value || "").split(":")[1], 10);
    return isNaN(m) ? 0 : m;
  });

  const confirm = () => {
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    onChange(`${hh}:${mm}`);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 24 }} onPress={onClose}>
        <Pressable style={{ backgroundColor: "#0B111E", borderRadius: 20, padding: 16 }} onPress={(e) => e.stopPropagation()}>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900", textAlign: "center", marginBottom: 12 }}>
            🕐 اختر الوقت ({String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")})
          </Text>

          <View style={{ flexDirection: "row", gap: 10, maxHeight: 260 }}>
            {/* Hours */}
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
              <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", textAlign: "center", paddingVertical: 6 }}>الساعة</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <TouchableOpacity key={h} onPress={() => setHour(h)} style={{ paddingVertical: 8, alignItems: "center", backgroundColor: hour === h ? `${accent}33` : "transparent" }}>
                    <Text style={{ color: hour === h ? accent : "#E2E8F0", fontSize: 14, fontWeight: hour === h ? "900" : "600" }}>
                      {String(h).padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Minutes */}
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
              <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700", textAlign: "center", paddingVertical: 6 }}>الدقائق</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => (
                  <TouchableOpacity key={m} onPress={() => setMinute(m)} style={{ paddingVertical: 8, alignItems: "center", backgroundColor: minute === m ? `${accent}33` : "transparent" }}>
                    <Text style={{ color: minute === m ? accent : "#E2E8F0", fontSize: 14, fontWeight: minute === m ? "900" : "600" }}>
                      {String(m).padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <TouchableOpacity onPress={confirm} style={{ marginTop: 12, backgroundColor: accent, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: "#0B111E", fontSize: 14, fontWeight: "900" }}>✔ تأكيد</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
