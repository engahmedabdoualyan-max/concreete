/**
 * ============================================================
 *  GET /api/workshop/history?vehicleId= — maintenance cards:
 *  every work order (open + completed) for one vehicle,
 *  newest first, with vehicle + mechanic names.
 * ============================================================
 *  RBAC: WORKSHOP_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { maintenanceOrders, fleetVehicles, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WORKSHOP_READ);
  if ("status" in auth) return auth;
  const vehicleId = new URL(req.url).searchParams.get("vehicleId") ?? "";
  if (!UUID_RE.test(vehicleId)) return errorResponse("INVALID_VEHICLE_ID", "vehicleId must be a valid UUID", 400);

  try {
    const rows = await db
      .select({
        order: maintenanceOrders,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        vehicleType: fleetVehicles.vehicleType,
        mechanicName: users.fullName,
      })
      .from(maintenanceOrders)
      .innerJoin(fleetVehicles, eq(maintenanceOrders.vehicleId, fleetVehicles.id))
      .leftJoin(
        users,
        and(
          eq(maintenanceOrders.assignedMechanicId, users.id),
          eq(users.tenantId, auth.user.tenantId)
        )
      )
      .where(
        and(
          eq(maintenanceOrders.tenantId, auth.user.tenantId),
          eq(maintenanceOrders.vehicleId, vehicleId)
        )
      )
      .orderBy(desc(maintenanceOrders.createdAt))
      .limit(200);
    const cards = rows.map((r) => ({
      ...r.order,
      vehicleCode: r.vehicleCode,
      plateNumber: r.plateNumber,
      vehicleType: r.vehicleType,
      mechanicName: r.mechanicName,
    }));
    return successResponse({ cards }, `${cards.length} card(s)`);
  } catch (err) {
    console.error("[GET /api/workshop/history]", err);
    return errorResponse("WORKSHOP_ERROR", "Failed to load maintenance cards", 500);
  }
}
