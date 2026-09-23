/**
 * ============================================================
 *  POST /api/hr/attendance/ping — Position fix → enter/exit
 * ============================================================
 *  Body: { latitude, longitude }
 *  Called periodically by the mobile app (drivers while tracking,
 *  field staff on screen visits). First zone entry of the day =
 *  check-in, exit = check-out stamped with the last inside fix.
 *  RBAC: any authenticated user (own scope)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { ping } from "@/lib/services/attendance.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid position payload", 400);
  }

  try {
    const result = await ping(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data.latitude,
      parsed.data.longitude
    );
    return successResponse(result, result.event);
  } catch (err) {
    console.error("[POST /api/hr/attendance/ping]", err);
    return errorResponse("HR_ERROR", "Ping failed", 500);
  }
}
