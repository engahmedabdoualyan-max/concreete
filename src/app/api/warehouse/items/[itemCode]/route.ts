/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/warehouse/items/[itemCode] — one item card, in full
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET    /api/warehouse/items/[itemCode]            — card + units + movements
 *  PATCH  /api/warehouse/items/[itemCode]            — edit the card
 *  POST   /api/warehouse/items/[itemCode]/units      — (units/route.ts)
 *
 *  This is the screen that settles the argument. It shows every movement the
 *  item has ever seen, which truck it went onto, and which work order justified
 *  it — so "I returned it because it went on" can be checked against the record
 *  rather than believed.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { warehouseItems, auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getItemCard } from "@/lib/services/warehouse.service";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ itemCode: string }> };

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_READ);
  if ("status" in auth) return auth;

  const { itemCode } = await ctx.params;
  const card = await getItemCard(auth.user.tenantId, decodeURIComponent(itemCode));
  if (!card) {
    return errorResponse("ITEM_NOT_FOUND", `No item card "${itemCode}".`, 404);
  }

  return successResponse(card, "Item card");
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

const PatchSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    nameAr: z.string().trim().max(160).nullable().optional(),
    category: z.enum(["SPARE_PART", "LUBRICANT", "CONSUMABLE", "SCRAP"]).optional(),
    unit: z.string().trim().max(20).optional(),
    minQty: z.number().min(0).optional(),
    unitCostSar: z.number().min(0).optional(),
    oemPartNumber: z.string().trim().max(80).nullable().optional(),
    appliesToMake: z.string().trim().max(80).nullable().optional(),
    appliesToModel: z.string().trim().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;

  const { itemCode } = await ctx.params;
  const code = decodeURIComponent(itemCode);

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid update.",
      400,
      parsed.error.flatten()
    );
  }

  const [existing] = await db
    .select()
    .from(warehouseItems)
    .where(
      and(eq(warehouseItems.tenantId, auth.user.tenantId), eq(warehouseItems.itemCode, code))
    )
    .limit(1);
  if (!existing) return errorResponse("ITEM_NOT_FOUND", `No item card "${code}".`, 404);

  const { minQty, unitCostSar, ...rest } = parsed.data;
  const [updated] = await db
    .update(warehouseItems)
    .set({
      ...rest,
      ...(minQty !== undefined ? { minQty: String(minQty) } : {}),
      ...(unitCostSar !== undefined ? { unitCostSar: String(unitCostSar) } : {}),
    })
    .where(eq(warehouseItems.id, existing.id))
    .returning();

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "WAREHOUSE_ITEM_UPDATED",
    entityType: "warehouse_items",
    entityId: existing.id,
    previousState: {
      name: existing.name,
      minQty: existing.minQty,
      unitCostSar: existing.unitCostSar,
      isActive: existing.isActive,
    },
    newState: parsed.data,
  });

  return successResponse(updated, "Item updated");
}
