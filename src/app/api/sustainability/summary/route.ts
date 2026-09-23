/**
 * ============================================================
 *  GET /api/sustainability/summary — Tenant carbon totals
 * ============================================================
 *  RBAC: RND_READ | FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { carbonSummary } from "@/lib/services/sustainability.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.RND_READ,
    PERMISSIONS.FINANCE_READ,
  ]);
  if ("status" in auth) return auth;

  try {
    const summary = await carbonSummary(auth.user.tenantId);
    return successResponse(summary, "Carbon summary");
  } catch (err) {
    console.error("[GET /api/sustainability/summary]", err);
    return errorResponse("CARBON_ERROR", "Failed to build summary", 500);
  }
}
