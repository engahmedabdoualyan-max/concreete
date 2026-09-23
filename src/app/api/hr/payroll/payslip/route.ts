/**
 * ============================================================
 *  GET /api/hr/payroll/payslip?runId=&employeeId= — Payslip JSON
 * ============================================================
 *  RBAC: HR_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getPayslip } from "@/lib/services/payroll.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const employeeId = url.searchParams.get("employeeId");
  if (!runId || !employeeId) {
    return errorResponse("INVALID_QUERY", "runId and employeeId are required", 400);
  }

  try {
    const slip = await getPayslip(auth.user.tenantId, runId, employeeId);
    if (!slip) return errorResponse("NOT_FOUND", "Payslip not found", 404);
    return successResponse(slip, "Payslip");
  } catch (err) {
    console.error("[GET /api/hr/payroll/payslip]", err);
    return errorResponse("HR_ERROR", "Failed to load payslip", 500);
  }
}
