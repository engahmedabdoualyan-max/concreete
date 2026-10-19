/**
 * ============================================================
 *  /api/hr/payroll/payments — بيان القبض الشهري
 * ============================================================
 *  GET   ?period=YYYY-MM  → one month's ledger rows (with receipt ref)
 *  GET   ?year=YYYY       → per-month aggregates for the whole year
 *  PATCH                  → mark one employee's month (upsert)
 *
 *  RBAC: HR_READ (GET) · HR_WRITE (PATCH)
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
  listPaymentsForPeriod,
  paymentSummaryForYear,
  upsertPayment,
} from "@/lib/services/payroll.service";

export const dynamic = "force-dynamic";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const period = url.searchParams.get("period");
  const year = url.searchParams.get("year");

  try {
    if (period) {
      if (!PERIOD_RE.test(period)) {
        return errorResponse("INVALID_PERIOD", "period must be YYYY-MM", 400);
      }
      const payments = await listPaymentsForPeriod(auth.user.tenantId, period);
      return successResponse({ period, payments }, `${payments.length} payment line(s)`);
    }
    if (year) {
      if (!YEAR_RE.test(year)) {
        return errorResponse("INVALID_YEAR", "year must be YYYY", 400);
      }
      const summary = await paymentSummaryForYear(auth.user.tenantId, year);
      return successResponse({ year, summary }, `${summary.length} summary row(s)`);
    }
    return errorResponse("INVALID_QUERY", "period or year is required", 400);
  } catch (err) {
    console.error("[GET /api/hr/payroll/payments]", err);
    return errorResponse("HR_ERROR", "Failed to load payments", 500);
  }
}

const PaymentSchema = z.object({
  employeeId: z.string().uuid(),
  period: z.string().regex(PERIOD_RE, "period must be YYYY-MM"),
  status: z.enum(["UNPAID", "PAID", "PARTIAL", "STOPPED"]),
  dueAmountSar: z.number().nonnegative().nullable().optional(),
  paidAmountSar: z.number().nonnegative().nullable().optional(),
  deductionSar: z.number().nonnegative().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  receiptDocumentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid payment payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const row = await upsertPayment(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(row, "تم حفظ حالة القبض");
  } catch (err) {
    console.error("[PATCH /api/hr/payroll/payments]", err);
    return errorResponse("HR_ERROR", "Failed to save payment", 500);
  }
}
