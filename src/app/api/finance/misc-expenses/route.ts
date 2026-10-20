/**
 * /api/finance/misc-expenses
 * GET  — نثريات الموظفين: القائمة + الملخص + خيارات الموظفين
 *        (?year=2026&month=10&kind=employee_fuel)
 * POST — بند نثرية جديد (يُنشئ قيداً دفترياً تلقائياً)
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listMiscExpenses,
  createMiscExpense,
  miscExpenseSummary,
  miscEmployeeOptions,
} from "@/lib/services/misc-expenses.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const KINDS = ["employee_fuel", "employee_car_rent", "employee_housing"] as const;
const METHODS = ["cash", "bank_transfer", "credit_card", "upi", "cheque"] as const;

const CreateMiscSchema = z.object({
  kind: z.enum(KINDS),
  employeeId: z.string().uuid("Invalid employee"),
  /** أي تاريخ داخل الشهر يُطبّق على أول يوم منه */
  periodMonth: z.string().min(1, "الشهر مطلوب"),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  paymentDate: z.string().min(1, "تاريخ الدفع مطلوب"),
  paymentMethod: z.enum(METHODS).optional(),
  notes: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const year = sp.get("year") ? Number(sp.get("year")) : undefined;
  const month = sp.get("month") ? Number(sp.get("month")) : undefined;
  const kind = sp.get("kind");
  if (kind && !KINDS.includes(kind as (typeof KINDS)[number])) {
    return errorResponse("VALIDATION_ERROR", "kind غير معروف", 400);
  }

  const [rows, summary, employees] = await Promise.all([
    listMiscExpenses(auth.user.tenantId, {
      year,
      month,
      kind: kind as (typeof KINDS)[number] | undefined,
    }),
    miscExpenseSummary(auth.user.tenantId, { year, month }),
    miscEmployeeOptions(auth.user.tenantId),
  ]);

  return successResponse({ miscExpenses: rows, summary, employees });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateMiscSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات النثرية غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const result = await createMiscExpense(auth.user.tenantId, auth.user.sub, {
      kind: d.kind,
      employeeId: d.employeeId,
      periodMonth: new Date(d.periodMonth),
      amountSar: d.amountSar,
      paymentDate: new Date(d.paymentDate),
      paymentMethod: d.paymentMethod,
      notes: d.notes ?? null,
      referenceNumber: d.referenceNumber ?? null,
    });
    return successResponse(result, "تم تسجيل بند النثرية");
  } catch (err) {
    console.error("[POST /api/finance/misc-expenses]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("MISC_EXPENSE_ERROR", message, 500);
  }
}
