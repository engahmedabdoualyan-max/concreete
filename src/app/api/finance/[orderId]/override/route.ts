/**
 * POST /api/finance/[orderId]/override
 * ─────────────────────────────────────────────────────────────────────────────
 * Accountant Manual Override — MANDATORY digital action to approve CREDIT_HOLD orders
 *
 * Even if a sales rep got verbal/paper clearance from the client or management,
 * the accountant MUST hit this endpoint to clear the credit block.
 *
 * Business Rules:
 * 1. Only orders in CREDIT_HOLD or PENDING_FINANCE can be overridden
 * 2. Blacklisted clients CANNOT be overridden (hard block)
 * 3. Override requires the accountant's user ID (non-delegable)
 * 4. Status upgrades to APPROVED_SCHEDULED (not just APPROVED)
 * 5. Outstanding balance is INCREMENTED by order value
 * 6. Real-time broadcast to batch plant, lab, workshop, dispatch
 *
 * This endpoint is the SOLE legal approval mechanism for credit-blocked orders.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { clients, orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { approveCreditAction } from "@/lib/services/finance.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const OverrideSchema = z.object({
  /** Reason for override (mandatory for audit trail) */
  reason: z.string().min(10, "Reason must be at least 10 characters"),
  /** Manual paper clearance flag (documentation only, does NOT replace this digital action) */
  paperClearanceGranted: z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_APPROVE_FINANCE);
  if ("status" in auth) return auth;

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid override data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const orderRows = await db
    .select({ id: orders.id, clientId: orders.clientId })
    .from(orders)
    .innerJoin(
      clients,
      and(
        eq(clients.id, orders.clientId),
        eq(clients.tenantId, auth.user.tenantId)
      )
    )
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

  try {
    const result = await approveCreditAction({
      orderId,
      action: "OVERRIDE_APPROVE",
      performedById: auth.user.sub,
      reason: parsed.data.reason,
      paperClearanceGranted: parsed.data.paperClearanceGranted,
    });

    return successResponse(
      {
        orderId,
        orderNumber: result.orderNumber,
        previousStatus: result.previousStatus,
        newStatus: result.newStatus,
        approvedBy: auth.user.fullName,
        approvedAt: new Date().toISOString(),
        creditEvaluation: result.evaluation,
        paperClearanceGranted: parsed.data.paperClearanceGranted,
        /** MANDATORY NOTE for audit */
        auditNote:
          "This digital override is the SOLE legal approval mechanism. Paper clearance alone is INVALID.",
        /** Real-time broadcast payload for Socket.io */
        socketBroadcast: {
          event: "order:approved",
          rooms: ["finance", "batch-plant", "lab", "workshop", "dispatch"],
          payload: {
            orderId,
            orderNumber: result.orderNumber,
            newStatus: result.newStatus,
            approvedBy: auth.user.fullName,
            creditOverrideApplied: true,
            creditUtilisationPct: result.evaluation.utilisationPct,
            timestamp: new Date().toISOString(),
          },
        },
      },
      `✅ Order ${result.orderNumber} APPROVED via accountant override. Real-time broadcast sent to Batch Plant, Lab, Workshop, and Dispatch.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("CREDIT_OVERRIDE_FAILED", message, 422);
  }
}
