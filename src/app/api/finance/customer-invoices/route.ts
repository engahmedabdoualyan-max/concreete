/**
 * ============================================================
 *  /api/finance/customer-invoices — Customer Invoices (Sales)
 * ============================================================
 *  GET    ?status=&customerId=&page=&limit=  → List invoices
 *  POST   { customerId, orderId?, invoiceDate, dueDate, items[], vatPercent?, description?, notes? }
 *         → Create invoice (auto-links order, calculates totals, auto-links ledger)
 *  RBAC: FINANCE_READ (GET) · FINANCE_CLIENT_UPDATE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { customerInvoices, clients, orders, mixDesigns } from "@/db/schema";
import type { customerInvoiceStatusEnum } from "@/db/schema";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const INVOICE_NUMBER_RE = /^CINV-\d{4}-\d{5}$/;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const customerId = url.searchParams.get("customerId") ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const conditions = [eq(customerInvoices.tenantId, auth.user.tenantId)];
  if (status) conditions.push(eq(customerInvoices.status, status as (typeof customerInvoiceStatusEnum.enumValues)[number]));
  if (customerId) conditions.push(eq(customerInvoices.customerId, customerId));

  try {
    const [rows, total] = await Promise.all([
      db
        .select({
          id: customerInvoices.id,
          invoiceNumber: customerInvoices.invoiceNumber,
          invoiceDate: customerInvoices.invoiceDate,
          dueDate: customerInvoices.dueDate,
          subtotalSar: customerInvoices.subtotalSar,
          vatPercent: customerInvoices.vatPercent,
          vatAmountSar: customerInvoices.vatAmountSar,
          totalAmountSar: customerInvoices.totalAmountSar,
          paidAmountSar: customerInvoices.paidAmountSar,
          status: customerInvoices.status,
          description: customerInvoices.description,
          createdAt: customerInvoices.createdAt,
          customerId: customerInvoices.customerId,
          customerName: clients.companyName,
          customerCode: clients.clientCode,
          orderId: customerInvoices.orderId,
          orderNumber: orders.orderNumber,
        })
        .from(customerInvoices)
        .leftJoin(clients, eq(customerInvoices.customerId, clients.id))
        .leftJoin(orders, eq(customerInvoices.orderId, orders.id))
        .where(and(...conditions))
        .orderBy(desc(customerInvoices.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(customerInvoices)
        .where(and(...conditions)),
    ]);

    return successResponse({
      invoices: rows,
      pagination: { page, limit, total: Number(total[0]?.count ?? 0), totalPages: Math.ceil((Number(total[0]?.count ?? 0) || 1) / limit) },
    });
  } catch (err) {
    console.error("[GET /api/finance/customer-invoices]", err);
    return errorResponse("INVOICE_FETCH_ERROR", "Failed to load invoices", 500);
  }
}

const InvoiceItemSchema = z.object({
  itemName: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceSar: z.number().positive(),
  vatPercent: z.number().min(0).max(100).default(15),
});

const CreateInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(InvoiceItemSchema).min(1),
  vatPercent: z.number().min(0).max(100).default(15).optional(),
  description: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid invoice data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const data = parsed.data;

  // Verify customer exists and belongs to tenant
  const [customer] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, parsed.data.customerId), eq(clients.tenantId, auth.user.tenantId)))
    .limit(1);
  if (!customer) return errorResponse("NOT_FOUND", "Customer not found", 404);

  // If orderId provided, verify it exists and belongs to customer
  if (parsed.data.orderId) {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, parsed.data.orderId), eq(orders.clientId, parsed.data.customerId)))
      .limit(1);
    if (!order) return errorResponse("NOT_FOUND", "Order not found for this customer", 404);
  }

  // Generate invoice number: CINV-YYYY-NNNNN
  const year = new Date().getFullYear();
  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(customerInvoices)
    .where(and(eq(customerInvoices.tenantId, auth.user.tenantId), sql`invoice_number LIKE 'CINV-${new Date().getFullYear()}%'`));
  const nextNum = (Number(count[0]?.count ?? 0) + 1).toString().padStart(5, '0');
  const invoiceNumber = `CINV-${new Date().getFullYear()}-${nextNum}`;

  // Calculate totals from items
  let subtotal = 0;
  for (const item of parsed.data.items) {
    subtotal += item.quantity * item.unitPriceSar;
  }
  const vatPercent = parsed.data.vatPercent ?? 15;
  // SAR cents (halala) — the column is an integer, never a float.
  const subtotalSar = Math.round(subtotal * 100);
  const vatAmountSarCalc = Math.round(subtotal * (vatPercent / 100) * 100);
  const totalAmountSar = subtotalSar + vatAmountSarCalc;

  try {
    const [created] = await db
      .insert(customerInvoices)
      .values({
        tenantId: auth.user.tenantId,
        invoiceNumber,
        customerId: parsed.data.customerId,
        orderId: parsed.data.orderId ?? null,
        invoiceDate: parsed.data.invoiceDate,
        dueDate: parsed.data.dueDate ?? null,
        subtotalSar,
        vatPercent: vatPercent,
        vatAmountSar: vatAmountSarCalc,
        totalAmountSar: totalAmountSar,
        paidAmountSar: 0,
        status: "OPEN",
        description: parsed.data.description ?? null,
        notes: parsed.data.notes ?? null,
        createdById: auth.user.sub,
      })
      .returning();

    // Create ledger entry for the sale
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/ledger/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN || ''}` },
      body: JSON.stringify({
        date: parsed.data.invoiceDate,
        description: `مبيعات - فاتورة ${invoiceNumber} - ${parsed.data.description || ''}`,
        amountSar: totalAmountSar,
        transactionType: 'sale',
        referenceNumber: invoiceNumber,
        counterpartyType: 'customer',
        counterpartyName: customer.companyName,
      }),
    }).catch(() => {}); // Non-blocking — the invoice is saved even if the ledger write fails

    return successResponse(created, "تم إنشاء الفاتورة بنجاح", 201);
  } catch (err) {
    console.error("[POST /api/finance/customer-invoices]", err);
    return errorResponse("INVOICE_CREATE_ERROR", "Failed to create invoice", 500);
  }
}