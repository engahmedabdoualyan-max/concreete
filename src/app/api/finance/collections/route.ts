import { NextRequest } from "next/server";
import { db } from "@/db";
import { ledgerEntries } from "@/db/schema";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/collections?date= — today's collected amounts.
 *
 * Collections are ledger income/sale entries the accountant records from his
 * Finance screen. The broadcast reads the day total (تحصيل اليوم).
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;
  const q = new URL(req.url).searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(`${date}T00:00:00+03:00`);
  const to = new Date(from.getTime() + 24 * 3600_000);

  const rows = await db
    .select({
      id: ledgerEntries.id,
      description: ledgerEntries.description,
      amountSar: ledgerEntries.amountSar,
      counterpartyName: ledgerEntries.counterpartyName,
      referenceNumber: ledgerEntries.referenceNumber,
      date: ledgerEntries.date,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, auth.user.tenantId),
        inArray(ledgerEntries.transactionType, ["income", "sale"]),
        gte(ledgerEntries.date, from),
        lte(ledgerEntries.date, to)
      )
    )
    .orderBy(desc(ledgerEntries.date))
    .limit(200);

  // amount_sar is stored in halalas (minor units); the broadcast shows SAR.
  const totalSar = rows.reduce((s, r) => s + Number(r.amountSar ?? 0), 0) / 100;
  return successResponse({ date, totalSar, count: rows.length, rows }, `${rows.length} collection(s)`);
}
