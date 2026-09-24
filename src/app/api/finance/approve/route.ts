/**
 * POST /api/finance/approve
 * ─────────────────────────────────────────────────────────────────────────────
 * Electronic approval toggle for a pending order.
 *
 * BUSINESS RULES:
 * 1. Order must be in PENDING_FINANCE status
 * 2. Client must not be blacklisted
 * 3. Electronic approval is MANDATORY — manual paper clearance alone is invalid
 * 4. On approval → broadcasts real-time event to Lab, Workshop, Inventory, Dispatch
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { orders, clients, financeActions, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ApproveOrderSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  notes: z.string().max(500).optional(),
  /** Manual paper clearance acknowledgement (does NOT replace this digital toggle) */
  paperClearanceGranted: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_APPROVE_FINANCE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ApproveOrderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { orderId, notes, paperClearanceGranted } = parsed.data;

  // 1. Fetch the order with client data
  const orderRows = await db
    .select({
      id: orders.id,
      tenantId: orders.tenantId,
      status: orders.status,
      orderNumber: orders.orderNumber,
      clientId: orders.clientId,
      totalVolumeM3: orders.totalVolumeM3,
      pricePerM3Sar: orders.pricePerM3Sar,
    })
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (orderRows.length === 0) {
    return errorResponse("NOT_FOUND", "Order not found", 404);
  }

  const order = orderRows[0];

  if (order.status !== "PENDING_FINANCE") {
    return errorResponse(
      "INVALID_STATE",
      `Order cannot be approved in its current state: ${order.status}`,
      409
    );
  }

  // 2. Fetch client credit data
  const clientRows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      creditLimitSar: clients.creditLimitSar,
      outstandingBalanceSar: clients.outstandingBalanceSar,
      isBlacklisted: clients.isBlacklisted,
    })
    .from(clients)
    .where(
      and(
        eq(clients.id, order.clientId),
        eq(clients.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (clientRows.length === 0) {
    return errorResponse("CLIENT_NOT_FOUND", "Client record not found", 404);
  }

  const client = clientRows[0];

  // 3. Hard block: blacklisted clients
  if (client.isBlacklisted) {
    await db.insert(financeActions).values({
      orderId,
      tenantId: order.tenantId,
      performedById: auth.user.sub,
      action: "REJECT",
      creditLimitSnapshot: client.creditLimitSar,
      outstandingBalanceSnapshot: client.outstandingBalanceSar,
      notes: "SYSTEM: Auto-rejected — client is blacklisted",
    });

    return errorResponse(
      "CLIENT_BLACKLISTED",
      `${client.companyName} is blacklisted. Order cannot be approved. Contact the credit manager.`,
      403
    );
  }

  // 4. Credit limit check
  const orderValue = parseFloat(order.totalVolumeM3 ?? "0") * order.pricePerM3Sar;
  const projectedBalance = client.outstandingBalanceSar + orderValue;
  const wouldExceedLimit = projectedBalance > client.creditLimitSar;

  if (wouldExceedLimit && !paperClearanceGranted) {
    return errorResponse(
      "CREDIT_LIMIT_EXCEEDED",
      `Approval blocked: Order value (SAR ${orderValue.toLocaleString()}) would bring ${client.companyName}'s balance to SAR ${projectedBalance.toLocaleString()}, exceeding credit limit of SAR ${client.creditLimitSar.toLocaleString()}. Set paperClearanceGranted=true to override with documented justification.`,
      402,
      {
        creditLimitSar: client.creditLimitSar,
        outstandingBalanceSar: client.outstandingBalanceSar,
        orderValueSar: orderValue,
        projectedBalanceSar: projectedBalance,
        excessSar: projectedBalance - client.creditLimitSar,
      }
    );
  }

  // 5. Approve the order — electronic toggle
  await db
    .update(orders)
    .set({
      status: "APPROVED",
      financeOfficerId: auth.user.sub,
      financeApprovedAt: new Date(),
      paperClearanceGranted: paperClearanceGranted ?? false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, auth.user.tenantId)
      )
    );

  // 6. Log the finance action
  await db.insert(financeActions).values({
    orderId,
    tenantId: order.tenantId,
    performedById: auth.user.sub,
    action: wouldExceedLimit ? "MANUAL_OVERRIDE" : "APPROVE",
    creditLimitSnapshot: client.creditLimitSar,
    outstandingBalanceSnapshot: client.outstandingBalanceSar,
    notes:
      notes ??
      (wouldExceedLimit
        ? "Approved with manual override — paper clearance documented"
        : "Electronic approval granted"),
  });

  // 7. Audit log
  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: order.tenantId,
    action: "ORDER_FINANCE_APPROVED",
    entityType: "orders",
    entityId: orderId,
    previousState: { status: "PENDING_FINANCE" },
    newState: {
      status: "APPROVED",
      approvedBy: auth.user.fullName,
      creditOverride: wouldExceedLimit,
    },
    socketEvent: "order:approved",
  });

  // Tree-plane mirror (Epic 13 — best-effort)
  void import("@/lib/services/tree-sync.service")
    .then((m) => m.mirrorOrderById(order.tenantId, orderId))
    .catch(() => {});

  return successResponse(
    {
      orderId,
      orderNumber: order.orderNumber,
      newStatus: "APPROVED",
      approvedBy: auth.user.fullName,
      approvedAt: new Date().toISOString(),
      creditOverrideApplied: wouldExceedLimit,
      /** Real-time broadcast payload for Socket.io */
      socketBroadcast: {
        event: "order:approved",
        rooms: ["lab", "workshop", "inventory", "dispatch"],
        payload: {
          orderId,
          orderNumber: order.orderNumber,
          approvedBy: auth.user.fullName,
          timestamp: new Date().toISOString(),
        },
      },
    },
    `Order ${order.orderNumber} approved. Real-time notification sent to Lab, Workshop, Inventory, and Dispatch.`
  );
}
