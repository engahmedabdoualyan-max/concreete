/**
 * ============================================================
 *  GET /api/hr/payroll/runs/[id] — Run + payslip lines
 * ============================================================
 *  RBAC: HR_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getRun } from "@/lib/services/payroll.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_RUN_ID", "Run ID must be a valid UUID", 400);
  }

  try {
    const run = await getRun(auth.user.tenantId, id);
    if (!run) return errorResponse("RUN_NOT_FOUND", "Payroll run not found", 404);
    return successResponse(run, "Payroll run");
  } catch (err) {
    console.error("[GET /api/hr/payroll/runs/:id]", err);
    return errorResponse("HR_ERROR", "Failed to load run", 500);
  }
}
