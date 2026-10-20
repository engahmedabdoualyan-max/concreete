/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  نثريات الموظفين — employee fuel / car rent / housing
 * ============================================================
 *  Month-scoped cash outflows under Finance → «نثريات». Every row
 *  auto-links a ledger entry inside one transaction, exactly like
 *  `expenses.service.ts`, so the income ledger stays the single
 *  source of truth for money out.
 * ============================================================
 */

import { db } from "@/db";
import { miscExpenses, ledgerEntries, payrollEmployees } from "@/db/schema";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MiscExpenseKind = "employee_fuel" | "employee_car_rent" | "employee_housing";
export type MiscPaymentMethod = "cash" | "bank_transfer" | "credit_card" | "upi" | "cheque";

export interface CreateMiscExpenseInput {
  kind: MiscExpenseKind;
  employeeId: string;
  /** First day of the covered month (any date inside the month works) */
  periodMonth: Date;
  amountSar: number;
  paymentDate: Date;
  paymentMethod?: MiscPaymentMethod;
  notes?: string | null;
  referenceNumber?: string | null;
}

export interface UpdateMiscExpenseInput {
  kind?: MiscExpenseKind;
  employeeId?: string;
  periodMonth?: Date;
  amountSar?: number;
  paymentDate?: Date;
  paymentMethod?: MiscPaymentMethod;
  notes?: string | null;
  referenceNumber?: string | null;
}

export const MISC_KIND_LABEL: Record<MiscExpenseKind, string> = {
  employee_fuel: "بنزين الموظفين",
  employee_car_rent: "إيجار سيارات الموظفين",
  employee_housing: "سكن الموظفين",
};

export const MISC_METHOD_LABEL: Record<MiscPaymentMethod, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  credit_card: "بطاقة ائتمان",
  upi: "UPI",
  cheque: "شيك",
};

export class MiscExpenseNotFoundError extends Error {
  constructor() {
    super("بند النثريات غير موجود");
    this.name = "MiscExpenseNotFoundError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalize to the first day of the month (accepts any date in the month). */
function firstOfMonth(d: Date): string {
  return toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listMiscExpenses(
  tenantId: string,
  opts: { year?: number; month?: number; kind?: MiscExpenseKind } = {}
) {
  const conditions = [eq(miscExpenses.tenantId, tenantId)];
  if (opts.year) {
    const from = toDateString(new Date(opts.year, (opts.month ?? 1) - 1, 1));
    const to = toDateString(new Date(opts.year, opts.month ?? 1, 1));
    conditions.push(gte(miscExpenses.periodMonth, from), lt(miscExpenses.periodMonth, to));
  }
  if (opts.kind) conditions.push(eq(miscExpenses.kind, opts.kind));

  const rows = await db
    .select({
      row: miscExpenses,
      employeeFullName: payrollEmployees.fullName,
      employeeJob: payrollEmployees.jobTitle,
    })
    .from(miscExpenses)
    .leftJoin(payrollEmployees, eq(miscExpenses.employeeId, payrollEmployees.id))
    .where(and(...conditions))
    .orderBy(desc(miscExpenses.periodMonth), desc(miscExpenses.paymentDate));

  return rows.map((r) => ({
    ...r.row,
    employeeFullName: r.employeeFullName ?? r.row.employeeName,
    employeeJob: r.employeeJob,
  }));
}

export async function createMiscExpense(tenantId: string, createdById: string, input: CreateMiscExpenseInput) {
  return db.transaction(async (tx) => {
    // Snapshot the employee name so history survives renames/removals.
    const [emp] = await tx
      .select({ fullName: payrollEmployees.fullName })
      .from(payrollEmployees)
      .where(and(eq(payrollEmployees.id, input.employeeId), eq(payrollEmployees.tenantId, tenantId)));
    if (!emp) throw new Error("الموظف غير موجود");

    const [row] = await tx
      .insert(miscExpenses)
      .values({
        tenantId,
        kind: input.kind,
        employeeId: input.employeeId,
        employeeName: emp.fullName,
        periodMonth: firstOfMonth(input.periodMonth),
        amountSar: input.amountSar,
        paymentDate: toDateString(input.paymentDate),
        paymentMethod: input.paymentMethod ?? "cash",
        notes: input.notes ?? null,
        referenceNumber: input.referenceNumber ?? null,
        createdById,
      })
      .returning();

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: input.paymentDate,
        description: `نثريات — ${MISC_KIND_LABEL[input.kind]} — ${emp.fullName} (${toDateString(input.periodMonth).slice(0, 7)})`,
        amountSar: input.amountSar,
        transactionType: "expense",
        referenceNumber: input.referenceNumber ?? null,
        counterpartyType: "employee",
        counterpartyId: input.employeeId,
        counterpartyName: emp.fullName,
        createdById,
      })
      .returning();

    await tx.update(miscExpenses).set({ ledgerEntryId: entry.id }).where(eq(miscExpenses.id, row.id));
    return { miscExpense: row, entry };
  });
}

export async function updateMiscExpense(tenantId: string, id: string, input: UpdateMiscExpenseInput) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(miscExpenses)
      .where(and(eq(miscExpenses.id, id), eq(miscExpenses.tenantId, tenantId)));
    if (!existing) throw new MiscExpenseNotFoundError();

    const patch: Record<string, unknown> = {};
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.periodMonth !== undefined) patch.periodMonth = firstOfMonth(input.periodMonth);
    if (input.amountSar !== undefined) patch.amountSar = input.amountSar;
    if (input.paymentDate !== undefined) patch.paymentDate = toDateString(input.paymentDate);
    if (input.paymentMethod !== undefined) patch.paymentMethod = input.paymentMethod;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.referenceNumber !== undefined) patch.referenceNumber = input.referenceNumber;

    let employeeId = existing.employeeId;
    let employeeName = existing.employeeName;
    if (input.employeeId !== undefined && input.employeeId !== existing.employeeId) {
      const [emp] = await tx
        .select({ fullName: payrollEmployees.fullName })
        .from(payrollEmployees)
        .where(and(eq(payrollEmployees.id, input.employeeId), eq(payrollEmployees.tenantId, tenantId)));
      if (!emp) throw new Error("الموظف غير موجود");
      employeeId = input.employeeId;
      employeeName = emp.fullName;
      patch.employeeId = employeeId;
      patch.employeeName = employeeName;
    }

    const [row] = await tx.update(miscExpenses).set(patch).where(eq(miscExpenses.id, id)).returning();

    // Keep the ledger row in step — same transaction, no orphan drift.
    if (existing.ledgerEntryId) {
      await tx
        .update(ledgerEntries)
        .set({
          date: new Date(row.paymentDate),
          description: `نثريات — ${MISC_KIND_LABEL[row.kind]} — ${employeeName ?? "موظف"} (${row.periodMonth.slice(0, 7)})`,
          amountSar: row.amountSar,
          referenceNumber: row.referenceNumber,
          counterpartyId: employeeId,
          counterpartyName: employeeName,
        })
        .where(eq(ledgerEntries.id, existing.ledgerEntryId));
    }

    return row;
  });
}

/** Remove a نثريات row AND its linked ledger entry (they must never diverge). */
export async function deleteMiscExpense(tenantId: string, id: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(miscExpenses)
      .where(and(eq(miscExpenses.id, id), eq(miscExpenses.tenantId, tenantId)));
    if (!existing) throw new MiscExpenseNotFoundError();

    if (existing.ledgerEntryId) {
      await tx.delete(ledgerEntries).where(eq(ledgerEntries.id, existing.ledgerEntryId));
    }
    await tx.delete(miscExpenses).where(eq(miscExpenses.id, id));
    return existing;
  });
}

// ─── Summary & employee options ───────────────────────────────────────────────

export async function miscExpenseSummary(
  tenantId: string,
  opts: { year?: number; month?: number } = {}
) {
  const conditions = [eq(miscExpenses.tenantId, tenantId)];
  if (opts.year) {
    const from = toDateString(new Date(opts.year, (opts.month ?? 1) - 1, 1));
    const to = toDateString(new Date(opts.year, opts.month ?? 1, 1));
    conditions.push(gte(miscExpenses.periodMonth, from), lt(miscExpenses.periodMonth, to));
  }

  const byKind = await db
    .select({ kind: miscExpenses.kind, total: sql<number>`coalesce(sum(${miscExpenses.amountSar}), 0)` })
    .from(miscExpenses)
    .where(and(...conditions))
    .groupBy(miscExpenses.kind);

  const [tot] = await db
    .select({ total: sql<number>`coalesce(sum(${miscExpenses.amountSar}), 0)` })
    .from(miscExpenses)
    .where(and(...conditions));

  return { byKind, totalSar: Number(tot?.total ?? 0) };
}

/** Active employees for the add-form dropdown — served from inside FINANCE_READ. */
export async function miscEmployeeOptions(tenantId: string) {
  return db
    .select({
      id: payrollEmployees.id,
      fullName: payrollEmployees.fullName,
      jobTitle: payrollEmployees.jobTitle,
      employeeCode: payrollEmployees.employeeCode,
    })
    .from(payrollEmployees)
    .where(and(eq(payrollEmployees.tenantId, tenantId), eq(payrollEmployees.isActive, true)))
    .orderBy(payrollEmployees.fullName);
}
