/**
 * ============================================================
 *  POST /api/sales/rfq/[id]/convert — APPROVED → PENDING_FINANCE orders
 * ============================================================
 *  One order per mix item. The finance gate is never bypassed.
 *  Body: { scheduledDate }
 *  RBAC: ORDER_CREATE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { convertRfq } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ConvertSchema = z.object({ scheduledDate: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_RFQ_ID", "RFQ ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ConvertSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "scheduledDate is required", 400);
  }

  try {
    const res = await convertRfq(
      auth.user.tenantId,
      auth.user.sub,
      id,
      parsed.data.scheduledDate
    );
    if (!res.ok) return errorResponse("RFQ_CONVERT_BLOCKED", res.error, 409);
    return successResponse(
      { orders: res.orders },
      `${res.orders.length} order(s) created for finance approval`,
      201
    );
  } catch (err) {
    console.error("[POST /api/sales/rfq/:id/convert]", err);
    return errorResponse("RFQ_ERROR", "Conversion failed", 500);
  }
}
