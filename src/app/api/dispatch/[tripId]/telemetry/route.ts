/**
 * ============================================================
 *  GET /api/dispatch/[tripId]/telemetry — Drum telemetry + QA
 * ============================================================
 *  Per-trip RPM/temp/water series with aggregates:
 *  avg RPM, max temp, total water added, rotation-stop count,
 *  plus the workability countdown (FRESH/AGING/EXPIRED).
 *
 *  RBAC: TRIP_READ (drivers see own trips via the same gate as
 *  checkpoints — enforced here explicitly)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getTripTelemetry } from "@/lib/services/telematics.service";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;

  const { tripId } = await params;
  if (!tripId || !/^[0-9a-f-]{36}$/i.test(tripId)) {
    return errorResponse("INVALID_TRIP_ID", "Trip ID must be a valid UUID", 400);
  }

  if (auth.user.role === "DRIVER") {
    const own = await db
      .select({ driverId: trips.driverId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!own[0] || own[0].driverId !== auth.user.sub) {
      return errorResponse("FORBIDDEN", "You can only view your own trips", 403);
    }
  }

  try {
    const telemetry = await getTripTelemetry(auth.user.tenantId, tripId);
    if (!telemetry) return errorResponse("TRIP_NOT_FOUND", "Trip not found", 404);
    return successResponse(telemetry, "Trip telemetry");
  } catch (err) {
    console.error("[GET /api/dispatch/:tripId/telemetry]", err);
    return errorResponse("TELEMETRY_FAILED", "Failed to load telemetry", 500);
  }
}
