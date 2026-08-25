/**
 * /api/suppliers/purchase-orders/receive
 * POST { poId } — receive a PO: credits silo stock + creates inventory
 * transactions + posts a ledger entry. Idempotent-guarded.
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { receivePurchaseOrder } from "@/lib/services/suppliers.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ReceiveSchema = z.object({
  poId: z.string().uuid("Invalid purchase order"),
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

  const parsed = ReceiveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await receivePurchaseOrder(auth.user.tenantId, parsed.data.poId);
    return successResponse(result, "تم استلام الأمر وتحديث المخزون");
  } catch (err) {
    console.error("[POST /api/suppliers/purchase-orders/receive]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("PO_RECEIVE_ERROR", message, 500);
  }
}
