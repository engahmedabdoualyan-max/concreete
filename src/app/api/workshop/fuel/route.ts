/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  POST /api/workshop/fuel — Fuel Log & Theft Detection
 * ============================================================
 *
 *  ANOMALY DETECTION ALGORITHM:
 *  1. Calculate actual L/100km from this fill
 *  2. Compare against vehicle's target L/100km
 *  3. If actual > (target × 1.25) → flag as anomaly
 *  4. Also flag if litres added > tank capacity (phantom fill)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { fuelLogs, fleetVehicles, auditLogs } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const FuelLogSchema = z.object({
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  logType: z.enum(["REFUEL", "CONSUMPTION_LOG", "DISCREPANCY_REPORT"]),
  odometreKm: z.number().nonnegative("Odometer must be non-negative"),
  litresAdded: z.number().positive("Litres must be positive").optional(),
  costPerLitreSarCents: z.number().int().positive().optional(),
  fuelStationName: z.string().max(100).optional(),
  receiptNumber: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FUEL_LOG_RECORD);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = FuelLogSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid fuel log data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch vehicle with target fuel efficiency
  const vehicleRows = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      targetFuelLPer100Km: fleetVehicles.targetFuelLPer100Km,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, parsed.data.vehicleId))
    .limit(1);

  if (vehicleRows.length === 0) {
    return errorResponse("NOT_FOUND", "Vehicle not found", 404);
  }

  const vehicle = vehicleRows[0];

  // Fetch last fuel log for this vehicle to compute distance
  const lastLogRows = await db
    .select({
      odometreKm: fuelLogs.odometreKm,
      litresAdded: fuelLogs.litresAdded,
    })
    .from(fuelLogs)
    .where(eq(fuelLogs.vehicleId, parsed.data.vehicleId))
    .orderBy(desc(fuelLogs.loggedAt))
    .limit(1);

  const previousOdometreKm =
    lastLogRows.length > 0 ? parseFloat(lastLogRows[0].odometreKm ?? "0") : null;

  const distanceTravelledKm =
    previousOdometreKm !== null
      ? Math.max(0, parsed.data.odometreKm - previousOdometreKm)
      : null;

  // Calculate actual fuel efficiency
  const actualLPer100Km =
    distanceTravelledKm && distanceTravelledKm > 0 && parsed.data.litresAdded
      ? (parsed.data.litresAdded / distanceTravelledKm) * 100
      : null;

  const targetLPer100Km = vehicle.targetFuelLPer100Km
    ? parseFloat(vehicle.targetFuelLPer100Km)
    : null;

  const efficiencyVariance =
    actualLPer100Km !== null && targetLPer100Km !== null
      ? actualLPer100Km - targetLPer100Km
      : null;

  // ── Anomaly Detection ──────────────────────────────────────────────────────
  let isAnomaly = false;
  const anomalyReasons: string[] = [];

  if (
    actualLPer100Km !== null &&
    targetLPer100Km !== null &&
    actualLPer100Km > targetLPer100Km * 1.25
  ) {
    isAnomaly = true;
    anomalyReasons.push(
      `Fuel consumption (${actualLPer100Km.toFixed(1)} L/100km) exceeds target by ${((actualLPer100Km / targetLPer100Km - 1) * 100).toFixed(0)}% (target: ${targetLPer100Km} L/100km)`
    );
  }

  // Check for phantom fill (litres > reasonable tank capacity of ~300L)
  if (parsed.data.litresAdded && parsed.data.litresAdded > 300) {
    isAnomaly = true;
    anomalyReasons.push(
      `Suspicious fill quantity: ${parsed.data.litresAdded}L exceeds maximum tank capacity`
    );
  }

  const totalFuelCostSar =
    parsed.data.litresAdded && parsed.data.costPerLitreSarCents
      ? Math.round(parsed.data.litresAdded * parsed.data.costPerLitreSarCents)
      : undefined;

  const [newLog] = await db
    .insert(fuelLogs)
    .values({
      vehicleId: parsed.data.vehicleId,
      tenantId: auth.user.tenantId,
      logType: parsed.data.logType,
      loggedAt: new Date(),
      litresAdded: parsed.data.litresAdded?.toFixed(2),
      odometreKm: parsed.data.odometreKm.toFixed(1),
      previousOdometreKm: previousOdometreKm?.toFixed(1),
      distanceTravelledKm: distanceTravelledKm?.toFixed(1),
      actualLPer100Km: actualLPer100Km?.toFixed(2),
      targetLPer100Km: targetLPer100Km?.toFixed(2),
      efficiencyVariance: efficiencyVariance?.toFixed(2),
      costPerLitreSarCents: parsed.data.costPerLitreSarCents,
      totalFuelCostSar,
      fuelStationName: parsed.data.fuelStationName,
      receiptNumber: parsed.data.receiptNumber,
      loggedById: auth.user.sub,
      isAnomaly,
      anomalyNotes: anomalyReasons.length > 0 ? anomalyReasons.join("; ") : undefined,
    })
    .returning();

  // Update vehicle odometer
  await db
    .update(fleetVehicles)
    .set({ odometreKm: parsed.data.odometreKm.toFixed(1), updatedAt: new Date() })
    .where(eq(fleetVehicles.id, parsed.data.vehicleId));

  if (isAnomaly) {
    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "FUEL_ANOMALY_DETECTED",
      entityType: "fuel_logs",
      entityId: newLog.id,
      newState: {
        vehicleCode: vehicle.vehicleCode,
        anomalyReasons,
        actualLPer100Km,
        targetLPer100Km,
      },
      socketEvent: "workshop:fuel_anomaly",
    });
  }

  return successResponse(
    {
      logId: newLog.id,
      vehicleCode: vehicle.vehicleCode,
      distanceTravelledKm,
      actualLPer100Km,
      targetLPer100Km,
      efficiencyVariance,
      totalFuelCostSar,
      anomalyDetected: isAnomaly,
      anomalyReasons,
      socketBroadcast: isAnomaly
        ? {
            event: "workshop:fuel_anomaly",
            rooms: ["workshop", "admin"],
            payload: { vehicleCode: vehicle.vehicleCode, anomalyReasons },
          }
        : null,
    },
    isAnomaly
      ? `⚠️ Fuel anomaly detected for ${vehicle.vehicleCode}. Workshop alert raised.`
      : `Fuel log recorded for ${vehicle.vehicleCode}.`,
    201
  );
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FUEL_LOG_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const vehicleId = url.searchParams.get("vehicleId");
  const anomalyOnly = url.searchParams.get("anomalyOnly") === "true";

  const conditions = [];
  if (vehicleId) conditions.push(eq(fuelLogs.vehicleId, vehicleId));
  if (anomalyOnly) conditions.push(eq(fuelLogs.isAnomaly, true));

  const query = db
    .select({
      id: fuelLogs.id,
      logType: fuelLogs.logType,
      loggedAt: fuelLogs.loggedAt,
      litresAdded: fuelLogs.litresAdded,
      odometreKm: fuelLogs.odometreKm,
      distanceTravelledKm: fuelLogs.distanceTravelledKm,
      actualLPer100Km: fuelLogs.actualLPer100Km,
      targetLPer100Km: fuelLogs.targetLPer100Km,
      efficiencyVariance: fuelLogs.efficiencyVariance,
      totalFuelCostSar: fuelLogs.totalFuelCostSar,
      isAnomaly: fuelLogs.isAnomaly,
      anomalyNotes: fuelLogs.anomalyNotes,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
    })
    .from(fuelLogs)
    .innerJoin(fleetVehicles, eq(fuelLogs.vehicleId, fleetVehicles.id))
    .orderBy(desc(fuelLogs.loggedAt))
    .limit(50);

  const result =
    conditions.length > 0 ? await query.where(and(...conditions)) : await query;

  return successResponse({ fuelLogs: result });
}
