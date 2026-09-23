/**
 * ============================================================
 *  GET  /api/hr/zones  — Work geofences
 *  POST /api/hr/zones  — Define a zone (factory gate, yard...)
 * ============================================================
 *  Body: { name, latitude, longitude, radiusM? }
 *  RBAC: HR_READ (GET) · HR_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listZones, createZone } from "@/lib/services/attendance.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  try {
    const zones = await listZones(auth.user.tenantId);
    return successResponse({ zones }, `${zones.length} zone(s)`);
  } catch (err) {
    console.error("[GET /api/hr/zones]", err);
    return errorResponse("HR_ERROR", "Failed to load zones", 500);
  }
}

const ZoneSchema = z.object({
  name: z.string().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(20).max(5000).optional(),
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

  const parsed = ZoneSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid zone payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const zone = await createZone(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(zone, "Zone defined", 201);
  } catch (err) {
    console.error("[POST /api/hr/zones]", err);
    return errorResponse("HR_ERROR", "Failed to define zone", 500);
  }
}
