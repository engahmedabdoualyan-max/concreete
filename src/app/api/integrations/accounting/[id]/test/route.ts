/**
 * ============================================================
 *  POST /api/integrations/accounting/[id]/test — Test connection
 * ============================================================
 *  RBAC: FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { testConnection } from "@/lib/services/accounting-sync.service";

export const dynamic = "force-dynamic";

export async function POST(
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
    const result = await testConnection(auth.user.tenantId, id);
    if (!result) return errorResponse("CONNECTION_NOT_FOUND", "Connection not found", 404);
    return successResponse(result, result.ok ? "Connection works" : "Connection failed");
  } catch (err) {
    console.error("[POST /api/integrations/accounting/:id/test]", err);
    return errorResponse("INTEGRATION_ERROR", "Test failed", 500);
  }
}
