/**
 * ============================================================
 *  PATCH /api/portal/requests/[requestId] — decide a customer request
 * ============================================================
 *  { "decision": "APPROVED" | "REJECTED", "note"?: string }
 *
 *  Approving a NEW_ORDER request materialises a real DRAFT order, which then
 *  walks the normal credit-check and finance gate like any other order. A
 *  public magic link can therefore never put a plant into debt.
 *
 *  RBAC: ORDER_CREATE — answering a customer is a sales action.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { portalRequests, clients, orders } from "@/db/schema";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ─── PATCH: approve or reject ───────────────────────────────────────────────

const DecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;
  const { requestId } = await params;
  if (!z.string().uuid().safeParse(requestId).success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request id", 400);
  }
  const rate = checkNextRateLimit(
    `portal-decision:${auth.user.tenantId}:${clientIpFromHeaders(req.headers)}`,
    60
  );
  if (!rate.allowed) {
    return errorResponse("RATE_LIMITED", "Too many decisions at once", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid decision", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const rows = await db
    .select()
    .from(portalRequests)
    .where(
      and(
        eq(portalRequests.id, requestId),
        eq(portalRequests.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);
  const request = rows[0];
  if (!request) return errorResponse("NOT_FOUND", "Request not found", 404);
  if (request.status !== "PENDING") {
    return errorResponse(
      "ALREADY_DECIDED",
      `This request was already ${request.status.toLowerCase()}`,
      409
    );
  }

  let createdOrderId: string | null = null;

  // Approving a new-delivery request materialises a real DRAFT order, which then
  // walks the normal credit + finance path. Nothing bypasses the gate.
  if (parsed.data.decision === "APPROVED" && request.requestType === "NEW_ORDER") {
    if (!request.deliverySiteId || !request.mixDesignId) {
      return errorResponse(
        "REQUEST_INCOMPLETE",
        "This request is missing the delivery site or the mix design, so it cannot become an order",
        409
      );
    }
    const volume = Number(request.requestedVolumeM3 ?? 0);
    if (volume <= 0) {
      return errorResponse("REQUEST_INCOMPLETE", "The requested volume is missing", 409);
    }
    const clientRows = await db
      .select({ companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.id, request.clientId))
      .limit(1);
    const orderNumber = `ORD-P-${Date.now().toString(36).toUpperCase()}`;
    const created = await db
      .insert(orders)
      .values({
        tenantId: request.tenantId,
        orderNumber,
        clientId: request.clientId,
        deliverySiteId: request.deliverySiteId,
        mixDesignId: request.mixDesignId,
        totalVolumeM3: String(volume),
        remainingVolumeM3: String(volume),
        pricePerM3Sar: 0, // set by sales; a portal request never invents a price
        scheduledDate:
          request.requestedDate ?? new Date(Date.now() + 86_400_000),
        status: "DRAFT",
        specialInstructions: request.note ?? null,
        createdByRepId: auth.user.sub,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    createdOrderId = created[0].id;
    await db
      .update(portalRequests)
      .set({
        status: "APPROVED",
        handledById: auth.user.sub,
        handledAt: new Date(),
        decisionNote:
          parsed.data.note ?? `Approved as ${created[0].orderNumber} for ${clientRows[0]?.companyName ?? "the client"}`,
        orderId: created[0].id,
        updatedAt: new Date(),
      })
      .where(eq(portalRequests.id, requestId));
  } else {
    await db
      .update(portalRequests)
      .set({
        status: parsed.data.decision,
        handledById: auth.user.sub,
        handledAt: new Date(),
        decisionNote: parsed.data.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(portalRequests.id, requestId));
  }

  return successResponse({
    id: requestId,
    status: parsed.data.decision,
    createdOrderId,
    createdOrderNumber: createdOrderId ? `ORD-P-…` : null,
  });
}
