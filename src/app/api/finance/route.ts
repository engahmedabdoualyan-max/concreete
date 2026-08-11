/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/finance — Finance & Credit Approval Module
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/finance              — Finance dashboard: pending orders + credit stats
 *  POST /api/finance/approve      — Toggle electronic approval for an order
 *  POST /api/finance/reject       — Reject an order with reason
 *
 *  PIPELINE BUSINESS RULES:
 *  ─────────────────────────────────────────────────────────
 *  1. Sales reps submit orders → PENDING_FINANCE
 *  2. Finance checks client credit limit vs outstanding balance
 *  3. Even with manual paper clearance, electronic toggle is MANDATORY
 *  4. On APPROVE → order becomes APPROVED and real-time events broadcast
 *  5. On REJECT → order goes to FINANCE_REJECTED; rep is notified
 *  6. Credit limits are enforced as HARD blocks (not warnings)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  orders,
  clients,
  financeActions,
  users,
  deliverySites,
  mixDesigns,
  auditLogs,
} from "@/db/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── GET /api/finance ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") ?? "PENDING_FINANCE";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20"));
    const offset = (page - 1) * limit;

    // ── Orders in Finance Queue ───────────────────────────────────────────────
    const validStatuses = [
      "PENDING_FINANCE",
      "FINANCE_REJECTED",
      "APPROVED",
      "CANCELLED",
      "ON_HOLD",
    ];
    const filterStatus = validStatuses.includes(statusFilter)
      ? statusFilter
      : "PENDING_FINANCE";

    const pendingOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalVolumeM3: orders.totalVolumeM3,
        pricePerM3Sar: orders.pricePerM3Sar,
        scheduledDate: orders.scheduledDate,
        createdAt: orders.createdAt,
        paperClearanceGranted: orders.paperClearanceGranted,
        financeRejectionReason: orders.financeRejectionReason,
        // Client info
        clientId: clients.id,
        clientCode: clients.clientCode,
        companyName: clients.companyName,
        creditLimitSar: clients.creditLimitSar,
        outstandingBalanceSar: clients.outstandingBalanceSar,
        isBlacklisted: clients.isBlacklisted,
        // Sales rep
        repName: users.fullName,
        // Site
        siteName: deliverySites.siteName,
        // Mix design
        designCode: mixDesigns.designCode,
        gradeDescription: mixDesigns.gradeDescription,
      })
      .from(orders)
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .innerJoin(users, eq(orders.createdByRepId, users.id))
      .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
      .innerJoin(mixDesigns, eq(orders.mixDesignId, mixDesigns.id))
      .where(eq(orders.status, filterStatus as never))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    // ── Credit Utilisation Summary ─────────────────────────────────────────────
    const creditSummary = await db
      .select({
        totalClients: sql<number>`COUNT(*)::int`,
        totalCreditLimitSar: sql<number>`SUM(credit_limit_sar)::bigint`,
        totalOutstandingSar: sql<number>`SUM(outstanding_balance_sar)::bigint`,
        blacklistedCount: sql<number>`SUM(CASE WHEN is_blacklisted THEN 1 ELSE 0 END)::int`,
        overLimitCount: sql<number>`SUM(CASE WHEN outstanding_balance_sar > credit_limit_sar THEN 1 ELSE 0 END)::int`,
      })
      .from(clients)
      .where(eq(clients.isActive, true));

    // ── Pipeline Status Counts ─────────────────────────────────────────────────
    const pipelineCounts = await db
      .select({
        status: orders.status,
        count: sql<number>`COUNT(*)::int`,
        totalVolume: sql<number>`SUM(CAST(total_volume_m3 AS DECIMAL))::decimal`,
      })
      .from(orders)
      .groupBy(orders.status);

    return successResponse({
      queue: {
        orders: pendingOrders.map((o) => ({
          ...o,
          // Calculate credit utilisation for this client
          creditUtilisationPct:
            o.creditLimitSar > 0
              ? Math.round((o.outstandingBalanceSar / o.creditLimitSar) * 100)
              : 0,
          creditAvailableSar: o.creditLimitSar - o.outstandingBalanceSar,
          orderValueSar: parseFloat(o.totalVolumeM3 ?? "0") * o.pricePerM3Sar,
          /** TRUE = this order would push client OVER credit limit */
          wouldExceedCreditLimit:
            o.outstandingBalanceSar +
              parseFloat(o.totalVolumeM3 ?? "0") * o.pricePerM3Sar >
            o.creditLimitSar,
        })),
        pagination: { page, limit, filterStatus },
      },
      creditSummary: creditSummary[0],
      pipelineCounts,
    });
  } catch (err) {
    console.error("[GET /api/finance]", err);
    return errorResponse("FINANCE_FETCH_ERROR", "Failed to load finance dashboard", 500);
  }
}
