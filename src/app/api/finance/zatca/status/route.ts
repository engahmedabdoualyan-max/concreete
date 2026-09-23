/**
 * ============================================================
 *  GET /api/finance/zatca/status — Compliance dashboard numbers
 * ============================================================
 *  RBAC: FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { complianceSummary, getZatcaConfig } from "@/lib/services/zatca.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const [summary, config] = await Promise.all([
      complianceSummary(auth.user.tenantId),
      getZatcaConfig(auth.user.tenantId),
    ]);
    return successResponse({ summary, config }, "ZATCA compliance status");
  } catch (err) {
    console.error("[GET /api/finance/zatca/status]", err);
    return errorResponse("ZATCA_ERROR", "Failed to load status", 500);
  }
}
