/**
 * ============================================================
 *  POST /api/orders/[orderId]/mirror — Push snapshot to tree plane
 * ============================================================
 *  Best-effort mirror to tenants/{tenant}/erpMirror/{orderId}.
 *  No-op (ok:false, skipped) when Firebase is not configured.
 *  RBAC: ORDER_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { mirrorOrderById } from "@/lib/services/tree-sync.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const { orderId } = await params;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return errorResponse("INVALID_ORDER_ID", "Order ID must be a valid UUID", 400);
  }

  try {
    const mirrored = await mirrorOrderById(auth.user.tenantId, orderId);
    return successResponse(
      { orderId, mirrored },
      mirrored ? "Mirrored to tree plane" : "Mirror skipped (Firebase not configured)"
    );
  } catch (err) {
    console.error("[POST /api/orders/:id/mirror]", err);
    return errorResponse("MIRROR_FAILED", "Mirror failed", 500);
  }
}
