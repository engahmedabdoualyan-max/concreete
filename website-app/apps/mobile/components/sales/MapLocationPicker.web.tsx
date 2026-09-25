/**
 * MapLocationPicker.web — web fallback (no react-native-maps on web).
 * Same props as the native version: manual lat/lng entry + browser GPS +
 * Nominatim place search. Metro picks this file automatically on web.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, Modal, TextInput, ScrollView, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import type { LatLng, PickResult } from "./MapLocationPicker";

interface Suggestion {
  lat: number;
  lon: number;
  label: string;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";

async function searchPlaces(q: string): Promise<Suggestion[]> {
  const url =
    `${NOMINATIM}/search?format=json&limit=6&accept-language=ar,en` +
    `&addressdetails=0&q=` +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
  return json.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    label: r.display_name || "",
  }));
}

interface Props {
  visible: boolean;
  value: LatLng | null;
  onClose: () => void;
  onConfirm: (loc: PickResult) => void;
}

export function MapLocationPicker({ visible, value, onClose, onConfirm }: Props) {
  const [lat, setLat] = useState(value ? String(value.latitude) : "");
  const [lng, setLng] = useState(value ? String(value.longitude) : "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const useGps = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
    } finally {
      setGpsLoading(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(query.trim()));
    } finally {
      setSearching(false);
    }
  };

  const confirm = () => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    onConfirm({ latitude, longitude });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#0B111E", padding: 16, paddingTop: 48 }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 4 }}>
          📍 موقع الصبة
        </Text>
        <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 12 }}>
          نسخة الويب: أدخل الإحداثيات أو استخدم GPS أو ابحث باسم المكان
        </Text>
        <TextInput
          value={lat}
          onChangeText={setLat}
          placeholder="خط العرض Latitude"
          keyboardType="numeric"
          placeholderTextColor="#64748B"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#fff", borderRadius: 10, padding: 12, marginBottom: 8 }}
        />
        <TextInput
          value={lng}
          onChangeText={setLng}
          placeholder="خط الطول Longitude"
          keyboardType="numeric"
          placeholderTextColor="#64748B"
          style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#fff", borderRadius: 10, padding: 12, marginBottom: 8 }}
        />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث باسم المكان..."
            placeholderTextColor="#64748B"
            style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.06)", color: "#fff", borderRadius: 10, padding: 12 }}
          />
          <TouchableOpacity onPress={search} style={{ backgroundColor: "#334155", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>{searching ? "…" : "🔍"}</Text>
          </TouchableOpacity>
        </View>
        {searching && <ActivityIndicator color="#38BDF8" style={{ marginVertical: 8 }} />}
        <ScrollView style={{ maxHeight: 180, marginBottom: 8 }}>
          {results.map((r, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                setLat(String(r.lat));
                setLng(String(r.lon));
                setResults([]);
              }}
              style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}
            >
              <Text style={{ color: "#E2E8F0", fontSize: 12 }} numberOfLines={2}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, marginTop: "auto", marginBottom: 16 }}>
          <TouchableOpacity onPress={useGps} style={{ flex: 1, backgroundColor: "#1E293B", borderRadius: 12, padding: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>{gpsLoading ? "⏳..." : "📡 GPS"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirm} style={{ flex: 1, backgroundColor: "#0EA5E9", borderRadius: 12, padding: 14, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>تأكيد ✓</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 14, alignItems: "center" }}>
            <Text style={{ color: "#CBD5E1", fontWeight: "800" }}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
