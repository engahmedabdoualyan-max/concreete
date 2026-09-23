/**
 * ============================================================
 *  PUT    /api/plant/controllers/[id]  — Edit binding/settings
 *  DELETE /api/plant/controllers/[id]  — Remove binding
 * ============================================================
 *  RBAC: SYSTEM_SETTINGS
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateController, deleteController } from "@/lib/services/batch-control.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_CONTROLLER_ID", "Controller ID must be a valid UUID", 400);
}

const UpdateControllerSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  batchPlantId: z.string().max(36).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateControllerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid controller payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateController(auth.user.tenantId, id, {
      name: parsed.data.name,
      settings: parsed.data.settings as Record<string, unknown> | undefined,
      isActive: parsed.data.isActive,
      batchPlantId: parsed.data.batchPlantId,
    });
    if (!updated) return errorResponse("CONTROLLER_NOT_FOUND", "Controller not found", 404);
    return successResponse(updated, "Controller updated");
  } catch (err) {
    console.error("[PUT /api/plant/controllers/:id]", err);
    return errorResponse("BATCH_CTRL_ERROR", "Failed to update controller", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const ok = await deleteController(auth.user.tenantId, id);
    if (!ok) return errorResponse("CONTROLLER_NOT_FOUND", "Controller not found", 404);
    return successResponse({ id }, "Controller removed");
  } catch (err) {
    console.error("[DELETE /api/plant/controllers/:id]", err);
    return errorResponse("BATCH_CTRL_ERROR", "Failed to remove controller", 500);
  }
}
