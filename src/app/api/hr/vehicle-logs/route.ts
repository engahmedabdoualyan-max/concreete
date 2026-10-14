import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrVehicleLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/hr/vehicle-logs[?vehicleId=] — odometer + fuel logbook
 *  POST /api/hr/vehicle-logs — log a reading (HR_WRITE)
 * ============================================================
 *  Consecutive fuel entries with odometer readings yield km/l in the
 *  UI; that consumption trend is what exposes abnormal usage.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const vehicleId = new URL(req.url).searchParams.get("vehicleId");
  const rows = await db
    .select()
    .from(hrVehicleLogs)
    .where(eq(hrVehicleLogs.tenantId, auth.user.tenantId))
    .orderBy(desc(hrVehicleLogs.logDate));
  const list = vehicleId ? rows.filter((r) => r.vehicleId === vehicleId) : rows;
  return successResponse({ logs: list }, `${list.length} log(s)`);
}

const LogSchema = z.object({
  vehicleId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  odometerKm: z.number().nonnegative().optional(),
  fuelLitres: z.number().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid log payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  if (d.odometerKm === undefined && d.fuelLitres === undefined) {
    return errorResponse("VALIDATION_ERROR", "odometerKm or fuelLitres required", 400);
  }
  const [created] = await db
    .insert(hrVehicleLogs)
    .values({
      tenantId: auth.user.tenantId,
      vehicleId: d.vehicleId,
      logDate: d.logDate,
      odometerKm: d.odometerKm !== undefined ? String(d.odometerKm) : null,
      fuelLitres: d.fuelLitres !== undefined ? String(d.fuelLitres) : null,
      notes: d.notes ?? null,
      recordedById: auth.user.sub,
    })
    .returning();
  return successResponse(created, "تم تسجيل القراءة", 201);
}
