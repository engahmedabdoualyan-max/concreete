/**
 * ============================================================
 *  /api/returns — Concrete Returns Governance
 * ============================================================
 *
 *  POST /api/returns   Weigh in a returning mixer, seal the reading on the
 *                      hash chain, derive the excess volume, and route the
 *                      disposition (recycle / cast blocks / washout / discard).
 *  GET  /api/returns   Recovery & sustainability statistics.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  processConcreteReturn,
  getReturnsRecoveryStats,
} from "@/lib/weighbridge";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ReturnSchema = z.object({
  tripId: z.string().uuid("Invalid trip ID"),
  /** Weighbridge gross reading of the returning truck (kg) */
  returnGrossWeightKg: z.number().positive("Gross weight must be positive"),
  disposition: z.enum([
    "RECYCLED_BATCHING",
    "CAST_BLOCKS",
    "WASHOUT",
    "DISCARDED",
  ]),
  returnReason: z.string().min(5, "Reason is required").max(1000),
  returnedSlumpCm: z.number().min(0).max(30).optional(),
  blockSizeCm: z.string().max(30).optional(),
  volumePerBlockM3: z.number().positive().max(1).optional(),
  recoveredGrade: z.enum(["FINE", "COARSE", "MIXED"]).optional(),
  destinationSiloId: z.string().uuid().optional(),
  raiseFinancialDeduction: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_RECORD);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ReturnSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid return payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await processConcreteReturn({
      ...parsed.data,
      authorisedById: auth.user.sub,
      operatorId: auth.user.sub,
    });

    const summary: Record<string, string> = {
      CAST_BLOCKS: `🧱 ${result.recovery.blocksManufactured ?? 0} block(s) manufactured from ${result.excessVolumeM3} m³.`,
      RECYCLED_BATCHING: `♻️ ${result.recovery.aggregateRecoveredKg ?? 0} kg aggregate recovered into ${result.recovery.siloCredited?.siloCode ?? "inventory"}.`,
      WASHOUT: `💧 ${result.recovery.waterRecoveredLitres ?? 0} L process water recovered.`,
      DISCARDED: `🗑️ ${result.excessVolumeM3} m³ discarded as waste.`,
    };

    return successResponse(
      {
        ...result,
        ticketNumber: result.weighbridgeRecord.ticketNumber,
        socketBroadcast: {
          event: "return:logged",
          rooms: ["inventory", "lab", "workshop", "weighbridge"],
          payload: {
            returnId: result.returnId,
            tripId: parsed.data.tripId,
            ticketNumber: result.weighbridgeRecord.ticketNumber,
            disposition: result.disposition,
            excessVolumeM3: result.excessVolumeM3,
            recovery: result.recovery,
            timestamp: new Date().toISOString(),
          },
        },
      },
      summary[parsed.data.disposition],
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("RETURN_FAILED", message, 422);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30")));

  try {
    const stats = await getReturnsRecoveryStats(days);
    return successResponse(
      stats,
      `Material recovery efficiency ${stats.recoveryEfficiencyPct}% across ${stats.totalReturns} return(s) in the last ${days} day(s).`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("RECOVERY_STATS_ERROR", message, 500);
  }
}
