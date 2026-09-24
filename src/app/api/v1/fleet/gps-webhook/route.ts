/**
 * ============================================================
 *  POST /api/v1/fleet/gps-webhook
 *  External Fleet GPS Vendor Ingestion Gateway
 * ============================================================
 *
 *  Open, authenticated ingestion endpoint for third-party GPS tracking
 *  vendors to stream live vehicle positions directly into the ERP.
 *
 *  AUTH: a static `X-Integration-Key` header (compared in constant time
 *  against FLEET_GPS_WEBHOOK_KEY). This is intentionally a simple shared
 *  secret so low-tech GPS hardware/middleware can POST without OAuth.
 *
 *  ACCEPTS either a single fix or a batch:
 *    { truck_id, latitude, longitude, speed, heading?, captured_at? }
 *    { fixes: [ { truck_id, latitude, longitude, speed, ... }, ... ] }
 *
 *  `truck_id` is matched against fleet_vehicles.vehicle_code OR the row UUID.
 *  Each fix updates the vehicle's live telemetry columns and appends a
 *  driver_locations trail row when the vehicle is on an active trip.
 * ============================================================
 */

import { NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { fleetVehicles, driverLocations, trips } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

function webhookKey(): string {
  const configured = process.env.FLEET_GPS_WEBHOOK_KEY;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("FLEET_GPS_WEBHOOK_KEY must be configured in production");
  }
  return configured ?? "fimto-gps-vendor-dev-key-change-me";
}

/** Constant-time comparison to prevent timing attacks on the shared key. */
function keyMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(webhookKey());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const FixSchema = z.object({
  truck_id: z.string().min(1, "truck_id is required"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(400).optional().default(0),
  heading: z.number().min(0).max(360).optional(),
  captured_at: z.string().datetime().optional(),
});

const PayloadSchema = z.union([
  FixSchema,
  z.object({ fixes: z.array(FixSchema).min(1).max(500) }),
]);

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  // ── Rate limit: 100 requests / minute / IP ────────────────────────────────
  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`gps-webhook:${ip}`);
  if (!rl.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      `Too many requests. Retry in ${rl.retryAfterSeconds}s.`,
      429
    );
  }

  // ── AUTH: hardcoded integration key ───────────────────────────────────────
  if (!keyMatches(req.headers.get("x-integration-key"))) {
    return errorResponse("INVALID_INTEGRATION_KEY", "Missing or invalid X-Integration-Key", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid GPS payload", 400, {
      fields: parsed.error.flatten(),
    });
  }

  const fixes = "fixes" in parsed.data ? parsed.data.fixes : [parsed.data];

  const results: {
    truck_id: string;
    matched: boolean;
    vehicleCode?: string;
    trailAppended?: boolean;
  }[] = [];

  for (const fix of fixes) {
    // Resolve the vehicle by UUID or by human-readable vehicle_code
    const byId = UUID_RE.test(fix.truck_id);
    const vehicleRows = await db
      .select({
        id: fleetVehicles.id,
        vehicleCode: fleetVehicles.vehicleCode,
        tenantId: sql<string>`tenant_id`,
      })
      .from(fleetVehicles)
      .where(
        byId
          ? eq(fleetVehicles.id, fix.truck_id)
          : eq(fleetVehicles.vehicleCode, fix.truck_id)
      )
      .limit(1);

    if (vehicleRows.length === 0) {
      results.push({ truck_id: fix.truck_id, matched: false });
      continue;
    }

    const vehicle = vehicleRows[0];
    const capturedAt = fix.captured_at ? new Date(fix.captured_at) : new Date();

    // 1. Update live telemetry on the fleet row
    await db
      .update(fleetVehicles)
      .set({
        lastGpsLat: fix.latitude.toFixed(7),
        lastGpsLng: fix.longitude.toFixed(7),
        lastGpsSpeedKmh: fix.speed.toFixed(2),
        lastGpsHeading: fix.heading != null ? fix.heading.toFixed(2) : null,
        lastGpsSource: "GPS_VENDOR",
        lastGpsAt: capturedAt,
        updatedAt: new Date(),
      })
      .where(eq(fleetVehicles.id, vehicle.id));

    // 2. If the vehicle is on an active (non-completed) trip, append a trail row
    let trailAppended = false;
    const activeTrip = await db
      .select({ id: trips.id, driverId: trips.driverId })
      .from(trips)
      .where(and(eq(trips.vehicleId, vehicle.id), eq(trips.isCompleted, false)))
      .orderBy(sql`created_at DESC`)
      .limit(1);

    if (activeTrip.length > 0) {
      // tenant_id mirrors the vehicle's tenant (defence-in-depth on the trail row)
      await db.insert(driverLocations).values({
        tripId: activeTrip[0].id,
        tenantId: vehicle.tenantId,
        vehicleId: vehicle.id,
        driverId: activeTrip[0].driverId,
        latitude: fix.latitude.toFixed(7),
        longitude: fix.longitude.toFixed(7),
        deviceSpeedKmh: fix.speed.toFixed(2),
        headingDegrees: fix.heading != null ? fix.heading.toFixed(2) : null,
        isMoving: fix.speed > 0.5,
        capturedAt,
      } as typeof driverLocations.$inferInsert);
      trailAppended = true;
    }

    results.push({
      truck_id: fix.truck_id,
      matched: true,
      vehicleCode: vehicle.vehicleCode,
      trailAppended,
    });
  }

  const matched = results.filter((r) => r.matched).length;
  return successResponse(
    { received: fixes.length, matched, unmatched: fixes.length - matched, results },
    `Ingested ${matched}/${fixes.length} GPS fix(es) from external vendor.`
  );
}
