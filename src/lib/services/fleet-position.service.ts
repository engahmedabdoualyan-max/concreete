/**
 * ============================================================
 *  fleet-position.service — vehicles, their GPS fix, and the sites
 * ============================================================
 *
 *  This is the join the plant asked for: "أدخل لوكيشن المصنع عشان الرصد بعد
 *  السيارات عنه" — record where the plant is, and the vehicles are then measured
 *  against it.
 *
 * ── What it answers, per vehicle ───────────────────────────────────────────────
 *   • Where is it right now (last fix, and HOW OLD that fix is)
 *   • Which site is it nearest, how far, in which direction
 *   • Is it inside that site's geofence
 *   • How far from the PLANT specifically (the origin, not just the nearest yard)
 *
 * ── Staleness is a first-class field, not a footnote ───────────────────────────
 *  A tracker that stopped reporting an hour ago still has a last-known position,
 *  and a dashboard that renders that as a live dot is lying: it says a truck is
 *  parked at the plant when nobody knows. So every row carries `isStale` and the
 *  age in minutes, and the UI is expected to grey the marker rather than hide the
 *  number. Distance is still computed — being wrong about *when* is better than
 *  refusing to answer *where*.
 *
 * ── The age is computed in SQL, and that is not an optimisation ────────────────
 *  `telematics_readings.captured_at` is `timestamp WITHOUT time zone` and the
 *  values in it are UTC, but the API process here runs Asia/Riyadh. node-postgres
 *  hands that naive value back as a JS Date it has interpreted as LOCAL time, so
 *  a reading taken now comes back three hours in the future. `now() - captured_at`
 *  in JS then yields a negative age, which the obvious `Math.max(0, age)` guard
 *  turns into "0 minutes old" — so a tracker dead since morning renders as live
 *  and is never greyed. That is precisely the failure this field exists to catch,
 *  produced by the field that catches it.
 *
 *  Letting Postgres do `now() - captured_at` makes the arithmetic happen where the
 *  timezone semantics are unambiguous. The ISO string handed to the client is
 *  built by tagging the naive UTC value explicitly rather than by handing a Date
 *  to `toISOString()`.
 *
 * ── Why raw SQL for the fix ────────────────────────────────────────────────────
 *  "Latest reading per vehicle" is `DISTINCT ON`, which Drizzle cannot express.
 *  The alternative is fetching every reading and reducing in JS, which for a
 *  fleet of 28 at one sample a minute is ~40k rows a minute of history for one
 *  number per truck. The existing `idx_tm_vehicle_time (vehicle_id, captured_at)`
 *  serves this exactly.
 *
 *  Readings with NULL coordinates are excluded: they exist (drum RPM arrives
 *  without a fix), and including them would let a telemetry-only row win the
 *  DISTINCT ON and blank out the truck's position.
 *
 * ── Tenant scoping ─────────────────────────────────────────────────────────────
 *  Filtered in the same statement, not in JS, so a vehicle from another company
 *  can never reach the distance calculation even if the caller asked for it.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fleetVehicles } from "@/db/schema";
import {
  bearingDegrees,
  getPrimarySite,
  haversineMetres,
  listSites,
  type NearestSite,
} from "@/lib/services/sites.service";

/**
 * A fix older than this is shown as stale.
 *
 * 15 minutes is chosen against how these trucks actually behave: a mixer's
 * position barely changes while it loads, so a slow update is not the same as a
 * broken tracker. A tighter window would grey out most of a working fleet and
 * train people to ignore the grey.
 */
export const STALE_AFTER_MINUTES = 15;

export type FleetPosition = {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: string;
  currentStatus: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  source: string;
  capturedAt: string;
  /** Whole minutes since the fix. 0 = this minute. */
  ageMinutes: number;
  isStale: boolean;
  /** Nearest site, or null when the company has no sites registered yet. */
  nearestSite: NearestSite | null;
  /** Distance to the plant itself, which is not necessarily the nearest site. */
  distanceToPrimaryMetres: number | null;
  bearingToPrimaryDegrees: number | null;
  isInsidePrimaryGeofence: boolean;
};

export type FleetPositionsResult = {
  positions: FleetPosition[];
  /** Sites the distances were measured against. */
  siteCount: number;
  /** False when the company has no primary site yet — the UI must say so. */
  hasPrimarySite: boolean;
  /**
   * Vehicles with no fix at all, so the UI can distinguish "no data yet" from
   * "this truck is not reporting". Both look identical on a map otherwise.
   */
  vehiclesWithoutFix: number;
};

/**
 * Latest GPS fix for every active vehicle, plus its distance to the sites.
 */
export async function getFleetPositions(
  tenantId: string,
  options: { vehicleIds?: string[] } = {}
): Promise<FleetPositionsResult> {
  const sites = await listSites(tenantId, false);
  const primary = await getPrimarySite(tenantId);

  // The sites are needed once per request, not once per vehicle, so they are
  // loaded above and the per-vehicle maths is done in memory. A company has a
  // handful of sites; the alternative is a PostGIS round trip per truck.
  const latest = await db.execute(sql`
    SELECT DISTINCT ON (v.id)
      v.id                AS vehicle_id,
      v.vehicle_code,
      v.plate_number,
      v.vehicle_type,
      v.current_status,
      r.latitude,
      r.longitude,
      r.speed_kmh,
      r.source,
      r.captured_at,
      EXTRACT(EPOCH FROM (now() - r.captured_at)) / 60.0 AS age_minutes
    FROM fleet_vehicles v
    JOIN LATERAL (
      SELECT t.latitude, t.longitude, t.speed_kmh, t.source, t.captured_at
      FROM telematics_readings t
      WHERE t.vehicle_id = v.id
        AND t.tenant_id = ${tenantId}
        AND t.latitude IS NOT NULL
        AND t.longitude IS NOT NULL
      ORDER BY t.captured_at DESC
      LIMIT 1
    ) r ON true
    WHERE v.tenant_id = ${tenantId}
      AND v.is_active = true
      ${options.vehicleIds?.length
        ? sql`AND v.id IN (${sql.join(
            options.vehicleIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )})`
        : sql``}
    ORDER BY v.id
  `);

  const rows = (latest.rows ?? []) as {
    vehicle_id: string;
    vehicle_code: string;
    plate_number: string | null;
    vehicle_type: string;
    current_status: string;
    latitude: string | number;
    longitude: string | number;
    speed_kmh: string | number | null;
    source: string;
    captured_at: string;
    age_minutes: string | number;
  }[];

  const primaryLat = primary ? Number(primary.latitude) : null;
  const primaryLng = primary ? Number(primary.longitude) : null;
  const primaryRadius = primary?.geofenceRadiusMetres ?? null;

  const positions: FleetPosition[] = rows.map((r) => {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    // Age straight from the database — see the header on why it is not computed
    // in JS. `max(0)` only absorbs genuine clock skew now, not a whole timezone.
    const ageMinutes = Math.max(0, Math.round(Number(r.age_minutes)));
    // `captured_at` is naive UTC; the 'Z' is asserted rather than inferred so the
    // client always gets a real instant instead of a local-time reinterpretation.
    const capturedAt = new Date(`${r.captured_at.replace(" ", "T")}Z`);

    let nearest: NearestSite | null = null;
    let best: number | null = null;
    let bestSite = primary;
    for (const s of sites) {
      const d = haversineMetres(lat, lng, Number(s.latitude), Number(s.longitude));
      if (best === null || d < best) {
        best = d;
        bestSite = s;
      }
    }
    if (bestSite && best !== null) {
      nearest = {
        siteId: bestSite.id,
        siteCode: bestSite.siteCode,
        siteName: bestSite.siteName,
        siteType: bestSite.siteType,
        distanceMetres: Math.round(best),
        bearingDegrees: Math.round(
          bearingDegrees(lat, lng, Number(bestSite.latitude), Number(bestSite.longitude))
        ),
        isInsideGeofence: best <= bestSite.geofenceRadiusMetres,
        geofenceRadiusMetres: bestSite.geofenceRadiusMetres,
      };
    }

    const distanceToPrimary =
      primaryLat !== null && primaryLng !== null
        ? Math.round(haversineMetres(lat, lng, primaryLat, primaryLng))
        : null;

    return {
      vehicleId: r.vehicle_id,
      vehicleCode: r.vehicle_code,
      plateNumber: r.plate_number ?? "",
      vehicleType: r.vehicle_type,
      currentStatus: r.current_status,
      latitude: lat,
      longitude: lng,
      speedKmh: r.speed_kmh === null ? null : Number(r.speed_kmh),
      source: r.source,
      capturedAt: capturedAt.toISOString(),
      ageMinutes,
      isStale: ageMinutes > STALE_AFTER_MINUTES,
      nearestSite: nearest,
      distanceToPrimaryMetres: distanceToPrimary,
      bearingToPrimaryDegrees:
        primaryLat !== null && primaryLng !== null
          ? Math.round(bearingDegrees(lat, lng, primaryLat, primaryLng))
          : null,
      isInsidePrimaryGeofence:
        distanceToPrimary !== null && primaryRadius !== null
          ? distanceToPrimary <= primaryRadius
          : false,
    };
  });

  const [total] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, tenantId), eq(fleetVehicles.isActive, true)));

  return {
    positions,
    siteCount: sites.length,
    hasPrimarySite: !!primary,
    vehiclesWithoutFix: Math.max(0, (total?.n ?? 0) - positions.length),
  };
}