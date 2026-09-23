/**
 * ============================================================
 *  GET /api/finance/zatca/documents — E-invoice registry
 * ============================================================
 *  RBAC: FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listDocuments } from "@/lib/services/zatca.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const documents = await listDocuments(auth.user.tenantId);
    // Strip bulky Fatoora payloads from the list view (detail on demand later)
    const slim = documents.map(({ fatooraResponse: _omit, ...d }) => d);
    return successResponse({ documents: slim }, `${slim.length} document(s)`);
  } catch (err) {
    console.error("[GET /api/finance/zatca/documents]", err);
    return errorResponse("ZATCA_ERROR", "Failed to list documents", 500);
  }
}
