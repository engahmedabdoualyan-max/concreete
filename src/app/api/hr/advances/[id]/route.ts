/**
 * ============================================================
 *  /api/hr/advances/:id — Single advance
 * ============================================================
 *  GET    → advance details with employee info
 *  PATCH  → approve advance (HR_MANAGER/PLANT_MGR)
 *  DELETE → cancel advance (HR_MANAGER/PLANT_MGR)
 *  RBAC: HR_READ (GET) · HR_WRITE (PATCH/DELETE)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  getAdvance,
  approveAdvance,
  cancelAdvance,
} from "@/lib/services/hr-advances.service";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid advance id", 400);

  try {
    const advance = await getAdvance(auth.user.tenantId, id);
    if (!advance) return errorResponse("NOT_FOUND", "Advance not found", 404);
    return successResponse(advance);
  } catch (err) {
    console.error("[GET /api/hr/advances/:id]", err);
    return errorResponse("HR_ERROR", "Failed to load advance", 500);
  }
}

const ApproveSchema = z.object({
  approvalNote: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid advance id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await approveAdvance(auth.user.tenantId, auth.user.sub, id, parsed.data.approvalNote);
    if (!updated) return errorResponse("NOT_FOUND", "Advance not found or not pending", 404);
    return successResponse(updated, "تم اعتماد السلفة");
  } catch (err) {
    console.error("[PATCH /api/hr/advances/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("HR_ERROR", message, 500);
  }
}

const CancelSchema = z.object({
  cancelReason: z.string().min(1).max(500),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid advance id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await cancelAdvance(auth.user.tenantId, auth.user.sub, id, parsed.data.cancelReason);
    if (!updated) return errorResponse("NOT_FOUND", "Advance not found or already completed", 404);
    return successResponse(updated, "تم إلغاء السلفة");
  } catch (err) {
    console.error("[DELETE /api/hr/advances/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("HR_ERROR", message, 500);
  }
}