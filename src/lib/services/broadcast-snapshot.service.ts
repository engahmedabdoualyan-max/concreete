import { db } from "@/db";
import {
  broadcastSnapshots,
  gatePasses,
  hrAbsences,
  ledgerEntries,
  orders,
  payrollEmployees,
  tenants,
  trips,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getFleetPositions } from "@/lib/services/fleet-position.service";
import { getReadinessSummary } from "@/lib/services/readiness.service";

export type BroadcastSnapshot = {
  date: string;
  fleet: {
    positioned: number;
    stale: number;
    insideGeofence: number;
    withoutFix: number;
  };
  readiness: Record<string, { total: number; working: number; idle: number; workshop: number; unmarked: number }>;
  manpower: { total: number; present: number; absent: number };
  gate: { inTickets: number; outTickets: number; inKg: number; concreteM3: number; blockUnits: number };
  collectionsSar: number;
  orders: { count: number; volumeM3: number };
  trips: { active: number; total: number };
  targets: { concreteM3: number; blocks: number };
};

/** Riyadh calendar day bounds. */
export function dayBounds(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00+03:00`);
  return { from, to: new Date(from.getTime() + 24 * 3600_000) };
}

/**
 * Capture the plant's numbers for one day. Read-only rollups only — never
 * mutates operations. Throttled by the route (15 min) so the TV's 30s poll
 * does not rewrite history mid-day.
 */
export async function takeSnapshot(tenantId: string, date: string): Promise<BroadcastSnapshot> {
  const { from, to } = dayBounds(date);

  const [fleet, readiness] = await Promise.all([
    getFleetPositions(tenantId).catch(() => null),
    getReadinessSummary(tenantId, date).catch(() => null),
  ]);

  const roster = await db
    .select({ id: payrollEmployees.id })
    .from(payrollEmployees)
    .where(and(eq(payrollEmployees.tenantId, tenantId), eq(payrollEmployees.isActive, true)));
  const absent = await db
    .select({ id: hrAbsences.id })
    .from(hrAbsences)
    .where(and(eq(hrAbsences.tenantId, tenantId), eq(hrAbsences.workDate, date)));

  const dayGate = await db
    .select({
      direction: gatePasses.direction,
      category: gatePasses.category,
      net: gatePasses.netWeightKg,
      qty: gatePasses.quantity,
    })
    .from(gatePasses)
    .where(and(eq(gatePasses.tenantId, tenantId), gte(gatePasses.createdAt, from), lte(gatePasses.createdAt, to)));

  const dayOrders = await db
    .select({ vol: orders.totalVolumeM3 })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), lte(orders.createdAt, to)));

  const dayTrips = await db
    .select({ done: trips.isCompleted, cancelled: trips.isCancelled })
    .from(trips)
    .where(and(eq(trips.tenantId, tenantId), gte(trips.createdAt, from), lte(trips.createdAt, to)));

  const dayIncome = await db
    .select({ amountSar: ledgerEntries.amountSar })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, tenantId),
        inArray(ledgerEntries.transactionType, ["income", "sale"]),
        gte(ledgerEntries.date, from),
        lte(ledgerEntries.date, to)
      )
    );

  const [tnt] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = (tnt?.settings ?? {}) as Record<string, unknown>;
  const targets = (settings.dailyTargets ?? {}) as { concreteM3?: number; blocks?: number };

  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const positioned = fleet?.positions ?? [];
  const payload: BroadcastSnapshot = {
    date,
    fleet: {
      positioned: positioned.length,
      stale: positioned.filter((p) => p.isStale).length,
      insideGeofence: positioned.filter((p) => p.isInsidePrimaryGeofence).length,
      withoutFix: fleet?.vehiclesWithoutFix ?? 0,
    },
    readiness: readiness?.byType ?? {},
    manpower: { total: roster.length, present: Math.max(0, roster.length - absent.length), absent: absent.length },
    gate: {
      inTickets: dayGate.filter((g) => g.direction === "IN").length,
      outTickets: dayGate.filter((g) => g.direction === "OUT").length,
      inKg: dayGate.filter((g) => g.direction === "IN").reduce((s, g) => s + num(g.net), 0),
      concreteM3: dayGate.filter((g) => g.category === "CONCRETE").reduce((s, g) => s + num(g.qty), 0),
      blockUnits: dayGate.filter((g) => g.category === "BLOCK").reduce((s, g) => s + num(g.qty), 0),
    },
    orders: {
      count: dayOrders.length,
      volumeM3: dayOrders.reduce((s, o) => s + num(o.vol), 0),
    },
    trips: {
      active: dayTrips.filter((x) => !x.done && !x.cancelled).length,
      total: dayTrips.length,
    },
    collectionsSar: dayIncome.reduce((s, r) => s + Number(r.amountSar ?? 0), 0) / 100,
    targets: { concreteM3: Number(targets.concreteM3 ?? 0), blocks: Number(targets.blocks ?? 0) },
  };

  await db.execute(sql`
    INSERT INTO broadcast_snapshots (tenant_id, snap_date, payload)
    VALUES (${tenantId}, ${date}, ${JSON.stringify(payload)}::jsonb)`);
  return payload;
}

export async function getSnapshotTimes(tenantId: string, date: string): Promise<string[]> {
  const rows = await db
    .select({ at: broadcastSnapshots.createdAt })
    .from(broadcastSnapshots)
    .where(and(eq(broadcastSnapshots.tenantId, tenantId), eq(broadcastSnapshots.snapDate, date)))
    .orderBy(broadcastSnapshots.createdAt);
  return rows.map((r) => new Date(String(r.at)).toISOString());
}

/** Nearest capture at or before the given instant (or the latest of the day). */
export async function getSnapshot(
  tenantId: string,
  date: string,
  atIso?: string
): Promise<{ payload: BroadcastSnapshot; updatedAt: string } | null> {
  const conds = [eq(broadcastSnapshots.tenantId, tenantId), eq(broadcastSnapshots.snapDate, date)];
  if (atIso) {
    const at = new Date(atIso);
    if (!Number.isNaN(at.getTime())) conds.push(lte(broadcastSnapshots.createdAt, at));
  }
  const [row] = await db
    .select({ payload: broadcastSnapshots.payload, updatedAt: broadcastSnapshots.createdAt })
    .from(broadcastSnapshots)
    .where(and(...conds))
    .orderBy(desc(broadcastSnapshots.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    payload: row.payload as unknown as BroadcastSnapshot,
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  };
}
