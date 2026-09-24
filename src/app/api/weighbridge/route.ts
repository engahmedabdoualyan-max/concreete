/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/weighbridge — Anti-Fraud SHA-256 Hash Chain Ledger
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/weighbridge          — Weighbridge dashboard + recent transactions
 *  POST /api/weighbridge          — Record a new weighbridge transaction
 *  GET  /api/weighbridge/verify   — Verify the integrity of the full hash chain
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { weighbridgeTransactions, trips, fleetVehicles, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { logWeighbridgeTransaction } from "@/lib/weighbridge";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── GET /api/weighbridge ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const tripId = url.searchParams.get("tripId");

  if (tripId) {
    const tripRows = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.tenantId, auth.user.tenantId)))
      .limit(1);

    if (tripRows.length === 0) {
      return errorResponse("NOT_FOUND", "Trip not found", 404);
    }

    const history = await db
      .select()
      .from(weighbridgeTransactions)
      .where(
        and(
          eq(weighbridgeTransactions.tripId, tripId),
          eq(weighbridgeTransactions.tenantId, auth.user.tenantId)
        )
      )
      .orderBy(weighbridgeTransactions.sequenceNumber);
    return successResponse({ transactions: history });
  }

  // Recent transactions across all trips in this tenant
  const recentTransactions = await db
    .select({
      id: weighbridgeTransactions.id,
      sequenceNumber: weighbridgeTransactions.sequenceNumber,
      transactionType: weighbridgeTransactions.transactionType,
      grossWeightKg: weighbridgeTransactions.grossWeightKg,
      tareWeightKg: weighbridgeTransactions.tareWeightKg,
      netWeightKg: weighbridgeTransactions.netWeightKg,
      recordHash: weighbridgeTransactions.recordHash,
      lockedAt: weighbridgeTransactions.lockedAt,
      notes: weighbridgeTransactions.notes,
      tripNumber: trips.tripNumber,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      operatorName: users.fullName,
    })
    .from(weighbridgeTransactions)
    .innerJoin(
      trips,
      and(
        eq(weighbridgeTransactions.tripId, trips.id),
        eq(trips.tenantId, auth.user.tenantId)
      )
    )
    .innerJoin(
      fleetVehicles,
      and(
        eq(trips.vehicleId, fleetVehicles.id),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .innerJoin(
      users,
      and(
        eq(weighbridgeTransactions.operatorId, users.id),
        eq(users.tenantId, auth.user.tenantId)
      )
    )
    .where(eq(weighbridgeTransactions.tenantId, auth.user.tenantId))
    .orderBy(desc(weighbridgeTransactions.sequenceNumber))
    .limit(50);

  const [statsRow] = await db
    .select({
      totalTransactions: sql<number>`COUNT(*)::int`,
      totalNetWeightKg: sql<string>`COALESCE(SUM(CAST(net_weight_kg AS DECIMAL)), 0)::text`,
      loadOutCount: sql<number>`COALESCE(SUM(CASE WHEN transaction_type = 'LOAD_OUT' THEN 1 ELSE 0 END), 0)::int`,
      returnInCount: sql<number>`COALESCE(SUM(CASE WHEN transaction_type = 'RETURN_IN' THEN 1 ELSE 0 END), 0)::int`,
      chainTipSequence: sql<number>`COALESCE(MAX(sequence_number), 0)::int`,
    })
    .from(weighbridgeTransactions)
    .where(eq(weighbridgeTransactions.tenantId, auth.user.tenantId));

  const stats = {
    totalTransactions: statsRow.totalTransactions,
    totalNetWeightKg: parseFloat(statsRow.totalNetWeightKg ?? "0"),
    loadOutCount: statsRow.loadOutCount,
    returnInCount: statsRow.returnInCount,
    chainTipSequence: statsRow.chainTipSequence,
  };

  return successResponse({
    recentTransactions,
    stats,
    integrity:
      "Run GET /api/weighbridge/verify to validate full SHA-256 hash chain integrity.",
  });
}

// ─── POST /api/weighbridge ────────────────────────────────────────────────────

const WeighbridgeEntrySchema = z.object({
  tripId: z.string().uuid("Invalid trip ID"),
  transactionType: z.enum(["LOAD_OUT", "RETURN_IN", "TARE_VERIFY"]),
  grossWeightKg: z.number().positive("Gross weight must be positive"),
  scaleUnitId: z.string().max(30).optional(),
  rawSensorData: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(500).optional(),
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

  const parsed = WeighbridgeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid weighbridge entry data", 400, {
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
    .where(
      and(
        eq(trips.id, parsed.data.tripId),
        eq(trips.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip or vehicle not found", 404);
  }

  try {
    const record = await logWeighbridgeTransaction({
      ...parsed.data,
      operatorId: auth.user.sub,
    });

    return successResponse(
      {
        transactionId: record.id,
        sequenceNumber: record.sequenceNumber,
        grossWeightKg: record.grossWeightKg,
        tareWeightKg: record.tareWeightKg,
        netWeightKg: record.netWeightKg,
        recordHash: record.recordHash,
        lockedAt: record.lockedAt,
        integrity: {
          hashAlgorithm: "SHA-256",
          chainPosition: record.sequenceNumber,
          tamperProof:
            "This record is cryptographically linked to the previous record. Any alteration will break the hash chain.",
        },
      },
      `Weighbridge transaction recorded. Net weight: ${record.netWeightKg} kg. Record sealed with SHA-256 hash.`,
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("WEIGHBRIDGE_ERROR", message, 422);
  }
}
