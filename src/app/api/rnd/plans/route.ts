/**
 * ============================================================
 *  GET  /api/rnd/plans[?status=]  — List development plans
 *  POST /api/rnd/plans            — Create a plan (starts as DRAFT)
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listPlans, createPlan } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "DRAFT",
  "PENDING_FINANCE",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
] as const;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
    return errorResponse("INVALID_STATUS", `status must be one of: ${VALID_STATUSES.join(", ")}`, 400);
  }

  try {
    const plans = await listPlans(auth.user.tenantId, status ?? undefined);
    return successResponse({ plans }, `${plans.length} development plan(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/plans]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to load plans", 500);
  }
}

const MilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: z.string().min(1),
  ownerId: z.string().uuid().optional(),
});

const CreatePlanSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(["PRODUCTION", "QUALITY", "COST", "STAFF", "TECHNOLOGY", "PROCESS"]).optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  budgetSar: z.number().int().nonnegative().optional(),
  expectedRoiPct: z.number().min(0).max(1000).optional(),
  milestones: z.array(MilestoneSchema).max(50).optional(),
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

  const parsed = CreatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid plan payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const plan = await createPlan(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(plan, "Development plan created as DRAFT", 201);
  } catch (err) {
    console.error("[POST /api/rnd/plans]", err);
    return errorResponse("RND_PLANS_ERROR", "Failed to create plan", 500);
  }
}
