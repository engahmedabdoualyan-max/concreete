/**
 * /api/finance/misc-expenses/:id
 * PUT    — تعديل بند نثرية (مع مزامنة القيد الدفتري في نفس المعاملة)
 * DELETE — حذف البند وقيده معاً (لا يبقي قيداً بلا مصدر)
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  updateMiscExpense,
  deleteMiscExpense,
  MiscExpenseNotFoundError,
} from "@/lib/services/misc-expenses.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const KINDS = ["employee_fuel", "employee_car_rent", "employee_housing"] as const;
const METHODS = ["cash", "bank_transfer", "credit_card", "upi", "cheque"] as const;

const UpdateMiscSchema = z.object({
  kind: z.enum(KINDS).optional(),
  employeeId: z.string().uuid("Invalid employee").optional(),
  periodMonth: z.string().optional(),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً").optional(),
  paymentDate: z.string().optional(),
  paymentMethod: z.enum(METHODS).optional(),
  notes: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateMiscSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const row = await updateMiscExpense(auth.user.tenantId, id, {
      kind: d.kind,
      employeeId: d.employeeId,
      periodMonth: d.periodMonth ? new Date(d.periodMonth) : undefined,
      amountSar: d.amountSar,
      paymentDate: d.paymentDate ? new Date(d.paymentDate) : undefined,
      paymentMethod: d.paymentMethod,
      notes: d.notes,
      referenceNumber: d.referenceNumber,
    });
    return successResponse(row, "تم تعديل بند النثرية");
  } catch (err) {
    if (err instanceof MiscExpenseNotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    console.error("[PUT /api/finance/misc-expenses/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("MISC_EXPENSE_ERROR", message, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  try {
    const row = await deleteMiscExpense(auth.user.tenantId, id);
    return successResponse(row, "تم حذف بند النثرية وقيده");
  } catch (err) {
    if (err instanceof MiscExpenseNotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    console.error("[DELETE /api/finance/misc-expenses/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("MISC_EXPENSE_ERROR", message, 500);
  }
}
