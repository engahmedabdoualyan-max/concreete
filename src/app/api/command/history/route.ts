import { NextRequest } from "next/server";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getSnapshot, getSnapshotTimes } from "@/lib/services/broadcast-snapshot.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/command/history?date=YYYY-MM-DD[&time=HH:MM] — read the past.
 * Without time: nearest/latest capture + the day's capture times. With time:
 * the nearest capture at or before that hour/minute (Riyadh).
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;
  const sp = new URL(req.url).searchParams;
  const date = sp.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return errorResponse("INVALID_DATE", "date=YYYY-MM-DD مطلوب", 400);
  const time = sp.get("time");
  let atIso: string | undefined;
  if (time && /^\d{2}:\d{2}$/.test(time)) atIso = `${date}T${time}:00+03:00`;
  const [snap, times] = await Promise.all([
    getSnapshot(auth.user.tenantId, date, atIso),
    getSnapshotTimes(auth.user.tenantId, date),
  ]);
  if (!snap) return errorResponse("NO_SNAPSHOT", "لا تسجيل لهذا اليوم", 404);
  return successResponse(
    { date, time: time ?? null, times, updatedAt: snap.updatedAt, snapshot: snap.payload },
    `لقطة ${date}${time ? ` ${time}` : ""}`
  );
}
