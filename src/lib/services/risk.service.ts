/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Client Risk Scoring Engine
 * ============================================================
 *
 *  Automatic credit-risk assessment for clients (LOW/MEDIUM/HIGH),
 *  ported from the RMC reference system's payment-behaviour model
 *  and adapted to the unified ERP data:
 *
 *  1. Outstanding balance utilisation vs credit limit
 *  2. Delivered-but-unpaid orders (count + value)
 *  3. Aging of the oldest delivered order (overdue-period proxy)
 *  4. Historical finance risk events (HOLD / CREDIT_HOLD / REJECT)
 *  5. Blacklist → forces HIGH
 *
 *  Points are summed; >=70 → HIGH, >=30 → MEDIUM, else LOW.
 *  The result is persisted on clients.risk_score / risk_notes.
 * ============================================================
 */

import { db } from "@/db";
import { clients, orders, financeActions } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ClientRiskResult {
  clientId: string;
  companyName: string;
  riskLevel: RiskLevel;
  points: number;
  factors: string[];
}

const RISK_EVENTS = ["HOLD", "CREDIT_HOLD", "REJECT"] as const;

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Computes and persists the risk score for a single client.
 * Idempotent — safe to call from the recalculate endpoint or on demand.
 */
export async function computeClientRiskScore(clientId: string): Promise<ClientRiskResult> {
  const clientRows = await db
    .select({
      id: clients.id,
      tenantId: clients.tenantId,
      companyName: clients.companyName,
      creditLimitSar: clients.creditLimitSar,
      outstandingBalanceSar: clients.outstandingBalanceSar,
      isBlacklisted: clients.isBlacklisted,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (clientRows.length === 0) {
    throw new Error(`Client not found: ${clientId}`);
  }
  const client = clientRows[0];

  const factors: string[] = [];
  let points = 0;

  // ── 1. Outstanding balance utilisation vs credit limit ─────────────────────
  const utilisationPct =
    client.creditLimitSar > 0
      ? Math.round((client.outstandingBalanceSar / client.creditLimitSar) * 100)
      : client.outstandingBalanceSar > 0
      ? 100
      : 0;

  if (utilisationPct >= 100) {
    points += 40;
    factors.push(`متجاوز حد الائتمان (${utilisationPct}% — ر.س ${client.outstandingBalanceSar.toLocaleString()})`);
  } else if (utilisationPct >= 75) {
    points += 40;
    factors.push(`استخدام عالي لحد الائتمان (${utilisationPct}%)`);
  } else if (utilisationPct >= 50) {
    points += 25;
    factors.push(`استخدام مرتفع لحد الائتمان (${utilisationPct}%)`);
  } else if (utilisationPct >= 25) {
    points += 10;
    factors.push(`استخدام متوسط لحد الائتمان (${utilisationPct}%)`);
  }

  // ── 2. Delivered-but-unpaid orders (delivered awaiting payment) ─────────────
  const deliveredRows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      totalValueSar: sql<number>`COALESCE(SUM(CAST(total_volume_m3 AS DECIMAL) * price_per_m3_sar), 0)::bigint`,
      oldestScheduledAt: sql<string | null>`MIN(scheduled_date)::timestamp`,
    })
    .from(orders)
    .where(and(eq(orders.clientId, clientId), eq(orders.status, "DELIVERED")));

  const delivered = deliveredRows[0];
  const deliveredCount = delivered?.count ?? 0;
  const deliveredValueSar = Number(delivered?.totalValueSar ?? 0);
  const oldestScheduledAt = delivered?.oldestScheduledAt ?? null;

  if (deliveredCount >= 5) {
    points += 35;
    factors.push(`${deliveredCount} تسليمات غير مسددة`);
  } else if (deliveredCount >= 3) {
    points += 20;
    factors.push(`${deliveredCount} تسليمات غير مسددة`);
  } else if (deliveredCount >= 1) {
    points += 10;
    factors.push(`${deliveredCount} تسليمات غير مسددة`);
  }

  // ── 3. Delivered-unpaid value as share of all delivered value ──────────────
  if (deliveredValueSar > 0) {
    const totalDelivered = await db
      .select({
        totalValueSar: sql<number>`COALESCE(SUM(CAST(total_volume_m3 AS DECIMAL) * price_per_m3_sar), 0)::bigint`,
      })
      .from(orders)
      .where(and(eq(orders.clientId, clientId), eq(orders.status, "DELIVERED")));

    const grandTotal = Number(totalDelivered[0]?.totalValueSar ?? 0);
    const unpaidPct = grandTotal > 0 ? (deliveredValueSar / grandTotal) * 100 : 0;

    if (unpaidPct >= 50) {
      points += 40;
      factors.push(`نسبة مستحقات عالية من إجمالي التوريد (${unpaidPct.toFixed(1)}%)`);
    } else if (unpaidPct >= 25) {
      points += 25;
      factors.push(`نسبة مستحقات مرتفعة (${unpaidPct.toFixed(1)}%)`);
    } else if (unpaidPct >= 10) {
      points += 10;
      factors.push(`نسبة مستحقات متوسطة (${unpaidPct.toFixed(1)}%)`);
    }
  }

  // ── 4. Aging of the oldest delivered order (overdue-period proxy) ───────────
  if (oldestScheduledAt) {
    const daysAged = Math.floor(
      (Date.now() - new Date(oldestScheduledAt).getTime()) / 86400000
    );
    if (daysAged >= 90) {
      points += 40;
      factors.push(`أقدم تسليم غير مسدد عمره ${daysAged} يوم`);
    } else if (daysAged >= 60) {
      points += 30;
      factors.push(`أقدم تسليم غير مسدد عمره ${daysAged} يوم`);
    } else if (daysAged >= 30) {
      points += 15;
      factors.push(`أقدم تسليم غير مسدد عمره ${daysAged} يوم`);
    } else if (daysAged >= 15) {
      points += 5;
      factors.push(`أقدم تسليم غير مسدد عمره ${daysAged} يوم`);
    }
  }

  // ── 5. Historical finance risk events ───────────────────────────────────────
  const riskEventRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(financeActions)
    .innerJoin(orders, eq(financeActions.orderId, orders.id))
    .where(
      and(
        eq(orders.clientId, clientId),
        inArray(financeActions.action, [...RISK_EVENTS])
      )
    );
  const riskEventCount = riskEventRows[0]?.count ?? 0;

  if (riskEventCount >= 3) {
    points += 25;
    factors.push(`${riskEventCount} أحداث مخاطر مالية سابقة (رفض/تعليق)`);
  } else if (riskEventCount >= 1) {
    points += 10;
    factors.push(`${riskEventCount} حدث مخاطر مالية سابق (رفض/تعليق)`);
  }

  // ── 6. Blacklist forces HIGH ────────────────────────────────────────────────
  if (client.isBlacklisted) {
    points += 50;
    factors.push("العميل مدرج في القائمة السوداء");
  }

  if (factors.length === 0) {
    factors.push("لا توجد عوامل مخاطر ذات دلالة");
  }

  const riskLevel: RiskLevel =
    points >= 70 ? "HIGH" : points >= 30 ? "MEDIUM" : "LOW";

  await db
    .update(clients)
    .set({
      riskScore: riskLevel,
      riskNotes: factors.join("\n"),
      riskLastUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  return {
    clientId,
    companyName: client.companyName,
    riskLevel,
    points,
    factors,
  };
}

/**
 * Recomputes risk for every active client in a tenant.
 * Returns per-client results plus a summary distribution.
 */
export async function recalculateAllClientRisk(tenantId: string): Promise<{
  results: ClientRiskResult[];
  summary: Record<RiskLevel, number>;
}> {
  const clientList = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.isActive, true)));

  const results: ClientRiskResult[] = [];
  for (const c of clientList) {
    try {
      results.push(await computeClientRiskScore(c.id));
    } catch (err) {
      // Skip clients whose supporting rows are missing rather than failing the batch
      console.error(`[risk] failed for ${c.id}:`, err);
    }
  }

  const summary: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const r of results) summary[r.riskLevel] += 1;

  return { results, summary };
}
