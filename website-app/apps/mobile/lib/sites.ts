/**
 * ============================================================
 *  Plant & branch proximity — lib/sites.ts
 * ============================================================
 *  Answers the two questions a driver standing at a gate actually has:
 *  "which yard am I at" and "how far is the plant".
 *
 * ── Why /api/sites/near and not /api/fleet/positions ──────────────────────────
 *  /fleet/positions answers "where is the whole fleet" and requires
 *  FLEET_POSITION_READ, which a driver deliberately does not hold. This card only
 *  needs "where am I relative to our yards", so it sends the phone's coordinates
 *  and gets back the company's own sites on a plain SITE_READ grant. The driver
 *  sees his own distance from the plant and nobody else's trucks.
 *
 * ── The distance is computed on the server, on purpose ────────────────────────
 *  Re-implementing haversine here would mean a second implementation of the same
 *  maths, and the two would drift. More importantly the server already knows the
 *  sites, so sending the coordinates *to* the sites is both smaller and impossible
 *  to get out of sync with a promote or a radius edit.
 *
 * ── Failure is silent, not fatal ──────────────────────────────────────────────
 *  A driver in a concrete yard is often in poor reception, and this card is
 *  informational. A rejected request returns null and the caller renders nothing;
 *  it never blocks the trip screen or throws into the render tree.
 */

export type NearbySite = {
  siteId: string;
  siteCode: string;
  siteName: string;
  siteType: "PLANT" | "BRANCH" | "STATION" | "YARD";
  latitude: number;
  longitude: number;
  city: string | null;
  addressLine: string | null;
  isPrimary: boolean;
  distanceMetres: number;
  bearingDegrees: number;
  isInsideGeofence: boolean;
  geofenceRadiusMetres: number;
};

export type SitesNearPoint = {
  latitude: number;
  longitude: number;
  /** Nearest first. */
  sites: NearbySite[];
  hasPrimarySite: boolean;
};

/**
 * Metres → something readable at arm's length in a truck cab.
 *
 * Under a kilometre the metre figure is the useful one — "180 m" tells a driver
 * they are at the gate, "0.2 km" does not. Past that, km with one decimal is
 * easier to compare at a glance than 845101.
 */
export function formatDistance(metres: number | null | undefined): string {
  if (metres == null || !Number.isFinite(metres)) return "—";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 100_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

/** The 16-point compass. "Riyadh" is not a direction; "SE" is. */
export function compassPoint(bearingDegrees: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((bearingDegrees % 360) + 360) % 360 / 45) % 8;
  return points[idx];
}

/**
 * True when the fix is not worth measuring anything from.
 *
 * Null island (0, 0) is the important case: a GPS chip genuinely reports it
 * indoors, in a shielded yard, and before it has locked a satellite. Sending it
 * would earn a confident set of distances from the Gulf of Guinea, which is worse
 * than showing nothing — the driver would be told they are 5 720 km from the plant
 * and have no reason to doubt it.
 */
export function isUsableFix(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): latitude is number {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}