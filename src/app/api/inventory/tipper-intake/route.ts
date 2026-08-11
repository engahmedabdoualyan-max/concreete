/**
 * ============================================================
 *  /api/inventory/tipper-intake — TIPPER Raw Material Supply Chain
 * ============================================================
 *
 *  A TIPPER arrives loaded with aggregate / sand / cement, is weighed
 *  on the bridge, then discharges DIRECTLY into an `inventory_silos`
 *  bin. This route is the audit bridge between the weighbridge
 *  hash-chain ledger and the inventory ledger for INBOUND material.
 *
 *  POST /api/inventory/tipper-intake            Weigh in + discharge
 *  GET  /api/inventory/tipper-intake            Intake history + KPIs
 *
 *  The destination silo may be identified either by `siloId` or by
 *  scanning the silo's permanent QR placard (`siloQrToken`) — the
 *  latter eliminates mis-tipping into the wrong bin.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  tipperIntakeLogs,
  inventorySilos,
  inventoryTransactions,
  fleetVehicles,
  purchaseRequests,
  users,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requirePermission, requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { assertCapability, VehicleClassViolation } from "@/lib/vehicle-class";
import { verifySiloQr, QrTicketError } from "@/lib/qr-ticket";
import { z } from "zod";

export const dynamic = "force-dynamic";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

const IntakeSchema = z
  .object({
    tipperVehicleId: z.string().uuid("Invalid tipper vehicle ID"),
    /** Destination silo — supply either the id directly … */
    siloId: z.string().uuid().optional(),
    /** … or scan the silo's permanent QR placard */
    siloQrToken: z.string().min(10).optional(),
    /** Gross weight from the bridge (kg) */
    grossWeightKg: z.number().positive("Gross weight must be positive"),
    supplierName: z.string().max(140).optional(),
    supplierDeliveryNote: z.string().max(80).optional(),
    moistureContentPct: z.number().min(0).max(30).optional(),
    costSarPerTonne: z.number().int().nonnegative().optional(),
    purchaseRequestId: z.string().uuid().optional(),
    /** QC outcome — false routes the load to REJECTED, no silo credit */
    qcPassed: z.boolean().default(true),
    rejectionReason: z.string().max(500).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.siloId || d.siloQrToken, {
    message: "Either siloId or siloQrToken must be provided",
    path: ["siloId"],
  });

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.WEIGHBRIDGE_RECORD,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid intake payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;

  // ── Resolve the tipper and enforce the class guard ────────────────────────
  const [tipper] = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      vehicleClass: fleetVehicles.vehicleClass,
      tareWeightTonnes: fleetVehicles.tareWeightTonnes,
      payloadCapacityTonnes: fleetVehicles.payloadCapacityTonnes,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, d.tipperVehicleId))
    .limit(1);

  if (!tipper) return errorResponse("NOT_FOUND", "Tipper vehicle not found", 404);

  try {
    assertCapability(tipper.vehicleClass, "siloIntake", tipper.vehicleCode);
  } catch (err) {
    if (err instanceof VehicleClassViolation) {
      return errorResponse("VEHICLE_CLASS_VIOLATION", err.message, 409, {
        vehicleClass: err.vehicleClass,
        capability: err.capability,
      });
    }
    throw err;
  }

  // ── Resolve the destination silo (by id or by scanned QR placard) ─────────
  let resolvedSiloId = d.siloId ?? null;
  let siloResolvedByQr = false;

  if (!resolvedSiloId && d.siloQrToken) {
    try {
      const scanned = verifySiloQr(d.siloQrToken);
      resolvedSiloId = scanned.siloId;
      siloResolvedByQr = true;
    } catch (err) {
      const message = err instanceof QrTicketError ? err.message : "Silo QR invalid";
      return errorResponse("SILO_QR_INVALID", message, 400);
    }
  }

  if (!resolvedSiloId) {
    return errorResponse("SILO_UNRESOLVED", "Could not determine the destination silo", 400);
  }

  // ── Net weight is ALWAYS computed, never supplied ─────────────────────────
  const tareWeightKg = parseFloat(tipper.tareWeightTonnes ?? "0") * 1000;
  if (tareWeightKg <= 0) {
    return errorResponse(
      "TARE_NOT_CONFIGURED",
      `Tipper ${tipper.vehicleCode} has no configured tare weight. Intake is blocked until the fleet record is completed.`,
      409
    );
  }

  const netWeightKg = r3(d.grossWeightKg - tareWeightKg);
  if (netWeightKg <= 0) {
    return errorResponse(
      "IMPOSSIBLE_WEIGHT",
      `Gross ${d.grossWeightKg} kg is at or below the configured tare ${tareWeightKg} kg. Check the scale.`,
      422
    );
  }

  // Payload sanity check (detects an overloaded or mis-tared truck)
  const capacityKg = tipper.payloadCapacityTonnes
    ? parseFloat(tipper.payloadCapacityTonnes) * 1000
    : null;
  const overloaded = capacityKg != null && netWeightKg > capacityKg * 1.05;

  const countRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(tipperIntakeLogs)
    .where(eq(tipperIntakeLogs.tenantId, auth.user.tenantId));
  const seq = ((countRows[0]?.count ?? 0) + 1).toString().padStart(5, "0");
  const intakeNumber = `TIP-${new Date().getFullYear()}-${seq}`;

  // ── Atomic: lock silo, credit stock, write both ledgers ───────────────────
  try {
    const result = await db.transaction(async (tx) => {
      const [silo] = await tx
        .select({
          id: inventorySilos.id,
          tenantId: inventorySilos.tenantId,
          siloCode: inventorySilos.siloCode,
          materialCategory: inventorySilos.materialCategory,
          currentStockKg: inventorySilos.currentStockKg,
          capacityKg: inventorySilos.capacityKg,
          reorderLevelKg: inventorySilos.reorderLevelKg,
          isActive: inventorySilos.isActive,
        })
        .from(inventorySilos)
        .where(eq(inventorySilos.id, resolvedSiloId!))
        .limit(1)
        .for("update");

      if (!silo) throw new Error("SILO_NOT_FOUND");
      if (!silo.isActive) throw new Error("SILO_INACTIVE");

      const currentStock = parseFloat(silo.currentStockKg ?? "0");
      const capacity = parseFloat(silo.capacityKg ?? "0");
      const headroom = Math.max(0, capacity - currentStock);

      // ── QC rejection: log the load, credit nothing ──────────────────────
      if (!d.qcPassed) {
        const [rejected] = await tx
          .insert(tipperIntakeLogs)
          .values({
            intakeNumber,
            tenantId: silo.tenantId,
            tipperVehicleId: tipper.id,
            siloId: silo.id,
            materialCategory: silo.materialCategory,
            purchaseRequestId: d.purchaseRequestId,
            status: "REJECTED",
            grossWeightKg: d.grossWeightKg.toFixed(3),
            tareWeightKg: tareWeightKg.toFixed(3),
            netWeightKg: netWeightKg.toFixed(3),
            dischargedWeightKg: "0",
            siloBalanceAfterKg: currentStock.toFixed(3),
            supplierName: d.supplierName,
            supplierDeliveryNote: d.supplierDeliveryNote,
            moistureContentPct: d.moistureContentPct?.toFixed(2),
            qcPassed: false,
            rejectionReason: d.rejectionReason ?? "Failed incoming QC inspection",
            costSarPerTonne: d.costSarPerTonne ?? 0,
            totalCostSar: 0,
            receivedById: auth.user.sub,
            notes: d.notes,
          })
          .returning();

        return {
          intake: rejected,
          silo,
          dischargedKg: 0,
          newStock: currentStock,
          partial: false,
          triggeredReorderClose: false,
        };
      }

      // ── Discharge, capped at physical headroom ──────────────────────────
      const dischargedKg = r3(Math.min(netWeightKg, headroom));
      const partial = dischargedKg < netWeightKg - 0.001;
      const newStock = r3(currentStock + dischargedKg);

      await tx
        .update(inventorySilos)
        .set({ currentStockKg: newStock.toFixed(3), updatedAt: new Date() })
        .where(eq(inventorySilos.id, silo.id));

      // Inventory ledger row (positive = receipt)
      await tx.insert(inventoryTransactions).values({
        siloId: silo.id,
        tenantId: silo.tenantId,
        transactionType: "RECEIPT",
        quantityKg: dischargedKg.toFixed(3),
        balanceAfterKg: newStock.toFixed(3),
        referenceDoc: intakeNumber,
        performedById: auth.user.sub,
        notes: `Tipper intake ${intakeNumber} — ${tipper.vehicleCode}${d.supplierName ? ` from ${d.supplierName}` : ""}`,
      });

      const totalCostSar = d.costSarPerTonne
        ? Math.round((dischargedKg / 1000) * d.costSarPerTonne)
        : 0;

      const [intake] = await tx
        .insert(tipperIntakeLogs)
        .values({
          intakeNumber,
          tenantId: silo.tenantId,
          tipperVehicleId: tipper.id,
          siloId: silo.id,
          materialCategory: silo.materialCategory,
          purchaseRequestId: d.purchaseRequestId,
          status: partial ? "PARTIAL" : "DISCHARGED",
          grossWeightKg: d.grossWeightKg.toFixed(3),
          tareWeightKg: tareWeightKg.toFixed(3),
          netWeightKg: netWeightKg.toFixed(3),
          dischargedWeightKg: dischargedKg.toFixed(3),
          siloBalanceAfterKg: newStock.toFixed(3),
          supplierName: d.supplierName,
          supplierDeliveryNote: d.supplierDeliveryNote,
          moistureContentPct: d.moistureContentPct?.toFixed(2),
          qcPassed: true,
          costSarPerTonne: d.costSarPerTonne ?? 0,
          totalCostSar,
          receivedById: auth.user.sub,
          dischargedAt: new Date(),
          notes: d.notes,
        })
        .returning();

      // ── Close the procurement loop ──────────────────────────────────────
      let triggeredReorderClose = false;
      if (d.purchaseRequestId) {
        await tx
          .update(purchaseRequests)
          .set({ status: "RECEIVED", updatedAt: new Date() })
          .where(eq(purchaseRequests.id, d.purchaseRequestId));
        triggeredReorderClose = true;
      } else if (newStock > parseFloat(silo.reorderLevelKg ?? "0")) {
        // Auto-close any open PR for this silo now that stock is healthy
        const closed = await tx
          .update(purchaseRequests)
          .set({ status: "RECEIVED", updatedAt: new Date() })
          .where(
            and(
              eq(purchaseRequests.siloId, silo.id),
              eq(purchaseRequests.tenantId, silo.tenantId),
              sql`${purchaseRequests.status} NOT IN ('RECEIVED','CANCELLED')`
            )
          )
          .returning({ id: purchaseRequests.id });
        triggeredReorderClose = closed.length > 0;
      }

      return { intake, silo, dischargedKg, newStock, partial, triggeredReorderClose };
    });

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: result.silo.tenantId,
      action: d.qcPassed ? "TIPPER_INTAKE_DISCHARGED" : "TIPPER_INTAKE_REJECTED",
      entityType: "tipper_intake_logs",
      entityId: result.intake.id,
      newState: {
        intakeNumber,
        tipperCode: tipper.vehicleCode,
        siloCode: result.silo.siloCode,
        netWeightKg,
        dischargedKg: result.dischargedKg,
        siloResolvedByQr,
        overloaded,
      },
      socketEvent: "inventory:tipper_intake",
    });

    const warnings: string[] = [];
    if (overloaded) {
      warnings.push(
        `Net load ${r2(netWeightKg / 1000)} t exceeds the tipper's rated payload of ${tipper.payloadCapacityTonnes} t by more than 5%.`
      );
    }
    if (result.partial) {
      warnings.push(
        `Silo ${result.silo.siloCode} reached capacity — only ${r2(result.dischargedKg)} kg of ${r2(netWeightKg)} kg was discharged. Remainder must be re-routed.`
      );
    }

    return successResponse(
      {
        intakeId: result.intake.id,
        intakeNumber,
        status: result.intake.status,
        tipperCode: tipper.vehicleCode,
        silo: {
          id: result.silo.id,
          siloCode: result.silo.siloCode,
          materialCategory: result.silo.materialCategory,
          resolvedByQrScan: siloResolvedByQr,
        },
        weights: {
          grossWeightKg: d.grossWeightKg,
          tareWeightKg,
          netWeightKg,
          dischargedWeightKg: result.dischargedKg,
          undischargedKg: r3(netWeightKg - result.dischargedKg),
        },
        siloBalanceAfterKg: result.newStock,
        purchaseRequestClosed: result.triggeredReorderClose,
        warnings,
        socketBroadcast: {
          event: "inventory:tipper_intake",
          rooms: ["inventory", "batch-plant", "dispatch"],
          payload: {
            intakeNumber,
            siloCode: result.silo.siloCode,
            dischargedKg: result.dischargedKg,
            newStockKg: result.newStock,
            timestamp: new Date().toISOString(),
          },
        },
      },
      d.qcPassed
        ? `✅ ${intakeNumber}: ${r2(result.dischargedKg)} kg of ${result.silo.materialCategory} discharged into ${result.silo.siloCode} (now ${r2(result.newStock)} kg).${warnings.length ? ` ⚠️ ${warnings.length} warning(s).` : ""}`
        : `🚫 ${intakeNumber}: load REJECTED at QC. No material credited to ${result.silo.siloCode}.`,
      201
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "SILO_NOT_FOUND") {
      return errorResponse("SILO_NOT_FOUND", "Destination silo not found", 404);
    }
    if (msg === "SILO_INACTIVE") {
      return errorResponse("SILO_INACTIVE", "Destination silo is inactive", 409);
    }
    return errorResponse("INTAKE_FAILED", msg, 422);
  }
}

// ─── GET — intake history + supply chain KPIs ────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30")));
  const siloId = url.searchParams.get("siloId");
  const since = new Date(Date.now() - days * 86400_000);

  const conditions = [
    gte(tipperIntakeLogs.weighedInAt, since),
    eq(tipperIntakeLogs.tenantId, auth.user.tenantId),
  ];
  if (siloId) conditions.push(eq(tipperIntakeLogs.siloId, siloId));

  const intakes = await db
    .select({
      id: tipperIntakeLogs.id,
      intakeNumber: tipperIntakeLogs.intakeNumber,
      status: tipperIntakeLogs.status,
      materialCategory: tipperIntakeLogs.materialCategory,
      grossWeightKg: tipperIntakeLogs.grossWeightKg,
      netWeightKg: tipperIntakeLogs.netWeightKg,
      dischargedWeightKg: tipperIntakeLogs.dischargedWeightKg,
      siloBalanceAfterKg: tipperIntakeLogs.siloBalanceAfterKg,
      supplierName: tipperIntakeLogs.supplierName,
      moistureContentPct: tipperIntakeLogs.moistureContentPct,
      qcPassed: tipperIntakeLogs.qcPassed,
      totalCostSar: tipperIntakeLogs.totalCostSar,
      weighedInAt: tipperIntakeLogs.weighedInAt,
      tipperCode: fleetVehicles.vehicleCode,
      siloCode: inventorySilos.siloCode,
      receivedByName: users.fullName,
    })
    .from(tipperIntakeLogs)
    .innerJoin(fleetVehicles, eq(tipperIntakeLogs.tipperVehicleId, fleetVehicles.id))
    .innerJoin(inventorySilos, eq(tipperIntakeLogs.siloId, inventorySilos.id))
    .innerJoin(users, eq(tipperIntakeLogs.receivedById, users.id))
    .where(and(...conditions))
    .orderBy(desc(tipperIntakeLogs.weighedInAt))
    .limit(100);

  const discharged = intakes.filter((i) => i.qcPassed);
  const totalTonnes = discharged.reduce(
    (s, i) => s + parseFloat(i.dischargedWeightKg ?? "0") / 1000,
    0
  );
  const rejected = intakes.filter((i) => !i.qcPassed).length;
  const totalCost = intakes.reduce((s, i) => s + (i.totalCostSar ?? 0), 0);

  // Tonnage per material category
  const byMaterial = new Map<string, number>();
  for (const i of discharged) {
    const t = parseFloat(i.dischargedWeightKg ?? "0") / 1000;
    byMaterial.set(i.materialCategory, (byMaterial.get(i.materialCategory) ?? 0) + t);
  }

  return successResponse(
    {
      intakes,
      kpis: {
        windowDays: days,
        totalLoads: intakes.length,
        dischargedLoads: discharged.length,
        rejectedLoads: rejected,
        rejectionRatePct:
          intakes.length > 0 ? r2((rejected / intakes.length) * 100) : 0,
        totalTonnesDelivered: r2(totalTonnes),
        totalCostSar: totalCost,
        avgCostPerTonneSar:
          totalTonnes > 0 ? Math.round(totalCost / totalTonnes) : 0,
        silosServed: new Set(intakes.map((i) => i.siloCode)).size,
      },
      tonnageByMaterial: Array.from(byMaterial.entries())
        .map(([materialCategory, tonnes]) => ({ materialCategory, tonnes: r2(tonnes) }))
        .sort((a, b) => b.tonnes - a.tonnes),
    },
    `${intakes.length} tipper intake(s) in ${days} day(s): ${r2(totalTonnes)} t delivered, ${rejected} rejected.`
  );
}
