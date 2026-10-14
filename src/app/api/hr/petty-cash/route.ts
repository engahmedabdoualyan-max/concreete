import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrPettyExpenses, hrPettyFunds } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/hr/petty-cash — funds with spent/remaining computed
 *  POST /api/hr/petty-cash — open a fund (HR_WRITE)
 *  POST /api/hr/petty-cash/[id]/expenses — spend a line (HR_WRITE)
 *  POST /api/hr/petty-cash/[id]/settle — close the fund (HR_WRITE)
 * ============================================================
 *  Department financial custody settlement: received − spent =
 *  remaining. Settling stamps the difference (positive = cash back,
 *  negative = overspend) into settleNote history — the record stays.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const fundId = url.searchParams.get("fundId");
  if (fundId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fundId)) {
      return errorResponse("INVALID_ID", "Invalid fund id", 400);
    }
    const lines = await db
      .select()
      .from(hrPettyExpenses)
      .where(
        and(
          eq(hrPettyExpenses.tenantId, auth.user.tenantId),
          eq(hrPettyExpenses.fundId, fundId)
        )
      )
      .orderBy(desc(hrPettyExpenses.expenseDate));
    return successResponse({ expenses: lines }, `${lines.length} line(s)`);
  }
  const funds = await db
    .select()
    .from(hrPettyFunds)
    .where(eq(hrPettyFunds.tenantId, auth.user.tenantId))
    .orderBy(desc(hrPettyFunds.createdAt));
  const sums = await db
    .select({
      fundId: hrPettyExpenses.fundId,
      spent: sql<string>`COALESCE(SUM(${hrPettyExpenses.amountSar}), 0)::text`,
      lines: sql<string>`COUNT(*)::text`,
    })
    .from(hrPettyExpenses)
    .where(eq(hrPettyExpenses.tenantId, auth.user.tenantId))
    .groupBy(hrPettyExpenses.fundId);
  const byFund = new Map(sums.map((s) => [s.fundId, s]));
  const rows = funds.map((f) => {
    const spent = Number(byFund.get(f.id)?.spent ?? 0);
    const received = Number(f.amountReceived ?? 0);
    return {
      ...f,
      spent: Math.round(spent * 100) / 100,
      lines: Number(byFund.get(f.id)?.lines ?? 0),
      remaining: Math.round((received - spent) * 100) / 100,
    };
  });
  return successResponse({ funds: rows }, `${rows.length} fund(s)`);
}

const FundSchema = z.object({
  department: z.string().max(80).optional(),
  amountReceived: z.number().positive(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purpose: z.string().max(1000).optional(),
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
  const parsed = FundSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid fund payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const [created] = await db
    .insert(hrPettyFunds)
    .values({
      tenantId: auth.user.tenantId,
      department: d.department?.trim() || "الموارد البشرية",
      amountReceived: String(d.amountReceived),
      receivedDate: d.receivedDate,
      purpose: d.purpose?.trim() || null,
      receivedById: auth.user.sub,
    })
    .returning();
  return successResponse(created, "تم فتح العهدة المالية", 201);
}

const ExpenseSchema = z.object({
  amountSar: z.number().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(300),
});

export async function PUT(req: NextRequest) {
  // Spend a line: PUT /api/hr/petty-cash?id=<fund>&action=spend (HR_WRITE)
  // Settle the fund: PUT /api/hr/petty-cash?id=<fund>&action=settle (HR_WRITE)
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const action = url.searchParams.get("action") ?? "";
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid fund id", 400);

  const fund = (
    await db
      .select()
      .from(hrPettyFunds)
      .where(and(eq(hrPettyFunds.id, id), eq(hrPettyFunds.tenantId, auth.user.tenantId)))
  )[0];
  if (!fund) return errorResponse("FUND_NOT_FOUND", "Fund not found", 404);
  if (fund.status !== "OPEN") return errorResponse("FUND_SETTLED", "Fund already settled", 409);

  if (action === "spend") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
    }
    const parsed = ExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid expense payload", 400, {
        fields: parsed.error.flatten().fieldErrors,
      });
    }
    const d = parsed.data;
    const [line] = await db
      .insert(hrPettyExpenses)
      .values({
        tenantId: auth.user.tenantId,
        fundId: id,
        amountSar: String(d.amountSar),
        expenseDate: d.expenseDate,
        description: d.description.trim(),
        recordedById: auth.user.sub,
      })
      .returning();
    return successResponse(line, "تم تسجيل الصرف", 201);
  }

  if (action === "settle") {
    const spent = await db
      .select({ total: sql<string>`COALESCE(SUM(${hrPettyExpenses.amountSar}), 0)::text` })
      .from(hrPettyExpenses)
      .where(
        and(
          eq(hrPettyExpenses.tenantId, auth.user.tenantId),
          eq(hrPettyExpenses.fundId, id)
        )
      );
    const diff = Math.round((Number(fund.amountReceived) - Number(spent[0]?.total ?? 0)) * 100) / 100;
    const [settled] = await db
      .update(hrPettyFunds)
      .set({
        status: "SETTLED",
        settledAt: new Date(),
        settleNote: diff === 0 ? "مصفّاة بالكامل — لا فرق" : diff > 0 ? `مصفّاة — راجع ${diff} ر.س` : `مصفّاة — تجاوز ${-diff} ر.س`,
      })
      .where(eq(hrPettyFunds.id, id))
      .returning();
    return successResponse(settled, "تمت تصفية العهدة");
  }

  return errorResponse("INVALID_ACTION", "action must be spend|settle", 400);
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid fund id", 400);
  const [deleted] = await db
    .delete(hrPettyFunds)
    .where(
      and(
        eq(hrPettyFunds.id, id),
        eq(hrPettyFunds.tenantId, auth.user.tenantId),
        eq(hrPettyFunds.status, "OPEN")
      )
    )
    .returning({ id: hrPettyFunds.id });
  if (!deleted) return errorResponse("FUND_NOT_FOUND", "Only OPEN funds can be deleted", 404);
  await db.delete(hrPettyExpenses).where(eq(hrPettyExpenses.fundId, id));
  return successResponse({ id: deleted.id }, "تم حذف العهدة");
}
