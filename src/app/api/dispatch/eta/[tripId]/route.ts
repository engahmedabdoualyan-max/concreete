/**
 * ============================================================
 *  GET /api/dispatch/eta/[tripId] — Predictive customer ETA
 * ============================================================
 *  Learned baseline: average completed transit to the SAME site
 *  (min 3 samples) else distance/speed estimate, adjusted live
 *  by elapsed time since DEP_PLANT. 0 once arrived.
 *
 *  RBAC: TRIP_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { predictEtaMinutes } from "@/lib/services/dispatch-optimization.service";

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

  try {
    const eta = await predictEtaMinutes(auth.user.tenantId, tripId);
    if (!eta) return errorResponse("TRIP_NOT_FOUND", "Trip not found", 404);
    return successResponse(eta, "ETA prediction");
  } catch (err) {
    console.error("[GET /api/dispatch/eta/:tripId]", err);
    return errorResponse("ETA_FAILED", "Failed to predict ETA", 500);
  }
}
