/**
 * ============================================================
 *  GET    /api/rnd/plans/[planId]  — Plan + milestones + tasks
 *  PUT    /api/rnd/plans/[planId]  — Edit a draft plan / advance progress
 *  DELETE /api/rnd/plans/[planId]  — Delete a DRAFT plan only
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (PUT/DELETE)
 *  NOTE: finance-gate transitions (PENDING_FINANCE ↔ APPROVED/REJECTED)
 *  are handled ONLY by the submit-finance / finance-decision endpoints.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getPlan, updatePlan, deletePlan } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_PLAN_ID", "Plan ID must be a valid UUID", 400);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const { planId } = await params;
  if (!planId || !UUID_RE.test(planId)) return badId();

  try {
    const plan = await getPlan(auth.user.tenantId, planId);
    if (!plan) return errorResponse("PLAN_NOT_FOUND", "Development plan not found", 404);
    return successResponse(plan, "Development plan");
  } catch (err) {
    console.error("[GET /api/rnd/plans/:id]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to load plan", 500);
  }
}

const UpdatePlanSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  category: z.enum(["PRODUCTION", "QUALITY", "COST", "STAFF", "TECHNOLOGY", "PROCESS"]).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  budgetSar: z.number().int().nonnegative().optional(),
  expectedRoiPct: z.number().min(0).max(1000).optional(),
  // Forward-progress only; the finance gate endpoints own PENDING_FINANCE/APPROVED/REJECTED
  status: z.enum(["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED"]).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { planId } = await params;
  if (!planId || !UUID_RE.test(planId)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid plan payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updatePlan(auth.user.tenantId, planId, parsed.data);
    if (!updated) return errorResponse("PLAN_NOT_FOUND", "Development plan not found", 404);
    return successResponse(updated, "Development plan updated");
  } catch (err) {
    console.error("[PUT /api/rnd/plans/:id]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to update plan", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { planId } = await params;
  if (!planId || !UUID_RE.test(planId)) return badId();

  try {
    const ok = await deletePlan(auth.user.tenantId, planId);
    if (!ok)
      return errorResponse(
        "PLAN_DELETE_BLOCKED",
        "Only DRAFT plans can be deleted",
        409
      );
    return successResponse({ id: planId }, "Development plan deleted");
  } catch (err) {
    console.error("[DELETE /api/rnd/plans/:id]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to delete plan", 500);
  }
}
