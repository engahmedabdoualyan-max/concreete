/**
 * ============================================================
 *  GET  /api/rnd/weekly?planId=  — Weekly entries for a plan
 *  POST /api/rnd/weekly          — Submit a weekly check-in
 * ============================================================
 *  Variance = (actual - planned) / planned * 100
 *  On-track threshold: variance >= -10%
 *  RBAC: RND_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listWeeklyEntries, createWeeklyEntry } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const planId = url.searchParams.get("planId");
  if (!planId || !UUID_RE.test(planId)) {
    return errorResponse("INVALID_PLAN_ID", "planId query param must be a valid UUID", 400);
  }

  try {
    const entries = await listWeeklyEntries(auth.user.tenantId, planId);
    return successResponse({ entries }, `${entries.length} weekly entr(ies)`);
  } catch (err) {
    console.error("[GET /api/rnd/weekly]", err);
    return errorResponse("RND_WEEKLY_ERROR", "Failed to load weekly entries", 500);
  }
}

const WeeklyEntrySchema = z.object({
  planId: z.string().uuid(),
  weekNumber: z.number().int().min(1).max(53),
  year: z.number().int().min(2020).max(2100),
  weekStartDate: z.string().min(1),
  weekEndDate: z.string().min(1),
  plannedTarget: z.number().nonnegative(),
  actualAchieved: z.number().nonnegative(),
  blockers: z.string().max(2000).optional(),
  actionsTaken: z.string().max(2000).optional(),
  nextWeekPlan: z.string().max(2000).optional(),
  metricsSnapshot: z.record(z.string(), z.number()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = WeeklyEntrySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid weekly-entry payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const entry = await createWeeklyEntry(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data
    );
    if (!entry) return errorResponse("PLAN_NOT_FOUND", "Development plan not found", 404);
    return successResponse(entry, "Weekly entry recorded", 201);
  } catch (err) {
    console.error("[POST /api/rnd/weekly]", err);
    return errorResponse("RND_WEEKLY_ERROR", "Failed to record weekly entry", 500);
  }
}
