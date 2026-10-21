/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  HR Advances Service
 * ============================================================
 *
 *  Employee salary advances with flexible repayment:
 *  - FIXED: fixed installment amount per month
 *  - PERCENTAGE: percentage of base salary per month
 *  - Auto-deduction via payroll_payments integration
 *  - Manager approval required (HR_MANAGER / PLANT_MGR)
 *  - Immediate deduction from next payroll after approval
 */

import { db } from "@/db";
import {
  hrAdvances,
  hrRequests,
  payrollEmployees,
  payrollPayments,
  users,
} from "@/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";

export type AdvanceRepaymentMode = "FIXED" | "PERCENTAGE";
export type AdvanceStatus = "PENDING" | "APPROVED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

const MODE_AR: Record<AdvanceRepaymentMode, string> = {
  FIXED: "قسط ثابت",
  PERCENTAGE: "نسبة من الراتب",
} as const;

const STATUS_AR: Record<AdvanceStatus, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "معتمد",
  ACTIVE: "قيد السداد",
  COMPLETED: "مسدد بالكامل",
  CANCELLED: "ملغى",
} as const;

/** Create an advance from an approved HR request (type=ADVANCE) */
export async function createAdvanceFromRequest(
  tenantId: string,
  requestId: string,
  input: {
    principalSar: number;
    repaymentMode: AdvanceRepaymentMode;
    installmentAmountSar?: number;
    installmentPct?: number;
    totalInstallments: number;
    nextDeductionPeriod: string; // YYYY-MM
  }
) {
  // Verify the request exists and is ADVANCE type
  const [req] = await db
    .select()
    .from(hrRequests)
    .where(and(eq(hrRequests.id, requestId), eq(hrRequests.tenantId, tenantId), eq(hrRequests.type, "ADVANCE")))
    .limit(1);

  if (!req) throw new Error("Advance request not found");
  if (req.status !== "APPROVED") throw new Error("Request must be approved first");

  const [created] = await db
    .insert(hrAdvances)
    .values({
      tenantId,
      employeeId: req.requesterId,
      requestId,
      principalSar: String(input.principalSar),
      repaymentMode: input.repaymentMode,
      installmentAmountSar: input.installmentAmountSar !== undefined ? String(input.installmentAmountSar) : null,
      installmentPct: input.installmentPct !== undefined ? String(input.installmentPct) : null,
      totalInstallments: input.totalInstallments,
      remainingSar: String(input.principalSar),
      nextDeductionPeriod: input.nextDeductionPeriod,
      status: "ACTIVE",
      requestedById: req.requesterId,
      requestedAt: req.createdAt,
      approvedById: req.reviewedById,
      approvedAt: req.reviewedAt,
      approvalNote: req.reviewNote,
    })
    .returning();

  return created;
}

/** Create a standalone advance (without HR request) */
export async function createAdvance(
  tenantId: string,
  actorId: string,
  input: {
    employeeId: string;
    principalSar: number;
    repaymentMode: AdvanceRepaymentMode;
    installmentAmountSar?: number;
    installmentPct?: number;
    totalInstallments: number;
    nextDeductionPeriod: string;
    approvalNote?: string;
  }
) {
  const [emp] = await db
    .select()
    .from(payrollEmployees)
    .where(and(eq(payrollEmployees.id, input.employeeId), eq(payrollEmployees.tenantId, tenantId)))
    .limit(1);

  if (!emp) throw new Error("Employee not found in payroll");

  // Validate repayment mode inputs
  if (input.repaymentMode === "FIXED" && !input.installmentAmountSar) {
    throw new Error("installmentAmountSar required for FIXED mode");
  }
  if (input.repaymentMode === "PERCENTAGE" && !input.installmentPct) {
    throw new Error("installmentPct required for PERCENTAGE mode");
  }

  const [created] = await db
    .insert(hrAdvances)
    .values({
      tenantId,
      employeeId: input.employeeId,
      principalSar: String(input.principalSar),
      repaymentMode: input.repaymentMode,
      installmentAmountSar: input.installmentAmountSar !== undefined ? String(input.installmentAmountSar) : null,
      installmentPct: input.installmentPct !== undefined ? String(input.installmentPct) : null,
      totalInstallments: input.totalInstallments,
      remainingSar: String(input.principalSar),
      nextDeductionPeriod: input.nextDeductionPeriod,
      status: "ACTIVE",
      requestedById: actorId,
      requestedAt: new Date(),
      approvedById: actorId,
      approvedAt: new Date(),
      approvalNote: input.approvalNote ?? null,
    })
    .returning();

  return created;
}

/** List advances with filters */
export async function listAdvances(
  tenantId: string,
  filters: {
    employeeId?: string;
    status?: AdvanceStatus;
    period?: string; // YYYY-MM for next deduction period
  } = {}
) {
  const conds = [eq(hrAdvances.tenantId, tenantId)];
  if (filters.employeeId) conds.push(eq(hrAdvances.employeeId, filters.employeeId));
  if (filters.status) conds.push(eq(hrAdvances.status, filters.status));
  if (filters.period) conds.push(eq(hrAdvances.nextDeductionPeriod, filters.period));

  const rows = await db
    .select({
      id: hrAdvances.id,
      principalSar: hrAdvances.principalSar,
      repaymentMode: hrAdvances.repaymentMode,
      installmentAmountSar: hrAdvances.installmentAmountSar,
      installmentPct: hrAdvances.installmentPct,
      totalInstallments: hrAdvances.totalInstallments,
      status: hrAdvances.status,
      paidInstallments: hrAdvances.paidInstallments,
      remainingSar: hrAdvances.remainingSar,
      nextDeductionPeriod: hrAdvances.nextDeductionPeriod,
      approvalNote: hrAdvances.approvalNote,
      requestedAt: hrAdvances.requestedAt,
      approvedAt: hrAdvances.approvedAt,
      employeeId: hrAdvances.employeeId,
      employeeCode: payrollEmployees.employeeCode,
      employeeName: payrollEmployees.fullName,
      baseSalarySar: payrollEmployees.baseSalarySar,
    })
    .from(hrAdvances)
    .innerJoin(payrollEmployees, eq(hrAdvances.employeeId, payrollEmployees.id))
    .where(and(...conds))
    .orderBy(desc(hrAdvances.createdAt));

  return rows.map(r => ({
    ...r,
    principalSar: Number(r.principalSar),
    installmentAmountSar: r.installmentAmountSar ? Number(r.installmentAmountSar) : null,
    installmentPct: r.installmentPct ? Number(r.installmentPct) : null,
    remainingSar: Number(r.remainingSar),
    baseSalarySar: Number(r.baseSalarySar),
    modeLabel: MODE_AR[r.repaymentMode as AdvanceRepaymentMode],
    statusLabel: STATUS_AR[r.status as AdvanceStatus],
  }));
}

/** Get advance by ID with full details */
export async function getAdvance(tenantId: string, id: string) {
  const [row] = await db
    .select({
      advance: hrAdvances,
      employee: payrollEmployees,
      requester: users,
    })
    .from(hrAdvances)
    .innerJoin(payrollEmployees, eq(hrAdvances.employeeId, payrollEmployees.id))
    .leftJoin(users, eq(hrAdvances.requestedById, users.id))
    .where(and(eq(hrAdvances.id, id), eq(hrAdvances.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  return {
    ...row.advance,
    principalSar: Number(row.advance.principalSar),
    installmentAmountSar: row.advance.installmentAmountSar ? Number(row.advance.installmentAmountSar) : null,
    installmentPct: row.advance.installmentPct ? Number(row.advance.installmentPct) : null,
    remainingSar: Number(row.advance.remainingSar),
    employee: {
      ...row.employee,
      baseSalarySar: Number(row.employee.baseSalarySar),
    },
    requesterName: row.requester?.fullName,
    modeLabel: MODE_AR[row.advance.repaymentMode as AdvanceRepaymentMode],
    statusLabel: STATUS_AR[row.advance.status as AdvanceStatus],
  };
}

/** Approve a pending advance (by HR_MANAGER / PLANT_MGR) */
export async function approveAdvance(
  tenantId: string,
  approverId: string,
  advanceId: string,
  approvalNote?: string
) {
  const [adv] = await db
    .select()
    .from(hrAdvances)
    .where(and(eq(hrAdvances.id, advanceId), eq(hrAdvances.tenantId, tenantId)))
    .limit(1);

  if (!adv) return null;
  if (adv.status !== "PENDING") throw new Error("Only PENDING advances can be approved");

  const [updated] = await db
    .update(hrAdvances)
    .set({
      status: "ACTIVE",
      approvedById: approverId,
      approvedAt: new Date(),
      approvalNote: approvalNote?.slice(0, 500) ?? null,
      updatedAt: new Date(),
    })
    .where(eq(hrAdvances.id, advanceId))
    .returning();

  return updated;
}

/** Cancel an advance (e.g., employee terminated) */
export async function cancelAdvance(
  tenantId: string,
  cancellerId: string,
  advanceId: string,
  cancelReason: string
) {
  const [adv] = await db
    .select()
    .from(hrAdvances)
    .where(and(eq(hrAdvances.id, advanceId), eq(hrAdvances.tenantId, tenantId)))
    .limit(1);

  if (!adv) return null;
  if (adv.status === "COMPLETED") throw new Error("Cannot cancel completed advance");

  const [updated] = await db
    .update(hrAdvances)
    .set({
      status: "CANCELLED",
      cancelledById: cancellerId,
      cancelledAt: new Date(),
      cancelReason: cancelReason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(hrAdvances.id, advanceId))
    .returning();

  return updated;
}

/** Process monthly deduction for all active advances (called from payroll run) */
export async function processMonthlyDeductions(
  tenantId: string,
  period: string, // YYYY-MM
  actorId: string
) {
  const installments = await db
    .select({
      advanceId: hrAdvances.id,
      employeeId: hrAdvances.employeeId,
      principalSar: hrAdvances.principalSar,
      repaymentMode: hrAdvances.repaymentMode,
      installmentAmountSar: hrAdvances.installmentAmountSar,
      installmentPct: hrAdvances.installmentPct,
      totalInstallments: hrAdvances.totalInstallments,
      paidInstallments: hrAdvances.paidInstallments,
      remainingSar: hrAdvances.remainingSar,
      nextDeductionPeriod: hrAdvances.nextDeductionPeriod,
      baseSalarySar: payrollEmployees.baseSalarySar,
    })
    .from(hrAdvances)
    .innerJoin(payrollEmployees, eq(hrAdvances.employeeId, payrollEmployees.id))
    .where(
      and(
        eq(hrAdvances.tenantId, tenantId),
        eq(hrAdvances.status, "ACTIVE"),
        gt(hrAdvances.remainingSar, "0"),
        eq(hrAdvances.nextDeductionPeriod, period)
      )
    );

  const results = [];
  for (const inst of installments) {
    const principal = Number(inst.principalSar);
    const remaining = Number(inst.remainingSar);
    const baseSalary = Number(inst.baseSalarySar);
    let deduction = 0;

    if (inst.repaymentMode === "FIXED") {
      deduction = Math.min(Number(inst.installmentAmountSar || 0), remaining);
    } else if (inst.repaymentMode === "PERCENTAGE" && inst.installmentPct && baseSalary > 0) {
      deduction = Math.min(Math.round(baseSalary * Number(inst.installmentPct) / 100 * 100) / 100, remaining);
    }
    if (deduction <= 0) continue;

    const remainingAfter = remaining - deduction;
    const nextPeriod = inst.nextDeductionPeriod
      ? `${String(Number(inst.nextDeductionPeriod.slice(0, 4)) + (Number(inst.nextDeductionPeriod.slice(5)) === 12 ? 1 : 0))}-${String((Number(inst.nextDeductionPeriod.slice(5)) % 12) + 1).padStart(2, "0")}`
      : null;

    // Upsert payroll_payments with deduction
    const [payment] = await db
      .insert(payrollPayments)
      .values({
        tenantId,
        employeeId: inst.employeeId,
        period,
        status: "UNPAID",
        dueAmountSar: "0",
        paidAmountSar: "0",
        deductionSar: String(deduction),
        note: `قسط سلفة ${inst.advanceId}`,
        updatedById: actorId,
      })
      .onConflictDoUpdate({
        target: [payrollPayments.tenantId, payrollPayments.employeeId, payrollPayments.period],
        set: {
          deductionSar: sql`${payrollPayments.deductionSar} + ${deduction}`,
          note: sql`COALESCE(${payrollPayments.note}, '') || ' | قسط سلفة ' || ${inst.advanceId}`,
          updatedById: actorId,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Update advance record
    await db
      .update(hrAdvances)
      .set({
        paidInstallments: sql`${hrAdvances.paidInstallments} + 1`,
        remainingSar: String(remainingAfter),
        nextDeductionPeriod: nextPeriod,
        status: remainingAfter <= 0 ? "COMPLETED" : "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(hrAdvances.id, inst.advanceId));

    results.push({ advanceId: inst.advanceId, employeeId: inst.employeeId, deduction, paymentId: payment.id });
  }

  return results;
}

/** Get advance summary for an employee */
export async function getEmployeeAdvanceSummary(tenantId: string, employeeId: string) {
  const advances = await listAdvances(tenantId, { employeeId });
  const active = advances.filter(a => a.status === "ACTIVE");
  const pending = advances.filter(a => a.status === "PENDING");
  const completed = advances.filter(a => a.status === "COMPLETED");
  const totalOutstanding = active.reduce((sum, a) => sum + a.remainingSar, 0);
  const nextDeduction = active.reduce((sum, a) => {
    if (!a.nextDeductionPeriod) return sum;
    const inst = a.repaymentMode === "FIXED"
      ? Math.min(a.installmentAmountSar || 0, a.remainingSar)
      : a.installmentPct && a.baseSalarySar
        ? Math.min(Math.round(a.baseSalarySar * a.installmentPct / 100 * 100) / 100, a.remainingSar)
        : 0;
    return sum + inst;
  }, 0);

  return {
    active: active.length,
    pending: pending.length,
    completed: completed.length,
    totalOutstanding,
    nextDeduction,
    advances,
  };
}