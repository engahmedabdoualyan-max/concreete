/**
 * /api/inventory/purchase-requests
 * GET  — list purchase requests (+ silo info)
 * POST — generate a purchase request for a silo (manual reorder)
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { purchaseRequests, inventorySilos, users } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const GeneratePRSchema = z.object({
  siloId: z.string().uuid("Invalid silo"),
  quantityKg: z.number().positive("الكمية يجب أن تكون موجبة").optional(),
  notes: z.string().max(500).optional(),
});

async function nextPRNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const existing = await db
    .select({ prNumber: purchaseRequests.prNumber })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.tenantId, tenantId));
  let max = 0;
  for (const r of existing) {
    const m = r.prNumber.match(/PR-\d{4}-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;

  try {
    const rows = await db
      .select({
        pr: purchaseRequests,
        siloCode: inventorySilos.siloCode,
        siloName: inventorySilos.siloName,
        generatedByName: users.fullName,
      })
      .from(purchaseRequests)
      .innerJoin(inventorySilos, eq(purchaseRequests.siloId, inventorySilos.id))
      .leftJoin(users, eq(purchaseRequests.generatedById, users.id))
      .where(eq(purchaseRequests.tenantId, auth.user.tenantId))
      .orderBy(desc(purchaseRequests.createdAt))
      .limit(50);

    const open = rows.filter((r) => r.pr.status === "AUTO_GENERATED" || r.pr.status === "ACKNOWLEDGED");

    return successResponse({
      purchaseRequests: rows.map((r) => ({ ...r.pr, siloCode: r.siloCode, siloName: r.siloName, generatedByName: r.generatedByName })),
      openCount: open.length,
    });
  } catch (err) {
    console.error("[GET /api/inventory/purchase-requests]", err);
    return errorResponse("PR_FETCH_ERROR", "Failed to load purchase requests", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_RECEIVE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = GeneratePRSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const [silo] = await db
      .select()
      .from(inventorySilos)
      .where(and(eq(inventorySilos.id, parsed.data.siloId), eq(inventorySilos.tenantId, auth.user.tenantId)));
    if (!silo) return errorResponse("NOT_FOUND", "Silo not found", 404);

    const stock = parseFloat(silo.currentStockKg ?? "0");
    const reorderLevel = parseFloat(silo.reorderLevelKg ?? "0");
    const quantityKg = parsed.data.quantityKg ?? Math.max(0, reorderLevel * 1.5 - stock);

    const prNumber = await nextPRNumber(auth.user.tenantId);
    const [pr] = await db
      .insert(purchaseRequests)
      .values({
        tenantId: auth.user.tenantId,
        prNumber,
        siloId: silo.id,
        materialCategory: silo.materialCategory,
        requestedQuantityKg: quantityKg.toFixed(3),
        stockAtGenerationKg: silo.currentStockKg,
        reorderLevelKg: silo.reorderLevelKg,
        status: "AUTO_GENERATED",
        priority: stock <= reorderLevel * 0.5 ? "URGENT" : "NORMAL",
        generatedById: auth.user.sub,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    return successResponse({ pr }, `تم إنشاء طلب شراء ${prNumber}`);
  } catch (err) {
    console.error("[POST /api/inventory/purchase-requests]", err);
    return errorResponse("PR_CREATE_ERROR", "Failed to create purchase request", 500);
  }
}
