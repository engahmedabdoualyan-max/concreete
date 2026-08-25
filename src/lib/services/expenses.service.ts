/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Expenses & salaries service (auto-linked to the ledger)
 * ============================================================
 */

import { db } from "@/db";
import { expenses, salaries, ledgerEntries, fleetVehicles, users } from "@/db/schema";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | "vehicle"
  | "fuel"
  | "office"
  | "materials"
  | "maintenance"
  | "utilities"
  | "rent"
  | "salary"
  | "other";

export type ExpensePaymentMethod = "cash" | "bank_transfer" | "credit_card" | "upi" | "cheque";

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amountSar: number;
  date: Date;
  paymentMethod: ExpensePaymentMethod;
  description?: string | null;
  vehicleId?: string | null;
  referenceNumber?: string | null;
  billUrl?: string | null;
}

export interface CreateSalaryInput {
  employeeId: string;
  amountSar: number;
  month: Date;
  paidOn: Date;
  notes?: string | null;
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  vehicle: "مركبات",
  fuel: "وقود",
  office: "مكتبية",
  materials: "خامات",
  maintenance: "صيانة",
  utilities: "مرافق",
  rent: "إيجار",
  salary: "رواتب",
  other: "أخرى",
};

export const EXPENSE_PAYMENT_METHOD_LABEL: Record<ExpensePaymentMethod, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  credit_card: "بطاقة ائتمان",
  upi: "UPI",
  cheque: "شيك",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange(year: number, month?: number): { from: string; to: string } {
  if (month !== undefined) {
    return { from: toDateString(new Date(year, month - 1, 1)), to: toDateString(new Date(year, month, 1)) };
  }
  return { from: toDateString(new Date(year, 0, 1)), to: toDateString(new Date(year + 1, 0, 1)) };
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function listExpenses(tenantId: string, opts: { year?: number; month?: number } = {}) {
  const conditions = [eq(expenses.tenantId, tenantId)];
  if (opts.year) {
    const { from, to } = monthRange(opts.year, opts.month);
    conditions.push(gte(expenses.date, from), lt(expenses.date, to));
  }

  const rows = await db
    .select({
      expense: expenses,
      vehicleName: fleetVehicles.vehicleCode,
      vehiclePlate: fleetVehicles.plateNumber,
    })
    .from(expenses)
    .leftJoin(fleetVehicles, eq(expenses.vehicleId, fleetVehicles.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.date));

  return rows.map((r) => ({ ...r.expense, vehicleName: r.vehicleName, vehiclePlate: r.vehiclePlate }));
}

export async function createExpense(tenantId: string, createdById: string, input: CreateExpenseInput) {
  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        tenantId,
        category: input.category,
        amountSar: input.amountSar,
        date: toDateString(input.date),
        paymentMethod: input.paymentMethod,
        description: input.description ?? null,
        vehicleId: input.vehicleId ?? null,
        referenceNumber: input.referenceNumber ?? null,
        billUrl: input.billUrl ?? null,
        createdById,
      })
      .returning();

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: input.date,
        description: `مصروف ${EXPENSE_CATEGORY_LABEL[input.category]}${input.description ? ` — ${input.description}` : ""}`,
        amountSar: input.amountSar,
        transactionType: "expense",
        referenceNumber: input.referenceNumber ?? null,
        counterpartyName: null,
        createdById,
      })
      .returning();

    await tx.update(expenses).set({ ledgerEntryId: entry.id }).where(eq(expenses.id, expense.id));
    return { expense, entry };
  });
}

// ─── Salaries ─────────────────────────────────────────────────────────────────

export async function listSalaries(tenantId: string, opts: { year?: number; month?: number } = {}) {
  const conditions = [eq(salaries.tenantId, tenantId)];
  if (opts.year) {
    const { from, to } = monthRange(opts.year, opts.month);
    conditions.push(gte(salaries.month, from), lt(salaries.month, to));
  }

  const rows = await db
    .select({
      salary: salaries,
      employeeName: users.fullName,
      employeeRole: users.role,
    })
    .from(salaries)
    .leftJoin(users, eq(salaries.employeeId, users.id))
    .where(and(...conditions))
    .orderBy(desc(salaries.paidOn));

  return rows.map((r) => ({ ...r.salary, employeeName: r.employeeName, employeeRole: r.employeeRole }));
}

export async function createSalary(tenantId: string, createdById: string, input: CreateSalaryInput) {
  return db.transaction(async (tx) => {
    const [salary] = await tx
      .insert(salaries)
      .values({
        tenantId,
        employeeId: input.employeeId,
        amountSar: input.amountSar,
        month: toDateString(input.month),
        paidOn: toDateString(input.paidOn),
        notes: input.notes ?? null,
        createdById,
      })
      .returning();

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: input.paidOn,
        description: `راتب شهر ${input.month.toISOString().slice(0, 7)}`,
        amountSar: input.amountSar,
        transactionType: "operational",
        referenceNumber: null,
        counterpartyType: "employee",
        counterpartyId: input.employeeId,
        createdById,
      })
      .returning();

    await tx.update(salaries).set({ ledgerEntryId: entry.id }).where(eq(salaries.id, salary.id));
    return { salary, entry };
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export async function expenseSummary(tenantId: string) {
  const [expenseAgg] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amountSar}), 0)` })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId));

  const byCategory = await db
    .select({ category: expenses.category, total: sql<number>`coalesce(sum(${expenses.amountSar}), 0)` })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId))
    .groupBy(expenses.category);

  const [salaryAgg] = await db
    .select({ total: sql<number>`coalesce(sum(${salaries.amountSar}), 0)` })
    .from(salaries)
    .where(eq(salaries.tenantId, tenantId));

  return {
    totalExpensesSar: Number(expenseAgg?.total ?? 0),
    totalSalariesSar: Number(salaryAgg?.total ?? 0),
    byCategory,
  };
}
