/**
 * ============================================================
 *  PUT    /api/sales/rfq/items/[itemId]  — Costing / quote edit
 *  DELETE /api/sales/rfq/items/[itemId]  — Remove (DRAFT only)
 * ============================================================
 *  PUT body: { volumeM3?, materialCostPerM3?, haulCostPerM3?,
 *    pumpCostPerM3?, overheadCostPerM3?, marginPct?,
 *    quotedPricePerM3?, autoMaterial? }
 *  Total + floor recomputed server-side on every edit.
 *  RBAC: ORDER_CREATE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateRfqItem, deleteRfqItem } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_ITEM_ID", "Item ID must be a valid UUID", 400);
}

const UpdateItemSchema = z.object({
  volumeM3: z.number().positive().max(100000).optional(),
  materialCostPerM3: z.number().nonnegative().max(100000).optional(),
  haulCostPerM3: z.number().nonnegative().max(100000).optional(),
  pumpCostPerM3: z.number().nonnegative().max(100000).optional(),
  overheadCostPerM3: z.number().nonnegative().max(100000).optional(),
  marginPct: z.number().min(0).max(1000).optional(),
  quotedPricePerM3: z.number().nonnegative().max(100000).optional(),
  autoMaterial: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { itemId } = await params;
  if (!itemId || !UUID_RE.test(itemId)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid item payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateRfqItem(auth.user.tenantId, itemId, parsed.data);
    if (!updated) return errorResponse("ITEM_NOT_FOUND", "Item not found", 404);
    return successResponse(updated, "Item costed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return errorResponse("RFQ_ITEM_BLOCKED", message, 409);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { itemId } = await params;
  if (!itemId || !UUID_RE.test(itemId)) return badId();

  try {
    const ok = await deleteRfqItem(auth.user.tenantId, itemId);
    if (!ok)
      return errorResponse("RFQ_ITEM_BLOCKED", "Only DRAFT items can be removed", 409);
    return successResponse({ id: itemId }, "Item removed");
  } catch (err) {
    console.error("[DELETE /api/sales/rfq/items/:id]", err);
    return errorResponse("RFQ_ERROR", "Failed to remove item", 500);
  }
}
