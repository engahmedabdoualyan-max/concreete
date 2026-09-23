/**
 * ============================================================
 *  PUT    /api/rnd/tasks/[taskId]  — Update task fields / status
 *  DELETE /api/rnd/tasks/[taskId]  — Remove a task
 * ============================================================
 *  RBAC: RND_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateTask, deleteTask } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_TASK_ID", "Task ID must be a valid UUID", 400);
}

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().max(36).optional(),
  assigneeName: z.string().max(120).optional(),
  startDate: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"]).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  progressPct: z.number().min(0).max(100).optional(),
  estimatedHours: z.number().nonnegative().optional(),
  actualHours: z.number().nonnegative().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { taskId } = await params;
  if (!taskId || !UUID_RE.test(taskId)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid task payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateTask(auth.user.tenantId, taskId, parsed.data);
    if (!updated) return errorResponse("TASK_NOT_FOUND", "Task not found", 404);
    return successResponse(updated, "Task updated");
  } catch (err) {
    console.error("[PUT /api/rnd/tasks/:id]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to update task", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { taskId } = await params;
  if (!taskId || !UUID_RE.test(taskId)) return badId();

  try {
    await deleteTask(auth.user.tenantId, taskId);
    return successResponse({ id: taskId }, "Task deleted");
  } catch (err) {
    console.error("[DELETE /api/rnd/tasks/:id]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to delete task", 500);
  }
}
