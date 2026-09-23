/**
 * ============================================================
 *  PUT    /api/sales/commissions/schemes/[id]  — Edit scheme
 *  DELETE /api/sales/commissions/schemes/[id]  — Remove scheme
 * ============================================================
 *  RBAC: RFQ_APPROVE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateScheme, deleteScheme } from "@/lib/services/rfq.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_SCHEME_ID", "Scheme ID must be a valid UUID", 400);
}

const UpdateSchemeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  ratePct: z.number().min(0).max(100).optional(),
  minDeliveredM3: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RFQ_APPROVE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateSchemeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid scheme payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateScheme(auth.user.tenantId, id, parsed.data);
    if (!updated) return errorResponse("SCHEME_NOT_FOUND", "Scheme not found", 404);
    return successResponse(updated, "Scheme updated");
  } catch (err) {
    console.error("[PUT /api/sales/commissions/schemes/:id]", err);
    return errorResponse("COMMISSION_ERROR", "Failed to update scheme", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RFQ_APPROVE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const ok = await deleteScheme(auth.user.tenantId, id);
    if (!ok) return errorResponse("SCHEME_NOT_FOUND", "Scheme not found", 404);
    return successResponse({ id }, "Scheme removed");
  } catch (err) {
    console.error("[DELETE /api/sales/commissions/schemes/:id]", err);
    return errorResponse("COMMISSION_ERROR", "Failed to remove scheme", 500);
  }
}
