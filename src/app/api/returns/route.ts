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
import { db } from "@/db";
import {
  concreteReturns,
  fleetVehicles,
  inventorySilos,
  orders,
  trips,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { processConcreteReturn } from "@/lib/weighbridge";
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

  const tripRows = await db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(
      fleetVehicles,
      and(
        eq(trips.vehicleId, fleetVehicles.id),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .innerJoin(
      orders,
      and(eq(trips.orderId, orders.id), eq(orders.tenantId, auth.user.tenantId))
    )
    .where(
      and(
        eq(trips.id, parsed.data.tripId),
        eq(trips.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip or related resource not found", 404);
  }

  let destinationSiloId = parsed.data.destinationSiloId;

  if (
    parsed.data.disposition === "RECYCLED_BATCHING" &&
    destinationSiloId === undefined
  ) {
    const defaultSiloRows = await db
      .select({ id: inventorySilos.id })
      .from(inventorySilos)
      .where(
        and(
          eq(inventorySilos.tenantId, auth.user.tenantId),
          eq(inventorySilos.materialCategory, "GRAVEL_20MM"),
          eq(inventorySilos.isActive, true)
        )
      )
      .limit(1);

    if (defaultSiloRows.length === 0) {
      return errorResponse("NOT_FOUND", "Recovery silo not found", 404);
    }
    destinationSiloId = defaultSiloRows[0].id;
  }

  if (destinationSiloId) {
    const siloRows = await db
      .select({ id: inventorySilos.id })
      .from(inventorySilos)
      .where(
        and(
          eq(inventorySilos.id, destinationSiloId),
          eq(inventorySilos.tenantId, auth.user.tenantId)
        )
      )
      .limit(1);

    if (siloRows.length === 0) {
      return errorResponse("NOT_FOUND", "Recovery silo not found", 404);
    }
  }

  try {
    const result = await processConcreteReturn({
      ...parsed.data,
      destinationSiloId,
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
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [r] = await db
      .select({
        totalReturns: sql<number>`COUNT(*)::int`,
        blocksManufactured: sql<number>`COALESCE(SUM(blocks_cast_count), 0)::int`,
        aggregateRecoveredKg: sql<string>`COALESCE(SUM(CAST(aggregate_recovered_kg AS DECIMAL)), 0)::text`,
        waterRecoveredLitres: sql<string>`COALESCE(SUM(CAST(water_recovered_litres AS DECIMAL)), 0)::text`,
        totalVolumeM3: sql<string>`COALESCE(SUM(CAST(returned_volume_m3 AS DECIMAL)), 0)::text`,
        recycledM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'RECYCLED_BATCHING' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
        castM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'CAST_BLOCKS' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
        washoutM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'WASHOUT' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
        discardedM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'DISCARDED' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
        deductionsSar: sql<number>`COALESCE(SUM(deduction_amount_sar), 0)::int`,
      })
      .from(concreteReturns)
      .where(
        and(
          eq(concreteReturns.tenantId, auth.user.tenantId),
          sql`created_at >= ${since.toISOString()}::timestamp`
        )
      );

    const total = parseFloat(r.totalVolumeM3 ?? "0");
    const recycled = parseFloat(r.recycledM3 ?? "0");
    const cast = parseFloat(r.castM3 ?? "0");
    const washout = parseFloat(r.washoutM3 ?? "0");
    const discarded = parseFloat(r.discardedM3 ?? "0");
    const recovered = recycled + cast + washout;

    const stats = {
      timeRangeDays: days,
      totalReturns: r.totalReturns,
      totalVolumeReturnedM3: Math.round(total * 100) / 100,
      blocksManufactured: r.blocksManufactured,
      aggregateRecoveredKg: parseFloat(r.aggregateRecoveredKg ?? "0"),
      waterRecoveredLitres: parseFloat(r.waterRecoveredLitres ?? "0"),
      discardedVolumeM3: Math.round(discarded * 100) / 100,
      recycledPct: total > 0 ? Math.round((recycled / total) * 100) : 0,
      castBlocksPct: total > 0 ? Math.round((cast / total) * 100) : 0,
      washoutPct: total > 0 ? Math.round((washout / total) * 100) : 0,
      wastedPct: total > 0 ? Math.round((discarded / total) * 100) : 0,
      recoveryEfficiencyPct:
        total > 0 ? Math.round((recovered / total) * 100) : 100,
      totalDeductionsSar: r.deductionsSar,
    };

    return successResponse(
      stats,
      `Material recovery efficiency ${stats.recoveryEfficiencyPct}% across ${stats.totalReturns} return(s) in the last ${days} day(s).`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("RECOVERY_STATS_ERROR", message, 500);
  }
}
