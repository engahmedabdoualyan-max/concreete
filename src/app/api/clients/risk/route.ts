/**
 * GET /api/clients/risk
 * Returns the current automatic risk assessment (LOW/MEDIUM/HIGH) for all
 * active clients of the tenant, with a summary distribution. Finance read-only.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq, and, asc, sql, lt, or, isNull } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { computeClientRiskScore } from "@/lib/services/risk.service";

export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 6 * 3600 * 1000; // recompute scores older than 6h

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const staleCutoff = new Date(Date.now() - STALE_AFTER_MS);

  // ── Automatic refresh: recompute stale / never-computed scores ─────────────
  const staleRows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, auth.user.tenantId),
        eq(clients.isActive, true),
        or(isNull(clients.riskLastUpdatedAt), lt(clients.riskLastUpdatedAt, staleCutoff))
      )
    )
    .limit(200);

  for (const c of staleRows) {
    try {
      await computeClientRiskScore(c.id);
    } catch (err) {
      console.error(`[risk] auto-refresh failed for ${c.id}:`, err);
    }
  }

  const rows = await db
    .select({
      id: clients.id,
      clientCode: clients.clientCode,
      companyName: clients.companyName,
      creditLimitSar: clients.creditLimitSar,
      outstandingBalanceSar: clients.outstandingBalanceSar,
      utilisationPct: sql<number>`CASE WHEN credit_limit_sar > 0
        THEN ROUND((outstanding_balance_sar::numeric / credit_limit_sar) * 100)
        ELSE 0 END`,
      isBlacklisted: clients.isBlacklisted,
      riskScore: clients.riskScore,
      riskNotes: clients.riskNotes,
      riskLastUpdatedAt: clients.riskLastUpdatedAt,
    })
    .from(clients)
    .where(
      and(eq(clients.tenantId, auth.user.tenantId), eq(clients.isActive, true))
    )
    .orderBy(
      sql`CASE risk_score WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END`,
      asc(clients.companyName)
    );

  const summary = { LOW: 0, MEDIUM: 0, HIGH: 0 } as Record<string, number>;
  for (const r of rows) summary[r.riskScore] += 1;

  return successResponse({ clients: rows, summary, total: rows.length });
}
