import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrPenalties, hrRequests, hrViolations, payrollEmployees } from "@/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/hr/deductions?period=YYYY-MM — monthly deductions sheet
 * ============================================================
 *  One row per employee with a non-zero total: penalty deductions
 *  issued that month + UNPAID traffic violations of that month +
 *  approved salary advances filed that month. This is the sheet the
 *  monthly employee review reads from — nothing here is invented, every
 *  line traces to its source record.
 */

function monthRange(period: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  // Asia/Riyadh month == UTC month shifted by +3h; boundaries computed in UTC.
  const from = new Date(Date.UTC(y, mo - 1, 1) - 3 * 3600 * 1000);
  const to = new Date(Date.UTC(y, mo, 1) - 3 * 3600 * 1000);
  return { from, to };
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const period = new URL(req.url).searchParams.get("period") ?? "";
  const range = monthRange(period);
  if (!range) return errorResponse("INVALID_PERIOD", "period must be YYYY-MM", 400);
  const t = auth.user.tenantId;

  const [emps, pens, vios, advs] = await Promise.all([
    db
      .select({ id: payrollEmployees.id, code: payrollEmployees.employeeCode, name: payrollEmployees.fullName })
      .from(payrollEmployees)
      .where(eq(payrollEmployees.tenantId, t)),
    db
      .select({ employeeId: hrPenalties.employeeId, amountSar: hrPenalties.amountSar })
      .from(hrPenalties)
      .where(
        and(
          eq(hrPenalties.tenantId, t),
          eq(hrPenalties.kind, "DEDUCTION"),
          gte(hrPenalties.issuedAt, range.from),
          lt(hrPenalties.issuedAt, range.to)
        )
      ),
    db
      .select({ employeeId: hrViolations.employeeId, amountSar: hrViolations.amountSar })
      .from(hrViolations)
      .where(
        and(
          eq(hrViolations.tenantId, t),
          eq(hrViolations.paid, false),
          gte(hrViolations.violationDate, range.from),
          lt(hrViolations.violationDate, range.to)
        )
      ),
    db
      .select({ requesterId: hrRequests.requesterId, amountSar: hrRequests.amountSar })
      .from(hrRequests)
      .where(
        and(
          eq(hrRequests.tenantId, t),
          eq(hrRequests.type, "ADVANCE"),
          eq(hrRequests.status, "APPROVED"),
          gte(hrRequests.createdAt, range.from),
          lt(hrRequests.createdAt, range.to)
        )
      ),
  ]);

  // Advances are filed by system user; map requester userId → payroll employee.
  const empByUser = new Map(emps.map((e) => [e.id, e]));
  const userEmp = await db
    .select({ id: payrollEmployees.id, userId: payrollEmployees.userId })
    .from(payrollEmployees)
    .where(eq(payrollEmployees.tenantId, t));
  const byUser = new Map(userEmp.filter((u) => u.userId).map((u) => [u.userId as string, u.id]));

  const agg = new Map<string, { penalties: number; violations: number; advances: number }>();
  const bump = (id: string, k: "penalties" | "violations" | "advances", v: number) => {
    const cur = agg.get(id) ?? { penalties: 0, violations: 0, advances: 0 };
    cur[k] += v;
    agg.set(id, cur);
  };
  for (const p of pens) bump(p.employeeId, "penalties", Number(p.amountSar ?? 0));
  for (const v of vios) bump(v.employeeId, "violations", Number(v.amountSar ?? 0));
  for (const a of advs) {
    const eid = byUser.get(a.requesterId);
    if (eid) bump(eid, "advances", Number(a.amountSar ?? 0));
  }

  const rows = [...agg.entries()]
    .map(([id, sums]) => {
      const e = empByUser.get(id);
      const total = Math.round((sums.penalties + sums.violations + sums.advances) * 100) / 100;
      return {
        employeeId: id,
        code: e?.code ?? "",
        name: e?.name ?? "",
        ...sums,
        total,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return successResponse(
    {
      period,
      rows,
      grandTotal: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100,
    },
    `${rows.length} employee(s) with deductions`
  );
}
