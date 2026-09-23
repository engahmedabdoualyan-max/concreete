/**
 * ============================================================
 *  POST /api/hr/payroll/runs/[id]/status — APPROVE | PAY | CANCEL
 *  Body: { action }
 * ============================================================
 *  RBAC: HR_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { transitionRun } from "@/lib/services/payroll.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const StatusSchema = z.object({
  action: z.enum(["APPROVE", "PAY", "CANCEL"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return errorResponse("INVALID_RUN_ID", "Run ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid action payload", 400);
  }

  try {
    const res = await transitionRun(
      auth.user.tenantId,
      auth.user.sub,
      id,
      parsed.data.action
    );
    if (!res.ok) return errorResponse("RUN_TRANSITION_BLOCKED", res.error, 409);
    return successResponse(res.run, `Payroll ${res.run.status}`);
  } catch (err) {
    console.error("[POST /api/hr/payroll/runs/:id/status]", err);
    return errorResponse("HR_ERROR", "Transition failed", 500);
  }
}
