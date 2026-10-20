/**
 * /api/suppliers/invoices/:id
 * PUT    — تعديل فاتورة غير مسدّدة، أو إلغاؤها (status=CANCELLED مسموح دائماً)
 * DELETE — حذف فاتورة بلا أي سداد (المسدّدة تُلغى ولا تُحذف حفظاً للسجل)
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  updateSupplierInvoice,
  deleteSupplierInvoice,
  InvoiceNotFoundError,
  InvoiceLockedError,
  InvoiceHasPaymentsError,
} from "@/lib/services/supplier-invoices.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const WRITE_GUARD = [PERMISSIONS.FINANCE_CLIENT_UPDATE, PERMISSIONS.SUPPLIER_MANAGE];

const UpdateInvoiceSchema = z.object({
  invoiceDate: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  subtotalSar: z.number().int().positive().optional(),
  vatPercent: z.number().int().min(0).max(100).optional(),
  totalAmountSar: z.number().int().positive().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["OPEN", "PARTIAL", "PAID", "CANCELLED"]).optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission(req, WRITE_GUARD);
  if ("status" in auth) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const row = await updateSupplierInvoice(auth.user.tenantId, id, {
      invoiceDate: d.invoiceDate ? new Date(d.invoiceDate) : undefined,
      dueDate: d.dueDate === undefined ? undefined : d.dueDate ? new Date(d.dueDate) : null,
      subtotalSar: d.subtotalSar,
      vatPercent: d.vatPercent,
      totalAmountSar: d.totalAmountSar,
      description: d.description,
      notes: d.notes,
      status: d.status,
    });
    return successResponse(row, "تم تعديل الفاتورة");
  } catch (err) {
    if (err instanceof InvoiceNotFoundError) return errorResponse("NOT_FOUND", err.message, 404);
    if (err instanceof InvoiceLockedError) return errorResponse("INVOICE_LOCKED", err.message, 409);
    console.error("[PUT /api/suppliers/invoices/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("INVOICE_ERROR", message, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission(req, WRITE_GUARD);
  if ("status" in auth) return auth;
  const { id } = await params;

  try {
    const row = await deleteSupplierInvoice(auth.user.tenantId, id);
    return successResponse(row, "تم حذف الفاتورة");
  } catch (err) {
    if (err instanceof InvoiceNotFoundError) return errorResponse("NOT_FOUND", err.message, 404);
    if (err instanceof InvoiceHasPaymentsError) return errorResponse("INVOICE_HAS_PAYMENTS", err.message, 409);
    console.error("[DELETE /api/suppliers/invoices/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("INVOICE_ERROR", message, 500);
  }
}
