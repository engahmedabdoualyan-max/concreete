import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, fuelLogs } from "@/db/schema";
import { and, asc, eq, gte } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/workshop/fuel/report?days=30 — diesel control per vehicle.
 *
 * From odometer readings + fill litres: km driven, litres burned, avg
 * L/100km vs the vehicle's target, anomaly count. The numbers that let the
 * manager judge diesel — not just record it.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WORKSHOP_READ);
  if ("status" in auth) return auth;
  const daysRaw = Number(new URL(req.url).searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await db
    .select({
      vehicleId: fuelLogs.vehicleId,
      code: fleetVehicles.vehicleCode,
      plate: fleetVehicles.plateNumber,
      type: fleetVehicles.vehicleType,
      target: fleetVehicles.targetFuelLPer100Km,
      odo: fuelLogs.odometreKm,
      litres: fuelLogs.litresAdded,
      actual: fuelLogs.actualLPer100Km,
      anomaly: fuelLogs.isAnomaly,
      at: fuelLogs.loggedAt,
    })
    .from(fuelLogs)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, fuelLogs.vehicleId))
    .where(
      and(
        eq(fuelLogs.tenantId, auth.user.tenantId),
        eq(fleetVehicles.tenantId, auth.user.tenantId),
        gte(fuelLogs.loggedAt, since)
      )
    )
    .orderBy(asc(fuelLogs.vehicleId), asc(fuelLogs.loggedAt));

  const byV = new Map<string, { code: string; plate: string; type: string; target: number | null; firstOdo: number | null; lastOdo: number | null; litres: number; fills: number; anomalies: number }>();
  for (const r of rows) {
    const odo = Number(r.odo);
    let b = byV.get(r.vehicleId);
    if (!b) {
      b = {
        code: r.code, plate: r.plate ?? "", type: r.type,
        target: r.target === null ? null : Number(r.target),
        firstOdo: odo, lastOdo: odo, litres: 0, fills: 0, anomalies: 0,
      };
      byV.set(r.vehicleId, b);
    }
    b.firstOdo = Math.min(b.firstOdo ?? odo, odo);
    b.lastOdo = Math.max(b.lastOdo ?? odo, odo);
    if (r.litres !== null) {
      b.litres += Number(r.litres);
      b.fills++;
    }
    if (r.anomaly) b.anomalies++;
  }

  const report = [...byV.values()].map((b) => {
    const km = (b.lastOdo ?? 0) - (b.firstOdo ?? 0);
    const avg = km > 0 && b.litres > 0 ? (b.litres / km) * 100 : null;
    return {
      vehicleCode: b.code,
      plateNumber: b.plate,
      vehicleType: b.type,
      kmDriven: Math.round(km * 10) / 10,
      litresBurned: Math.round(b.litres * 100) / 100,
      fills: b.fills,
      avgLPer100Km: avg === null ? null : Math.round(avg * 100) / 100,
      targetLPer100Km: b.target,
      variancePct:
        avg === null || !b.target ? null : Math.round(((avg - b.target) / b.target) * 100),
      anomalies: b.anomalies,
    };
  });

  return successResponse({ days, vehicles: report }, `${report.length} vehicle(s)`);
}
