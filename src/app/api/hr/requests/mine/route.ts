/**
 * ============================================================
 *  GET /api/hr/requests/mine — My own requests (any staff)
 * ============================================================
 *  RBAC: any authenticated user (inherently own-scoped)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { listMyRequests } from "@/lib/services/hr-social.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  try {
    const rows = await listMyRequests(auth.user.tenantId, auth.user.sub);
    return successResponse({ requests: rows }, `${rows.length} request(s)`);
  } catch (err) {
    console.error("[GET /api/hr/requests/mine]", err);
    return errorResponse("HR_ERROR", "Failed to load requests", 500);
  }
}
