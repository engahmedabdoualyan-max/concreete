/**
 * ============================================================
 *  POST /api/integrations/accounting/[id]/push-invoice
 *  Body: { orderId } — Ticket → Invoice (auto-pushes customer first)
 * ============================================================
 *  RBAC: FINANCE_INVOICE_MANAGE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { pushInvoice } from "@/lib/services/accounting-sync.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PushInvoiceSchema = z.object({ orderId: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_CONNECTION_ID", "Connection ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PushInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "orderId is required", 400);
  }

  try {
    const result = await pushInvoice(auth.user.tenantId, id, parsed.data.orderId);
    if (!result) return errorResponse("CONNECTION_NOT_FOUND", "Connection not found", 404);
    return successResponse(
      result,
      result.ok ? "Invoice pushed" : "Invoice push failed",
      result.ok ? 201 : 422
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed";
    return errorResponse("INTEGRATION_PUSH_FAILED", message, 422);
  }
}
