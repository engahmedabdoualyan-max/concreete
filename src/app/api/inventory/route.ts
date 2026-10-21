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
import { inventorySilos, inventoryTransactions, users, auditLogs, plants, sites } from "@/db/schema";
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

  const url = new URL(req.url);
  const plantId = url.searchParams.get("plantId");
  const siteId = url.searchParams.get("siteId");

  // Build where conditions
  const conditions = [
    eq(inventorySilos.isActive, true),
    eq(inventorySilos.tenantId, auth.user.tenantId)
  ];
  if (plantId) conditions.push(eq(inventorySilos.plantId, plantId));
  if (siteId) {
    // Join plants to filter by site
  }

  // All silos with stock percentages and plant/site info
  const silos = await db
    .select({
      silo: inventorySilos,
      plant: plants,
      site: sites,
    })
    .from(inventorySilos)
    .leftJoin(plants, eq(inventorySilos.plantId, plants.id))
    .leftJoin(sites, eq(plants.siteId, sites.id))
    .where(and(...conditions))
    .orderBy(inventorySilos.materialCategory);

  const enrichedSilos = silos.map(({ silo, plant, site }) => {
    const capacity = parseFloat(silo.capacityKg ?? "0");
    const current = parseFloat(silo.currentStockKg ?? "0");
    const reorderLevel = parseFloat(silo.reorderLevelKg ?? "0");
    const stockPct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;
    const daysRemaining = current > 0 && capacity > 0
      ? Math.round((current / capacity) * 30)
      : 0;

    return {
      ...silo,
      stockPct,
      daysRemaining,
      isLowStock: current <= reorderLevel,
      isCritical: current <= reorderLevel * 0.5,
      plant: plant ? { id: plant.id, plantCode: plant.plantCode, plantName: plant.plantName, plantType: plant.plantType } : null,
      site: site ? { id: site.id, siteCode: site.siteCode, siteName: site.siteName } : null,
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
    .leftJoin(
      users,
      and(
        eq(inventoryTransactions.performedById, users.id),
        eq(users.tenantId, auth.user.tenantId)
      )
    )
    .where(
      and(
        eq(inventoryTransactions.tenantId, auth.user.tenantId),
        eq(inventorySilos.tenantId, auth.user.tenantId)
      )
    )
    .orderBy(desc(inventoryTransactions.createdAt))
    .limit(30);

  // Get plants for filter dropdown
  const allPlants = await db
    .select({
      id: plants.id,
      plantCode: plants.plantCode,
      plantName: plants.plantName,
      plantType: plants.plantType,
      siteId: plants.siteId,
    })
    .from(plants)
    .where(and(eq(plants.tenantId, auth.user.tenantId), eq(plants.isActive, true)))
    .orderBy(plants.plantType, plants.plantName);

  // Get sites for filter dropdown
  const allSites = await db
    .select({
      id: sites.id,
      siteCode: sites.siteCode,
      siteName: sites.siteName,
    })
    .from(sites)
    .where(and(eq(sites.tenantId, auth.user.tenantId), eq(sites.isActive, true)))
    .orderBy(sites.siteName);

  return successResponse({
    silos: enrichedSilos,
    plants: allPlants,
    sites: allSites,
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
    .where(
      and(
        eq(inventorySilos.id, parsed.data.siloId),
        eq(inventorySilos.tenantId, auth.user.tenantId)
      )
    )
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
    .where(
      and(
        eq(inventorySilos.id, parsed.data.siloId),
        eq(inventorySilos.tenantId, auth.user.tenantId)
      )
    );

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
