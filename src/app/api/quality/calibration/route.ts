/**
 * ============================================================
 *  /api/quality/calibration — Batch Plant Scale Calibration
 * ============================================================
 *
 *  POST /api/quality/calibration        Record a scale verification
 *  GET  /api/quality/calibration        Current calibration status per station
 *
 *  A deviation beyond ±1% FAILS the check and immediately flags the
 *  batching station OUT_OF_SERVICE, hard-blocking StartBatching.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { batchPlants, calibrationControl, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requirePermission, requireRole, requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  recordCalibration,
  assertScaleCalibration,
  restoreBatchPlant,
  CALIBRATION_TOLERANCE_PCT,
  type CalibrationStatus,
} from "@/lib/lab-quality";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── POST — record a verification ─────────────────────────────────────────────

const CalibrationSchema = z.object({
  batchPlantId: z.string().uuid("Invalid batch plant ID"),
  scaleIdentifier: z.string().min(2).max(40),
  certifiedTestWeightKg: z.number().positive("Certified weight must be positive"),
  observedReadingKg: z.number().nonnegative("Observed reading is required"),
  tolerancePct: z.number().positive().max(10).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.LAB_RECORD_SLUMP,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CalibrationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid calibration payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await recordCalibration({
      ...parsed.data,
      verifiedById: auth.user.sub,
      tenantId: auth.user.tenantId,
    });

    return successResponse(
      {
        ...result,
        toleranceP: parsed.data.tolerancePct ?? CALIBRATION_TOLERANCE_PCT,
        socketBroadcast:
          result.result === "FAIL"
            ? {
                event: "plant:out_of_service",
                rooms: ["lab", "dispatch", "batch-plant", "admin-live-map"],
                payload: {
                  batchPlantId: parsed.data.batchPlantId,
                  scaleIdentifier: parsed.data.scaleIdentifier,
                  deviationPct: result.deviationPct,
                  timestamp: new Date().toISOString(),
                },
              }
            : null,
      },
      result.result === "FAIL"
        ? `🚨 CALIBRATION FAILED — scale "${parsed.data.scaleIdentifier}" deviated ${result.deviationPct}%. Station flagged OUT_OF_SERVICE and batching is blocked.`
        : `Calibration ${result.result}: deviation ${result.deviationPct}% (within ±${parsed.data.tolerancePct ?? CALIBRATION_TOLERANCE_PCT}%).`,
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("CALIBRATION_ERROR", message, 422);
  }
}

// ─── GET — station calibration status ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.LAB_READ,
  ]);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const batchPlantId = url.searchParams.get("batchPlantId");

  const plants = await db
    .select()
    .from(batchPlants)
    .where(eq(batchPlants.isActive, true))
    .orderBy(batchPlants.plantCode);

  const targets = batchPlantId
    ? plants.filter((p) => p.id === batchPlantId)
    : plants;

  const statuses: (CalibrationStatus & { blocked: boolean })[] = [];

  for (const plant of targets) {
    try {
      const status = await assertScaleCalibration(plant.id);
      statuses.push({ ...status, blocked: false });
    } catch (err) {
      const attached = (err as Error & { calibration?: CalibrationStatus })
        .calibration;
      statuses.push({
        ...(attached ?? {
          passed: false,
          batchPlantId: plant.id,
          plantCode: plant.plantCode,
          plantStatus: plant.status,
          checkedScales: [],
          failingScales: [],
          expiredScales: [],
          message: err instanceof Error ? err.message : "Calibration check failed",
        }),
        blocked: true,
      });
    }
  }

  // Recent verification history
  const history = await db
    .select({
      id: calibrationControl.id,
      scaleIdentifier: calibrationControl.scaleIdentifier,
      certifiedTestWeightKg: calibrationControl.certifiedTestWeightKg,
      observedReadingKg: calibrationControl.observedReadingKg,
      deviationPct: calibrationControl.deviationPct,
      tolerancePct: calibrationControl.tolerancePct,
      result: calibrationControl.result,
      triggeredOutOfService: calibrationControl.triggeredOutOfService,
      verifiedAt: calibrationControl.verifiedAt,
      plantCode: batchPlants.plantCode,
      verifiedByName: users.fullName,
    })
    .from(calibrationControl)
    .innerJoin(batchPlants, eq(calibrationControl.batchPlantId, batchPlants.id))
    .innerJoin(users, eq(calibrationControl.verifiedById, users.id))
    .orderBy(desc(calibrationControl.verifiedAt))
    .limit(50);

  const blockedCount = statuses.filter((s) => s.blocked).length;

  return successResponse(
    {
      stations: statuses,
      history,
      toleranceP: CALIBRATION_TOLERANCE_PCT,
      summary: {
        totalStations: statuses.length,
        operational: statuses.length - blockedCount,
        blocked: blockedCount,
      },
    },
    blockedCount > 0
      ? `⚠️ ${blockedCount} batching station(s) are blocked by the calibration gate.`
      : `All ${statuses.length} station(s) pass the ±${CALIBRATION_TOLERANCE_PCT}% calibration gate.`
  );
}

// ─── PATCH — restore a station after re-calibration ───────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ["SUPER_ADMIN", "LAB_TECHNICIAN"]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = z
    .object({ batchPlantId: z.string().uuid() })
    .safeParse(body);

  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "batchPlantId is required", 400);
  }

  try {
    const result = await restoreBatchPlant(parsed.data.batchPlantId, auth.user.sub, auth.user.tenantId);
    return successResponse(
      result,
      `Station ${result.plantCode} restored to ${result.status}. Batching is unblocked.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("RESTORE_BLOCKED", message, 409);
  }
}
