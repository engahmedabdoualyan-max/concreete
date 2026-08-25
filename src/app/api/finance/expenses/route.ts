/**
 * /api/finance/expenses
 * GET  — list expenses + summary (optional ?year=&month=)
 * POST — create an expense (auto-links a ledger entry)
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listExpenses,
  createExpense,
  expenseSummary,
} from "@/lib/services/expenses.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateExpenseSchema = z.object({
  category: z.enum(["vehicle", "fuel", "office", "materials", "maintenance", "utilities", "rent", "salary", "other"]),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  date: z.string().min(1, "التاريخ مطلوب"),
  paymentMethod: z.enum(["cash", "bank_transfer", "credit_card", "upi", "cheque"]),
  description: z.string().optional().nullable(),
  vehicleId: z.string().uuid("Invalid vehicle").optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  billUrl: z.string().url("Invalid URL").optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined;
  const month = url.searchParams.get("month") ? Number(url.searchParams.get("month")) : undefined;

  try {
    const [expenses, summary] = await Promise.all([
      listExpenses(auth.user.tenantId, { year, month }),
      expenseSummary(auth.user.tenantId),
    ]);
    return successResponse({ expenses, summary });
  } catch (err) {
    console.error("[GET /api/finance/expenses]", err);
    return errorResponse("EXPENSES_FETCH_ERROR", "Failed to load expenses", 500);
  }
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

  const parsed = CreateExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid expense data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const result = await createExpense(auth.user.tenantId, auth.user.sub, {
      category: d.category,
      amountSar: d.amountSar,
      date: new Date(d.date),
      paymentMethod: d.paymentMethod,
      description: d.description ?? null,
      vehicleId: d.vehicleId ?? null,
      referenceNumber: d.referenceNumber ?? null,
      billUrl: d.billUrl ?? null,
    });
    return successResponse(result, "تم تسجيل المصروف");
  } catch (err) {
    console.error("[POST /api/finance/expenses]", err);
    return errorResponse("EXPENSE_CREATE_ERROR", "Failed to create expense", 500);
  }
}
