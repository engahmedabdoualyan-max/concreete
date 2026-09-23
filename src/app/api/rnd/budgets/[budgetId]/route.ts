/**
 * ============================================================
 *  PUT /api/rnd/budgets/[budgetId]
 *  Update a budget container (totals) or decide a line item.
 *
 *  Body variants:
 *   • { totalBudgetSar?, fiscalYear? }              — container edit (RND_WRITE)
 *   • { itemId, approved: boolean }                 — finance decision (RND_FINANCE_APPROVE)
 * ============================================================
 */

import { NextRequest } from "next/server";
import {
  requirePermission,
  requireAnyPermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { db } from "@/db";
import { rndBudgetPlans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decideBudgetItem } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const UpdateBudgetSchema = z.object({
  totalBudgetSar: z.number().int().nonnegative().optional(),
  fiscalYear: z.string().max(10).optional(),
  itemId: z.string().uuid().optional(),
  approved: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ budgetId: string }> }
) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.RND_WRITE,
    PERMISSIONS.RND_FINANCE_APPROVE,
  ]);
  if ("status" in auth) return auth;

  const { budgetId } = await params;
  if (!budgetId || !UUID_RE.test(budgetId)) {
    return errorResponse("INVALID_BUDGET_ID", "Budget ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid budget payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    // Finance decision on a line item
    if (parsed.data.itemId && parsed.data.approved !== undefined) {
      const finance = await requirePermission(req, PERMISSIONS.RND_FINANCE_APPROVE);
      if ("status" in finance) return finance;
      const item = await decideBudgetItem(
        auth.user.tenantId,
        parsed.data.itemId,
        auth.user.sub,
        parsed.data.approved
      );
      if (!item) return errorResponse("ITEM_NOT_FOUND", "Budget item not found", 404);
      return successResponse(
        item,
        parsed.data.approved ? "Budget item approved" : "Budget item rejected"
      );
    }

    // Container edit
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.totalBudgetSar !== undefined)
      patch.totalBudgetSar = parsed.data.totalBudgetSar;
    if (parsed.data.fiscalYear !== undefined) patch.fiscalYear = parsed.data.fiscalYear;

    const [updated] = await db
      .update(rndBudgetPlans)
      .set(patch)
      .where(
        and(
          eq(rndBudgetPlans.id, budgetId),
          eq(rndBudgetPlans.tenantId, auth.user.tenantId)
        )
      )
      .returning();
    if (!updated) return errorResponse("BUDGET_NOT_FOUND", "Budget plan not found", 404);
    return successResponse(updated, "Budget plan updated");
  } catch (err) {
    console.error("[PUT /api/rnd/budgets/:id]", err);
    return errorResponse("RND_BUDGET_ERROR", "Failed to update budget", 500);
  }
}
