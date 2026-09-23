/**
 * ============================================================
 *  GET  /api/rnd/budgets[?planId=]  — Budget plans with line items
 *  POST /api/rnd/budgets            — Create a budget container / add item
 * ============================================================
 *  Body for item creation: { budgetPlanId, item: {...} }
 *  Body for container creation: { planId?, fiscalYear?, totalBudgetSar? }
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listBudgetPlans, createBudgetPlan, addBudgetItem } from "@/lib/services/rnd.service";
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
    const budgets = await listBudgetPlans(auth.user.tenantId, planId ?? undefined);
    return successResponse({ budgets }, `${budgets.length} budget plan(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/budgets]", err);
    return errorResponse("RND_BUDGET_ERROR", "Failed to load budgets", 500);
  }
}

const BudgetItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z
    .enum(["EQUIPMENT", "SOFTWARE", "TRAINING", "CONSULTING", "MARKETING", "HR", "MATERIALS", "OTHER"])
    .optional(),
  estimatedCostSar: z.number().int().nonnegative().optional(),
  vendor: z.string().max(160).optional(),
});

const CreateBudgetSchema = z
  .object({
    planId: z.string().uuid().optional(),
    fiscalYear: z.string().max(10).optional(),
    totalBudgetSar: z.number().int().nonnegative().optional(),
    budgetPlanId: z.string().uuid().optional(),
    item: BudgetItemSchema.optional(),
  })
  .refine((d) => d.budgetPlanId || d.item === undefined, {
    message: "item requires budgetPlanId",
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

  const parsed = CreateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid budget payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    // Add a line item to an existing container
    if (parsed.data.budgetPlanId && parsed.data.item) {
      const item = await addBudgetItem(
        auth.user.tenantId,
        auth.user.sub,
        parsed.data.budgetPlanId,
        parsed.data.item
      );
      if (!item) return errorResponse("BUDGET_NOT_FOUND", "Budget plan not found", 404);
      return successResponse(item, "Budget item added", 201);
    }
    // Create a new budget container
    const budget = await createBudgetPlan(auth.user.tenantId, auth.user.sub, {
      planId: parsed.data.planId,
      fiscalYear: parsed.data.fiscalYear,
      totalBudgetSar: parsed.data.totalBudgetSar,
    });
    return successResponse(budget, "Budget plan created", 201);
  } catch (err) {
    console.error("[POST /api/rnd/budgets]", err);
    return errorResponse("RND_BUDGET_ERROR", "Failed to save budget", 500);
  }
}
