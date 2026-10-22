/**
 * ============================================================
 *  /api/finance/customer-invoices/:id — Single Customer Invoice
 * ============================================================
 *  GET    → Invoice details with payment history
 *  PATCH  → Update invoice (status, notes, etc.)
 *  DELETE → Cancel invoice (if OPEN)
 *  POST /pay  → Record payment against invoice
 *  POST /zatca/issue → Issue ZATCA e-invoice
 *  RBAC: FINANCE_READ (GET) · FINANCE_CLIENT_UPDATE (PATCH/POST/DELETE)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { customerInvoices, customerPayments, clients, ledgerEntries, tenantZatcaSettings } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid invoice ID", 400);

  try {
    const [invoice] = await db
      .select({
        invoice: customerInvoices,
        client: { companyName: clients.companyName, clientCode: clients.clientCode, phone: clients.phone, email: clients.email },
      })
      .from(customerInvoices)
      .leftJoin(clients, eq(customerInvoices.customerId, clients.id))
      .where(and(eq(customerInvoices.id, id), eq(customerInvoices.tenantId, auth.user.tenantId)))
      .limit(1);

    if (!invoice) return errorResponse("NOT_FOUND", "Invoice not found", 404);

    // Get payments
    const payments = await db
      .select()
      .from(customerPayments)
      .where(and(eq(customerPayments.invoiceId, id), eq(customerPayments.tenantId, auth.user.tenantId)))
      .orderBy(desc(customerPayments.paymentDate));

    return successResponse({ invoice, payments });
  } catch (err) {
    console.error("[GET /api/finance/customer-invoices/:id]", err);
    return errorResponse("INVOICE_FETCH_ERROR", "Failed to load invoice", 500);
  }
}

const UpdateInvoiceSchema = z.object({
  status: z.enum(["OPEN", "PARTIAL", "PAID", "CANCELLED"]).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).optional(),
  description: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid invoice ID", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid invoice data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const [updated] = await db
      .update(customerInvoices)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(customerInvoices.id, id), eq(customerInvoices.tenantId, auth.user.tenantId)))
      .returning();

    if (!updated) return errorResponse("NOT_FOUND", "Invoice not found", 404);
    return successResponse(updated, "تم تحديث الفاتورة");
  } catch (err) {
    console.error("[PATCH /api/finance/customer-invoices/:id]", err);
    return errorResponse("INVOICE_UPDATE_ERROR", "Failed to update invoice", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid invoice ID", 400);

  try {
    const [invoice] = await db
      .select()
      .from(customerInvoices)
      .where(and(eq(customerInvoices.id, id), eq(customerInvoices.tenantId, auth.user.tenantId)))
      .limit(1);

    if (!invoice) return errorResponse("NOT_FOUND", "Invoice not found", 404);
    if (invoice.status !== "OPEN") return errorResponse("INVALID_STATE", "Only OPEN invoices can be cancelled", 409);

    const [updated] = await db
      .update(customerInvoices)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(and(eq(customerInvoices.id, id), eq(customerInvoices.tenantId, auth.user.tenantId)))
      .returning();

    return successResponse(updated, "تم إلغاء الفاتورة");
  } catch (err) {
    console.error("[DELETE /api/finance/customer-invoices/:id]", err);
    return errorResponse("INVOICE_CANCEL_ERROR", "Failed to cancel invoice", 500);
  }
}

const PaymentSchema = z.object({
  amountSar: z.number().positive(),
  paymentMode: z.enum(["BANK", "CASH", "CARD", "WALLET", "OTHER"]).default("BANK"),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  referenceNumber: z.string().max(50).optional(),
  remarks: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid invoice ID", 400);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "pay") {
    // Record payment
    const authCheck = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
    if ("status" in authCheck) return authCheck;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = PaymentSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid payment data", 400, {
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const [invoice] = await db
      .select()
      .from(customerInvoices)
      .where(and(eq(customerInvoices.id, id), eq(customerInvoices.tenantId, auth.user.tenantId)))
      .limit(1);

    if (!invoice) return errorResponse("NOT_FOUND", "Invoice not found", 404);
    if (invoice.status === "CANCELLED") return errorResponse("INVALID_STATE", "Cannot pay cancelled invoice", 409);
    if (invoice.status === "PAID") return errorResponse("INVALID_STATE", "Invoice already paid", 409);

    const paidAmount = Number(invoice.paidAmountSar) + Math.round(parsed.data.amountSar * 100);
    const totalAmount = Number(invoice.totalAmountSar);
    if (paidAmount > totalAmount) return errorResponse("INVALID_AMOUNT", "Payment exceeds invoice total", 400);

    const newStatus = paidAmount >= totalAmount ? "PAID" : "PARTIAL";

    if (!invoice.customerId) {
      return errorResponse("INVALID_STATE", "Invoice has no customer — cannot record a payment", 409);
    }

    const [clientRow] = await db
      .select({ companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.id, invoice.customerId))
      .limit(1);
    const clientName = clientRow?.companyName ?? null;

    try {
      const [payment] = await db
        .insert(customerPayments)
        .values({
          tenantId: auth.user.tenantId,
          customerId: invoice.customerId,
          invoiceId: id,
          amountSar: Math.round(parsed.data.amountSar * 100),
          paymentMode: parsed.data.paymentMode,
          paymentDate: parsed.data.paymentDate,
          dueDate: parsed.data.dueDate ?? null,
          referenceNumber: parsed.data.referenceNumber ?? null,
          remarks: parsed.data.remarks ?? null,
          createdById: auth.user.sub,
        })
        .returning();

      const [updatedInvoice] = await db
        .update(customerInvoices)
        .set({
          paidAmountSar: paidAmount,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(customerInvoices.id, id), eq(customerInvoices.tenantId, auth.user.tenantId)))
        .returning();

      // Create ledger entry
      await db.insert(ledgerEntries).values({
        tenantId: auth.user.tenantId,
        date: new Date(parsed.data.paymentDate),
        description: `سداد فاتورة ${invoice.invoiceNumber}`,
        amountSar: Math.round(parsed.data.amountSar * 100),
        transactionType: "sale",
        referenceNumber: invoice.invoiceNumber,
        counterpartyType: "customer",
        counterpartyName: clientName,
        createdById: auth.user.sub,
      });

      return successResponse({ payment, invoice: updatedInvoice }, "تم تسجيل السداد بنجاح", 201);
    } catch (err) {
      console.error("[POST /api/finance/customer-invoices/:id?action=pay]", err);
      return errorResponse("PAYMENT_ERROR", "Failed to record payment", 500);
    }
  }

  if (action === "zatca-issue") {
    // Issue ZATCA e-invoice
    const authCheck = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
    if ("status" in authCheck) return authCheck;

    try {
      // Get ZATCA config
      const [zatcaConfig] = await db
        .select()
        .from(tenantZatcaSettings)
        .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId))
        .limit(1);

      if (!zatcaConfig || !zatcaConfig.configured) {
        return errorResponse("ZATCA_NOT_CONFIGURED", "ZATCA not configured for this tenant", 400);
      }

      // Call ZATCA issue endpoint
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/zatca/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.INTERNAL_API_TOKEN || ''}` },
        body: JSON.stringify({ orderId: id, type: 'STANDARD' }),
      }).catch(() => null);

      if (!res || !res.ok) {
        return errorResponse("ZATCA_ISSUE_FAILED", "Failed to issue ZATCA e-invoice", 500);
      }

      const result = await res.json();
      return successResponse(result, "تم إصدار الفاتورة الإلكترونية");
    } catch (err) {
      console.error("[POST /api/finance/customer-invoices/:id?action=zatca-issue]", err);
      return errorResponse("ZATCA_ERROR", "ZATCA issue failed", 500);
    }
  }

  return errorResponse("INVALID_ACTION", "Invalid action. Use ?action=pay or ?action=zatca-issue", 400);
}