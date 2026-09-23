/**
 * ============================================================
 *  GET /api/sustainability/order/[orderId] — Order footprint
 * ============================================================
 *  Computes materials + haul CO2e and saves the snapshot.
 *  RBAC: ORDER_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { computeOrderFootprint } from "@/lib/services/sustainability.service";

export const dynamic = "force-dynamic";

export async function GET(
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
    const footprint = await computeOrderFootprint(auth.user.tenantId, orderId, true);
    if (!footprint) return errorResponse("ORDER_NOT_FOUND", "Order not found", 404);
    return successResponse(footprint, "Carbon footprint");
  } catch (err) {
    console.error("[GET /api/sustainability/order/:id]", err);
    return errorResponse("CARBON_ERROR", "Computation failed", 500);
  }
}
