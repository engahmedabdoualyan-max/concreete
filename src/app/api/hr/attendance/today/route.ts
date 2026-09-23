/**
 * ============================================================
 *  GET /api/hr/attendance/today — My attendance row today
 * ============================================================
 *  RBAC: any authenticated user (own scope)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { myAttendanceToday } from "@/lib/services/attendance.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  try {
    const row = await myAttendanceToday(auth.user.tenantId, auth.user.sub);
    return successResponse({ attendance: row }, "Today");
  } catch (err) {
    console.error("[GET /api/hr/attendance/today]", err);
    return errorResponse("HR_ERROR", "Failed", 500);
  }
}
