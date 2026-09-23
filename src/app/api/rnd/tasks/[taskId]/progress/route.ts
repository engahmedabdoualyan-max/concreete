/**
 * ============================================================
 *  POST /api/rnd/tasks/[taskId]/progress
 *  Lightweight progress ping from the field (progress % + status).
 *  Recomputes the parent plan's overall progress automatically.
 * ============================================================
 *  RBAC: RND_READ holders can report progress on visible tasks
 *  (assignees update their own tasks; managers update any).
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateTask } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const ProgressSchema = z.object({
  progress: z.number().min(0).max(100),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const { taskId } = await params;
  if (!taskId || !UUID_RE.test(taskId)) {
    return errorResponse("INVALID_TASK_ID", "Task ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ProgressSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid progress payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateTask(auth.user.tenantId, taskId, {
      progressPct: parsed.data.progress,
      status: parsed.data.status,
    });
    if (!updated) return errorResponse("TASK_NOT_FOUND", "Task not found", 404);
    return successResponse(updated, "Task progress updated");
  } catch (err) {
    console.error("[POST /api/rnd/tasks/:id/progress]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to update progress", 500);
  }
}
