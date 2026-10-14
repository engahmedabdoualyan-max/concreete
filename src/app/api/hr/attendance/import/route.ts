import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrAttendance, payrollEmployees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
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
 *  POST /api/hr/attendance/import — fingerprint/Excel import
 * ============================================================
 *  Body: { rows: [{ code, datetime, type? }] } (max 2000 rows).
 *  `code` matches payroll employeeCode (case-insensitive); `datetime`
 *  is ISO. Earliest punch of the day becomes check-in, latest becomes
 *  check-out — but only into EMPTY slots, so live app pings are never
 *  clobbered. Unknown codes are reported back, not silently dropped.
 *  The attendance report reads the same rows, so the rest of the
 *  tabs (report, export, payroll) pick them up automatically.
 */

const RowSchema = z.object({
  code: z.string().min(1).max(20),
  datetime: z.string().min(1).max(40),
  type: z.enum(["in", "out"]).optional(),
});

const ImportSchema = z.object({
  rows: z.array(RowSchema).min(1).max(2000),
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
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid import payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const emps = await db
    .select({ id: payrollEmployees.id, code: payrollEmployees.employeeCode, userId: payrollEmployees.userId })
    .from(payrollEmployees)
    .where(eq(payrollEmployees.tenantId, auth.user.tenantId));
  const byCode = new Map(emps.map((e) => [e.code.trim().toLowerCase(), e]));

  // Group punches per user per day.
  type Punch = { at: Date; type?: "in" | "out" };
  const groups = new Map<string, { userId: string; day: string; punches: Punch[]; code: string }>();
  const unknown = new Set<string>();
  for (const r of parsed.data.rows) {
    const emp = byCode.get(r.code.trim().toLowerCase());
    if (!emp || !emp.userId) {
      unknown.add(r.code.trim());
      continue;
    }
    const at = new Date(r.datetime);
    if (Number.isNaN(+at)) {
      unknown.add(`${r.code} (bad date)`);
      continue;
    }
    const day = at.toISOString().slice(0, 10);
    const key = `${emp.userId}|${day}`;
    const g = groups.get(key) ?? { userId: emp.userId, day, punches: [], code: emp.code };
    g.punches.push({ at, type: r.type });
    groups.set(key, g);
  }

  let imported = 0;
  let filled = 0;
  for (const g of groups.values()) {
    const sorted = g.punches.map((p) => p.at).sort((a, b) => +a - +b);
    const explicitIn = g.punches.filter((p) => p.type === "in").map((p) => p.at).sort((a, b) => +a - +b)[0];
    const explicitOut = g.punches.filter((p) => p.type === "out").map((p) => p.at).sort((a, b) => +b - +a)[0];
    const checkIn = explicitIn ?? sorted[0];
    const checkOut = explicitOut ?? (sorted.length > 1 ? sorted[sorted.length - 1] : undefined);

    const existing = await db
      .select()
      .from(hrAttendance)
      .where(
        and(
          eq(hrAttendance.tenantId, auth.user.tenantId),
          eq(hrAttendance.userId, g.userId),
          eq(hrAttendance.workDate, g.day)
        )
      );
    if (existing.length === 0) {
      await db.insert(hrAttendance).values({
        tenantId: auth.user.tenantId,
        userId: g.userId,
        workDate: g.day,
        checkInAt: checkIn,
        checkOutAt: checkOut ?? null,
      });
      imported++;
    } else {
      const row = existing[0];
      const patch: Record<string, Date> = {};
      if (!row.checkInAt && checkIn) patch.checkInAt = checkIn;
      if (!row.checkOutAt && checkOut) patch.checkOutAt = checkOut;
      if (Object.keys(patch).length > 0) {
        await db.update(hrAttendance).set(patch).where(eq(hrAttendance.id, row.id));
        filled++;
      }
    }
  }

  return successResponse(
    {
      imported,
      filled,
      skippedUnknown: [...unknown],
      days: groups.size,
    },
    `تم استيراد ${imported} يوم + استكمال ${filled}`
  );
}
