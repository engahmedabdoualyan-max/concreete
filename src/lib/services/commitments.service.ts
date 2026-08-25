/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Commitments service (recurring obligations + payments)
 * ============================================================
 */

import { db } from "@/db";
import { commitments, commitmentPayments, ledgerEntries } from "@/db/schema";
import { eq, and, asc, desc, inArray, lt } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommitmentType =
  | "emi"
  | "lease"
  | "insurance"
  | "maintenance"
  | "utilities"
  | "rent"
  | "other";

export type CommitmentFrequency = "monthly" | "quarterly" | "half_yearly" | "yearly" | "one_time";

export type CommitmentStatus = "active" | "completed" | "terminated";

export type CommitmentPaymentMode = "CASH" | "CHEQUE" | "BANK" | "UPI" | "AUTO_DEBIT" | "OTHER";

export interface CreateCommitmentInput {
  title: string;
  commitmentType: CommitmentType;
  description?: string | null;
  amountSar: number;
  referenceNumber?: string | null;
  startDate: Date;
  endDate?: Date | null;
  paymentFrequency: CommitmentFrequency;
  paymentDay?: number;
  nextPaymentDate?: Date | null;
  payeeName: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

export interface CreateCommitmentPaymentInput {
  commitmentId: string;
  amountSar: number;
  paymentDate: Date;
  paymentMode: CommitmentPaymentMode;
  referenceNumber?: string | null;
  remarks?: string | null;
  receiptNumber?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const COMMITMENT_TYPE_LABEL: Record<CommitmentType, string> = {
  emi: "EMI",
  lease: "عقد إيجار",
  insurance: "تأمين",
  maintenance: "عقد صيانة",
  utilities: "مرافق",
  rent: "إيجار",
  other: "أخرى",
};

export const COMMITMENT_FREQUENCY_LABEL: Record<CommitmentFrequency, string> = {
  monthly: "شهري",
  quarterly: "ربع سنوي",
  half_yearly: "نصف سنوي",
  yearly: "سنوي",
  one_time: "لأول مرة",
};

export const COMMITMENT_PAYMENT_MODE_LABEL: Record<CommitmentPaymentMode, string> = {
  CASH: "نقدي",
  CHEQUE: "شيك",
  BANK: "تحويل بنكي",
  UPI: "UPI",
  AUTO_DEBIT: "خصم آلي",
  OTHER: "أخرى",
};

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Roll `nextPaymentDate` forward by the given frequency (clamped to month length). */
export function rollNextPaymentDate(
  current: Date,
  frequency: CommitmentFrequency,
  paymentDay: number
): Date | null {
  if (frequency === "one_time") return null;
  const d = new Date(current);
  const months =
    frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "half_yearly" ? 6 : 12;
  const year = d.getFullYear();
  const month = d.getMonth() + months;
  const y = year + Math.floor(month / 12);
  const m = ((month - 1) % 12) + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return new Date(y, m, Math.min(paymentDay, lastDay));
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listCommitments(tenantId: string) {
  const rows = await db
    .select()
    .from(commitments)
    .where(eq(commitments.tenantId, tenantId))
    .orderBy(asc(commitments.nextPaymentDate));

  if (rows.length === 0) return [];

  const payments = await db
    .select()
    .from(commitmentPayments)
    .where(inArray(commitmentPayments.commitmentId, rows.map((r) => r.id)))
    .orderBy(desc(commitmentPayments.paymentDate));

  const grouped = new Map<string, (typeof payments)[number][]>();
  for (const p of payments) {
    const list = grouped.get(p.commitmentId) ?? [];
    list.push(p);
    grouped.set(p.commitmentId, list);
  }

  return rows.map((c) => ({ ...c, payments: grouped.get(c.id) ?? [] }));
}

export async function listOverdueCommitments(tenantId: string) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.tenantId, tenantId),
        eq(commitments.status, "active"),
        lt(commitments.nextPaymentDate, toDateString(new Date()))
      )
    )
    .orderBy(asc(commitments.nextPaymentDate));
}

export async function createCommitment(tenantId: string, createdById: string, input: CreateCommitmentInput) {
  const nextPaymentDate = input.nextPaymentDate ?? input.startDate;

  const [row] = await db
    .insert(commitments)
    .values({
      tenantId,
      title: input.title,
      commitmentType: input.commitmentType,
      description: input.description ?? null,
      amountSar: input.amountSar,
      referenceNumber: input.referenceNumber ?? null,
      startDate: toDateString(input.startDate),
      endDate: input.endDate ? toDateString(input.endDate) : null,
      paymentFrequency: input.paymentFrequency,
      paymentDay: input.paymentDay ?? 1,
      nextPaymentDate: toDateString(nextPaymentDate),
      payeeName: input.payeeName,
      contactPerson: input.contactPerson ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
      createdById,
    })
    .returning();
  return row;
}

/**
 * Record a payment against a commitment.
 * - Creates the commitment payment row
 * - Creates a linked ledger entry (transaction_type = operational, expense)
 * - Rolls the commitment's nextPaymentDate forward + clears the paid flag
 */
export async function recordCommitmentPayment(
  tenantId: string,
  createdById: string,
  input: CreateCommitmentPaymentInput
) {
  return db.transaction(async (tx) => {
    const [commitment] = await tx
      .select()
      .from(commitments)
      .where(and(eq(commitments.id, input.commitmentId), eq(commitments.tenantId, tenantId)));
    if (!commitment) throw new Error("الالتزام غير موجود");

    const [payment] = await tx
      .insert(commitmentPayments)
      .values({
        tenantId,
        commitmentId: input.commitmentId,
        amountSar: input.amountSar,
        paymentDate: toDateString(input.paymentDate),
        paymentMode: input.paymentMode,
        referenceNumber: input.referenceNumber ?? null,
        remarks: input.remarks ?? null,
        receiptNumber: input.receiptNumber ?? null,
        createdById,
      })
      .returning();

    // Linked ledger entry (operational expense)
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: input.paymentDate,
        description: `سداد ${COMMITMENT_TYPE_LABEL[commitment.commitmentType]} — ${commitment.title}`,
        amountSar: input.amountSar,
        transactionType: "operational",
        referenceNumber: input.referenceNumber ?? null,
        counterpartyType: "commitment",
        counterpartyId: commitment.id,
        counterpartyName: commitment.payeeName,
        createdById,
      })
      .returning();

    await tx.update(commitmentPayments).set({ ledgerEntryId: entry.id }).where(eq(commitmentPayments.id, payment.id));

    // Roll the next payment date forward
    const next = rollNextPaymentDate(new Date(commitment.nextPaymentDate), commitment.paymentFrequency, commitment.paymentDay);
    await tx
      .update(commitments)
      .set({
        nextPaymentDate: next ? toDateString(next) : commitment.nextPaymentDate,
        currentPaymentIsPaid: false,
        updatedAt: new Date(),
      })
      .where(eq(commitments.id, commitment.id));

    return { payment, entry };
  });
}

export async function updateCommitmentStatus(tenantId: string, id: string, status: CommitmentStatus) {
  const [row] = await db
    .update(commitments)
    .set({ status, isActive: status === "active", updatedAt: new Date() })
    .where(and(eq(commitments.id, id), eq(commitments.tenantId, tenantId)))
    .returning();
  return row;
}

/** Re-roll nextPaymentDate for active commitments that are overdue or stale. */
export async function refreshCommitmentSchedules(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateString(today);
  const active = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.tenantId, tenantId), eq(commitments.status, "active")));
  const updated: string[] = [];

  for (const c of active) {
    let next = new Date(c.nextPaymentDate);
    let guard = 0;
    while (next < today && guard < 24) {
      const rolled = rollNextPaymentDate(next, c.paymentFrequency, c.paymentDay);
      if (!rolled) break;
      next = rolled;
      guard += 1;
    }
    const nextStr = toDateString(next);
    if (nextStr !== c.nextPaymentDate) {
      await db
        .update(commitments)
        .set({ nextPaymentDate: nextStr, currentPaymentIsPaid: false, updatedAt: new Date() })
        .where(eq(commitments.id, c.id));
      updated.push(c.id);
    }
  }
  return updated;
}
