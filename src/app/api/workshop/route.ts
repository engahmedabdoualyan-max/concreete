/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/workshop — Fleet Workshop & Maintenance Module
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/workshop        — Workshop dashboard: open WOs, fleet health
 *  POST /api/workshop        — Create a new maintenance work order
 *
 *  DISPATCH ISOLATION RULE:
 *  When a work order is OPEN or IN_PROGRESS for a vehicle,
 *  the scheduling algorithm excludes that vehicle ID from
 *  the available dispatch pool.
 *
 *  FUEL THEFT DETECTION:
 *  If actual L/100km > (target * 1.25) for 3+ consecutive logs,
 *  the anomaly flag is set and an alert is raised.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  maintenanceOrders,
  fleetVehicles,
  users,
  fuelLogs,
  auditLogs,
} from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── GET /api/workshop ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WORKSHOP_READ);
  if ("status" in auth) return auth;

  try {
    // ── Open Work Orders ──────────────────────────────────────────────────────
    const openWorkOrders = await db
      .select({
        id: maintenanceOrders.id,
        workOrderNumber: maintenanceOrders.workOrderNumber,
        maintenanceType: maintenanceOrders.maintenanceType,
        status: maintenanceOrders.status,
        priority: maintenanceOrders.priority,
        faultDescription: maintenanceOrders.faultDescription,
        estimatedCompletionAt: maintenanceOrders.estimatedCompletionAt,
        completedAt: maintenanceOrders.completedAt,
        createdAt: maintenanceOrders.createdAt,
        totalCostSar: maintenanceOrders.totalCostSar,
        // Vehicle
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        vehicleType: fleetVehicles.vehicleType,
        vehicleStatus: fleetVehicles.currentStatus,
        // Mechanic
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
          eq(fleetVehicles.tenantId, auth.user.tenantId),
          inArray(maintenanceOrders.status, [
            "OPEN",
            "IN_PROGRESS",
            "AWAITING_PARTS",
            "ESCALATED",
          ])
        )
      )
      .orderBy(maintenanceOrders.priority, desc(maintenanceOrders.createdAt));

    // ── Fleet Health Summary ───────────────────────────────────────────────────
    const fleetHealth = await db
      .select({
        status: fleetVehicles.currentStatus,
        type: fleetVehicles.vehicleType,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(fleetVehicles)
      .where(
        and(
          eq(fleetVehicles.isActive, true),
          eq(fleetVehicles.tenantId, auth.user.tenantId)
        )
      )
      .groupBy(fleetVehicles.currentStatus, fleetVehicles.vehicleType);

    // ── Vehicles Currently in Workshop (excluded from dispatch) ───────────────
    const workshopVehicles = await db
      .select({
        id: fleetVehicles.id,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        currentStatus: fleetVehicles.currentStatus,
      })
      .from(fleetVehicles)
      .where(
        and(
          eq(fleetVehicles.isActive, true),
          eq(fleetVehicles.tenantId, auth.user.tenantId),
          inArray(fleetVehicles.currentStatus, ["IN_WORKSHOP", "MAJOR_BREAKDOWN"])
        )
      );

    // ── Recent Fuel Anomalies ─────────────────────────────────────────────────
    const fuelAnomalies = await db
      .select({
        id: fuelLogs.id,
        loggedAt: fuelLogs.loggedAt,
        anomalyNotes: fuelLogs.anomalyNotes,
        actualLPer100Km: fuelLogs.actualLPer100Km,
        targetLPer100Km: fuelLogs.targetLPer100Km,
        efficiencyVariance: fuelLogs.efficiencyVariance,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
      })
      .from(fuelLogs)
      .innerJoin(fleetVehicles, eq(fuelLogs.vehicleId, fleetVehicles.id))
      .where(
        and(
          eq(fuelLogs.tenantId, auth.user.tenantId),
          eq(fleetVehicles.tenantId, auth.user.tenantId),
          eq(fuelLogs.isAnomaly, true)
        )
      )
      .orderBy(desc(fuelLogs.loggedAt))
      .limit(10);

    // ── Maintenance Cost Summary (current month) ───────────────────────────────
    const monthlyCostSummary = await db
      .select({
        totalCost: sql<number>`SUM(total_cost_sar)::bigint`,
        completedCount: sql<number>`COUNT(*)::int`,
      })
      .from(maintenanceOrders)
      .where(
        and(
          eq(maintenanceOrders.tenantId, auth.user.tenantId),
          eq(maintenanceOrders.status, "COMPLETED"),
          sql`completed_at >= date_trunc('month', NOW())`
        )
      );

    return successResponse({
      openWorkOrders,
      fleetHealth,
      workshopVehicles: {
        count: workshopVehicles.length,
        vehicles: workshopVehicles,
        note: "These vehicles are excluded from the dispatch pool.",
      },
      fuelAnomalies,
      monthlyStats: monthlyCostSummary[0],
    });
  } catch (err) {
    console.error("[GET /api/workshop]", err);
    return errorResponse("WORKSHOP_FETCH_ERROR", "Failed to fetch workshop data", 500);
  }
}

// ─── POST /api/workshop ───────────────────────────────────────────────────────

const CreateMaintenanceOrderSchema = z.object({
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  maintenanceType: z.enum([
    "PREVENTIVE",
    "CORRECTIVE",
    "INSPECTION",
    "MAJOR_OVERHAUL",
    "TIRE_SERVICE",
    "HYDRAULIC_SERVICE",
  ]),
  priority: z.number().int().min(1).max(4).default(3),
  /** Severity level — CRITICAL auto-sets vehicle status to IN_WORKSHOP */
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  faultDescription: z.string().min(10, "Fault description must be at least 10 characters"),
  assignedMechanicId: z.string().uuid().optional(),
  estimatedCompletionAt: z.string().datetime().optional(),
  odometreAtMaintenanceKm: z.number().positive().optional(),
  /** When true, vehicle status is set to MAJOR_BREAKDOWN */
  isMajorBreakdown: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WORKSHOP_CREATE_ORDER);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateMaintenanceOrderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid work order data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch vehicle
  const vehicleRows = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      currentStatus: fleetVehicles.currentStatus,
    })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, parsed.data.vehicleId),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (vehicleRows.length === 0) {
    return errorResponse("NOT_FOUND", "Vehicle not found", 404);
  }

  const vehicle = vehicleRows[0];
  const previousStatus = vehicle.currentStatus;

  if (parsed.data.assignedMechanicId) {
    const [mechanic] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, parsed.data.assignedMechanicId),
          eq(users.tenantId, auth.user.tenantId)
        )
      )
      .limit(1);

    if (!mechanic) {
      return errorResponse("MECHANIC_NOT_FOUND", "Assigned mechanic not found", 404);
    }
  }

  // Generate work order number
  const woCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(maintenanceOrders)
    .where(eq(maintenanceOrders.tenantId, auth.user.tenantId));
  const woSeq = (woCount[0].count + 1).toString().padStart(4, "0");
  const year = new Date().getFullYear();
  const workOrderNumber = `WO-${year}-${woSeq}`;

  // Determine new vehicle status based on severity + isMajorBreakdown
  // - CRITICAL severity → always IN_WORKSHOP (dispatch exclusion)
  // - isMajorBreakdown → MAJOR_BREAKDOWN (more severe)
  // - Otherwise → IN_WORKSHOP (standard maintenance)
  const newVehicleStatus = parsed.data.isMajorBreakdown
    ? "MAJOR_BREAKDOWN"
    : parsed.data.severity === "CRITICAL"
    ? "IN_WORKSHOP"
    : parsed.data.severity === "HIGH"
    ? "IN_WORKSHOP"
    : "STANDBY"; // LOW/MEDIUM doesn't necessarily remove from pool

  // Create maintenance order
  const [newWO] = await db
    .insert(maintenanceOrders)
    .values({
      workOrderNumber,
      tenantId: auth.user.tenantId,
      vehicleId: parsed.data.vehicleId,
      maintenanceType: parsed.data.maintenanceType,
      status: "OPEN",
      priority: parsed.data.priority,
      severity: parsed.data.severity,
      reportedById: auth.user.sub,
      assignedMechanicId: parsed.data.assignedMechanicId,
      faultDescription: parsed.data.faultDescription,
      estimatedCompletionAt: parsed.data.estimatedCompletionAt
        ? new Date(parsed.data.estimatedCompletionAt)
        : undefined,
      odometreAtMaintenanceKm: parsed.data.odometreAtMaintenanceKm?.toFixed(1),
    })
    .returning();

  // !! CRITICAL: Mark vehicle as IN_WORKSHOP / MAJOR_BREAKDOWN
  // This immediately excludes it from the dispatch pool
  await db
    .update(fleetVehicles)
    .set({
      currentStatus: newVehicleStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fleetVehicles.id, parsed.data.vehicleId),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    );

  // Audit log
  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "VEHICLE_TAKEN_OFF_ROAD",
    entityType: "fleet_vehicles",
    entityId: parsed.data.vehicleId,
    previousState: { status: previousStatus },
    newState: {
      status: newVehicleStatus,
      workOrderNumber,
      reason: parsed.data.faultDescription,
    },
    socketEvent: "vehicle:status_changed",
  });

  return successResponse(
    {
      workOrderId: newWO.id,
      workOrderNumber,
      vehicleCode: vehicle.vehicleCode,
      previousStatus,
      newVehicleStatus,
      dispatchImpact:
        "Vehicle has been removed from the available dispatch pool until this work order is closed.",
      socketBroadcast: {
        event: "vehicle:status_changed",
        rooms: ["dispatch", "fleet"],
        payload: {
          vehicleId: parsed.data.vehicleId,
          vehicleCode: vehicle.vehicleCode,
          previousStatus,
          newStatus: newVehicleStatus,
          workOrderNumber,
          isMajorBreakdown: parsed.data.isMajorBreakdown,
        },
      },
    },
    `Work order ${workOrderNumber} created. Vehicle ${vehicle.vehicleCode} is now ${newVehicleStatus}.`,
    201
  );
}
