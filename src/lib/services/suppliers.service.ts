/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Suppliers & purchase orders service
 * ============================================================
 */

import { db } from "@/db";
import {
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  supplierPayments,
  inventorySilos,
  inventoryTransactions,
  ledgerEntries,
} from "@/db/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSupplierInput {
  name: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface PurchaseOrderItemInput {
  siloId?: string | null;
  materialCategory: string;
  materialName: string;
  quantityKg: number;
  ratePerKgSar: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  purchaseDate: Date;
  dueDate?: Date | null;
  vatPercent?: number;
  transportCostSar?: number;
  notes?: string | null;
  items: PurchaseOrderItemInput[];
}

export interface RecordSupplierPaymentInput {
  supplierId: string;
  purchaseOrderId: string;
  amountSar: number;
  paymentMode: string;
  paymentDate: Date;
  dueDate?: Date | null;
  referenceNumber?: string | null;
  remarks?: string | null;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const SUPPLIER_PAYMENT_MODE_LABEL: Record<string, string> = {
  CASH: "نقدي",
  CHEQUE: "شيك",
  BANK: "تحويل بنكي",
  CREDIT: "آجل",
  UPI: "UPI",
  OTHER: "أخرى",
};

export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "مسودة",
  ORDERED: "تم الطلب",
  PARTIAL_RECEIVED: "استلام جزئي",
  RECEIVED: "مستلم",
  CANCELLED: "ملغي",
};

// ─── Suppliers ────────────────────────────────────────────────────────────────

export async function listSuppliers(tenantId: string, includeInactive = false) {
  return db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tenantId), includeInactive ? undefined : eq(suppliers.isActive, true)))
    .orderBy(asc(suppliers.name));
}

export async function createSupplier(tenantId: string, createdById: string, input: CreateSupplierInput) {
  const [row] = await db
    .insert(suppliers)
    .values({
      tenantId,
      name: input.name,
      contactPerson: input.contactPerson ?? null,
      phone: input.phone,
      email: input.email ?? null,
      vatNumber: input.vatNumber ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      createdById,
    })
    .returning();
  return row;
}

// ─── Purchase orders ──────────────────────────────────────────────────────────

async function nextPONumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const existing = await db
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenantId, tenantId));
  let max = 0;
  for (const r of existing) {
    const m = r.poNumber.match(/PO-\d{4}-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export async function createPurchaseOrder(tenantId: string, createdById: string, input: CreatePurchaseOrderInput) {
  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, tenantId)));
    if (!supplier) throw new Error("المورد غير موجود");

    const subtotal = input.items.reduce((s, i) => s + Math.round(i.quantityKg * i.ratePerKgSar), 0);
    const vatPercent = input.vatPercent ?? 15;
    const vatAmount = Math.round((subtotal * vatPercent) / 100);
    const transport = input.transportCostSar ?? 0;
    const total = subtotal + vatAmount + transport;

    const poNumber = await nextPONumber(tenantId);
    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        tenantId,
        poNumber,
        supplierId: input.supplierId,
        purchaseDate: toDateString(input.purchaseDate),
        dueDate: input.dueDate ? toDateString(input.dueDate) : null,
        subtotalSar: subtotal,
        vatPercent,
        vatAmountSar: vatAmount,
        transportCostSar: transport,
        totalAmountSar: total,
        status: "ORDERED",
        notes: input.notes ?? null,
        createdById,
      })
      .returning();

    for (const item of input.items) {
      await tx.insert(purchaseOrderItems).values({
        tenantId,
        purchaseOrderId: po.id,
        siloId: item.siloId ?? null,
        materialCategory: item.materialCategory as never,
        materialName: item.materialName,
        quantityKg: item.quantityKg.toFixed(3),
        ratePerKgSar: item.ratePerKgSar,
        lineTotalSar: Math.round(item.quantityKg * item.ratePerKgSar),
      });
    }

    return { po, supplierName: supplier.name };
  });
}

export async function listPurchaseOrders(tenantId: string) {
  const rows = await db
    .select({
      po: purchaseOrders,
      supplierName: suppliers.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.tenantId, tenantId))
    .orderBy(desc(purchaseOrders.purchaseDate))
    .limit(50);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.po.id);
  const [items, payments] = await Promise.all([
    db.select().from(purchaseOrderItems).where(inArray(purchaseOrderItems.purchaseOrderId, ids)),
    db.select().from(supplierPayments).where(inArray(supplierPayments.purchaseOrderId, ids)),
  ]);

  const itemsByPo = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByPo.get(it.purchaseOrderId) ?? [];
    list.push(it);
    itemsByPo.set(it.purchaseOrderId, list);
  }
  const paysByPo = new Map<string, typeof payments>();
  for (const p of payments) {
    const list = paysByPo.get(p.purchaseOrderId) ?? [];
    list.push(p);
    paysByPo.set(p.purchaseOrderId, list);
  }

  return rows.map((r) => ({
    ...r.po,
    supplierName: r.supplierName,
    items: itemsByPo.get(r.po.id) ?? [],
    payments: paysByPo.get(r.po.id) ?? [],
    balanceSar: r.po.totalAmountSar - r.po.paidAmountSar,
    paymentStatus:
      r.po.paidAmountSar >= r.po.totalAmountSar
        ? "PAID"
        : r.po.paidAmountSar > 0
          ? "PARTIAL"
          : "PENDING",
  }));
}

/**
 * Record a supplier payment → update PO paidAmount + create ledger entry.
 */
export async function recordSupplierPayment(tenantId: string, createdById: string, input: RecordSupplierPaymentInput) {
  return db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, input.purchaseOrderId), eq(purchaseOrders.tenantId, tenantId)));
    if (!po) throw new Error("أمر الشراء غير موجود");

    const newPaid = po.paidAmountSar + input.amountSar;

    const [payment] = await tx
      .insert(supplierPayments)
      .values({
        tenantId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId,
        amountSar: input.amountSar,
        paymentMode: input.paymentMode as never,
        paymentDate: toDateString(input.paymentDate),
        dueDate: input.dueDate ? toDateString(input.dueDate) : null,
        referenceNumber: input.referenceNumber ?? null,
        remarks: input.remarks ?? null,
        createdById,
      })
      .returning();

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: input.paymentDate,
        description: `سداد مورد — ${po.poNumber}`,
        amountSar: input.amountSar,
        transactionType: "purchase",
        referenceNumber: input.referenceNumber ?? null,
        counterpartyType: "supplier",
        counterpartyId: input.supplierId,
        createdById,
      })
      .returning();

    await tx.update(supplierPayments).set({ ledgerEntryId: entry.id }).where(eq(supplierPayments.id, payment.id));
    await tx
      .update(purchaseOrders)
      .set({ paidAmountSar: newPaid, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, po.id));

    return { payment, entry, balanceSar: po.totalAmountSar - newPaid };
  });
}

/**
 * Receive a PO → credit silo stock + inventory transactions + ledger entry
 * for the total payable. Marks inventoryUpdated.
 */
export async function receivePurchaseOrder(tenantId: string, poId: string) {
  return db.transaction(async (tx) => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));
    if (!po) throw new Error("أمر الشراء غير موجود");
    if (po.inventoryUpdated) throw new Error("تم استلام هذا الأمر مسبقاً");

    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, poId));

    const received: { materialName: string; quantityKg: string; newStockKg: string }[] = [];
    for (const item of items) {
      if (!item.siloId) continue;
      const [silo] = await tx
        .select()
        .from(inventorySilos)
        .where(eq(inventorySilos.id, item.siloId));
      if (!silo) continue;

      const current = parseFloat(silo.currentStockKg ?? "0");
      const capacity = parseFloat(silo.capacityKg ?? "0");
      const add = Math.min(parseFloat(item.quantityKg), Math.max(0, capacity - current));
      const newStock = current + add;

      await tx
        .update(inventorySilos)
        .set({ currentStockKg: newStock.toFixed(3), updatedAt: new Date() })
        .where(eq(inventorySilos.id, item.siloId));

      await tx.insert(inventoryTransactions).values({
        tenantId,
        siloId: item.siloId,
        transactionType: "RECEIPT",
        quantityKg: add.toFixed(3),
        balanceAfterKg: newStock.toFixed(3),
        referenceDoc: po.poNumber,
        performedById: po.createdById,
        notes: `استلام مشتريات ${po.poNumber}`,
      });

      received.push({ materialName: item.materialName, quantityKg: add.toFixed(3), newStockKg: newStock.toFixed(3) });
    }

    // Ledger entry for the full PO value (purchase / payable)
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        date: new Date(),
        description: `استلام مشتريات ${po.poNumber}`,
        amountSar: po.totalAmountSar,
        transactionType: "purchase",
        referenceNumber: po.poNumber,
        counterpartyType: "supplier",
        counterpartyId: po.supplierId,
        createdById: po.createdById,
      })
      .returning();

    await tx
      .update(purchaseOrders)
      .set({ status: "RECEIVED", inventoryUpdated: true, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, poId));

    return { po, received, ledgerEntryId: entry.id };
  });
}

export async function supplierSummary(tenantId: string) {
  const [aggs] = await db
    .select({
      supplierCount: sql<number>`count(distinct ${suppliers.id})`,
    })
    .from(suppliers)
    .where(eq(suppliers.tenantId, tenantId));

  const [poAgg] = await db
    .select({
      totalPayableSar: sql<number>`coalesce(sum(${purchaseOrders.totalAmountSar} - ${purchaseOrders.paidAmountSar}), 0)`,
      totalOrderedSar: sql<number>`coalesce(sum(${purchaseOrders.totalAmountSar}), 0)`,
      openPoCount: sql<number>`count(*) filter (where ${purchaseOrders.status} in ('ORDERED', 'PARTIAL_RECEIVED'))`,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenantId, tenantId));

  return {
    supplierCount: Number(aggs?.supplierCount ?? 0),
    totalPayableSar: Number(poAgg?.totalPayableSar ?? 0),
    totalOrderedSar: Number(poAgg?.totalOrderedSar ?? 0),
    openPoCount: Number(poAgg?.openPoCount ?? 0),
  };
}
