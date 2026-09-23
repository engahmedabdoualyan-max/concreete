/**
 * ============================================================
 *  GET  /api/rnd/tasks[?planId=]  — List tasks (optionally per plan)
 *  POST /api/rnd/tasks            — Assign a task to staff
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listTasks, createTask } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const planId = url.searchParams.get("planId");
  if (planId && !UUID_RE.test(planId)) {
    return errorResponse("INVALID_PLAN_ID", "planId must be a valid UUID", 400);
  }

  try {
    const tasks = await listTasks(auth.user.tenantId, planId ?? undefined);
    return successResponse({ tasks }, `${tasks.length} task(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/tasks]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to load tasks", 500);
  }
}

const CreateTaskSchema = z.object({
  planId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().uuid().optional(),
  assigneeName: z.string().max(120).optional(),
  startDate: z.string().min(1).optional(),
  dueDate: z.string().min(1, "Due date is required"),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  estimatedHours: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid task payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const task = await createTask(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(task, "Task assigned", 201);
  } catch (err) {
    console.error("[POST /api/rnd/tasks]", err);
    return errorResponse("RND_TASKS_ERROR", "Failed to create task", 500);
  }
}
