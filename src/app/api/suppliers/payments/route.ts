/**
 * /api/suppliers/payments
 * POST — record a supplier payment against a PO (auto-links ledger entry)
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { recordSupplierPayment, OverpaymentError } from "@/lib/services/suppliers.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PaymentSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier"),
  purchaseOrderId: z.string().uuid("Invalid purchase order"),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  paymentMode: z.enum(["CASH", "CHEQUE", "BANK", "CREDIT", "UPI", "OTHER"]),
  paymentDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [PERMISSIONS.FINANCE_CLIENT_UPDATE, PERMISSIONS.SUPPLIER_MANAGE]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PaymentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid payment", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const result = await recordSupplierPayment(auth.user.tenantId, auth.user.sub, {
      supplierId: d.supplierId,
      purchaseOrderId: d.purchaseOrderId,
      amountSar: d.amountSar,
      paymentMode: d.paymentMode,
      paymentDate: new Date(d.paymentDate),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      referenceNumber: d.referenceNumber ?? null,
      remarks: d.remarks ?? null,
    });
    return successResponse(result, "تم تسجيل دفعة المورد");
  } catch (err) {
    // The over-payment guard is a client mistake, not a server failure:
    // answer 400 so the UI can show the message instead of "500".
    if (err instanceof OverpaymentError) {
      return errorResponse("OVERPAYMENT_NOT_ALLOWED", err.message, 400, {
        balanceBeforeSar: err.balanceBeforeSar,
        amountSar: err.amountSar,
        poNumber: err.poNumber,
      });
    }
    console.error("[POST /api/suppliers/payments]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("SUPPLIER_PAYMENT_ERROR", message, 500);
  }
}
