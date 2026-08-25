/**
 * Vehicle type helpers — driver selects their vehicle type
 * (قلاب / شاحنة / خلاطة / بامب). Persisted locally so it survives restarts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const VEHICLE_TYPE_KEY = "fimto.vehicleType";

export const VEHICLE_TYPES: { key: string; ar: string; emoji: string }[] = [
  { key: "قلاب", ar: "قلاب (نقل رمل/سن/مخلفات)", emoji: "🚚" },
  { key: "شاحنة", ar: "شاحنة", emoji: "🛻" },
  { key: "خلاطة", ar: "خلاطة خرسانة", emoji: "🧱" },
  { key: "بامب", ar: "بامب (مضخة خرسانة)", emoji: "🚰" },
];

export async function loadVehicleType(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(VEHICLE_TYPE_KEY)) || "";
  } catch {
    return "";
  }
}

export async function saveVehicleType(type: string): Promise<void> {
  try {
    await AsyncStorage.setItem(VEHICLE_TYPE_KEY, type);
  } catch {}
}
