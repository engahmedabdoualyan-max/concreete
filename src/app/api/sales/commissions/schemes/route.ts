/**
 * ============================================================
 *  GET  /api/sales/commissions/schemes  — List rate schemes
 *  POST /api/sales/commissions/schemes  — Create scheme
 * ============================================================
 *  RBAC: ORDER_CREATE (GET) · RFQ_APPROVE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listSchemes, createScheme } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  try {
    const schemes = await listSchemes(auth.user.tenantId);
    return successResponse({ schemes }, `${schemes.length} scheme(s)`);
  } catch (err) {
    console.error("[GET /api/sales/commissions/schemes]", err);
    return errorResponse("COMMISSION_ERROR", "Failed to load schemes", 500);
  }
}

const CreateSchemeSchema = z.object({
  name: z.string().min(1).max(120),
  ratePct: z.number().min(0).max(100),
  minDeliveredM3: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RFQ_APPROVE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateSchemeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid scheme payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const scheme = await createScheme(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(scheme, "Commission scheme created", 201);
  } catch (err) {
    console.error("[POST /api/sales/commissions/schemes]", err);
    return errorResponse("COMMISSION_ERROR", "Failed to create scheme", 500);
  }
}
