/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  GCC Payroll Service (Epic 9 — Competitive Parity)
 * ============================================================
 *
 *  Saudi GOSI-accurate payroll (AKST / iCeipts parity).
 *  Rates verified against GOSI publications (Sep-2026):
 *
 *   • Contributory wage = basic + housing ONLY, capped SAR 45,000
 *   • Legacy Saudi (registered < 2024-07-03):
 *       employee 9.75% (9 + 0.75) · employer 11.75% (9 + 2 + 0.75)
 *   • New-system Saudi — annuity steps every July through 2028:
 *       2024: 9.0 | 2025: 9.5 | 2026: 10.0 | 2027: 10.5 | 2028+: 11.0
 *       employee = annuity + 0.75 (SANED)
 *       employer = annuity + 2.75 (hazards 2 + SANED 0.75)
 *   • Non-Saudi: employer 2% hazards only · employee 0%
 *
 *  CRITICAL: the track follows contribution HISTORY (explicit
 *  gosi_system per employee), never the hire date.
 * ============================================================
 */

import { db } from "@/db";
import {
  payrollEmployees,
  payrollRuns,
  payrollLines,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const GOSI_CAP_SAR = 45_000;
export const STANDARD_MONTH_DAYS = 30;

/** Annuity (pension) rate per side for new-system Saudis by July-anchor year. */
function newSystemAnnuity(anchorYear: number): number {
  if (anchorYear <= 2024) return 9.0;
  if (anchorYear === 2025) return 9.5;
  if (anchorYear === 2026) return 10.0;
  if (anchorYear === 2027) return 10.5;
  return 11.0; // 2028+ final
}

/** July-anchor year for a YYYY-MM period (steps apply each July). */
function anchorYearForPeriod(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

export interface GosiBreakdown {
  gosiSystem: "LEGACY" | "NEW" | "EXPAT";
  contributoryWage: number;
  employeeRatePct: number;
  employerRatePct: number;
  employeeGosi: number;
  employerGosi: number;
}

export function computeGosi(
  nationality: string,
  gosiSystem: string,
  baseSalary: number,
  housing: number,
  period: string
): GosiBreakdown {
  const wage = Math.min(GOSI_CAP_SAR, Math.max(0, baseSalary + housing));
  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (nationality !== "SAUDI") {
    const employer = r2((wage * 2) / 100);
    return {
      gosiSystem: "EXPAT",
      contributoryWage: r2(wage),
      employeeRatePct: 0,
      employerRatePct: 2,
      employeeGosi: 0,
      employerGosi: employer,
    };
  }

  let annuity: number;
  let system: "LEGACY" | "NEW";
  if (gosiSystem === "NEW") {
    annuity = newSystemAnnuity(anchorYearForPeriod(period));
    system = "NEW";
  } else {
    annuity = 9.0;
    system = "LEGACY";
  }

  const empRate = annuity + 0.75;
  const empyrRate = annuity + 2.75;
  return {
    gosiSystem: system,
    contributoryWage: r2(wage),
    employeeRatePct: r2(empRate),
    employerRatePct: r2(empyrRate),
    employeeGosi: r2((wage * empRate) / 100),
    employerGosi: r2((wage * empyrRate) / 100),
  };
}

// ─── Employees ────────────────────────────────────────────────────────────────

export async function listEmployees(tenantId: string, activeOnly = true) {
  const where = activeOnly
    ? and(eq(payrollEmployees.tenantId, tenantId), eq(payrollEmployees.isActive, true))
    : eq(payrollEmployees.tenantId, tenantId);
  return db
    .select()
    .from(payrollEmployees)
    .where(where)
    .orderBy(payrollEmployees.fullName);
}

export async function createEmployee(
  tenantId: string,
  input: {
    userId?: string;
    employeeCode: string;
    fullName: string;
    nationalId?: string;
    nationality?: string;
    gosiSystem?: string;
    jobTitle?: string;
    department?: string;
    baseSalarySar?: number;
    housingAllowanceSar?: number;
    transportAllowanceSar?: number;
    otherAllowancesSar?: number;
    bankIban?: string;
    bankName?: string;
    hireDate?: string;
    countryCode?: string;
    contactPhone?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    lastVacationDate?: string;
    lastResumptionDate?: string;
    medicalInsuranceNo?: string;
    medicalInsuranceExpiry?: string;
  }
) {
  const [created] = await db
    .insert(payrollEmployees)
    .values({
      tenantId,
      userId: input.userId || null,
      employeeCode: input.employeeCode,
      fullName: input.fullName,
      nationalId: input.nationalId,
      nationality: input.nationality === "SAUDI" ? "SAUDI" : "NON_SAUDI",
      gosiSystem: input.gosiSystem === "NEW" ? "NEW" : "LEGACY",
      jobTitle: input.jobTitle,
      department: input.department,
      baseSalarySar: String(input.baseSalarySar ?? 0),
      housingAllowanceSar: String(input.housingAllowanceSar ?? 0),
      transportAllowanceSar: String(input.transportAllowanceSar ?? 0),
      otherAllowancesSar: String(input.otherAllowancesSar ?? 0),
      bankIban: input.bankIban,
      bankName: input.bankName,
      hireDate: input.hireDate ? new Date(input.hireDate) : null,
      countryCode: input.countryCode,
      contactPhone: input.contactPhone,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      lastVacationDate: input.lastVacationDate ? new Date(input.lastVacationDate) : null,
      lastResumptionDate: input.lastResumptionDate ? new Date(input.lastResumptionDate) : null,
      medicalInsuranceNo: input.medicalInsuranceNo,
      medicalInsuranceExpiry: input.medicalInsuranceExpiry ? new Date(input.medicalInsuranceExpiry) : null,
    })
    .returning();
  return created;
}

export async function updateEmployee(
  tenantId: string,
  employeeId: string,
  input: Partial<{
    fullName: string;
    nationalId: string;
    nationality: string;
    gosiSystem: string;
    jobTitle: string;
    department: string;
    baseSalarySar: number;
    housingAllowanceSar: number;
    transportAllowanceSar: number;
    otherAllowancesSar: number;
    bankIban: string;
    bankName: string;
    isActive: boolean;
  }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "fullName", "nationalId", "jobTitle", "department", "bankIban", "bankName",
  ] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (input.nationality !== undefined)
    patch.nationality = input.nationality === "SAUDI" ? "SAUDI" : "NON_SAUDI";
  if (input.gosiSystem !== undefined)
    patch.gosiSystem = input.gosiSystem === "NEW" ? "NEW" : "LEGACY";
  for (const k of [
    "baseSalarySar", "housingAllowanceSar", "transportAllowanceSar", "otherAllowancesSar",
  ] as const) {
    if (input[k] !== undefined) patch[k] = String(input[k]);
  }
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [updated] = await db
    .update(payrollEmployees)
    .set(patch)
    .where(
      and(eq(payrollEmployees.id, employeeId), eq(payrollEmployees.tenantId, tenantId))
    )
    .returning();
  return updated ?? null;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export interface RunAdjustment {
  employeeId: string;
  daysWorked?: number;
  deductionsSar?: number;
  deductionNote?: string;
}

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function listRuns(tenantId: string) {
  return db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.tenantId, tenantId))
    .orderBy(desc(payrollRuns.period))
    .limit(24);
}

export async function getRun(tenantId: string, runId: string) {
  const rows = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return null;
  const lines = await db
    .select()
    .from(payrollLines)
    .where(and(eq(payrollLines.runId, runId), eq(payrollLines.tenantId, tenantId)))
    .orderBy(payrollLines.employeeName);
  return { ...rows[0], lines };
}

export async function createRun(
  tenantId: string,
  userId: string,
  period: string,
  adjustments: RunAdjustment[] = []
) {
  // One open run per period
  const existing = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.period, period)))
    .limit(1);
  if (existing[0]) throw new Error(`Payroll run for ${period} already exists`);

  const employees = await listEmployees(tenantId, true);
  if (employees.length === 0) throw new Error("No active employees");

  const adjBy = new Map(adjustments.map((a) => [a.employeeId, a]));

  const [run] = await db
    .insert(payrollRuns)
    .values({ tenantId, period, status: "DRAFT", createdById: userId })
    .returning();

  let tGross = 0;
  let tEmpGosi = 0;
  let tEmpyrGosi = 0;
  let tDed = 0;
  let tNet = 0;

  for (const e of employees) {
    const adj = adjBy.get(e.id);
    const days = Math.min(30, Math.max(0, adj?.daysWorked ?? 30));
    const factor = days / STANDARD_MONTH_DAYS;

    const base = r2(num(e.baseSalarySar) * factor);
    const housing = r2(num(e.housingAllowanceSar) * factor);
    const transport = r2(num(e.transportAllowanceSar) * factor);
    const other = r2(num(e.otherAllowancesSar) * factor);
    const allowances = r2(housing + transport + other);
    const gross = r2(base + allowances);

    const g = computeGosi(e.nationality, e.gosiSystem, base, housing, period);
    const deductions = r2(adj?.deductionsSar ?? 0);
    const net = r2(gross - g.employeeGosi - deductions);

    await db.insert(payrollLines).values({
      tenantId,
      runId: run.id,
      employeeId: e.id,
      employeeName: e.fullName,
      daysWorked: String(days),
      baseSalarySar: String(base),
      allowancesSar: String(allowances),
      grossSar: String(gross),
      gosiWageSar: String(g.contributoryWage),
      gosiSystem: g.gosiSystem,
      employeeGosiSar: String(g.employeeGosi),
      employerGosiSar: String(g.employerGosi),
      deductionsSar: String(deductions),
      deductionNote: adj?.deductionNote,
      netSar: String(net),
      bankIban: e.bankIban,
    });

    tGross += gross;
    tEmpGosi += g.employeeGosi;
    tEmpyrGosi += g.employerGosi;
    tDed += deductions;
    tNet += net;
  }

  const [final] = await db
    .update(payrollRuns)
    .set({
      totalGrossSar: String(r2(tGross)),
      totalEmployeeGosiSar: String(r2(tEmpGosi)),
      totalEmployerGosiSar: String(r2(tEmpyrGosi)),
      totalDeductionsSar: String(r2(tDed)),
      totalNetSar: String(r2(tNet)),
    })
    .where(eq(payrollRuns.id, run.id))
    .returning();

  return getRun(tenantId, final.id);
}

export async function transitionRun(
  tenantId: string,
  userId: string,
  runId: string,
  action: "APPROVE" | "PAY" | "CANCEL"
) {
  const rows = await db
    .select({ status: payrollRuns.status })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, tenantId)))
    .limit(1);
  const cur = rows[0]?.status;
  if (!cur) return { ok: false as const, error: "RUN_NOT_FOUND" };

  const allowed =
    (action === "APPROVE" && cur === "DRAFT") ||
    (action === "PAY" && cur === "APPROVED") ||
    (action === "CANCEL" && (cur === "DRAFT" || cur === "APPROVED"));
  if (!allowed) {
    return { ok: false as const, error: `Cannot ${action} a ${cur} run` };
  }

  const patch: Record<string, unknown> = {};
  if (action === "APPROVE") {
    patch.status = "APPROVED";
    patch.approvedById = userId;
    patch.approvedAt = new Date();
  } else if (action === "PAY") {
    patch.status = "PAID";
    patch.paidAt = new Date();
  } else {
    patch.status = "CANCELLED";
  }

  const [updated] = await db
    .update(payrollRuns)
    .set(patch)
    .where(eq(payrollRuns.id, runId))
    .returning();
  return { ok: true as const, run: updated };
}

// ─── Mudad/WPS export + payslip ───────────────────────────────────────────────

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Mudad/WPS salary file (bank upload layout). Column mapping follows the
 * common Saudi WPS format — confirm against your bank's template once.
 */
export async function exportMudadCsv(tenantId: string, runId: string) {
  const run = await getRun(tenantId, runId);
  if (!run) return null;
  const head = "sequence,employee_code,employee_name,national_id,iban,net_salary_sar,period";
  const lines = run.lines.map((l, i) =>
    [
      csvCell(i + 1),
      csvCell(""),
      csvCell(l.employeeName),
      csvCell(""),
      csvCell(l.bankIban ?? ""),
      csvCell(l.netSar),
      csvCell(run.period),
    ].join(",")
  );
  return {
    filename: `mudad-wps-${run.period}.csv`,
    content: [head, ...lines].join("\n"),
  };
}

export async function getPayslip(tenantId: string, runId: string, employeeId: string) {
  const run = await getRun(tenantId, runId);
  if (!run) return null;
  const line = run.lines.find((l) => l.employeeId === employeeId);
  if (!line) return null;
  return {
    period: run.period,
    status: run.status,
    employee: {
      name: line.employeeName,
      daysWorked: line.daysWorked,
      iban: line.bankIban,
    },
    earnings: {
      base: line.baseSalarySar,
      allowances: line.allowancesSar,
      gross: line.grossSar,
    },
    gosi: {
      system: line.gosiSystem,
      wage: line.gosiWageSar,
      employeeShare: line.employeeGosiSar,
      employerShare: line.employerGosiSar,
    },
    deductions: { amount: line.deductionsSar, note: line.deductionNote },
    net: line.netSar,
  };
}
