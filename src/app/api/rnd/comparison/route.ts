/**
 * ============================================================
 *  GET /api/rnd/comparison[?grade=C30]
 *  Price comparison: OUR mixes vs RIVALS, grade-by-grade.
 *  Returns every product row with verdict (CHEAPER/EQUAL/PRICIER)
 *  plus a per-grade market summary (lowest rival vs our price).
 * ============================================================
 *  RBAC: RND_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getPriceComparison } from "@/lib/services/rnd-competitor.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const grade = url.searchParams.get("grade") ?? undefined;

  try {
    const comparison = await getPriceComparison(auth.user.tenantId, grade);
    return successResponse(comparison, "Price comparison");
  } catch (err) {
    console.error("[GET /api/rnd/comparison]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to build comparison", 500);
  }
}
