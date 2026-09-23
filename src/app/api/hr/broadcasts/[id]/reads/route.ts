/**
 * ============================================================
 *  GET /api/hr/broadcasts/[id]/reads — Read receipt count
 * ============================================================
 *  RBAC: HR_READ (HR desk visibility)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { broadcastReadCount } from "@/lib/services/hr-social.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_BROADCAST_ID", "Broadcast ID must be a valid UUID", 400);
  }

  try {
    const reads = await broadcastReadCount(auth.user.tenantId, id);
    return successResponse({ broadcastId: id, reads }, `${reads} read(s)`);
  } catch (err) {
    console.error("[GET /api/hr/broadcasts/:id/reads]", err);
    return errorResponse("HR_ERROR", "Failed", 500);
  }
}
