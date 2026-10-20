/**
 * /api/suppliers/invoices
 * GET  — فواتير المورد (?supplierId=) — finance or the purchasing register
 * POST — إصدار فاتورة مشتريات لورد (تلقائياً SINV-YYYY-NNNN)
 *
 * Both paths accept the legacy finance key or the narrow supplier key,
 * same split as the rest of the supplier routes.
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listSupplierInvoices,
  createSupplierInvoice,
} from "@/lib/services/supplier-invoices.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const READ_GUARD = [PERMISSIONS.FINANCE_READ, PERMISSIONS.SUPPLIER_READ];
const WRITE_GUARD = [PERMISSIONS.FINANCE_CLIENT_UPDATE, PERMISSIONS.SUPPLIER_MANAGE];

const CreateInvoiceSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier"),
  invoiceDate: z.string().min(1, "تاريخ الفاتورة مطلوب"),
  dueDate: z.string().optional().nullable(),
  /** SAR cents — المبلغ بدون ضريبة */
  subtotalSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  vatPercent: z.number().int().min(0).max(100).optional(),
  /** SAR cents — الإجمالي شامل الضريبة */
  totalAmountSar: z.number().int().positive("الإجمالي يجب أن يكون موجباً"),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  /** ربط الفاتورة بأمر شراء (يُحتسب في كشف الحساب مرة واحدة فقط) */
  purchaseOrderId: z.string().uuid("Invalid purchase order").optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, READ_GUARD);
  if ("status" in auth) return auth;

  const supplierId = req.nextUrl.searchParams.get("supplierId") ?? undefined;
  const rows = await listSupplierInvoices(auth.user.tenantId, {
    supplierId: supplierId ?? undefined,
  });
  return successResponse({ invoices: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, WRITE_GUARD);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات الفاتورة غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  if (d.totalAmountSar < d.subtotalSar) {
    return errorResponse("VALIDATION_ERROR", "الإجمالي لا يقل عن المبلغ قبل الضريبة", 400);
  }

  try {
    const result = await createSupplierInvoice(auth.user.tenantId, auth.user.sub, {
      supplierId: d.supplierId,
      invoiceDate: new Date(d.invoiceDate),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      subtotalSar: d.subtotalSar,
      vatPercent: d.vatPercent,
      totalAmountSar: d.totalAmountSar,
      description: d.description ?? null,
      notes: d.notes ?? null,
      purchaseOrderId: d.purchaseOrderId ?? null,
    });
    return successResponse(result, `تم إصدار الفاتورة ${result.invoice.invoiceNumber}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("المورد غير موجود")) {
      return errorResponse("NOT_FOUND", message, 404);
    }
    console.error("[POST /api/suppliers/invoices]", err);
    return errorResponse("INVOICE_ERROR", message, 500);
  }
}
