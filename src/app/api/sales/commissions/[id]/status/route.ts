/**
 * ============================================================
 *  POST /api/sales/commissions/[id]/status — APPROVED | PAID
 *  Body: { status: "APPROVED" | "PAID" }
 * ============================================================
 *  RBAC: RFQ_APPROVE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { setCommissionStatus } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const StatusSchema = z.object({ status: z.enum(["APPROVED", "PAID"]) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RFQ_APPROVE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_COMMISSION_ID", "Commission ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid status payload", 400);
  }

  try {
    const updated = await setCommissionStatus(
      auth.user.tenantId,
      id,
      parsed.data.status
    );
    if (!updated) return errorResponse("COMMISSION_NOT_FOUND", "Commission not found", 404);
    return successResponse(updated, `Commission ${updated.status}`);
  } catch (err) {
    console.error("[POST /api/sales/commissions/:id/status]", err);
    return errorResponse("COMMISSION_ERROR", "Status update failed", 500);
  }
}
