/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Finance Service — Credit Evaluation & CREDIT_HOLD Workflow
 * ============================================================
 *
 *  PIPELINE BUSINESS RULES:
 *  ─────────────────────────────────────────────────────────
 *  1. Sales rep submits order → status: PENDING_FINANCE
 *  2. System evaluates credit limit:
 *     headroom = credit_limit - outstanding_balance
 *     If order_value > headroom → CREDIT_HOLD
 *     Else → APPROVED
 *  3. CREDIT_HOLD blocks production. Order is frozen.
 *  4. Even if paper clearance given verbally, the accountant
 *     MUST hit approveCreditAction endpoint to override.
 *  5. On override → status upgrades to APPROVED_SCHEDULED
 *  6. Real-time broadcast to batch plant dashboard via Socket.io
 *
 *  This module also handles:
 *  • Outstanding balance updates on order delivery
 *  • Credit limit snapshot for audit trail
 *  • Blacklist enforcement
 * ============================================================
 */

import { db } from "@/db";
import {
  orders,
  clients,
  financeActions,
  auditLogs,
} from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreditEvaluation {
  clientId: string;
  companyName: string;
  creditLimitSar: number;
  outstandingBalanceSar: number;
  /** Calculated available headroom */
  headroomSar: number;
  /** Utilization as percentage */
  utilisationPct: number;
  /** Whether the client is on the blacklist */
  isBlacklisted: boolean;
  /** Open orders value (sum of PENDING_FINANCE orders not yet in outstanding) */
  pendingOrdersValueSar: number;
  /** Result of the evaluation */
  decision: "APPROVE" | "CREDIT_HOLD" | "REJECT";
  /** Reason for decision */
  decisionReason: string;
  /** If CREDIT_HOLD, how much the order exceeds headroom */
  excessAmountSar?: number;
}

export interface CreditActionParams {
  orderId: string;
  action: "OVERRIDE_APPROVE" | "REJECT" | "HOLD";
  performedById: string;
  reason?: string;
  /** Manual paper clearance flag (does NOT replace this digital action) */
  paperClearanceGranted?: boolean;
}

// ─── Credit Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluates a client's credit status against a proposed order value.
 * Aggregates:
 * 1. outstanding_balance_sar (current unpaid invoices)
 * 2. pending_orders (orders in PENDING_FINANCE that haven't been added to outstanding)
 * 3. credit_limit_sar (the maximum allowed debt)
 *
 * Returns a decision:
 * - APPROVE: headroom sufficient, no blacklist, no holds
 * - CREDIT_HOLD: headroom breached, but client not blacklisted — can be overridden by accountant
 * - REJECT: blacklisted or permanently blocked
 */
export async function evaluateCustomerCredit(
  clientId: string,
  proposedOrderValueSar: number
): Promise<CreditEvaluation> {
  const clientRows = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      creditLimitSar: clients.creditLimitSar,
      outstandingBalanceSar: clients.outstandingBalanceSar,
      isBlacklisted: clients.isBlacklisted,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (clientRows.length === 0) {
    throw new Error(`Client not found: ${clientId}`);
  }

  const client = clientRows[0];

  // Sum pending finance orders for this client (not yet in outstanding balance)
  const pendingOrders = await db
    .select({
      totalValueSar: sql<number>`COALESCE(SUM(CAST(total_volume_m3 AS DECIMAL) * price_per_m3_sar), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.clientId, clientId),
        eq(orders.status, "PENDING_FINANCE")
      )
    );

  const pendingValueSar = pendingOrders[0]?.totalValueSar ?? 0;

  // Calculate projected balance (current outstanding + pending + proposed)
  const projectedBalance =
    client.outstandingBalanceSar + pendingValueSar + proposedOrderValueSar;
  const headroom = client.creditLimitSar - client.outstandingBalanceSar - pendingValueSar;
  const utilisation =
    client.creditLimitSar > 0
      ? Math.round(
          ((client.outstandingBalanceSar + pendingValueSar) / client.creditLimitSar) * 100
        )
      : 100;

  // Decision logic
  let decision: "APPROVE" | "CREDIT_HOLD" | "REJECT";
  let decisionReason: string;
  let excessAmountSar: number | undefined;

  if (client.isBlacklisted) {
    decision = "REJECT";
    decisionReason = `Client ${client.companyName} is blacklisted. No new orders permitted.`;
  } else if (headroom <= 0) {
    decision = "REJECT";
    decisionReason = `Client already at or above credit limit. Outstanding: SAR ${client.outstandingBalanceSar.toLocaleString()}, Limit: SAR ${client.creditLimitSar.toLocaleString()}. Requires full payment before new orders.`;
  } else if (projectedBalance > client.creditLimitSar) {
    decision = "CREDIT_HOLD";
    excessAmountSar = projectedBalance - client.creditLimitSar;
    decisionReason = `Proposed order (SAR ${proposedOrderValueSar.toLocaleString()}) would push balance to SAR ${projectedBalance.toLocaleString()}, exceeding credit limit by SAR ${excessAmountSar.toLocaleString()}. Order placed on CREDIT_HOLD pending accountant override.`;
  } else {
    decision = "APPROVE";
    decisionReason = `Sufficient headroom: SAR ${headroom.toLocaleString()} available after this order.`;
  }

  return {
    clientId,
    companyName: client.companyName,
    creditLimitSar: client.creditLimitSar,
    outstandingBalanceSar: client.outstandingBalanceSar,
    headroomSar: headroom,
    utilisationPct: utilisation,
    isBlacklisted: client.isBlacklisted,
    pendingOrdersValueSar: pendingValueSar,
    decision,
    decisionReason,
    excessAmountSar,
  };
}

// ─── Apply Order Decision ─────────────────────────────────────────────────────

/**
 * Applies the credit evaluation decision to an order.
 * Called automatically when an order transitions to PENDING_FINANCE.
 */
export async function applyCreditEvaluationToOrder(orderId: string): Promise<{
  newStatus: "APPROVED" | "CREDIT_HOLD" | "FINANCE_REJECTED";
  evaluation: CreditEvaluation;
}> {
  const orderRows = await db
    .select({
      id: orders.id,
      tenantId: orders.tenantId,
      clientId: orders.clientId,
      totalVolumeM3: orders.totalVolumeM3,
      pricePerM3Sar: orders.pricePerM3Sar,
      status: orders.status,
      orderNumber: orders.orderNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderRows.length === 0) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const order = orderRows[0];

  if (order.status !== "PENDING_FINANCE") {
    throw new Error(`Order is not in PENDING_FINANCE state (current: ${order.status})`);
  }

  const orderValue =
    parseFloat(order.totalVolumeM3 ?? "0") * order.pricePerM3Sar;

  const evaluation = await evaluateCustomerCredit(order.clientId, orderValue);

  let newStatus: "APPROVED" | "CREDIT_HOLD" | "FINANCE_REJECTED";

  switch (evaluation.decision) {
    case "APPROVE":
      newStatus = "APPROVED";
      break;
    case "CREDIT_HOLD":
      newStatus = "CREDIT_HOLD";
      break;
    case "REJECT":
      newStatus = "FINANCE_REJECTED";
      break;
  }

  await db
    .update(orders)
    .set({
      status: newStatus,
      financeRejectionReason:
        newStatus === "FINANCE_REJECTED" ? evaluation.decisionReason : undefined,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  // Log finance action
  await db.insert(financeActions).values({
    orderId,
    tenantId: orderRows[0].tenantId,
    performedById: "00000000-0000-0000-0000-000000000000", // System
    action: evaluation.decision === "APPROVE" ? "APPROVE" : 
            evaluation.decision === "CREDIT_HOLD" ? "CREDIT_HOLD" : "REJECT",
    creditLimitSnapshot: evaluation.creditLimitSar,
    outstandingBalanceSnapshot: evaluation.outstandingBalanceSar,
    notes: `[SYSTEM] ${evaluation.decisionReason}`,
  });

  return { newStatus, evaluation };
}

// ─── Accountant Override (CREDIT_HOLD → APPROVED_SCHEDULED) ───────────────────

/**
 * Approves a CREDIT_HOLD order via accountant override.
 * This is the MANDATORY digital step — paper clearance alone is invalid.
 *
 * On approval:
 * 1. Status upgrades to APPROVED_SCHEDULED
 * 2. Outstanding balance is INCREASED by the order value (since it's now approved)
 * 3. Finance action logged with OVERRIDE_APPROVE
 * 4. Real-time broadcast to batch plant, lab, dispatch, workshop
 */
export async function approveCreditAction(
  params: CreditActionParams
): Promise<{
  orderId: string;
  orderNumber: string;
  previousStatus: string;
  newStatus: "APPROVED_SCHEDULED";
  evaluation: CreditEvaluation;
  auditAction: string;
}> {
  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      tenantId: orders.tenantId,
      clientId: orders.clientId,
      totalVolumeM3: orders.totalVolumeM3,
      pricePerM3Sar: orders.pricePerM3Sar,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, params.orderId))
    .limit(1);

  if (orderRows.length === 0) {
    throw new Error(`Order not found: ${params.orderId}`);
  }

  const order = orderRows[0];

  // Only CREDIT_HOLD orders can be overridden
  if (order.status !== "CREDIT_HOLD" && order.status !== "PENDING_FINANCE") {
    throw new Error(
      `Order cannot be overridden — current status is ${order.status}. Only CREDIT_HOLD or PENDING_FINANCE orders can be approved.`
    );
  }

  // Blacklist hard-block — even accountants cannot override
  const clientRows = await db
    .select({ isBlacklisted: clients.isBlacklisted, companyName: clients.companyName })
    .from(clients)
    .where(eq(clients.id, order.clientId))
    .limit(1);

  if (clientRows.length > 0 && clientRows[0].isBlacklisted) {
    throw new Error(
      `BLOCKED: ${clientRows[0].companyName} is blacklisted. Even accountant override cannot approve this order. Only Super Admin can lift the blacklist.`
    );
  }

  // Re-evaluate to get current state
  const orderValue =
    parseFloat(order.totalVolumeM3 ?? "0") * order.pricePerM3Sar;
  const evaluation = await evaluateCustomerCredit(order.clientId, orderValue);

  // Update order to APPROVED_SCHEDULED
  await db
    .update(orders)
    .set({
      status: "APPROVED_SCHEDULED",
      financeOfficerId: params.performedById,
      financeApprovedAt: new Date(),
      paperClearanceGranted: params.paperClearanceGranted ?? false,
      financeRejectionReason: undefined, // Clear any previous rejection reason
      updatedAt: new Date(),
    })
    .where(eq(orders.id, params.orderId));

  // Add order value to client's outstanding balance (now approved)
  // Use atomic increment to avoid race conditions
  await db
    .update(clients)
    .set({
      outstandingBalanceSar: sql`outstanding_balance_sar + ${orderValue}`,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, order.clientId));

  // Log finance action
  await db.insert(financeActions).values({
    orderId: params.orderId,
    tenantId: order.tenantId,
    performedById: params.performedById,
    action: "OVERRIDE_APPROVE",
    creditLimitSnapshot: evaluation.creditLimitSar,
    outstandingBalanceSnapshot: evaluation.outstandingBalanceSar,
    notes: params.reason ?? "Accountant manual override of CREDIT_HOLD",
  });

  // Audit log
  await db.insert(auditLogs).values({
    userId: params.performedById,
    tenantId: order.tenantId,
    action: "CREDIT_OVERRIDE_APPROVED",
    entityType: "orders",
    entityId: params.orderId,
    previousState: { status: order.status },
    newState: {
      status: "APPROVED_SCHEDULED",
      orderValueSar: orderValue,
      paperClearanceGranted: params.paperClearanceGranted ?? false,
      creditHeadroomAtApproval: evaluation.headroomSar,
      creditUtilisationPct: evaluation.utilisationPct,
    },
    socketEvent: "order:approved",
  });

  return {
    orderId: params.orderId,
    orderNumber: order.orderNumber,
    previousStatus: order.status,
    newStatus: "APPROVED_SCHEDULED",
    evaluation,
    auditAction: "CREDIT_OVERRIDE_APPROVED",
  };
}

// ─── Credit Hold Expiry ───────────────────────────────────────────────────────

/**
 * Cancels orders that have been in CREDIT_HOLD for too long (configurable).
 * Returns the count of orders cancelled.
 */
export async function expireCreditHeldOrders(
  maxHoldHours = 72
): Promise<{ cancelledCount: number; orderNumbers: string[] }> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - maxHoldHours);

  // Find orders that have been in CREDIT_HOLD past the cutoff
  const staleOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      tenantId: orders.tenantId,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "CREDIT_HOLD"),
        sql`updated_at < ${cutoffDate.toISOString()}::timestamptz`
      )
    );

  const orderNumbers: string[] = [];

  for (const order of staleOrders) {
    await db
      .update(orders)
      .set({
        status: "CANCELLED",
        financeRejectionReason: `Auto-cancelled: held in CREDIT_HOLD for more than ${maxHoldHours} hours`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    orderNumbers.push(order.orderNumber);

    await db.insert(auditLogs).values({
      action: "CREDIT_HOLD_EXPIRED",
      tenantId: order.tenantId,
      entityType: "orders",
      entityId: order.id,
      previousState: { status: "CREDIT_HOLD" },
      newState: { status: "CANCELLED", reason: `Hold timeout: ${maxHoldHours}h exceeded` },
    });
  }

  return { cancelledCount: staleOrders.length, orderNumbers };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Gets the finance queue: all orders in PENDING_FINANCE + CREDIT_HOLD states
 * with full client credit details.
 */
export async function getFinanceQueue() {
  return db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalVolumeM3: orders.totalVolumeM3,
      pricePerM3Sar: orders.pricePerM3Sar,
      scheduledDate: orders.scheduledDate,
      createdAt: orders.createdAt,
      paperClearanceGranted: orders.paperClearanceGranted,
      // Client
      clientId: clients.id,
      companyName: clients.companyName,
      creditLimitSar: clients.creditLimitSar,
      outstandingBalanceSar: clients.outstandingBalanceSar,
      isBlacklisted: clients.isBlacklisted,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(
      sql`${orders.status} IN ('PENDING_FINANCE', 'CREDIT_HOLD')`
    );
}
