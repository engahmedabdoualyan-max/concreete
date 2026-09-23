/**
 * ============================================================
 *  POST /api/dispatch/optimize/apply — Confirm suggestion → trips
 * ============================================================
 *  Creates real trips (with inventory deduction + env compensation)
 *  from reviewed assignments. Per-item results: partial success
 *  is reported, never silently swallowed.
 *
 *  Body: { assignments: [{ orderId, vehicleId, driverId, loadedVolumeM3 }] }
 *  RBAC: TRIP_CREATE (same gate as manual trip creation)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { applyDispatchPlan } from "@/lib/services/dispatch-optimization.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ApplySchema = z.object({
  assignments: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        vehicleId: z.string().uuid(),
        driverId: z.string().uuid(),
        loadedVolumeM3: z.number().positive().max(20),
      })
    )
    .min(1)
    .max(200),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid apply payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const results = await applyDispatchPlan(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data.assignments
    );
    const ok = results.filter((r) => r.ok).length;
    return successResponse(
      { results, created: ok, total: results.length },
      `${ok}/${results.length} trip(s) created`,
      201
    );
  } catch (err) {
    console.error("[POST /api/dispatch/optimize/apply]", err);
    return errorResponse("OPTIMIZE_APPLY_FAILED", "Failed to apply dispatch plan", 500);
  }
}
