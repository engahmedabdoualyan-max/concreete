/**
 * ============================================================
 *  GET /api/integrations/accounting/[id]/logs — Sync audit trail
 * ============================================================
 *  RBAC: FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getConnectionLogs } from "@/lib/services/accounting-sync.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_CONNECTION_ID", "Connection ID must be a valid UUID", 400);
  }

  try {
    const logs = await getConnectionLogs(auth.user.tenantId, id);
    if (!logs) return errorResponse("CONNECTION_NOT_FOUND", "Connection not found", 404);
    return successResponse({ logs }, `${logs.length} log entr(ies)`);
  } catch (err) {
    console.error("[GET /api/integrations/accounting/:id/logs]", err);
    return errorResponse("INTEGRATION_ERROR", "Failed to load logs", 500);
  }
}
