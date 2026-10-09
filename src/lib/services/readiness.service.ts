import { db } from "@/db";
import { fleetReadiness, fleetVehicles, sites } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type ReadinessByType = Record<
  string,
  { total: number; working: number; idle: number; workshop: number; stored: number; unmarked: number }
>;

export type ReadinessByBranch = Record<
  string,
  { siteCode: string; siteName: string; total: number; working: number; idle: number; workshop: number; stored: number }
>;

/**
 * Shared readiness summary: per-type working/idle/workshop/unmarked counts
 * for one Riyadh day. Used by the readiness API and the broadcast snapshot
 * so the two can never disagree.
 */
export async function getReadinessSummary(
  tenantId: string,
  date: string
): Promise<{ rows: number; byType: ReadinessByType; byBranch: ReadinessByBranch }> {
  const fleet = await db
    .select({
      id: fleetVehicles.id,
      type: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, tenantId), eq(fleetVehicles.isActive, true)));

  const marks = await db
    .select({ vehicleId: fleetReadiness.vehicleId, status: fleetReadiness.status, siteId: fleetReadiness.siteId })
    .from(fleetReadiness)
    .where(and(eq(fleetReadiness.tenantId, tenantId), eq(fleetReadiness.workDate, date)));
  const byV = new Map(marks.map((m) => [m.vehicleId, m]));

  const siteList = await db
    .select({ id: sites.id, code: sites.siteCode, name: sites.siteName })
    .from(sites)
    .where(and(eq(sites.tenantId, tenantId), eq(sites.isActive, true)));
  const siteById = new Map(siteList.map((s) => [s.id, s]));

  const byType: ReadinessByType = {};
  const byBranch: ReadinessByBranch = {};
  for (const v of fleet) {
    const b = (byType[v.type] ??= { total: 0, working: 0, idle: 0, workshop: 0, stored: 0, unmarked: 0 });
    b.total++;
    const m = byV.get(v.id);
    const s = m?.status;
    if (s === "WORKING") b.working++;
    else if (s === "IDLE") b.idle++;
    else if (s === "IN_WORKSHOP") b.workshop++;
    else if (s === "STORED") b.stored++;
    else b.unmarked++;
    if (m?.siteId && siteById.has(m.siteId)) {
      const info = siteById.get(m.siteId)!;
      const bb = (byBranch[m.siteId] ??= {
        siteCode: info.code, siteName: info.name,
        total: 0, working: 0, idle: 0, workshop: 0, stored: 0,
      });
      bb.total++;
      if (s === "WORKING") bb.working++;
      else if (s === "IDLE") bb.idle++;
      else if (s === "IN_WORKSHOP") bb.workshop++;
      else if (s === "STORED") bb.stored++;
    }
  }
  return { rows: fleet.length, byType, byBranch };
}
