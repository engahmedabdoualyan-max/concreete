/**
 * ============================================================
 *  /api/hr/advances — Employee salary advances
 * ============================================================
 *  GET    ?employeeId=&status=&period=  → list with filters
 *  POST   { employeeId, principalSar, repaymentMode, installmentAmountSar|installmentPct,
 *           totalInstallments, nextDeductionPeriod, approvalNote? }
 *          → create advance (HR_MANAGER/PLANT_MGR only)
 *  RBAC: HR_READ (GET) · HR_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listAdvances,
  createAdvance,
  getAdvance,
  AdvanceRepaymentMode,
} from "@/lib/services/hr-advances.service";

export const dynamic = "force-dynamic";

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const period = url.searchParams.get("period") ?? undefined;

  if (period && !YEAR_MONTH_RE.test(period)) {
    return errorResponse("INVALID_PERIOD", "period must be YYYY-MM", 400);
  }

  try {
    const rows = await listAdvances(auth.user.tenantId, { employeeId, status: status as any, period });
    return successResponse({ advances: rows }, `${rows.length} advance(s)`);
  } catch (err) {
    console.error("[GET /api/hr/advances]", err);
    return errorResponse("HR_ERROR", "Failed to load advances", 500);
  }
}

const CreateAdvanceSchema = z.object({
  employeeId: z.string().uuid(),
  principalSar: z.number().positive(),
  repaymentMode: z.enum(["FIXED", "PERCENTAGE"]),
  installmentAmountSar: z.number().positive().optional(),
  installmentPct: z.number().positive().max(100).optional(),
  totalInstallments: z.number().int().positive().max(60),
  nextDeductionPeriod: z.string().regex(YEAR_MONTH_RE, "period must be YYYY-MM"),
  approvalNote: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.repaymentMode === "FIXED") return data.installmentAmountSar !== undefined;
    if (data.repaymentMode === "PERCENTAGE") return data.installmentPct !== undefined;
    return true;
  },
  { message: "FIXED mode requires installmentAmountSar, PERCENTAGE mode requires installmentPct", path: ["repaymentMode"] }
);

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateAdvanceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid advance payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const created = await createAdvance(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(created, "تم إنشاء السلفة", 201);
  } catch (err) {
    console.error("[POST /api/hr/advances]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("HR_ERROR", message, 500);
  }
}