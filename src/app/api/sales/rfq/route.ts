/**
 * ============================================================
 *  GET  /api/sales/rfq[?status=]  — List quotations
 *  POST /api/sales/rfq            — Create DRAFT quotation
 * ============================================================
 *  RBAC: ORDER_CREATE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listRfqs, createRfq } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const status = new URL(req.url).searchParams.get("status") ?? undefined;

  try {
    const rfqs = await listRfqs(auth.user.tenantId, status);
    return successResponse({ rfqs }, `${rfqs.length} quotation(s)`);
  } catch (err) {
    console.error("[GET /api/sales/rfq]", err);
    return errorResponse("RFQ_ERROR", "Failed to load quotations", 500);
  }
}

const CreateRfqSchema = z.object({
  clientId: z.string().uuid(),
  deliverySiteId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  validUntil: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        mixDesignId: z.string().uuid(),
        volumeM3: z.number().positive().max(100000),
      })
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateRfqSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid RFQ payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const rfq = await createRfq(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(rfq, `Quotation ${rfq?.rfqNumber} drafted`, 201);
  } catch (err) {
    console.error("[POST /api/sales/rfq]", err);
    return errorResponse("RFQ_ERROR", "Failed to create quotation", 500);
  }
}
