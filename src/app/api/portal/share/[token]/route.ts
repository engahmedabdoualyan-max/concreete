/**
 * ============================================================
 *  DELETE /api/portal/share/[token] — Revoke a magic link
 * ============================================================
 *  RBAC: ORDER_READ or FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { revokeShareToken } from "@/lib/services/portal.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.FINANCE_READ,
  ]);
  if ("status" in auth) return auth;

  const { token } = await params;
  if (!token || token.length < 10 || token.length > 64) {
    return errorResponse("INVALID_TOKEN", "Invalid share token", 400);
  }

  try {
    const ok = await revokeShareToken(auth.user.tenantId, token);
    if (!ok) return errorResponse("TOKEN_NOT_FOUND", "Share link not found", 404);
    return successResponse({ token }, "Share link revoked");
  } catch (err) {
    console.error("[DELETE /api/portal/share/:token]", err);
    return errorResponse("PORTAL_SHARE_ERROR", "Failed to revoke link", 500);
  }
}
