/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/finance/ledger — Unified ledger module
 * ============================================================
 *
 *  GET  /api/finance/ledger        — ledger entries + bank accounts + tx
 *  POST /api/finance/ledger        — create bank account
 *  POST /api/finance/ledger/entries — create a ledger entry (+ bank tx)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listBankAccounts,
  listLedgerEntries,
  listBankTransactions,
  createBankAccount,
  createLedgerEntry,
} from "@/lib/services/ledger.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateBankAccountSchema = z.object({
  accountName: z.string().min(2, "اسم الحساب مطلوب"),
  accountNumber: z.string().min(3, "رقم الحساب مطلوب"),
  bankName: z.string().min(2, "اسم البنك مطلوب"),
  branch: z.string().optional().nullable(),
  initialBalanceSar: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") ?? undefined;

  try {
    const [accounts, entries, transactions] = await Promise.all([
      listBankAccounts(auth.user.tenantId),
      listLedgerEntries(auth.user.tenantId),
      listBankTransactions(auth.user.tenantId, accountId),
    ]);

    const totalDebitsSar = entries
      .filter((e) => e.transactionType !== "income" && e.transactionType !== "sale")
      .reduce((s, e) => s + e.amountSar, 0);
    const totalCreditsSar = entries
      .filter((e) => e.transactionType === "income" || e.transactionType === "sale")
      .reduce((s, e) => s + e.amountSar, 0);

    return successResponse({
      accounts,
      entries,
      transactions,
      summary: {
        totalAccounts: accounts.length,
        totalBalanceSar: accounts.reduce((s, a) => s + a.currentBalanceSar, 0),
        totalDebitsSar,
        totalCreditsSar,
      },
    });
  } catch (err) {
    console.error("[GET /api/finance/ledger]", err);
    return errorResponse("LEDGER_FETCH_ERROR", "Failed to load ledger", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateBankAccountSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid bank account data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const account = await createBankAccount(auth.user.tenantId, parsed.data);
    return successResponse({ account }, "تم إضافة الحساب البنكي");
  } catch (err) {
    console.error("[POST /api/finance/ledger]", err);
    return errorResponse("LEDGER_CREATE_ERROR", "Failed to create bank account", 500);
  }
}
