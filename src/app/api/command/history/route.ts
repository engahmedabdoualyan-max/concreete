import { NextRequest } from "next/server";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getSnapshot } from "@/lib/services/broadcast-snapshot.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/command/history?date=YYYY-MM-DD — read a past day (TRIP_READ).
 * History is immutable: only today's numbers are live; past days come from
 * the recorded snapshot or 404 when the broadcast never ran that day.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return errorResponse("INVALID_DATE", "date=YYYY-MM-DD مطلوب", 400);
  const snap = await getSnapshot(auth.user.tenantId, date);
  if (!snap) return errorResponse("NO_SNAPSHOT", "لا تسجيل لهذا اليوم", 404);
  return successResponse({ date, updatedAt: snap.updatedAt, snapshot: snap.payload }, `لقطة ${date}`);
}
