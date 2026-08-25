/**
 * POST /api/finance/commitments/payments
 * Record a payment against a commitment (creates linked ledger entry + rolls schedule).
 * POST /api/finance/commitments/[status] handled via PATCH on /api/finance/commitments/status
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { recordCommitmentPayment } from "@/lib/services/commitments.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PayCommitmentSchema = z.object({
  commitmentId: z.string().uuid("Invalid commitment"),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  paymentDate: z.string().min(1, "تاريخ الدفع مطلوب"),
  paymentMode: z.enum(["CASH", "CHEQUE", "BANK", "UPI", "AUTO_DEBIT", "OTHER"]),
  referenceNumber: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
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

  const parsed = PayCommitmentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid payment data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const result = await recordCommitmentPayment(auth.user.tenantId, auth.user.sub, {
      commitmentId: d.commitmentId,
      amountSar: d.amountSar,
      paymentDate: new Date(d.paymentDate),
      paymentMode: d.paymentMode,
      referenceNumber: d.referenceNumber ?? null,
      remarks: d.remarks ?? null,
      receiptNumber: d.receiptNumber ?? null,
    });
    return successResponse(result, "تم تسجيل الدفعة");
  } catch (err) {
    console.error("[POST /api/finance/commitments/payments]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("COMMITMENT_PAYMENT_ERROR", message, 500);
  }
}
