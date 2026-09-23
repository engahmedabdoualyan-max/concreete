/**
 * ============================================================
 *  POST /api/rnd/plans/[planId]/submit-finance
 *  Management submits a DRAFT plan for finance budget approval.
 *  DRAFT → PENDING_FINANCE
 * ============================================================
 *  RBAC: RND_WRITE (management side)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { submitPlanForFinance } from "@/lib/services/rnd.service";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { planId } = await params;
  if (!planId || !UUID_RE.test(planId)) {
    return errorResponse("INVALID_PLAN_ID", "Plan ID must be a valid UUID", 400);
  }

  try {
    const updated = await submitPlanForFinance(auth.user.tenantId, planId);
    if (!updated)
      return errorResponse(
        "PLAN_SUBMIT_BLOCKED",
        "Only DRAFT plans can be submitted for finance approval",
        409
      );
    return successResponse(updated, "Plan submitted — awaiting finance approval");
  } catch (err) {
    console.error("[POST /api/rnd/plans/:id/submit-finance]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to submit plan", 500);
  }
}
