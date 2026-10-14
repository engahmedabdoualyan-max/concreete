import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, telematicsReadings } from "@/db/schema";
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/fleet/vehicles/[vehicleId]/trail — today's path for the map
 *
 * The broadcast draws this as a polyline behind the focused truck
 * (Uber-style route trail). Same FLEET_POSITION_READ gate as live positions:
 * plate/code only, no driver identity. Capped — a truck reporting every
 * minute yields ~1.4k rows a day; 500 points still draws a faithful path.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_POINTS = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_POSITION_READ);
  if ("status" in auth) return auth;
  const { vehicleId } = await params;
  if (!vehicleId || !UUID_RE.test(vehicleId))
    return errorResponse("INVALID_ID", "Invalid vehicle id", 400);

  const veh = await db
    .select({ id: fleetVehicles.id, code: fleetVehicles.vehicleCode })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.id, vehicleId), eq(fleetVehicles.tenantId, auth.user.tenantId)))
    .limit(1);
  if (!veh[0]) return errorResponse("VEHICLE_NOT_FOUND", "Vehicle not found", 404);

  const hours = Number(new URL(req.url).searchParams.get("hours") ?? "24");
  const since = new Date(Date.now() - (Number.isFinite(hours) && hours > 0 && hours <= 72 ? hours : 24) * 3600_000);

  const rows = await db
    .select({
      lat: telematicsReadings.latitude,
      lng: telematicsReadings.longitude,
      speed: telematicsReadings.speedKmh,
      at: sql<string>`to_char(${telematicsReadings.capturedAt}, 'YYYY-MM-DD HH24:MI:SS')`,
    })
    .from(telematicsReadings)
    .where(
      and(
        eq(telematicsReadings.vehicleId, vehicleId),
        eq(telematicsReadings.tenantId, auth.user.tenantId),
        isNotNull(telematicsReadings.latitude),
        isNotNull(telematicsReadings.longitude),
        gte(telematicsReadings.capturedAt, since)
      )
    )
    .orderBy(asc(telematicsReadings.capturedAt))
    .limit(MAX_POINTS);

  const points = rows.map((r) => ({
    latitude: Number(r.lat),
    longitude: Number(r.lng),
    speedKmh: r.speed === null ? null : Number(r.speed),
    capturedAt: new Date(`${String(r.at).replace(" ", "T")}Z`).toISOString(),
  }));

  return successResponse(
    { vehicleId, vehicleCode: veh[0].code, points, truncated: rows.length >= MAX_POINTS },
    `${points.length} trail point(s)`
  );
}
