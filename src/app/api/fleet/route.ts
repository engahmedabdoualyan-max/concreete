/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/fleet — Fleet Management (Vehicles)
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/fleet   — List all fleet vehicles with status
 *  POST /api/fleet   — Register a new vehicle
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, users, auditLogs } from "@/db/schema";
import { eq, and, desc, ne, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";
import {
  inferClassFromType,
  capabilitiesFor,
  CLASS_METRICS,
} from "@/lib/vehicle-class";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const typeFilter = url.searchParams.get("type");
  const statusFilter = url.searchParams.get("status");
  const availableOnly = url.searchParams.get("availableOnly") === "true";

  const conditions = [
    eq(fleetVehicles.isActive, true),
    eq(fleetVehicles.tenantId, auth.user.tenantId),
  ];

  if (typeFilter) conditions.push(eq(fleetVehicles.vehicleType, typeFilter as never));
  if (statusFilter) conditions.push(eq(fleetVehicles.currentStatus, statusFilter as never));
  if (availableOnly) {
    conditions.push(
      inArray(fleetVehicles.currentStatus, ["AVAILABLE", "STANDBY"] as never[])
    );
  }

  const vehicles = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      vehicleClass: fleetVehicles.vehicleClass,
      isExternal: fleetVehicles.isExternal,
      externalVendorName: fleetVehicles.externalVendorName,
      make: fleetVehicles.make,
      model: fleetVehicles.model,
      year: fleetVehicles.year,
      drumCapacityM3: fleetVehicles.drumCapacityM3,
      tareWeightTonnes: fleetVehicles.tareWeightTonnes,
      currentStatus: fleetVehicles.currentStatus,
      targetFuelLPer100Km: fleetVehicles.targetFuelLPer100Km,
      odometreKm: fleetVehicles.odometreKm,
      insuranceExpiresAt: fleetVehicles.insuranceExpiresAt,
      inspectionDueAt: fleetVehicles.inspectionDueAt,
      driverName: users.fullName,
      driverEmployeeCode: users.employeeCode,
    })
    .from(fleetVehicles)
    .leftJoin(
      users,
      and(
        eq(fleetVehicles.assignedDriverId, users.id),
        eq(users.tenantId, auth.user.tenantId)
      )
    )
    .where(and(...conditions))
    .orderBy(fleetVehicles.vehicleCode);

  // Attach the capability matrix + class KPI descriptors so the dashboard
  // knows which panels to render for each vehicle without hardcoding rules.
  const enriched = vehicles.map((v) => ({
    ...v,
    capabilities: capabilitiesFor(v.vehicleClass),
    metricDescriptors: CLASS_METRICS[v.vehicleClass] ?? [],
  }));

  const byClass = enriched.reduce<Record<string, number>>((acc, v) => {
    acc[v.vehicleClass] = (acc[v.vehicleClass] ?? 0) + 1;
    return acc;
  }, {});

  return successResponse({
    vehicles: enriched,
    count: enriched.length,
    fleetComposition: byClass,
    externalAssets: enriched.filter((v) => v.isExternal).length,
  });
}

const CreateVehicleSchema = z.object({
  vehicleCode: z.string().min(2).max(20),
  plateNumber: z.string().min(3).max(30),
  vehicleType: z.enum([
    "MIXER_TRUCK",
    "CONCRETE_PUMP",
    "TRANSIT_MIXER",
    "WATER_TANKER",
    "SERVICE_TRUCK",
    "TIPPER_TRUCK",
  ]),
  /** Behavioural class. Omit to auto-infer from vehicleType. */
  vehicleClass: z.enum(["MIXER", "PUMP", "TIPPER", "SERVICE", "REGULAR"]).optional(),
  /** Outsourced / leased asset — segregates cost accounting */
  isExternal: z.boolean().optional().default(false),
  externalVendorName: z.string().max(120).optional(),
  monthlyRentalRateSar: z.number().int().nonnegative().optional(),
  /** PUMP class: hourly hire rate (SAR halalas) */
  hourlyRateSar: z.number().int().nonnegative().optional(),
  /** PUMP class: boom reach + rated throughput */
  boomReachMetres: z.number().positive().max(100).optional(),
  pumpRateM3PerHour: z.number().positive().max(500).optional(),
  /** TIPPER class: rated payload */
  payloadCapacityTonnes: z.number().positive().max(100).optional(),
  make: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  year: z.number().int().min(1990).max(2030).optional(),
  drumCapacityM3: z.number().positive().max(20).optional(),
  /** REQUIRED: tare (empty) weight in tonnes for weighbridge net calculation */
  tareWeightTonnes: z.number().positive("Tare weight must be positive"),
  targetFuelLPer100Km: z.number().positive().max(200).optional(),
  assignedDriverId: z.string().uuid().optional(),
  insuranceExpiresAt: z.string().datetime().optional(),
  inspectionDueAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateVehicleSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid vehicle data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  if (parsed.data.assignedDriverId) {
    const driverRows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, parsed.data.assignedDriverId),
          eq(users.tenantId, auth.user.tenantId),
          eq(users.isActive, true)
        )
      )
      .limit(1);
    if (driverRows.length === 0) {
      return errorResponse("DRIVER_NOT_FOUND", "Assigned driver not found in this tenant", 404);
    }
  }

  const [newVehicle] = await db
    .insert(fleetVehicles)
    .values({
      tenantId: auth.user.tenantId,
      vehicleCode: parsed.data.vehicleCode.toUpperCase(),
      plateNumber: parsed.data.plateNumber,
      vehicleType: parsed.data.vehicleType,
      vehicleClass:
        parsed.data.vehicleClass ?? inferClassFromType(parsed.data.vehicleType),
      isExternal: parsed.data.isExternal,
      externalVendorName: parsed.data.externalVendorName,
      monthlyRentalRateSar: parsed.data.monthlyRentalRateSar,
      hourlyRateSar: parsed.data.hourlyRateSar,
      boomReachMetres: parsed.data.boomReachMetres?.toFixed(2),
      pumpRateM3PerHour: parsed.data.pumpRateM3PerHour?.toFixed(2),
      payloadCapacityTonnes: parsed.data.payloadCapacityTonnes?.toFixed(3),
      make: parsed.data.make,
      model: parsed.data.model,
      year: parsed.data.year,
      drumCapacityM3: parsed.data.drumCapacityM3?.toFixed(2),
      tareWeightTonnes: parsed.data.tareWeightTonnes.toFixed(3),
      currentStatus: "AVAILABLE",
      targetFuelLPer100Km: parsed.data.targetFuelLPer100Km?.toFixed(2),
      assignedDriverId: parsed.data.assignedDriverId,
      insuranceExpiresAt: parsed.data.insuranceExpiresAt
        ? new Date(parsed.data.insuranceExpiresAt)
        : undefined,
      inspectionDueAt: parsed.data.inspectionDueAt
        ? new Date(parsed.data.inspectionDueAt)
        : undefined,
      notes: parsed.data.notes,
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "VEHICLE_REGISTERED",
    entityType: "fleet_vehicles",
    entityId: newVehicle.id,
    newState: { vehicleCode: newVehicle.vehicleCode, tareWeightTonnes: newVehicle.tareWeightTonnes },
  });

  return successResponse(
    {
      id: newVehicle.id,
      vehicleCode: newVehicle.vehicleCode,
      plateNumber: newVehicle.plateNumber,
      tareWeightTonnes: newVehicle.tareWeightTonnes,
      currentStatus: newVehicle.currentStatus,
      vehicleClass: newVehicle.vehicleClass,
      isExternal: newVehicle.isExternal,
      capabilities: capabilitiesFor(newVehicle.vehicleClass),
    },
    `Vehicle ${newVehicle.vehicleCode} registered successfully.`,
    201
  );
}
