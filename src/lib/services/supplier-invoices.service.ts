/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  فواتير المورد + كشف حساب المورد
 * ============================================================
 *  Invoices are charges issued against a supplier (فاتورة مشتريات),
 *  numbered SINV-YYYY-NNNN per tenant. A payment targets a PO **or**
 *  an invoice (XOR, see sp_target_check) — never both.
 *
 *  Statement invariant (no double counting):
 *    مدين = فواتير غير ملغاة + أوامر شراء غير ملغاة ليس لها فاتورة مرتبطة
 *    دائن = كل سدادات المورد (سواء كانت على أمر شراء أو على فاتورة)
 * ============================================================
 */

import { db } from "@/db";
import {
  supplierInvoices,
  supplierPayments,
  suppliers,
  purchaseOrders,
  ledgerEntries,
} from "@/db/schema";
import { eq, and, desc, asc, sql, like, ne } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";

export interface CreateInvoiceInput {
  supplierId: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  subtotalSar: number;
  vatPercent?: number;
  totalAmountSar: number;
  description?: string | null;
  notes?: string | null;
  purchaseOrderId?: string | null;
}

export interface UpdateInvoiceInput {
  invoiceDate?: Date;
  dueDate?: Date | null;
  subtotalSar?: number;
  vatPercent?: number;
  totalAmountSar?: number;
  description?: string | null;
  notes?: string | null;
  status?: InvoiceStatus;
}

export interface InvoicePaymentInput {
  amountSar: number;
  paymentDate: Date;
  paymentMode?: string;
  referenceNumber?: string | null;
  remarks?: string | null;
}

export class InvoiceNotFoundError extends Error {
  constructor() {
    super("الفاتورة غير موجودة");
    this.name = "InvoiceNotFoundError";
  }
}

/** 409 — a settled invoice cannot be edited or deleted. */
export class InvoiceLockedError extends Error {
  constructor() {
    super("الفاتورة عليها سدادات — لا يمكن تعديلها أو حذفها");
    this.name = "InvoiceLockedError";
  }
}

/** 400 — deleting would orphan payment history. */
export class InvoiceHasPaymentsError extends Error {
  constructor() {
    super("لا يمكن حذف فاتورة عليها سدادات — ألغِها بدلاً من الحذف");
    this.name = "InvoiceHasPaymentsError";
  }
}

export class SupplierNotFoundError extends Error {
  constructor() {
    super("المورد غير موجود");
    this.name = "SupplierNotFoundError";
  }
}

/**
 * 400 OVERPAYMENT_NOT_ALLOWED — same errorCode as the PO guard so the
 * frontend maps it identically; wording names the invoice, not a PO.
 */
export class InvoiceOverpaymentError extends Error {
  readonly invoiceNumber: string;
  readonly amountSar: number;
  readonly balanceBeforeSar: number;
  constructor(invoiceNumber: string, amountSar: number, balanceBeforeSar: number) {
    const sar = (n: number) => (n / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
    super(
      `مبلغ السداد (${sar(amountSar)} ر.س) يتجاوز المتبقي على الفاتورة ${invoiceNumber} (${sar(balanceBeforeSar)} ر.س) — المسموح به كحد أقصى: ${sar(balanceBeforeSar)} ر.س`
    );
    this.name = "InvoiceOverpaymentError";
    this.invoiceNumber = invoiceNumber;
    this.amountSar = amountSar;
    this.balanceBeforeSar = balanceBeforeSar;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function deriveStatus(paidSar: number, totalSar: number): InvoiceStatus {
  if (paidSar >= totalSar && totalSar > 0) return "PAID";
  if (paidSar > 0) return "PARTIAL";
  return "OPEN";
}

/** Next per-tenant sequence: SINV-2026-00007 (max numeric suffix + 1). */
async function nextInvoiceNumber(tenantId: string, date: Date): Promise<string> {
  const prefix = `SINV-${date.getFullYear()}-`;
  const [last] = await db
    .select({ invoiceNumber: supplierInvoices.invoiceNumber })
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.tenantId, tenantId), like(supplierInvoices.invoiceNumber, `${prefix}%`)))
    .orderBy(desc(supplierInvoices.invoiceNumber))
    .limit(1);
  const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${`${seq}`.padStart(5, "0")}`;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listSupplierInvoices(tenantId: string, opts: { supplierId?: string } = {}) {
  const conditions = [eq(supplierInvoices.tenantId, tenantId)];
  if (opts.supplierId) conditions.push(eq(supplierInvoices.supplierId, opts.supplierId));

  return db
    .select({
      invoice: supplierInvoices,
      supplierName: suppliers.name,
      supplierCategory: suppliers.category,
      poNumber: purchaseOrders.poNumber,
    })
    .from(supplierInvoices)
    .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
    .leftJoin(purchaseOrders, eq(supplierInvoices.purchaseOrderId, purchaseOrders.id))
    .where(and(...conditions))
    .orderBy(desc(supplierInvoices.invoiceDate), desc(supplierInvoices.createdAt));
}

export async function createSupplierInvoice(
  tenantId: string,
  createdById: string,
  input: CreateInvoiceInput
) {
  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, tenantId)));
    if (!supplier) throw new SupplierNotFoundError();

    if (input.purchaseOrderId) {
      const [po] = await tx
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.tenantId, tenantId)));
      if (!po) throw new Error("أمر الشراء غير موجود");
    }

    const invoiceNumber = await (async () => {
      // same-sequence generator, but inside the tx for consistency
      const prefix = `SINV-${input.invoiceDate.getFullYear()}-`;
      const [last] = await tx
        .select({ invoiceNumber: supplierInvoices.invoiceNumber })
        .from(supplierInvoices)
        .where(and(eq(supplierInvoices.tenantId, tenantId), like(supplierInvoices.invoiceNumber, `${prefix}%`)))
        .orderBy(desc(supplierInvoices.invoiceNumber))
        .limit(1);
      const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
      return `${prefix}${`${seq}`.padStart(5, "0")}`;
    })();

    const vatPercent = input.vatPercent ?? 15;
    const vatAmountSar = Math.max(0, input.totalAmountSar - input.subtotalSar);

    const [row] = await tx
      .insert(supplierInvoices)
      .values({
        tenantId,
        invoiceNumber,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceDate: toDateString(input.invoiceDate),
        dueDate: input.dueDate ? toDateString(input.dueDate) : null,
        subtotalSar: input.subtotalSar,
        vatPercent,
        vatAmountSar,
        totalAmountSar: input.totalAmountSar,
        paidAmountSar: 0,
        status: "OPEN",
        description: input.description ?? null,
        notes: input.notes ?? null,
        createdById,
      })
      .returning();

    return { invoice: row, supplierName: supplier.name };
  });
}

export async function updateSupplierInvoice(
  tenantId: string,
  invoiceId: string,
  input: UpdateInvoiceInput
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(supplierInvoices)
      .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));
    if (!existing) throw new InvoiceNotFoundError();

    // cancellation is always allowed; field edits need a clean slate
    const cancelling = input.status === "CANCELLED" && existing.status !== "CANCELLED";
    if (!cancelling && existing.paidAmountSar > 0) throw new InvoiceLockedError();
    if (existing.status === "CANCELLED") throw new InvoiceLockedError();

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.invoiceDate !== undefined) patch.invoiceDate = toDateString(input.invoiceDate);
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? toDateString(input.dueDate) : null;
    if (input.subtotalSar !== undefined) patch.subtotalSar = input.subtotalSar;
    if (input.vatPercent !== undefined) patch.vatPercent = input.vatPercent;
    if (input.totalAmountSar !== undefined) patch.totalAmountSar = input.totalAmountSar;
    if (input.description !== undefined) patch.description = input.description;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.status !== undefined) patch.status = input.status;

    if (input.subtotalSar !== undefined || input.totalAmountSar !== undefined) {
      const total = input.totalAmountSar ?? existing.totalAmountSar;
      const sub = input.subtotalSar ?? existing.subtotalSar;
      patch.vatAmountSar = Math.max(0, total - sub);
      patch.status = deriveStatus(existing.paidAmountSar, total);
      if (input.status === "CANCELLED") patch.status = "CANCELLED";
    }

    const [row] = await tx
      .update(supplierInvoices)
      .set(patch)
      .where(eq(supplierInvoices.id, invoiceId))
      .returning();
    return row;
  });
}

/** Hard delete only when nothing settled against it — history first. */
export async function deleteSupplierInvoice(tenantId: string, invoiceId: string) {
  const [existing] = await db
    .select({ id: supplierInvoices.id, paidAmountSar: supplierInvoices.paidAmountSar })
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));
  if (!existing) throw new InvoiceNotFoundError();
  if (existing.paidAmountSar > 0) throw new InvoiceHasPaymentsError();
  await db.delete(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  return existing;
}

// ─── سداد الفاتورة ────────────────────────────────────────────────────────────

export async function recordSupplierInvoicePayment(
  tenantId: string,
  createdById: string,
  invoiceId: string,
  input: InvoicePaymentInput
) {
  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ inv: supplierInvoices, supplierName: suppliers.name })
      .from(supplierInvoices)
      .innerJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
      .where(and(eq(supplierInvoices.id, invoiceId), eq(supplierInvoices.tenantId, tenantId)));
    if (!invoice) throw new InvoiceNotFoundError();
    if (invoice.inv.status === "CANCELLED") throw new InvoiceLockedError();

    const remaining = invoice.inv.totalAmountSar - invoice.inv.paidAmountSar;
    if (input.amountSar > remaining) {
      throw new InvoiceOverpaymentError(invoice.inv.invoiceNumber, input.amountSar, remaining);
    }

    const [payment] = await tx
      .insert(supplierPayments)
      .values({
        tenantId,
        supplierId: invoice.inv.supplierId,
        purchaseOrderId: null,
        invoiceId,
        amountSar: input.amountSar,
        paymentMode: (input.paymentMode ?? "BANK") as never,
        paymentDate: toDateString(input.paymentDate),
        referenceNumber: input.referenceNumber ?? null,
        remarks: input.remarks ?? null,
        createdById,
      })
      .returning();

    const newPaid = invoice.inv.paidAmountSar + input.amountSar;
    const newStatus = deriveStatus(newPaid, invoice.inv.totalAmountSar);
    const [updated] = await tx
      .update(supplierInvoices)
      .set({ paidAmountSar: newPaid, status: newStatus, updatedAt: new Date() })
      .where(eq(supplierInvoices.id, invoiceId))
      .returning();

    const [ledger] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: new Date(toDateString(input.paymentDate)),
        description: `سداد فاتورة ${invoice.inv.invoiceNumber} — ${invoice.supplierName}`,
        amountSar: input.amountSar,
        transactionType: "purchase",
        referenceNumber: invoice.inv.invoiceNumber,
        counterpartyType: "supplier",
        counterpartyId: invoice.inv.supplierId,
        counterpartyName: invoice.supplierName,
        createdById,
      })
      .returning();

    await tx
      .update(supplierPayments)
      .set({ ledgerEntryId: ledger.id })
      .where(eq(supplierPayments.id, payment.id));

    return { payment, invoice: updated };
  });
}

// ─── كشف حساب المورد ──────────────────────────────────────────────────────────

export interface StatementMovement {
  date: string;
  type: "INVOICE" | "PO" | "PAYMENT";
  ref: string;
  description: string;
  debitSar: number;
  creditSar: number;
  balanceSar: number;
}

export interface SupplierStatement {
  supplier: {
    id: string;
    name: string;
    category: string | null;
    phone: string;
    crNumber: string | null;
    paymentTerms: string | null;
    bankIban: string | null;
  };
  movements: StatementMovement[];
  openingBalanceSar: number;
  totalDebitSar: number;
  totalCreditSar: number;
  balanceSar: number;
  from: string | null;
  to: string | null;
  hasInvoiceLinkedToPO: boolean;
}

/**
 * كشف حساب في أي وقت: كل الحركات مرتبة زمنياً برصيد جارٍ.
 * فاتورة مرتبطة بأمر شراء تحتسب مكانه مرة واحدة فقط (باستثناء الـ PO).
 */
export async function supplierStatement(
  tenantId: string,
  supplierId: string,
  opts: { from?: Date | null; to?: Date | null } = {}
): Promise<SupplierStatement> {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId)));
  if (!supplier) throw new SupplierNotFoundError();

  const [invoices, pos, payments] = await Promise.all([
    db
      .select()
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.tenantId, tenantId),
          eq(supplierInvoices.supplierId, supplierId),
          ne(supplierInvoices.status, "CANCELLED")
        )
      ),
    db
      .select({ po: purchaseOrders, invoiced: sql<number>`exists(select 1 from ${supplierInvoices} i where i.purchase_order_id = ${purchaseOrders.id} and i.status <> 'CANCELLED')::int` })
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.supplierId, supplierId), ne(purchaseOrders.status, "CANCELLED"))
      ),
    db
      .select()
      .from(supplierPayments)
      .where(and(eq(supplierPayments.tenantId, tenantId), eq(supplierPayments.supplierId, supplierId))),
  ]);

  const raw: Array<Omit<StatementMovement, "balanceSar">> = [];

  for (const inv of invoices) {
    raw.push({
      date: inv.invoiceDate,
      type: "INVOICE",
      ref: inv.invoiceNumber,
      description: inv.description ?? (inv.purchaseOrderId ? `فاتورة مشتريات (مرتبطة بأمر شراء)` : "فاتورة مشتريات"),
      debitSar: inv.totalAmountSar,
      creditSar: 0,
    });
  }

  for (const { po, invoiced } of pos) {
    if (Number(invoiced) === 1) continue; // already counted through its invoice
    raw.push({
      date: po.purchaseDate,
      type: "PO",
      ref: po.poNumber,
      description: `أمر شراء (مستلم/مفتوح) — بدون فاتورة`,
      debitSar: po.totalAmountSar,
      creditSar: 0,
    });
  }

  for (const p of payments) {
    raw.push({
      date: p.paymentDate,
      type: "PAYMENT",
      ref: p.referenceNumber ?? p.id.slice(0, 8),
      description: p.remarks ?? (p.invoiceId ? "سداد فاتورة" : "سداد أمر شراء"),
      debitSar: 0,
      creditSar: p.amountSar,
    });
  }

  raw.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  let running = 0;
  const all: StatementMovement[] = raw.map((m) => {
    running += m.debitSar - m.creditSar;
    return { ...m, balanceSar: running };
  });

  const from = opts.from ? toDateString(opts.from) : null;
  const to = opts.to ? toDateString(opts.to) : null;

  const beforeFrom = from ? all.filter((m) => m.date < from) : [];
  const openingBalanceSar = beforeFrom.length ? beforeFrom[beforeFrom.length - 1].balanceSar : 0;

  const movements = all.filter((m) => (!from || m.date >= from) && (!to || m.date <= to));
  const totalDebitSar = movements.reduce((s, m) => s + m.debitSar, 0);
  const totalCreditSar = movements.reduce((s, m) => s + m.creditSar, 0);

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      category: supplier.category,
      phone: supplier.phone,
      crNumber: supplier.crNumber,
      paymentTerms: supplier.paymentTerms,
      bankIban: supplier.bankIban,
    },
    movements,
    openingBalanceSar,
    totalDebitSar,
    totalCreditSar,
    balanceSar: running,
    from,
    to,
    hasInvoiceLinkedToPO: invoices.some((i) => i.purchaseOrderId !== null),
  };
}

// re-export the number generator for tests/tools
export { nextInvoiceNumber };
