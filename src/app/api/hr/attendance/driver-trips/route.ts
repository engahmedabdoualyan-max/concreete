/**
 * ============================================================
 *  GET /api/hr/attendance/driver-trips?from=&to=[&thresholdH=8]
 *  Driver overtime evidence: trips + hours + overtime minutes
 * ============================================================
 *  RBAC: HR_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { driverOvertimeReport } from "@/lib/services/attendance.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? from;
  const thresholdH = Math.min(
    24,
    Math.max(1, parseFloat(url.searchParams.get("thresholdH") ?? "8") || 8)
  );

  try {
    const rows = await driverOvertimeReport(auth.user.tenantId, from, to, thresholdH);
    return successResponse({ drivers: rows, thresholdH }, `${rows.length} driver(s)`);
  } catch (err) {
    console.error("[GET /api/hr/attendance/driver-trips]", err);
    return errorResponse("HR_ERROR", "Failed to build report", 500);
  }
}
