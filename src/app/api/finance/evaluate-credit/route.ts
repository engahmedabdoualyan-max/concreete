/**
 * POST /api/finance/evaluate-credit
 * Evaluates a client's credit status against a proposed order value.
 * Called automatically when an order is created, and can be called
 * manually by Finance to preview approval impact.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { evaluateCustomerCredit } from "@/lib/services/finance.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const EvaluateSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  proposedOrderValueSar: z.number().int().positive("Order value must be positive integer"),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = EvaluateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid evaluation data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const clientRows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.id, parsed.data.clientId),
        eq(clients.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (clientRows.length === 0) {
    return errorResponse("NOT_FOUND", "Client not found", 404);
  }

  try {
    const evaluation = await evaluateCustomerCredit(
      parsed.data.clientId,
      parsed.data.proposedOrderValueSar
    );

    return successResponse({
      evaluation,
      recommendation:
        evaluation.decision === "APPROVE"
          ? "Order can be approved — headroom sufficient"
          : evaluation.decision === "CREDIT_HOLD"
          ? `Order will be placed on CREDIT_HOLD. Accountant manual override available via POST /api/finance/${parsed.data.clientId}/override`
          : "Order will be REJECTED — client blocked or at credit limit",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("CREDIT_EVALUATION_ERROR", message, 422);
  }
}
