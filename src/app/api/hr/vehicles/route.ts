import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
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
 *  GET /api/hr/vehicles — fleet with renewal dates + drivers
 *  PUT /api/hr/vehicles/[id]/renewals — set dates (HR_WRITE)
 * ============================================================
 *  The HR vehicles tab (renewals watch + violation assignment) reads
 *  here. Gre/oily mechanical state stays in /api/workshop; this is the
 *  paperwork side: istimara, insurance, inspection expiries.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const rows = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      currentStatus: fleetVehicles.currentStatus,
      assignedDriverId: fleetVehicles.assignedDriverId,
      driverName: users.fullName,
      istimaraExpiry: fleetVehicles.istimaraExpiry,
      insuranceExpiresAt: fleetVehicles.insuranceExpiresAt,
      inspectionDueAt: fleetVehicles.inspectionDueAt,
    })
    .from(fleetVehicles)
    .leftJoin(users, eq(users.id, fleetVehicles.assignedDriverId))
    .where(eq(fleetVehicles.tenantId, auth.user.tenantId))
    .orderBy(fleetVehicles.vehicleCode);
  return successResponse({ vehicles: rows }, `${rows.length} vehicle(s)`);
}
