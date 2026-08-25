/**
 * POST /api/workshop/driver-report
 * ─────────────────────────────────────────────────────────────────────────────
 * Driver-facing breakdown report. The DRIVER role holds
 * FLEET_MARK_BREAKDOWN ("can self-report a breakdown") but NOT
 * WORKSHOP_CREATE_ORDER, so this lightweight endpoint is what the driver app
 * calls. It creates a maintenance work order (status OPEN) and — for
 * HIGH/CRITICAL severity — flips the vehicle to IN_WORKSHOP so the scheduling
 * algorithm excludes it from the dispatch pool.
 *
 * Body: { vehicleId?: uuid | vehicleCode?: string, faultDescription, severity,
 *         maintenanceType?, priority?, tripId?, latitude?, longitude? }
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { maintenanceOrders, fleetVehicles, trips } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DriverReportSchema = z.object({
  vehicleId: z.string().uuid("Invalid vehicle ID").optional(),
  vehicleCode: z.string().trim().max(20).optional(),
  faultDescription: z.string().min(5, "اكتب وصف العطل"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  maintenanceType: z
    .enum([
      "PREVENTIVE",
      "CORRECTIVE",
      "INSPECTION",
      "MAJOR_OVERHAUL",
      "TIRE_SERVICE",
      "HYDRAULIC_SERVICE",
    ])
    .default("CORRECTIVE"),
  priority: z.number().int().min(1).max(4).optional(),
  tripId: z.string().uuid("Invalid trip ID").optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const SEVERITY_TO_PRIORITY: Record<string, number> = {
  LOW: 4,
  MEDIUM: 3,
  HIGH: 2,
  CRITICAL: 1,
};

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_MARK_BREAKDOWN);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = DriverReportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid breakdown report", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // ── Resolve the vehicle (UUID preferred, code fallback) ─────────────────────
  const baseWhere = eq(fleetVehicles.tenantId, auth.user.tenantId);
  const vehicleWhere = parsed.data.vehicleId
    ? and(baseWhere, eq(fleetVehicles.id, parsed.data.vehicleId))
    : parsed.data.vehicleCode
    ? and(baseWhere, eq(fleetVehicles.vehicleCode, parsed.data.vehicleCode.toUpperCase()))
    : null;

  if (!vehicleWhere) {
    return errorResponse("VEHICLE_REQUIRED", "vehicleId or vehicleCode is required", 400);
  }

  const vehicleRows = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      currentStatus: fleetVehicles.currentStatus,
    })
    .from(fleetVehicles)
    .where(vehicleWhere)
    .limit(1);

  if (vehicleRows.length === 0) {
    return errorResponse("NOT_FOUND", "Vehicle not found", 404);
  }
  const vehicle = vehicleRows[0];

  // ── Generate work order number ──────────────────────────────────────────────
  const woCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(maintenanceOrders)
    .where(eq(maintenanceOrders.tenantId, auth.user.tenantId));
  const woSeq = (woCount[0].count + 1).toString().padStart(4, "0");
  const year = new Date().getFullYear();
  const workOrderNumber = `WO-${year}-${woSeq}`;

  const severity = parsed.data.severity;
  const priority = parsed.data.priority ?? SEVERITY_TO_PRIORITY[severity];
  const isMajorBreakdown = severity === "CRITICAL";

  // CRITICAL/HIGH → pull from dispatch pool; LOW/MEDIUM → STANDBY
  const newVehicleStatus = isMajorBreakdown
    ? "MAJOR_BREAKDOWN"
    : severity === "HIGH"
    ? "IN_WORKSHOP"
    : "STANDBY";

  const [newWO] = await db
    .insert(maintenanceOrders)
    .values({
      workOrderNumber,
      tenantId: auth.user.tenantId,
      vehicleId: vehicle.id,
      maintenanceType: parsed.data.maintenanceType,
      status: "OPEN",
      priority,
      severity,
      reportedById: auth.user.sub,
      faultDescription: parsed.data.faultDescription,
    })
    .returning();

  await db
    .update(fleetVehicles)
    .set({ currentStatus: newVehicleStatus, updatedAt: new Date() })
    .where(eq(fleetVehicles.id, vehicle.id));

  // Stamp the originating trip with a cancellation hint if still active
  if (parsed.data.tripId) {
    await db
      .update(trips)
      .set({
        cancellationReason: sql`COALESCE(cancellation_reason, '') || '[BREAKDOWN ' || ${workOrderNumber} || '] '`,
        updatedAt: new Date(),
      })
      .where(and(eq(trips.id, parsed.data.tripId), eq(trips.isCompleted, false)));
  }

  return successResponse(
    {
      workOrder: newWO,
      workOrderNumber,
      vehicle: {
        id: vehicle.id,
        vehicleCode: vehicle.vehicleCode,
        plateNumber: vehicle.plateNumber,
        currentStatus: newVehicleStatus,
      },
    },
    "تم تسجيل بلاغ العطل وفتح أمر صيانة"
  );
}
