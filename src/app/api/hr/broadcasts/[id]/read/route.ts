/**
 * ============================================================
 *  POST /api/hr/broadcasts/[id]/read — Mark as read (any staff)
 * ============================================================
 *  RBAC: any authenticated user (idempotent)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { markBroadcastRead } from "@/lib/services/hr-social.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_BROADCAST_ID", "Broadcast ID must be a valid UUID", 400);
  }

  try {
    await markBroadcastRead(auth.user.tenantId, auth.user.sub, id);
    return successResponse({ id }, "Marked as read");
  } catch (err) {
    console.error("[POST /api/hr/broadcasts/:id/read]", err);
    return errorResponse("HR_ERROR", "Failed", 500);
  }
}
