/**
 * ============================================================
 *  GET  /api/hr/payroll/runs          — Monthly runs
 *  POST /api/hr/payroll/runs          — Create DRAFT run + math
 * ============================================================
 *  POST body: { period: "YYYY-MM", adjustments?: [
 *    { employeeId, daysWorked?, deductionsSar?, deductionNote? }] }
 *  RBAC: HR_READ (GET) · HR_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listRuns, createRun } from "@/lib/services/payroll.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  try {
    const runs = await listRuns(auth.user.tenantId);
    return successResponse({ runs }, `${runs.length} run(s)`);
  } catch (err) {
    console.error("[GET /api/hr/payroll/runs]", err);
    return errorResponse("HR_ERROR", "Failed to load runs", 500);
  }
}

const CreateRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  adjustments: z
    .array(
      z.object({
        employeeId: z.string().uuid(),
        daysWorked: z.number().min(0).max(30).optional(),
        deductionsSar: z.number().nonnegative().optional(),
        deductionNote: z.string().max(200).optional(),
      })
    )
    .max(5000)
    .optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid run payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const run = await createRun(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data.period,
      parsed.data.adjustments ?? []
    );
    return successResponse(run, `Payroll ${parsed.data.period} drafted`, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return errorResponse("HR_RUN_BLOCKED", message, 409);
  }
}
