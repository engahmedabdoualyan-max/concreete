/**
 * MapLocationPicker — full-screen map picker for the pour location.
 *  - Tap the map to drop a pin
 *  - 📍 use your current GPS position (requests permission first)
 *  - 🔍 search for a place (OpenStreetMap Nominatim) and jump to it
 * Confirms a LatLng plus a resolved address so the order keeps a label too.
 */

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { Marker, MapPressEvent } from "react-native-maps";
import * as Location from "expo-location";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface PickResult extends LatLng {
  address?: string;
}

interface Suggestion {
  lat: number;
  lon: number;
  label: string;
}

const DEFAULT_REGION = {
  latitude: 26.4207,
  longitude: 50.0888,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const NOMINATIM = "https://nominatim.openstreetmap.org";

async function searchPlaces(q: string): Promise<Suggestion[]> {
  const url =
    `${NOMINATIM}/search?format=json&limit=6&accept-language=ar,en` +
    `&addressdetails=0&q=` +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
  return json.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    label: r.display_name || "",
  }));
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ar,en`
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: string };
    return json.display_name || null;
  } catch {
    return null;
  }
}

interface Props {
  visible: boolean;
  value: LatLng | null;
  onClose: () => void;
  onConfirm: (result: PickResult) => void;
}

export function MapLocationPicker({ visible, value, onClose, onConfirm }: Props) {
  const [picked, setPicked] = useState<LatLng | null>(value);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  const setPin = (loc: LatLng) => {
    setPicked(loc);
    setAddress(null);
    reverseGeocode(loc.latitude, loc.longitude)
      .then((a) => {
        if (a) {
          setAddress(a);
          setQuery(a.split(",").slice(0, 2).join("، "));
        }
      })
      .catch(() => {});
  };

  const handlePress = (e: MapPressEvent) => {
    const c = e.nativeEvent.coordinate;
    if (c && typeof c.latitude === "number" && typeof c.longitude === "number") {
      setPin({ latitude: c.latitude, longitude: c.longitude });
    }
  };

  const handleGPS = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("تنبيه", "تحتاج منح إذن الموقع من الإعدادات حتى نستخدم موقعك الحالي.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setPin({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (error) {
      console.error("[MapPicker] GPS failed:", error);
      Alert.alert("تنبيه", "تعذّر الحصول على موقعك الحالي. جرّب مرة أخرى أو اختر من الخريطة.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setResults([]);
    try {
      setResults(await searchPlaces(q));
    } catch (error) {
      console.error("[MapPicker] search failed:", error);
    } finally {
      setSearching(false);
    }
  };

  const pickSuggestion = (s: Suggestion) => {
    setQuery("");
    setResults([]);
    setPin({ latitude: s.lat, longitude: s.lon });
    setAddress(s.label);
  };

  const initialRegion = value
    ? { ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_REGION;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1">
        <View className="bg-orange-500 px-4 pt-12 pb-3 flex-row justify-between items-center">
          <TouchableOpacity onPress={onClose} className="py-2">
            <Text className="text-white font-bold">✕ إلغاء</Text>
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg">📌 اختر مكان الصب</Text>
          <TouchableOpacity
            onPress={() => picked && onConfirm({ ...picked, address: address || undefined })}
            disabled={!picked}
            className={`py-2 px-1 ${picked ? "" : "opacity-40"}`}
          >
            <Text className="text-white font-bold">✓ تأكيد</Text>
          </TouchableOpacity>
        </View>

        {/* 🔍 بحث عن مكان */}
        <View className="bg-white px-3 pt-2 pb-2 border-b border-slate-200">
          <View className="flex-row items-center gap-2">
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              placeholder="🔍 ابحث عن حي، شارع، أو مشروع..."
              placeholderTextColor="#94A3B8"
              className="flex-1 bg-slate-50 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-base text-slate-800"
            />
            <TouchableOpacity
              onPress={handleSearch}
              className="bg-orange-500 rounded-xl px-4 py-2.5"
            >
              {searching ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">بحث</Text>}
            </TouchableOpacity>
          </View>
          {results.length > 0 ? (
            <ScrollView style={{ maxHeight: 200 }} className="mt-2">
              {results.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => pickSuggestion(r)}
                  className="px-3 py-2.5 border-b border-slate-100"
                >
                  <Text className="text-slate-700 text-sm">{r.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <MapView
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          onPress={handlePress}
        >
          {picked && <Marker coordinate={picked} title="مكان الصب" />}
        </MapView>

        <View className="bg-white p-3 border-t border-slate-200">
          {address ? (
            <Text numberOfLines={2} className="text-slate-600 text-center text-xs mb-2 font-semibold">
              📍 {address}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={handleGPS}
            disabled={gpsLoading}
            className="bg-orange-50 rounded-2xl p-3 items-center"
          >
            <Text className="text-orange-600 font-bold">
              {gpsLoading ? "جارِ الحصول على موقعك..." : "📍 استخدام موقعي الحالي"}
            </Text>
          </TouchableOpacity>
          <Text className="text-slate-500 text-center text-xs mt-2">
            اضغط على الخريطة لتحديد مكان الصب بدقة
          </Text>
        </View>
      </View>
    </Modal>
  );
}
