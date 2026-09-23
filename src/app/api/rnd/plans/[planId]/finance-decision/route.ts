/**
 * ============================================================
 *  POST /api/rnd/plans/[planId]/finance-decision
 *  Finance approves or rejects the plan budget.
 *  PENDING_FINANCE → APPROVED | REJECTED
 * ============================================================
 *  RBAC: RND_FINANCE_APPROVE (Finance / Accountant / Super Admin)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { decidePlanFinance } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const DecisionSchema = z.object({
  approved: z.boolean(),
  comments: z.string().max(2000).optional(),
  approvedBudgetSar: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_FINANCE_APPROVE);
  if ("status" in auth) return auth;

  const { planId } = await params;
  if (!planId || !UUID_RE.test(planId)) {
    return errorResponse("INVALID_PLAN_ID", "Plan ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid decision payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await decidePlanFinance(
      auth.user.tenantId,
      planId,
      auth.user.sub,
      parsed.data.approved,
      parsed.data.comments,
      parsed.data.approvedBudgetSar
    );
    if (!updated)
      return errorResponse(
        "PLAN_DECISION_BLOCKED",
        "Only plans PENDING_FINANCE can receive a finance decision",
        409
      );
    return successResponse(
      updated,
      parsed.data.approved ? "Plan budget approved" : "Plan budget rejected"
    );
  } catch (err) {
    console.error("[POST /api/rnd/plans/:id/finance-decision]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to record finance decision", 500);
  }
}
