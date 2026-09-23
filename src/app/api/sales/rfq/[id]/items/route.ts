/**
 * ============================================================
 *  GET  /api/sales/rfq/[id]/items  — Quotation items
 *  POST /api/sales/rfq/[id]/items  — Add item (DRAFT only)
 * ============================================================
 *  RBAC: ORDER_CREATE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getRfq, addRfqItem } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_RFQ_ID", "RFQ ID must be a valid UUID", 400);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const rfq = await getRfq(auth.user.tenantId, id);
    if (!rfq) return errorResponse("RFQ_NOT_FOUND", "Quotation not found", 404);
    return successResponse({ items: rfq.items }, `${rfq.items.length} item(s)`);
  } catch (err) {
    console.error("[GET /api/sales/rfq/:id/items]", err);
    return errorResponse("RFQ_ERROR", "Failed to load items", 500);
  }
}

const AddItemSchema = z.object({
  mixDesignId: z.string().uuid(),
  volumeM3: z.number().positive().max(100000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = AddItemSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid item payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const item = await addRfqItem(auth.user.tenantId, id, parsed.data);
    return successResponse(item, "Item added", 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Add failed";
    return errorResponse("RFQ_ITEM_BLOCKED", message, 409);
  }
}
