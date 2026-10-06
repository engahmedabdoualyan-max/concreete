import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrLeaveBalances } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
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
 *  GET /api/hr/leave-balances[?employeeId=] — yearly entitlements
 *  PUT /api/hr/leave-balances — set allocation (HR_WRITE)
 * ============================================================
 *  Approving a LEAVE request auto-decrements `used` (see review flow);
 *  rows auto-create at 0 so no entitlement is ever invented. Negative
 *  balance = overuse, shown as-is.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const employeeId = new URL(req.url).searchParams.get("employeeId");
  const rows = await db
    .select()
    .from(hrLeaveBalances)
    .where(
      and(
        eq(hrLeaveBalances.tenantId, auth.user.tenantId),
        ...(employeeId ? [eq(hrLeaveBalances.employeeId, employeeId)] : [])
      )
    )
    .orderBy(desc(hrLeaveBalances.year));
  return successResponse({ balances: rows }, `${rows.length} balance(s)`);
}

const SetSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  leaveType: z.enum(["ANNUAL", "SICK", "UNPAID"]).optional(),
  allocated: z.number().nonnegative(),
});

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = SetSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid allocation payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const type = d.leaveType ?? "ANNUAL";

  const existing = await db
    .select()
    .from(hrLeaveBalances)
    .where(
      and(
        eq(hrLeaveBalances.tenantId, auth.user.tenantId),
        eq(hrLeaveBalances.employeeId, d.employeeId),
        eq(hrLeaveBalances.year, d.year),
        eq(hrLeaveBalances.leaveType, type)
      )
    );
  if (existing.length > 0) {
    const [updated] = await db
      .update(hrLeaveBalances)
      .set({ allocated: String(d.allocated) })
      .where(eq(hrLeaveBalances.id, existing[0].id))
      .returning();
    return successResponse(updated, "تم تحديث الرصيد");
  }
  const [created] = await db
    .insert(hrLeaveBalances)
    .values({
      tenantId: auth.user.tenantId,
      employeeId: d.employeeId,
      year: d.year,
      leaveType: type,
      allocated: String(d.allocated),
    })
    .returning();
  return successResponse(created, "تم تحديد الرصيد", 201);
}
