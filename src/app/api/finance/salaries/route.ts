/**
 * /api/finance/salaries
 * GET  — list salaries + employee picker (optional ?year=&month=)
 * POST — pay a salary (auto-links a ledger entry)
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listSalaries, createSalary, expenseSummary } from "@/lib/services/expenses.service";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, ne, and } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateSalarySchema = z.object({
  employeeId: z.string().uuid("Invalid employee"),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  month: z.string().min(1, "الشهر مطلوب"),
  paidOn: z.string().min(1, "تاريخ الدفع مطلوب"),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined;
  const month = url.searchParams.get("month") ? Number(url.searchParams.get("month")) : undefined;

  try {
    const [salaries, summary, employees] = await Promise.all([
      listSalaries(auth.user.tenantId, { year, month }),
      expenseSummary(auth.user.tenantId),
      db
        .select({ id: users.id, fullName: users.fullName, role: users.role })
        .from(users)
        .where(and(eq(users.tenantId, auth.user.tenantId), ne(users.role, "DRIVER")))
        .orderBy(users.fullName),
    ]);
    return successResponse({ salaries, summary, employees });
  } catch (err) {
    console.error("[GET /api/finance/salaries]", err);
    return errorResponse("SALARIES_FETCH_ERROR", "Failed to load salaries", 500);
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

  const parsed = CreateSalarySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid salary data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  const month = new Date(d.month);
  month.setDate(1);

  try {
    const result = await createSalary(auth.user.tenantId, auth.user.sub, {
      employeeId: d.employeeId,
      amountSar: d.amountSar,
      month,
      paidOn: new Date(d.paidOn),
      notes: d.notes ?? null,
    });
    return successResponse(result, "تم تسجيل الراتب");
  } catch (err) {
    console.error("[POST /api/finance/salaries]", err);
    return errorResponse("SALARY_CREATE_ERROR", "Failed to create salary", 500);
  }
}
