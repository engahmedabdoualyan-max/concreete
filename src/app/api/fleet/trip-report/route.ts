import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, telematicsReadings } from "@/db/schema";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getPrimarySite, haversineMetres } from "@/lib/services/sites.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/fleet/trip-report — geofence trips per vehicle for a calendar day
 *
 * A trip starts the moment a truck LEAVES the plant geofence and ends when it
 * comes back inside (Asia/Riyadh day). This matches how the plant actually
 * works: leaving the gate = loaded and dispatched, returning = trip done.
 *
 * Blips shorter than 3 minutes are ignored — a fence-edge GPS wobble is not a
 * delivery. A truck still outside at day end (or now, for today) counts as an
 * open trip. Same FLEET_POSITION_READ gate as live positions.
 */
const MIN_TRIP_MINUTES = 3;
const MAX_READINGS = 20000;

export type TripLeg = {
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  maxDistanceMetres: number;
  open: boolean;
};

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_POSITION_READ);
  if ("status" in auth) return auth;

  const primary = await getPrimarySite(auth.user.tenantId);
  if (!primary)
    return errorResponse("NO_PRIMARY_SITE", "سجل موقع المصنع أولاً", 400);
  const plat = Number(primary.latitude);
  const plng = Number(primary.longitude);
  const radius = primary.geofenceRadiusMetres;

  const q = new URL(req.url).searchParams.get("date");
  const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayRiyadh();
  // Riyadh is UTC+3 year-round (no DST): day bounds are exact.
  const from = new Date(`${day}T00:00:00+03:00`);
  const to = new Date(`${day}T00:00:00+03:00`);
  to.setUTCDate(to.getUTCDate() + 1);

  const rows = await db
    .select({
      vehicleId: telematicsReadings.vehicleId,
      code: fleetVehicles.vehicleCode,
      plate: fleetVehicles.plateNumber,
      lat: telematicsReadings.latitude,
      lng: telematicsReadings.longitude,
      at: telematicsReadings.capturedAt,
    })
    .from(telematicsReadings)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsReadings.vehicleId))
    .where(
      and(
        eq(telematicsReadings.tenantId, auth.user.tenantId),
        isNotNull(telematicsReadings.latitude),
        isNotNull(telematicsReadings.longitude),
        gte(telematicsReadings.capturedAt, from),
        lte(telematicsReadings.capturedAt, to)
      )
    )
    .orderBy(asc(telematicsReadings.vehicleId), asc(telematicsReadings.capturedAt))
    .limit(MAX_READINGS);

  const iso = (v: unknown) => new Date(`${String(v).replace(" ", "T")}Z`).toISOString();
  const byVehicle = new Map<string, { code: string; plate: string; trips: TripLeg[] }>();
  let cur: string | null = null;
  let open: { start: string; maxD: number } | null = null;

  const closeTrip = (
    bucket: { trips: TripLeg[] },
    endIso: string | null
  ) => {
    if (!open) return;
    const mins = endIso
      ? Math.round((new Date(endIso).getTime() - new Date(open.start).getTime()) / 60000)
      : null;
    if (endIso && (mins ?? 0) < MIN_TRIP_MINUTES) {
      open = null;
      return; // fence-edge wobble, not a delivery
    }
    bucket.trips.push({
      startedAt: open.start,
      endedAt: endIso,
      durationMinutes: mins,
      maxDistanceMetres: Math.round(open.maxD),
      open: endIso === null,
    });
    open = null;
  };

  for (const r of rows) {
    if (r.vehicleId !== cur) {
      if (cur) {
        const b = byVehicle.get(cur);
        if (b && open) closeTrip(b, null);
      }
      cur = r.vehicleId;
      open = null;
      if (!byVehicle.has(cur))
        byVehicle.set(cur, { code: r.code, plate: r.plate ?? "", trips: [] });
    }
    const bucket = byVehicle.get(cur)!;
    const d = haversineMetres(Number(r.lat), Number(r.lng), plat, plng);
    const stamp = iso(r.at);
    if (d > radius) {
      if (!open) open = { start: stamp, maxD: d };
      else open.maxD = Math.max(open.maxD, d);
    } else if (open) {
      closeTrip(bucket, stamp);
    }
  }
  if (cur) {
    const b = byVehicle.get(cur);
    if (b && open) closeTrip(b, null);
  }

  const vehicles = [...byVehicle.entries()].map(([vehicleId, b]) => ({
    vehicleId,
    vehicleCode: b.code,
    plateNumber: b.plate,
    tripsCount: b.trips.length,
    openTrips: b.trips.filter((t) => t.open).length,
    minutesOut: b.trips.reduce((s, t) => s + (t.durationMinutes ?? 0), 0),
    trips: b.trips,
  }));
  const totalTrips = vehicles.reduce((s, v) => s + v.tripsCount, 0);

  return successResponse(
    { date: day, totalTrips, vehicles },
    `${totalTrips} trip(s) on ${day}`
  );
}

function todayRiyadh(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date());
}
