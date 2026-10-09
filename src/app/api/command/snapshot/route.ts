import { NextRequest } from "next/server";
import { db } from "@/db";
import { broadcastSnapshots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { takeSnapshot } from "@/lib/services/broadcast-snapshot.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/command/snapshot — capture today's numbers (TRIP_READ).
 *
 * The broadcast calls this on load; throttled to one capture per 15 minutes
 * so the TV's 30s poll does not rewrite history mid-day. ?force=1 recaptures.
 */
const FIFTEEN_MIN = 15 * 60_000;

function today(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;
  const day = today();

  if (new URL(req.url).searchParams.get("force") !== "1") {
    const [row] = await db
      .select({ updatedAt: broadcastSnapshots.updatedAt })
      .from(broadcastSnapshots)
      .where(
        and(
          eq(broadcastSnapshots.tenantId, auth.user.tenantId),
          eq(broadcastSnapshots.snapDate, day)
        )
      )
      .limit(1);
    if (row && Date.now() - new Date(row.updatedAt).getTime() < FIFTEEN_MIN)
      return successResponse({ date: day, throttled: true }, "لقطة اليوم محفوظة");
  }

  try {
    const payload = await takeSnapshot(auth.user.tenantId, day);
    return successResponse({ date: day, payload }, "تم تسجيل لقطة اليوم");
  } catch (e) {
    console.error("[POST /api/command/snapshot]", e);
    return errorResponse("SNAPSHOT_FAILED", "تعذر تسجيل اللقطة", 500);
  }
}
