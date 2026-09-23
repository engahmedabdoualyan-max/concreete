/**
 * ============================================================
 *  GET /api/integrations/accounting/export?type=customers|invoices
 *      &connectionId= — CSV download (SAP/Oracle bridge)
 * ============================================================
 *  Returns text/csv with a download filename. Only available on
 *  CSV_BRIDGE connections (single source of truth for file drops).
 *  RBAC: FINANCE_READ
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, errorResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { exportCsv } from "@/lib/services/accounting-sync.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const connectionId = url.searchParams.get("connectionId");
  if ((type !== "customers" && type !== "invoices") || !connectionId) {
    return errorResponse(
      "INVALID_EXPORT",
      "Query must include type=customers|invoices and connectionId",
      400
    );
  }

  try {
    const result = await exportCsv(auth.user.tenantId, connectionId, type);
    if (!result) return errorResponse("CONNECTION_NOT_FOUND", "Connection not found", 404);
    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return errorResponse("INTEGRATION_EXPORT_FAILED", message, 422);
  }
}
