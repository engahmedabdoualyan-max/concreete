/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  GET /api/orders/[orderId] — Single order detail with joins
 *  Used by the Sales Rep mobile app order-tracking screen.
 *  Scoped to the caller's tenant; sales reps can only read
 *  orders they created.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { orders, clients, deliverySites, mixDesigns, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

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

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Sar: orders.pricePerM3Sar,
      scheduledDate: orders.scheduledDate,
      paperClearanceGranted: orders.paperClearanceGranted,
      financeApprovedAt: orders.financeApprovedAt,
      financeRejectionReason: orders.financeRejectionReason,
      createdByRepId: orders.createdByRepId,
      createdAt: orders.createdAt,
      companyName: clients.companyName,
      clientCode: clients.clientCode,
      siteName: deliverySites.siteName,
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
      repName: users.fullName,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .innerJoin(mixDesigns, eq(orders.mixDesignId, mixDesigns.id))
    .innerJoin(users, eq(orders.createdByRepId, users.id))
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, auth.user.tenantId)))
    .limit(1);

  if (rows.length === 0) {
    return errorResponse("ORDER_NOT_FOUND", "Order not found", 404);
  }

  const order = rows[0];

  // Sales reps can only read their own orders.
  if (auth.user.role === "SALES_REP" && order.createdByRepId !== auth.user.sub) {
    return errorResponse("FORBIDDEN", "You can only view your own orders", 403);
  }

  return successResponse(order);
}
