/**
 * ============================================================
 *  GET  /api/rnd/tasks/[taskId]/comments  — Task discussion thread
 *  POST /api/rnd/tasks/[taskId]/comments  — Add a comment
 * ============================================================
 *  RBAC: RND_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listTaskComments, addTaskComment } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_TASK_ID", "Task ID must be a valid UUID", 400);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const { taskId } = await params;
  if (!taskId || !UUID_RE.test(taskId)) return badId();

  try {
    const comments = await listTaskComments(auth.user.tenantId, taskId);
    return successResponse({ comments }, `${comments.length} comment(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/tasks/:id/comments]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to load comments", 500);
  }
}

const CommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const { taskId } = await params;
  if (!taskId || !UUID_RE.test(taskId)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid comment payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const comment = await addTaskComment(
      auth.user.tenantId,
      taskId,
      auth.user.sub,
      parsed.data.content
    );
    if (!comment) return errorResponse("TASK_NOT_FOUND", "Task not found", 404);
    return successResponse(comment, "Comment added", 201);
  } catch (err) {
    console.error("[POST /api/rnd/tasks/:id/comments]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to add comment", 500);
  }
}
