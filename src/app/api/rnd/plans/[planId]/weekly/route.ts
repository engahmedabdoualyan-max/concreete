/**
 * ============================================================
 *  GET /api/rnd/plans/[planId]/weekly — Weekly entries (plan-scoped alias)
 *  Convenience alias of GET /api/rnd/weekly?planId=
 * ============================================================
 *  RBAC: RND_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listWeeklyEntries } from "@/lib/services/rnd.service";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const { planId } = await params;
  if (!planId || !UUID_RE.test(planId)) {
    return errorResponse("INVALID_PLAN_ID", "Plan ID must be a valid UUID", 400);
  }

  try {
    const entries = await listWeeklyEntries(auth.user.tenantId, planId);
    return successResponse({ entries }, `${entries.length} weekly entr(ies)`);
  } catch (err) {
    console.error("[GET /api/rnd/plans/:id/weekly]", err);
    return errorResponse("RND_WEEKLY_ERROR", "Failed to load weekly entries", 500);
  }
}
