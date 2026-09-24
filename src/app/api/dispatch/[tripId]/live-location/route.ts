/**
 * POST /api/dispatch/[tripId]/live-location
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives GPS updates from the driver's mobile app (via Socket.io or REST).
 *
 * Returns:
 * - Moving average speed
 * - Geofence detection result
 * - Auto-triggered ARR_SITE (if geofence entered)
 * - Broadcast events to emit via Socket.io
 *
 * Note: In production, this is called via the Socket.io event handler.
 * This REST endpoint exists for:
 *   - Direct integration testing
 *   - Fallback when Socket.io is unavailable
 *   - Server-side cron jobs that need to simulate location updates
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  deliverySites,
  fleetVehicles,
  orders,
  trips,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { processLocationUpdate } from "@/lib/services/realtime-gps.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const LocationUpdateSchema = z.object({
  tripId: z.string().uuid("Invalid trip ID"),
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  driverId: z.string().uuid("Invalid driver ID"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMetres: z.number().min(0).max(10000).optional(),
  deviceSpeedKmh: z.number().min(0).max(500).optional(),
  headingDegrees: z.number().min(0).max(360).optional(),
  isMoving: z.boolean().default(true),
  batteryPct: z.number().min(0).max(100).optional(),
  capturedAt: z.string().datetime("Invalid timestamp").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_UPDATE_CHECKPOINT);
  if ("status" in auth) return auth;

  const { tripId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = LocationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid location data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Validate trip matches
  if (parsed.data.tripId !== tripId) {
    return errorResponse(
      "TRIP_MISMATCH",
      "tripId in body does not match URL param",
      400
    );
  }

  const tripRows = await db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(
      orders,
      and(eq(trips.orderId, orders.id), eq(orders.tenantId, auth.user.tenantId))
    )
    .innerJoin(
      deliverySites,
      and(
        eq(orders.deliverySiteId, deliverySites.id),
        eq(deliverySites.tenantId, auth.user.tenantId)
      )
    )
    .where(
      and(
        eq(trips.id, tripId),
        eq(trips.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip not found", 404);
  }

  const resourceRows = await db
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .innerJoin(
      users,
      and(
        eq(users.id, parsed.data.driverId),
        eq(users.tenantId, auth.user.tenantId)
      )
    )
    .where(
      and(
        eq(fleetVehicles.id, parsed.data.vehicleId),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (resourceRows.length === 0) {
    return errorResponse(
      "NOT_FOUND",
      "Vehicle or driver not found",
      404
    );
  }

  try {
    const result = await processLocationUpdate(
      {
        ...parsed.data,
        capturedAt: parsed.data.capturedAt ?? new Date().toISOString(),
      },
      auth.user.sub
    );

    const response: Record<string, unknown> = {
      vehicleState: result.vehicleState,
      speed: {
        movingAverageKmh: result.movingAverageSpeedKmh,
        isStationary: result.isStationary,
      },
      geofence: result.geofenceResult,
      autoTriggeredArrSite: result.autoTriggeredArrSite,
      alerts: {
        lowBattery: result.lowBatteryAlert ?? false,
        poorAccuracy: result.poorAccuracyAlert ?? false,
      },
      broadcast: result.broadcastEvent,
    };

    if (result.geofenceBroadcastEvent) {
      response.geofenceBroadcast = result.geofenceBroadcastEvent;
    }

    return successResponse(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("LOCATION_PROCESSING_ERROR", message, 422);
  }
}
