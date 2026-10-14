import { NextRequest } from "next/server";
import { db } from "@/db";
import { blockManufacturingLogs, orders } from "@/db/schema";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  requirePermission,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/blocks/today — block production + block sales today
 * ============================================================
 *
 *  Two honest numbers from tables that already exist, for the command
 *  center's block tiles:
 *    produced: blocks cast today (block_manufacturing_logs, recovery flow)
 *    sales:    orders with product_type = BLOCKS scheduled today
 *  Gated by ORDER_READ, which the plant manager already holds — no new
 *  permission, no migration. Day boundaries use Asia/Riyadh.
 */

function riyadhDayRange(now = new Date()): { from: Date; to: Date } {
  // Midnight-to-midnight in Asia/Riyadh (UTC+3, no DST).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  // Riyadh midnight == 21:00 UTC of the previous day (UTC+3, no DST).
  const fromUtc = new Date(Date.UTC(y, m - 1, d) - 3 * 3600 * 1000);
  return { from: fromUtc, to: new Date(fromUtc.getTime() + 24 * 3600 * 1000) };
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;
  const { from, to } = riyadhDayRange();

  const cast = await db
    .select({
      units: sql<string>`COALESCE(SUM(${blockManufacturingLogs.blocksCount}), 0)::text`,
      volumeM3: sql<string>`COALESCE(SUM(${blockManufacturingLogs.totalVolumeCastM3}), 0)::text`,
    })
    .from(blockManufacturingLogs)
    .where(
      and(
        eq(blockManufacturingLogs.tenantId, auth.user.tenantId),
        gte(blockManufacturingLogs.createdAt, from),
        lt(blockManufacturingLogs.createdAt, to)
      )
    );

  const sales = await db
    .select({
      orders: sql<string>`COUNT(*)::text`,
      volumeM3: sql<string>`COALESCE(SUM(${orders.totalVolumeM3}), 0)::text`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, auth.user.tenantId),
        eq(orders.productType, "BLOCKS"),
        gte(orders.scheduledDate, from),
        lt(orders.scheduledDate, to)
      )
    );

  return successResponse({
    produced: {
      units: Number(cast[0]?.units ?? 0),
      volumeM3: Number(cast[0]?.volumeM3 ?? 0),
    },
    sales: {
      orders: Number(sales[0]?.orders ?? 0),
      volumeM3: Number(sales[0]?.volumeM3 ?? 0),
    },
  });
}
