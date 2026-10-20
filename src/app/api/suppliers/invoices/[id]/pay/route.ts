/**
 * /api/suppliers/invoices/:id/pay
 * POST — سداد فاتورة (يحدّث paid/status + قيد دفتري)،
 *        بحد أقصى = المتبقي (OVERPAYMENT_NOT_ALLOWED مثل أوامر الشراء)
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  recordSupplierInvoicePayment,
  InvoiceNotFoundError,
  InvoiceLockedError,
  InvoiceOverpaymentError,
} from "@/lib/services/supplier-invoices.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const WRITE_GUARD = [PERMISSIONS.FINANCE_CLIENT_UPDATE, PERMISSIONS.SUPPLIER_MANAGE];

const PaySchema = z.object({
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  paymentDate: z.string().min(1),
  paymentMode: z.enum(["CASH", "CHEQUE", "BANK", "CREDIT", "UPI", "OTHER"]).optional(),
  referenceNumber: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission(req, WRITE_GUARD);
  if ("status" in auth) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PaySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات السداد غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const result = await recordSupplierInvoicePayment(auth.user.tenantId, auth.user.sub, id, {
      amountSar: d.amountSar,
      paymentDate: new Date(d.paymentDate),
      paymentMode: d.paymentMode,
      referenceNumber: d.referenceNumber ?? null,
      remarks: d.remarks ?? null,
    });
    return successResponse(result, "تم تسجيل سداد الفاتورة");
  } catch (err) {
    if (err instanceof InvoiceNotFoundError) return errorResponse("NOT_FOUND", err.message, 404);
    if (err instanceof InvoiceLockedError) return errorResponse("INVOICE_LOCKED", err.message, 409);
    if (err instanceof InvoiceOverpaymentError) {
      return errorResponse("OVERPAYMENT_NOT_ALLOWED", err.message, 400, {
        balanceBeforeSar: err.balanceBeforeSar,
        amountSar: err.amountSar,
        invoiceNumber: err.invoiceNumber,
      });
    }
    console.error("[POST /api/suppliers/invoices/:id/pay]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("INVOICE_PAYMENT_ERROR", message, 500);
  }
}
