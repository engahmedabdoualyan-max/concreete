import { db } from "@/db";
import { fleetReadiness, fleetVehicles } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type ReadinessByType = Record<
  string,
  { total: number; working: number; idle: number; workshop: number; unmarked: number }
>;

/**
 * Shared readiness summary: per-type working/idle/workshop/unmarked counts
 * for one Riyadh day. Used by the readiness API and the broadcast snapshot
 * so the two can never disagree.
 */
export async function getReadinessSummary(
  tenantId: string,
  date: string
): Promise<{ rows: number; byType: ReadinessByType }> {
  const fleet = await db
    .select({
      id: fleetVehicles.id,
      type: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, tenantId), eq(fleetVehicles.isActive, true)));

  const marks = await db
    .select({ vehicleId: fleetReadiness.vehicleId, status: fleetReadiness.status })
    .from(fleetReadiness)
    .where(and(eq(fleetReadiness.tenantId, tenantId), eq(fleetReadiness.workDate, date)));
  const byV = new Map(marks.map((m) => [m.vehicleId, m.status]));

  const byType: ReadinessByType = {};
  for (const v of fleet) {
    const b = (byType[v.type] ??= { total: 0, working: 0, idle: 0, workshop: 0, unmarked: 0 });
    b.total++;
    const s = byV.get(v.id);
    if (s === "WORKING") b.working++;
    else if (s === "IDLE") b.idle++;
    else if (s === "IN_WORKSHOP") b.workshop++;
    else b.unmarked++;
  }
  return { rows: fleet.length, byType };
}
