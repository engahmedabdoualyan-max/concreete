/**
 * /api/suppliers/aging
 * GET — vendor aging (عمر ذمم الموردين): every supplier's open balance bucketed
 * by how overdue it is (current / 1-30 / 31-60 / 61-90 / +90), plus the totals.
 *
 * Read-only, and reachable with either FINANCE_READ (as finance has always had)
 * or the narrow SUPPLIER_READ of مدير المشتروات — same split as the register.
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { supplierAging } from "@/lib/services/suppliers.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [PERMISSIONS.FINANCE_READ, PERMISSIONS.SUPPLIER_READ]);
  if ("status" in auth) return auth;

  try {
    const aging = await supplierAging(auth.user.tenantId);
    return successResponse(aging);
  } catch (err) {
    console.error("[GET /api/suppliers/aging]", err);
    return errorResponse("SUPPLIER_AGING_ERROR", "Failed to build the aging report", 500);
  }
}
