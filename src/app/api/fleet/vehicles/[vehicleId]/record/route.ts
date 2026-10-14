/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/fleet/vehicles/[vehicleId]/record — the vehicle's whole file
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET /api/fleet/vehicles/[vehicleId]/record
 *
 *  TWO DEPTHS, DECIDED BY PERMISSION NOT BY A FLAG
 *  ─────────────────────────────────────────────────────────
 *  Scanning a truck in the yard has to answer something useful to everyone, and
 *  must not hand the maintenance file to everyone. So:
 *
 *    FULL  (qr:read_full → mechanic, workshop manager, plant manager, HR manager)
 *          every work order, every fuel and oil log, every part ever fitted,
 *          costs and anomalies.
 *
 *    BASIC (fleet:read → driver, dispatcher, sales, accounts)
 *          which truck it is, its plate and status, and who is driving it.
 *          Nothing else. Not a count of open repairs, not a date.
 *
 *  The narrower payload is BUILT SEPARATELY rather than filtered down from the
 *  wide one, so a field cannot leak because someone forgot to delete it from a
 *  redaction list.
 *
 *  RE-USED BY: the QR scan endpoint returns the same BASIC/FULL split for a
 *  vehicle label, via `asset-qr.service`, so both routes agree by construction.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  fleetVehicles,
  maintenanceOrders,
  fuelLogs,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS, userHasPermission } from "@/lib/auth/rbac";
import { labelsForVehicle } from "@/lib/services/asset-qr.service";
import { and, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ vehicleId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  // fleet:read is the floor: without it you get nothing at all.
  const auth = await requirePermission(req, PERMISSIONS.FLEET_READ);
  if ("status" in auth) return auth;

  const { vehicleId } = await ctx.params;

  const [vehicle] = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      vehicleClass: fleetVehicles.vehicleClass,
      make: fleetVehicles.make,
      model: fleetVehicles.model,
      year: fleetVehicles.year,
      drumCapacityM3: fleetVehicles.drumCapacityM3,
      tareWeightTonnes: fleetVehicles.tareWeightTonnes,
      currentStatus: fleetVehicles.currentStatus,
      fuelType: fleetVehicles.fuelType,
      odometreKm: fleetVehicles.odometreKm,
      assignedDriverId: fleetVehicles.assignedDriverId,
      isActive: fleetVehicles.isActive,
    })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, vehicleId),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (!vehicle) {
    return errorResponse("VEHICLE_NOT_FOUND", "No such vehicle in your plant.", 404);
  }

  const assignedDriver = vehicle.assignedDriverId
    ? (
        await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, vehicle.assignedDriverId))
          .limit(1)
      )[0]
    : undefined;

  const canSeeFull = userHasPermission(
    auth.user.role,
    auth.user.permissions ?? [],
    PERMISSIONS.QR_READ_FULL
  );

  // ── BASIC: identity and who is on it. Nothing operational. ──
  const basic = {
    vehicleCode: vehicle.vehicleCode,
    plateNumber: vehicle.plateNumber,
    vehicleType: vehicle.vehicleType,
    vehicleClass: vehicle.vehicleClass,
    currentStatus: vehicle.currentStatus,
    /** The one fact a non-workshop viewer gets: who is driving it. */
    assignedDriverName: assignedDriver?.fullName ?? null,
    isActive: vehicle.isActive,
  };

  if (!canSeeFull) {
    return successResponse(
      { ...basic, depth: "BASIC" },
      "Identity only. The maintenance file needs workshop access."
    );
  }

  // ── FULL: the workshop's view ──
  const [workOrders, fuels, fittedParts] = await Promise.all([
    db
      .select({
        id: maintenanceOrders.id,
        workOrderNumber: maintenanceOrders.workOrderNumber,
        maintenanceType: maintenanceOrders.maintenanceType,
        status: maintenanceOrders.status,
        severity: maintenanceOrders.severity,
        faultDescription: maintenanceOrders.faultDescription,
        actionTaken: maintenanceOrders.actionTaken,
        partsUsed: maintenanceOrders.partsUsed,
        odometreAtMaintenanceKm: maintenanceOrders.odometreAtMaintenanceKm,
        nextServiceDueKm: maintenanceOrders.nextServiceDueKm,
        labourHours: maintenanceOrders.labourHours,
        totalCostSar: maintenanceOrders.totalCostSar,
        createdAt: maintenanceOrders.createdAt,
        completedAt: maintenanceOrders.completedAt,
        mechanicName: users.fullName,
      })
      .from(maintenanceOrders)
      .leftJoin(
        users,
        eq(users.id, maintenanceOrders.assignedMechanicId)
      )
      .where(eq(maintenanceOrders.vehicleId, vehicle.id))
      .orderBy(desc(maintenanceOrders.createdAt))
      .limit(100),

    db
      .select({
        id: fuelLogs.id,
        loggedAt: fuelLogs.loggedAt,
        litresAdded: fuelLogs.litresAdded,
        odometreKm: fuelLogs.odometreKm,
        distanceTravelledKm: fuelLogs.distanceTravelledKm,
        efficiencyVariance: fuelLogs.efficiencyVariance,
        totalFuelCostSar: fuelLogs.totalFuelCostSar,
        fuelStationName: fuelLogs.fuelStationName,
        loggedByName: users.fullName,
      })
      .from(fuelLogs)
      .leftJoin(users, eq(users.id, fuelLogs.loggedById))
      .where(eq(fuelLogs.vehicleId, vehicle.id))
      .orderBy(desc(fuelLogs.loggedAt))
      .limit(100),

    labelsForVehicle(auth.user.tenantId, vehicle.id),
  ]);

  const openWorkOrders = workOrders.filter(
    (w) => w.status === "OPEN" || w.status === "IN_PROGRESS"
  ).length;

  return successResponse(
    {
      ...basic,
      depth: "FULL",
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      drumCapacityM3: vehicle.drumCapacityM3,
      tareWeightTonnes: vehicle.tareWeightTonnes,
      fuelType: vehicle.fuelType,
      odometreKm: vehicle.odometreKm,
      assignedDriverPhone: null,
      summary: {
        totalWorkOrders: workOrders.length,
        openWorkOrders,
        totalFuelLogs: fuels.length,
        partsCurrentlyFitted: fittedParts.filter((p) => p.currentlyFitted).length,
        partsEverFitted: fittedParts.length,
      },
      workOrders,
      fuelLogs: fuels,
      /** "What has this truck ever had on it?" — the label history. */
      partsHistory: fittedParts,
    },
    "Full vehicle record"
  );
}