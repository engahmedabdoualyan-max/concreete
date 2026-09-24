/**
 * ============================================================
 *  POST /api/batching/start — Atomic Batching Command
 * ============================================================
 *
 *  Execution order (all-or-nothing):
 *    1. Scale calibration gate  (±1% deviation → hard block)
 *    2. Al-Sharqia climate compensation of the mix recipe
 *    3. Atomic silo deduction with row-level locks
 *    4. URGENT purchase requests for silos at/below reorder level
 *
 *  If ANY step fails, the transaction rolls back completely —
 *  no partial inventory deduction is ever persisted.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { batchPlants, mixDesigns, trips } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission, requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { startBatching, type CalibrationStatus } from "@/lib/lab-quality";
import { z } from "zod";

export const dynamic = "force-dynamic";

const StartBatchSchema = z.object({
  tripId: z.string().uuid("Invalid trip ID"),
  /** Station whose scales must pass the calibration gate */
  batchPlantId: z.string().uuid().optional(),
  ambientTempC: z.number().min(-10).max(60),
  ambientHumidityPct: z.number().min(0).max(100),
  estimatedTransitMinutes: z.number().min(1).max(480).optional(),
  /** Override the trip's planned volume (defaults to trip.loadedVolumeM3) */
  requestedM3: z.number().positive().max(20).optional(),
  /** Emergency bypass — SUPER_ADMIN only, fully audited */
  overrideCalibration: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.BATCH_START,
    PERMISSIONS.TRIP_CREATE,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = StartBatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid batch start payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Calibration override is restricted to SUPER_ADMIN
  if (parsed.data.overrideCalibration && auth.user.role !== "SUPER_ADMIN") {
    return errorResponse(
      "OVERRIDE_FORBIDDEN",
      "Only a SUPER_ADMIN may bypass the scale calibration gate.",
      403
    );
  }

  // ── Resolve the trip ───────────────────────────────────────────────────────
  const tripRows = await db
    .select({
      id: trips.id,
      tripNumber: trips.tripNumber,
      mixDesignId: trips.mixDesignId,
      loadedVolumeM3: trips.loadedVolumeM3,
      currentCheckpoint: trips.currentCheckpoint,
      isCompleted: trips.isCompleted,
      isCancelled: trips.isCancelled,
    })
    .from(trips)
    .where(
      and(
        eq(trips.id, parsed.data.tripId),
        eq(trips.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip not found", 404);
  }

  const trip = tripRows[0];

  if (trip.isCompleted || trip.isCancelled) {
    return errorResponse(
      "TRIP_CLOSED",
      "Cannot batch for a completed or cancelled trip.",
      409
    );
  }

  if (!["ARR_PLANT", "ARR_BSTC"].includes(trip.currentCheckpoint)) {
    return errorResponse(
      "INVALID_CHECKPOINT",
      `Trip is at '${trip.currentCheckpoint}'. Batching may only start at ARR_PLANT or ARR_BSTC.`,
      409
    );
  }

  const requestedM3 =
    parsed.data.requestedM3 ?? parseFloat(trip.loadedVolumeM3 ?? "0");

  if (!(requestedM3 > 0)) {
    return errorResponse("INVALID_VOLUME", "Trip has no loaded volume set.", 422);
  }

  const [mixDesign] = await db
    .select({ id: mixDesigns.id })
    .from(mixDesigns)
    .where(
      and(
        eq(mixDesigns.id, trip.mixDesignId),
        eq(mixDesigns.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (!mixDesign) {
    return errorResponse("MIX_DESIGN_NOT_FOUND", "Mix design not found", 404);
  }

  if (parsed.data.batchPlantId) {
    const [batchPlant] = await db
      .select({ id: batchPlants.id })
      .from(batchPlants)
      .where(
        and(
          eq(batchPlants.id, parsed.data.batchPlantId),
          eq(batchPlants.tenantId, auth.user.tenantId)
        )
      )
      .limit(1);

    if (!batchPlant) {
      return errorResponse("BATCH_PLANT_NOT_FOUND", "Batch plant not found", 404);
    }
  }

  // ── Execute ────────────────────────────────────────────────────────────────
  try {
    const result = await startBatching({
      tripId: trip.id,
      tenantId: auth.user.tenantId,
      mixDesignId: trip.mixDesignId,
      requestedM3,
      ambientTempC: parsed.data.ambientTempC,
      humidityPct: parsed.data.ambientHumidityPct,
      operatorId: auth.user.sub,
      batchPlantId: parsed.data.batchPlantId,
      estimatedTransitMinutes: parsed.data.estimatedTransitMinutes,
      overrideCalibration: parsed.data.overrideCalibration,
    });

    const { recipe } = result;

    return successResponse(
      {
        ...result,
        tripNumber: trip.tripNumber,
        socketBroadcast: {
          event: "batch:started",
          rooms: ["lab", "inventory", "dispatch", "batch-plant"],
          payload: {
            tripId: trip.id,
            tripNumber: trip.tripNumber,
            mixDesignCode: recipe.mixDesignCode,
            requestedM3,
            ambientTempC: parsed.data.ambientTempC,
            humidityPct: parsed.data.ambientHumidityPct,
            climateCompensated: recipe.climate.compensationTriggered,
            wcRatio: recipe.quality.resultingWcRatio,
            silosDeducted: result.deductions.length,
            urgentPurchaseRequests: result.purchaseRequests.length,
            timestamp: new Date().toISOString(),
          },
        },
      },
      `✅ Batch ${recipe.mixDesignCode} × ${requestedM3} m³ started for ${trip.tripNumber}. ` +
        `${result.deductions.length} silo(s) deducted` +
        (recipe.climate.compensationTriggered
          ? `, climate compensation applied (${recipe.climate.tempDeltaC}°C over baseline)`
          : "") +
        (result.purchaseRequests.length > 0
          ? `, ⚠️ ${result.purchaseRequests.length} URGENT purchase request(s) raised`
          : "") +
        ".",
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const calibration = (err as Error & { calibration?: CalibrationStatus })
      .calibration;

    // Calibration gate rejection → 423 Locked
    if (calibration) {
      return errorResponse(
        "CALIBRATION_BLOCKED",
        message,
        423,
        { calibration }
      );
    }

    // Insufficient stock → 409 Conflict (nothing was deducted)
    if (message.includes("BATCH ABORTED")) {
      return errorResponse("INSUFFICIENT_STOCK", message, 409);
    }

    return errorResponse("BATCH_START_FAILED", message, 422);
  }
}
