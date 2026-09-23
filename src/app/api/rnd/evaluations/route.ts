/**
 * ============================================================
 *  GET  /api/rnd/evaluations  — List staff evaluations
 *  POST /api/rnd/evaluations  — Evaluate an employee
 * ============================================================
 *  Overall = average(quality, initiative, teamwork), clamped 0–10.
 *  Completion rate is derived from tasksAssigned/tasksCompleted.
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listEvaluations, createEvaluation } from "@/lib/services/rnd.service";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  try {
    const evaluations = await listEvaluations(auth.user.tenantId);
    return successResponse({ evaluations }, `${evaluations.length} evaluation(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/evaluations]", err);
    return errorResponse("RND_EVAL_ERROR", "Failed to load evaluations", 500);
  }
}

const CreateEvaluationSchema = z.object({
  employeeId: z.string().uuid().optional(),
  employeeName: z.string().min(1).max(120),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  tasksAssigned: z.number().int().nonnegative().optional(),
  tasksCompleted: z.number().int().nonnegative().optional(),
  qualityScore: z.number().min(0).max(10),
  initiativeScore: z.number().min(0).max(10),
  teamworkScore: z.number().min(0).max(10),
  strengths: z.string().max(2000).optional(),
  improvements: z.string().max(2000).optional(),
  reviewerComments: z.string().max(2000).optional(),
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

  const parsed = CreateEvaluationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid evaluation payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const reviewer = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, auth.user.sub))
      .limit(1);

    const evaluation = await createEvaluation(
      auth.user.tenantId,
      auth.user.sub,
      reviewer[0]?.fullName ?? "Unknown",
      parsed.data
    );
    return successResponse(evaluation, "Evaluation recorded", 201);
  } catch (err) {
    console.error("[POST /api/rnd/evaluations]", err);
    return errorResponse("RND_EVAL_ERROR", "Failed to record evaluation", 500);
  }
}
