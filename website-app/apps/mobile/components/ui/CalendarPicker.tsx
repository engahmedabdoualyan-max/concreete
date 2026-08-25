/**
 * CalendarPicker — reusable Arabic calendar modal.
 * Returns selected date as "yyyy-MM-dd". JS-only (no native dep).
 */

import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import { useState } from "react";
import { addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, format, isBefore, startOfDay } from "date-fns";
import { ar } from "date-fns/locale";

const AR_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

interface Props {
  visible: boolean;
  value: string; // yyyy-MM-dd
  onChange: (date: string) => void;
  onClose: () => void;
  minDate?: string; // yyyy-MM-dd — days before this are disabled
  accent?: string;
}

export default function CalendarPicker({ visible, value, onChange, onClose, minDate, accent = "#F97316" }: Props) {
  const [viewMonth, setViewMonth] = useState<Date>(value ? new Date(value) : new Date());

  const selected = value ? new Date(value) : null;
  const min = minDate ? startOfDay(new Date(minDate)) : null;

  const days = eachDayOfInterval({
    start: startOfMonth(viewMonth),
    end: endOfMonth(viewMonth),
  });

  const select = (d: Date) => {
    onChange(format(d, "yyyy-MM-dd"));
    onClose();
  };

  const disabled = (d: Date) => (min ? isBefore(d, min) : false);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", padding: 20 }} onPress={onClose}>
        <Pressable style={{ backgroundColor: "#0B111E", borderRadius: 20, padding: 16 }} onPress={(e) => e.stopPropagation()}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <TouchableOpacity onPress={() => setViewMonth(subMonths(viewMonth, 1))} style={{ padding: 8 }}>
              <Text style={{ color: "#94A3B8", fontSize: 18 }}>▶</Text>
            </TouchableOpacity>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>
              {format(viewMonth, "LLLL yyyy", { locale: ar })}
            </Text>
            <TouchableOpacity onPress={() => setViewMonth(addMonths(viewMonth, 1))} style={{ padding: 8 }}>
              <Text style={{ color: "#94A3B8", fontSize: 18 }}>◀</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            {AR_DAYS.map((d) => (
              <Text key={d} style={{ flex: 1, textAlign: "center", color: "#64748B", fontSize: 10, fontWeight: "700" }}>
                {d}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {days.map((d) => {
              const off = !isSameMonth(d, viewMonth);
              const isSel = selected ? isSameDay(d, selected) : false;
              const dis = disabled(d);
              return (
                <TouchableOpacity
                  key={d.toISOString()}
                  disabled={off || dis}
                  onPress={() => select(d)}
                  style={{
                    width: "14.28%",
                    aspectRatio: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    backgroundColor: isSel ? accent : "transparent",
                    opacity: off ? 0.15 : dis ? 0.3 : 1,
                  }}
                >
                  <Text style={{ color: isSel ? "#0B111E" : dis ? "#64748B" : "#E2E8F0", fontSize: 13, fontWeight: isSel ? "900" : "600" }}>
                    {format(d, "d")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={onClose} style={{ marginTop: 12, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
            <Text style={{ color: "#94A3B8", fontSize: 13, fontWeight: "700" }}>إلغاء</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
