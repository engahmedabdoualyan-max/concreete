/**
 * ============================================================
 *  GET /api/orders/by-ref?ref= — Resolve tree doc → ERP order
 * ============================================================
 *  Lets field screens (Firestore ids) open ERP features
 *  (magic-link portal, ETA, ZATCA) for the same commercial order.
 *  RBAC: ORDER_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref) return errorResponse("INVALID_REF", "ref query param is required", 400);

  try {
    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
      })
      .from(orders)
      .where(and(eq(orders.sourceRef, ref), eq(orders.tenantId, auth.user.tenantId)))
      .limit(1);
    if (!rows[0]) return errorResponse("NOT_FOUND", "No ERP order for this reference", 404);
    return successResponse(rows[0], "Order resolved");
  } catch (err) {
    console.error("[GET /api/orders/by-ref]", err);
    return errorResponse("ORDER_ERROR", "Lookup failed", 500);
  }
}
