/**
 * ============================================================
 *  POST /api/dispatch/optimize — AI dispatch suggestion (preview)
 * ============================================================
 *  Returns ranked load assignments WITHOUT creating trips.
 *  The dispatcher reviews in the preview, then confirms via
 *  POST /api/dispatch/optimize/apply.
 *
 *  Body: { date: "YYYY-MM-DD" }
 *  RBAC: ORDER_SCHEDULE or TRIP_CREATE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { suggestDispatchPlan } from "@/lib/services/dispatch-optimization.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const OptimizeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.ORDER_SCHEDULE,
    PERMISSIONS.TRIP_CREATE,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = OptimizeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid optimize payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const plan = await suggestDispatchPlan(auth.user.tenantId, parsed.data.date);
    return successResponse(plan, `${plan.stats.loadsSuggested} load(s) suggested`);
  } catch (err) {
    console.error("[POST /api/dispatch/optimize]", err);
    return errorResponse("OPTIMIZE_FAILED", "Failed to build dispatch suggestion", 500);
  }
}
