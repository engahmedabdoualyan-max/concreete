/**
 * POST /api/finance/ledger/entries
 * Creates a unified ledger entry and optionally posts a matching bank
 * transaction. Balances are updated atomically by the ledger service.
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createLedgerEntry } from "@/lib/services/ledger.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateEntrySchema = z.object({
  date: z.string().datetime("Invalid date"),
  description: z.string().min(3, "الوصف مطلوب"),
  amountSar: z.number().int().positive("المبلغ يجب أن يكون موجباً"),
  transactionType: z.enum([
    "income",
    "expense",
    "transfer",
    "purchase",
    "sale",
    "adjustment",
    "operational",
  ]),
  referenceNumber: z.string().optional().nullable(),
  bankAccountId: z.string().uuid("Invalid account").optional().nullable(),
  counterpartyType: z.string().optional().nullable(),
  counterpartyId: z.string().optional().nullable(),
  counterpartyName: z.string().optional().nullable(),
  /** Optional matching bank transaction */
  bankTransaction: z
    .object({
      transactionType: z.enum(["deposit", "withdrawal", "transfer"]),
      destinationAccountId: z.string().uuid("Invalid destination account").optional().nullable(),
    })
    .optional(),
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

  const parsed = CreateEntrySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid ledger entry", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;

  // Transfer must specify a destination account
  if (d.transactionType === "transfer" && !d.bankTransaction?.destinationAccountId) {
    return errorResponse("DESTINATION_REQUIRED", "تحويل يتطلب حساباً وجهة", 400);
  }

  try {
    const result = await createLedgerEntry(
      auth.user.tenantId,
      auth.user.sub,
      {
        date: new Date(d.date),
        description: d.description,
        amountSar: d.amountSar,
        transactionType: d.transactionType,
        referenceNumber: d.referenceNumber ?? null,
        bankAccountId: d.bankAccountId ?? null,
        counterpartyType: d.counterpartyType ?? null,
        counterpartyId: d.counterpartyId ?? null,
        counterpartyName: d.counterpartyName ?? null,
      },
      d.bankAccountId && d.bankTransaction
        ? {
            bankAccountId: d.bankAccountId,
            transactionType: d.bankTransaction.transactionType,
            destinationAccountId: d.bankTransaction.destinationAccountId ?? null,
            amountSar: d.amountSar,
            date: new Date(d.date),
            description: d.description,
            referenceNumber: d.referenceNumber ?? null,
          }
        : undefined
    );

    return successResponse(result, "تم تسجيل القيد في دفتر الأستاذ");
  } catch (err) {
    console.error("[POST /api/finance/ledger/entries]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("LEDGER_ENTRY_ERROR", message, 500);
  }
}
