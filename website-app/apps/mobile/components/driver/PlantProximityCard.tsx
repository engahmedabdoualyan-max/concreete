import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { geolocation } from "@/lib/geolocation";
import {
  compassPoint,
  formatDistance,
  isUsableFix,
  type SitesNearPoint,
} from "@/lib/sites";

/**
 * ============================================================
 *  PlantProximityCard — 📍 which yard am I at, how far is the plant
 * ============================================================
 *  The driver's answer to "how far am I from the plant", from the coordinates the
 *  phone already has. No map, no manual entry, no extra permission: by the time
 *  this renders, background tracking is already running for the trip.
 *
 * ── Why the nearest site is picked by flag, not by array order ────────────────
 *  The API returns sites sorted nearest-first, so `sites[0]` is the closest. But
 *  "closest yard" and "the plant" are different questions, and a company whose
 *  nearest site is a Jeddah branch must not have the plant silently become that
 *  branch. The primary is found by `isPrimary`; only when the company has no
 *  primary at all does this fall back to the nearest, and says so.
 *
 * ── It hides rather than apologises ───────────────────────────────────────────
 *  No fix, no sites, or a failed request all render nothing. This is an
 *  informational card on a screen whose real job is the trip; a persistent
 *  "couldn't load" banner on a phone with no signal is noise that trains people
 *  to ignore the card. The absence is honest — nothing is claimed.
 *
 * ── Accuracy is shown when it is poor ─────────────────────────────────────────
 *  A 200 m-accuracy fix claiming "you are 50 m from the gate" is worse than
 *  useless. When accuracy exceeds the distance being reported, the card says the
 *  reading is coarse instead of implying precision it does not have.
 */

interface Props {
  /** Rendered only when this is true, so it never appears on a driver with no trip. */
  visible: boolean;
}

export default function PlantProximityCard({ visible }: Props) {
  // The accuracy travels with the answer rather than being fetched separately: they
// come from the same fix, and re-reading the position would be a second, later
// sample — so the card could end up comparing a distance from one instant against
// an accuracy from another.
type Proximity = { sites: SitesNearPoint | null; accuracy: number | null };

const { data } = useQuery<Proximity | null>({
    queryKey: ["sites-near-me"],
    queryFn: async () => {
      const coords = await geolocation.getCurrentLocation();
      if (!isUsableFix(coords?.latitude, coords?.longitude)) return null;
      const sites = await api.getSitesNear(coords.latitude, coords.longitude);
      return {
        sites,
        accuracy:
          typeof coords?.accuracy === "number" ? coords.accuracy : null,
      };
    },
    enabled: visible,
    // The driver is moving and the answer changes as they do. 2 minutes is a
    // deliberate middle: 10 s burns battery in a truck cab for a number that
    // moves tens of metres, and 10 minutes would still claim the Dammam branch
    // after the driver has crossed Riyadh.
    refetchInterval: 120_000,
    staleTime: 60_000,
    // Never surface a request failure — see the header.
    retry: false,
  });

  if (!visible || !data?.sites || data.sites.sites.length === 0) return null;

  const all = data.sites.sites;
  const primary = all.find((s) => s.isPrimary);
  const nearest = all[0];
  const plant = primary ?? nearest;
  const accuracy = data.accuracy;

  // A coarse fix must not masquerade as a precise one.
  const coarse = accuracy != null && accuracy > plant.distanceMetres;

  return (
    <Card variant="default" className="mt-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-slate-600 text-sm">
          {primary ? "📍 الموقع الأقرب" : "📍 أقرب موقع"}
        </Text>
        {plant.isInsideGeofence && (
          <View className="bg-emerald-100 rounded px-2 py-0.5">
            <Text className="text-emerald-800 font-bold text-xs">داخل الموقع</Text>
          </View>
        )}
      </View>

      <Text className="text-lg font-bold text-slate-800">
        {plant.siteName}
        {primary ? "" : " (أقرب موقع — مفيش مصنع أساسي مسجل)"}
      </Text>

      <View className="flex-row items-center gap-4 mt-1.5">
        <Text className="text-slate-600 text-sm">
          {primary ? "من المصنع: " : "المسافة: "}
          <Text className="font-bold text-slate-800">
            {formatDistance(plant.distanceMetres)}
          </Text>
        </Text>
        <Text className="text-slate-500 text-xs">
          {compassPoint(plant.bearingDegrees)}
        </Text>
      </View>

      {/* The primary and the nearest are not always the same yard; saying only
          one distance would hide which question just got answered. */}
      {nearest.siteId !== plant.siteId && (
        <Text className="text-slate-500 text-xs mt-1">
          أقرب موقع فعلي: {nearest.siteName} · {formatDistance(nearest.distanceMetres)}
        </Text>
      )}

      {coarse && (
        <Text className="text-amber-700 text-xs mt-1.5">
          ⚠️ دقة تحديد الموقع ضعيفة ({formatDistance(accuracy)}) — المسافة تقريبية
        </Text>
      )}
    </Card>
  );
}