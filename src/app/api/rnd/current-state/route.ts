/**
 * ============================================================
 *  GET  /api/rnd/current-state  — Latest factory baseline + targets
 *  POST /api/rnd/current-state  — Record / update baseline for a period
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getLatestCurrentState, upsertCurrentState } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  try {
    const state = await getLatestCurrentState(auth.user.tenantId);
    return successResponse({ currentState: state }, "R&D current state");
  } catch (err) {
    console.error("[GET /api/rnd/current-state]", err);
    return errorResponse("RND_STATE_ERROR", "Failed to load current state", 500);
  }
}

const KeyIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  severity: z.string().max(20).default("medium"),
  category: z.string().max(30).default("other"),
});

const CurrentStateSchema = z.object({
  period: z.string().min(1).max(20),
  currentProductionCapacity: z.number().nonnegative().optional(),
  targetProductionCapacity: z.number().nonnegative().optional(),
  currentEfficiencyPct: z.number().min(0).max(100).optional(),
  targetEfficiencyPct: z.number().min(0).max(100).optional(),
  currentStaffCount: z.number().int().nonnegative().optional(),
  targetStaffCount: z.number().int().nonnegative().optional(),
  currentCostPerM3: z.number().nonnegative().optional(),
  targetCostPerM3: z.number().nonnegative().optional(),
  keyIssues: z.array(KeyIssueSchema).max(100).optional(),
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

  const parsed = CurrentStateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid current-state payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const saved = await upsertCurrentState(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data
    );
    return successResponse(saved, "Current state saved", 201);
  } catch (err) {
    console.error("[POST /api/rnd/current-state]", err);
    return errorResponse("RND_STATE_ERROR", "Failed to save current state", 500);
  }
}
