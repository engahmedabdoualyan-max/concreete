/**
 * ============================================================
 *  DELETE /api/hr/zones/[id] — Remove a geofence
 * ============================================================
 *  RBAC: HR_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { deleteZone } from "@/lib/services/attendance.service";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_ZONE_ID", "Zone ID must be a valid UUID", 400);
  }

  try {
    const ok = await deleteZone(auth.user.tenantId, id);
    if (!ok) return errorResponse("ZONE_NOT_FOUND", "Zone not found", 404);
    return successResponse({ id }, "Zone removed");
  } catch (err) {
    console.error("[DELETE /api/hr/zones/:id]", err);
    return errorResponse("HR_ERROR", "Failed to remove zone", 500);
  }
}
