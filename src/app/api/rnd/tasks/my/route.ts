/**
 * ============================================================
 *  GET /api/rnd/tasks/my — Tasks assigned to the caller
 *  (drives the "My Tasks" view for every employee role)
 * ============================================================
 *  RBAC: any authenticated user (assignment visibility is
 *  inherently scoped to the caller's own user id + tenant)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { listMyTasks } from "@/lib/services/rnd.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  try {
    const tasks = await listMyTasks(auth.user.tenantId, auth.user.sub);
    return successResponse({ tasks }, `${tasks.length} assigned task(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/tasks/my]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to load assigned tasks", 500);
  }
}
