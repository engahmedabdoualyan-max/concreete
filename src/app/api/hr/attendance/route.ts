/**
 * ============================================================
 *  GET /api/hr/attendance?from=&to=[&userId=] — Attendance report
 * ============================================================
 *  RBAC: HR_READ sees all (optional userId filter);
 *  without it, callers see only their own rows.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { userHasPermission } from "@/lib/auth/rbac";
import { attendanceReport } from "@/lib/services/attendance.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const canSeeAll = userHasPermission(
    auth.user.role,
    auth.user.permissions ?? [],
    PERMISSIONS.HR_READ
  );
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? from;
  const userId = canSeeAll
    ? (url.searchParams.get("userId") ?? undefined)
    : auth.user.sub;

  try {
    const rows = await attendanceReport(auth.user.tenantId, from, to, userId);
    return successResponse({ attendance: rows }, `${rows.length} row(s)`);
  } catch (err) {
    console.error("[GET /api/hr/attendance]", err);
    return errorResponse("HR_ERROR", "Failed to load report", 500);
  }
}
