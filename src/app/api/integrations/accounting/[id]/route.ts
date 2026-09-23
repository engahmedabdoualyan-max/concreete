/**
 * ============================================================
 *  PUT    /api/integrations/accounting/[id]  — Update connection
 *  DELETE /api/integrations/accounting/[id]  — Remove connection
 * ============================================================
 *  RBAC: FINANCE_INVOICE_MANAGE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateConnection, deleteConnection } from "@/lib/services/accounting-sync.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_CONNECTION_ID", "Connection ID must be a valid UUID", 400);
}

const UpdateConnectionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  credentials: z.record(z.string(), z.string()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid connection payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateConnection(auth.user.tenantId, id, {
      name: parsed.data.name,
      credentials: parsed.data.credentials,
      settings: parsed.data.settings as Record<string, unknown> | undefined,
      isActive: parsed.data.isActive,
    });
    if (!updated) return errorResponse("CONNECTION_NOT_FOUND", "Connection not found", 404);
    return successResponse(updated, "Connection updated");
  } catch (err) {
    console.error("[PUT /api/integrations/accounting/:id]", err);
    return errorResponse("INTEGRATION_ERROR", "Failed to update connection", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const ok = await deleteConnection(auth.user.tenantId, id);
    if (!ok) return errorResponse("CONNECTION_NOT_FOUND", "Connection not found", 404);
    return successResponse({ id }, "Connection removed");
  } catch (err) {
    console.error("[DELETE /api/integrations/accounting/:id]", err);
    return errorResponse("INTEGRATION_ERROR", "Failed to remove connection", 500);
  }
}
