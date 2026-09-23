/**
 * ============================================================
 *  GET /api/hr/payroll/export?runId= — Mudad/WPS salary file (CSV)
 * ============================================================
 *  RBAC: HR_READ
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, errorResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { exportMudadCsv } from "@/lib/services/payroll.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const runId = new URL(req.url).searchParams.get("runId");
  if (!runId) return errorResponse("INVALID_RUN", "runId is required", 400);

  try {
    const result = await exportMudadCsv(auth.user.tenantId, runId);
    if (!result) return errorResponse("RUN_NOT_FOUND", "Payroll run not found", 404);
    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/hr/payroll/export]", err);
    return errorResponse("HR_ERROR", "Export failed", 500);
  }
}
