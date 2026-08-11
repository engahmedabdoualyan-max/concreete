/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/inventory — Raw Material Silo Management
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/inventory   — Current stock levels, low-stock alerts
 *  POST /api/inventory   — Record a stock receipt (resupply)
 *  POST /api/inventory/adjust — Manual stock adjustment (admin only)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { inventorySilos, inventoryTransactions, users, auditLogs } from "@/db/schema";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── GET /api/inventory ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;

  // All silos with stock percentages
  const silos = await db
    .select()
    .from(inventorySilos)
    .where(eq(inventorySilos.isActive, true))
    .orderBy(inventorySilos.materialCategory);

  const enrichedSilos = silos.map((silo) => {
    const capacity = parseFloat(silo.capacityKg ?? "0");
    const current = parseFloat(silo.currentStockKg ?? "0");
    const reorderLevel = parseFloat(silo.reorderLevelKg ?? "0");
    const stockPct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;
    const daysRemaining = current > 0 && capacity > 0
      ? Math.round((current / capacity) * 30) // rough estimate
      : 0;

    return {
      ...silo,
      stockPct,
      daysRemaining,
      isLowStock: current <= reorderLevel,
      isCritical: current <= reorderLevel * 0.5,
    };
  });

  // Low-stock alerts
  const lowStockSilos = enrichedSilos.filter((s) => s.isLowStock);

  // Recent transactions
  const recentTransactions = await db
    .select({
      id: inventoryTransactions.id,
      transactionType: inventoryTransactions.transactionType,
      quantityKg: inventoryTransactions.quantityKg,
      balanceAfterKg: inventoryTransactions.balanceAfterKg,
      createdAt: inventoryTransactions.createdAt,
      notes: inventoryTransactions.notes,
      siloCode: inventorySilos.siloCode,
      siloName: inventorySilos.siloName,
      performedByName: users.fullName,
    })
    .from(inventoryTransactions)
    .innerJoin(inventorySilos, eq(inventoryTransactions.siloId, inventorySilos.id))
    .leftJoin(users, eq(inventoryTransactions.performedById, users.id))
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(30);

  return successResponse({
    silos: enrichedSilos,
    alerts: {
      lowStockCount: lowStockSilos.length,
      criticalSilos: enrichedSilos.filter((s) => s.isCritical),
      lowStockSilos: lowStockSilos,
    },
    recentTransactions,
  });
}

// ─── POST /api/inventory (stock receipt) ─────────────────────────────────────

const StockReceiptSchema = z.object({
  siloId: z.string().uuid("Invalid silo ID"),
  quantityKg: z.number().positive("Quantity must be positive"),
  referenceDoc: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_RECEIVE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = StockReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid receipt data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const siloRows = await db
    .select()
    .from(inventorySilos)
    .where(eq(inventorySilos.id, parsed.data.siloId))
    .limit(1);

  if (siloRows.length === 0) return errorResponse("NOT_FOUND", "Silo not found", 404);

  const silo = siloRows[0];
  const currentStock = parseFloat(silo.currentStockKg ?? "0");
  const capacity = parseFloat(silo.capacityKg ?? "0");
  const newStock = Math.min(capacity, currentStock + parsed.data.quantityKg);

  if (newStock >= capacity) {
    return errorResponse(
      "SILO_FULL",
      `Silo ${silo.siloCode} would overflow. Capacity: ${capacity}kg, Current: ${currentStock}kg, Adding: ${parsed.data.quantityKg}kg`,
      422
    );
  }

  await db
    .update(inventorySilos)
    .set({ currentStockKg: newStock.toFixed(3), updatedAt: new Date() })
    .where(eq(inventorySilos.id, parsed.data.siloId));

  await db.insert(inventoryTransactions).values({
    siloId: parsed.data.siloId,
    tenantId: silo.tenantId,
    transactionType: "RECEIPT",
    quantityKg: parsed.data.quantityKg.toFixed(3),
    balanceAfterKg: newStock.toFixed(3),
    referenceDoc: parsed.data.referenceDoc,
    performedById: auth.user.sub,
    notes: parsed.data.notes,
  });

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: silo.tenantId,
    action: "INVENTORY_RECEIPT",
    entityType: "inventory_silos",
    entityId: parsed.data.siloId,
    previousState: { stockKg: currentStock },
    newState: { stockKg: newStock, addedKg: parsed.data.quantityKg },
  });

  return successResponse(
    {
      siloId: parsed.data.siloId,
      siloCode: silo.siloCode,
      previousStockKg: currentStock,
      addedKg: parsed.data.quantityKg,
      newStockKg: newStock,
      capacityKg: capacity,
      fillPct: Math.round((newStock / capacity) * 100),
    },
    `Stock receipt recorded for ${silo.siloCode}. New stock: ${newStock.toFixed(0)}kg.`,
    201
  );
}
