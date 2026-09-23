/**
 * POST /api/finance/reject
 * Rejects a pending order with a mandatory reason.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { orders, financeActions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RejectOrderSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_REJECT_FINANCE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = RejectOrderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { orderId, reason } = parsed.data;

  const orderRows = await db
    .select({
      id: orders.id,
      tenantId: orders.tenantId,
      status: orders.status,
      orderNumber: orders.orderNumber,
      clientId: orders.clientId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderRows.length === 0) return errorResponse("NOT_FOUND", "Order not found", 404);

  if (orderRows[0].status !== "PENDING_FINANCE") {
    return errorResponse("INVALID_STATE", `Order is not pending finance review (current: ${orderRows[0].status})`, 409);
  }

  await db
    .update(orders)
    .set({
      status: "FINANCE_REJECTED",
      financeOfficerId: auth.user.sub,
      financeRejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  await db.insert(financeActions).values({
    orderId,
    tenantId: orderRows[0].tenantId,
    performedById: auth.user.sub,
    action: "REJECT",
    notes: reason,
  });

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: orderRows[0].tenantId,
    action: "ORDER_FINANCE_REJECTED",
    entityType: "orders",
    entityId: orderId,
    previousState: { status: "PENDING_FINANCE" },
    newState: { status: "FINANCE_REJECTED", reason },
    socketEvent: "order:rejected",
  });

  // Tree-plane mirror (Epic 13 — best-effort)
  void import("@/lib/services/tree-sync.service")
    .then((m) => m.mirrorOrderById(orderRows[0].tenantId, orderId))
    .catch(() => {});

  return successResponse(
    {
      orderId,
      orderNumber: orderRows[0].orderNumber,
      newStatus: "FINANCE_REJECTED",
      rejectedBy: auth.user.fullName,
      reason,
      socketBroadcast: {
        event: "order:rejected",
        rooms: ["sales"],
        payload: { orderId, reason, rejectedBy: auth.user.fullName },
      },
    },
    `Order ${orderRows[0].orderNumber} has been rejected.`
  );
}
