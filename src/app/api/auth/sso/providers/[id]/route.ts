/**
 * ============================================================
 *  DELETE /api/auth/sso/providers/[id] — Remove IdP binding
 * ============================================================
 *  RBAC: SYSTEM_SETTINGS
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { deleteSsoProvider } from "@/lib/services/sso.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id) return errorResponse("INVALID_PROVIDER_ID", "Provider ID is required", 400);

  try {
    const ok = await deleteSsoProvider(auth.user.tenantId, id);
    if (!ok) return errorResponse("PROVIDER_NOT_FOUND", "Provider not found", 404);
    return successResponse({ id }, "Provider removed");
  } catch (err) {
    console.error("[DELETE /api/auth/sso/providers/:id]", err);
    return errorResponse("SSO_ERROR", "Failed to remove provider", 500);
  }
}
