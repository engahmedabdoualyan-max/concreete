/**
 * ============================================================
 *  /api/fuel-log — Smart Fuel Efficiency Log
 * ============================================================
 *
 *  POST /api/fuel-log            Post-trip refuel webhook
 *  GET  /api/fuel-log            Logs + anomaly feed
 *  GET  /api/fuel-log?budget=1   Monthly budget report
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  fleetVehicles,
  fuelLogs,
  maintenanceOrders,
  plantConfig,
  trips,
} from "@/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  HEAVY_VEHICLE_TYPES,
  processPostTripRefuel,
  type BudgetLine,
  type MonthlyBudgetReport,
} from "@/lib/services/fuel-efficiency.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function budgetStatus(utilisationPct: number): BudgetLine["status"] {
  if (utilisationPct > 100) return "OVER_BUDGET";
  if (utilisationPct >= 90) return "AT_RISK";
  if (utilisationPct >= 60) return "ON_TRACK";
  return "UNDER_BUDGET";
}

async function buildTenantMonthlyBudgetReport(
  tenantId: string,
  year?: number,
  month?: number
): Promise<MonthlyBudgetReport> {
  const now = new Date();
  const reportYear = year ?? now.getUTCFullYear();
  const reportMonth = month ?? now.getUTCMonth() + 1;
  const periodStart = new Date(Date.UTC(reportYear, reportMonth - 1, 1));
  const periodEnd = new Date(Date.UTC(reportYear, reportMonth, 1));

  const configRows = await db
    .select()
    .from(plantConfig)
    .where(and(eq(plantConfig.tenantId, tenantId), eq(plantConfig.isActive, true)))
    .limit(1);
  const config = {
    podEffTargetKmPerLitre: configRows[0]
      ? parseFloat(configRows[0].podEffTargetKmPerLitre)
      : 2.6,
    lightFuelBudgetSar: configRows[0]?.lightFuelBudgetSar ?? 0,
    heavyFuelBudgetSar: configRows[0]?.heavyFuelBudgetSar ?? 0,
    tyreBudgetSar: configRows[0]?.tyreBudgetSar ?? 0,
    maintenanceBudgetSar: configRows[0]?.maintenanceBudgetSar ?? 0,
  };

  const fuelRows = await db
    .select({
      vehicleType: fleetVehicles.vehicleType,
      costSar: sql<number>`COALESCE(SUM(${fuelLogs.totalFuelCostSar}), 0)::int`,
      litres: sql<string>`COALESCE(SUM(CAST(${fuelLogs.litresAdded} AS DECIMAL)), 0)::text`,
      distanceKm: sql<string>`COALESCE(SUM(CAST(${fuelLogs.distanceTravelledKm} AS DECIMAL)), 0)::text`,
      anomalies: sql<number>`COALESCE(SUM(CASE WHEN ${fuelLogs.isAnomaly} THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(fuelLogs)
    .innerJoin(
      fleetVehicles,
      and(
        eq(fuelLogs.vehicleId, fleetVehicles.id),
        eq(fleetVehicles.tenantId, tenantId)
      )
    )
    .where(
      and(
        eq(fuelLogs.tenantId, tenantId),
        gte(fuelLogs.loggedAt, periodStart),
        lte(fuelLogs.loggedAt, periodEnd)
      )
    )
    .groupBy(fleetVehicles.vehicleType);

  let heavyFuelActual = 0;
  let lightFuelActual = 0;
  let totalLitres = 0;
  let totalDistanceKm = 0;
  let anomalyCount = 0;

  for (const row of fuelRows) {
    if ((HEAVY_VEHICLE_TYPES as readonly string[]).includes(row.vehicleType)) {
      heavyFuelActual += row.costSar;
    } else {
      lightFuelActual += row.costSar;
    }
    totalLitres += parseFloat(row.litres ?? "0");
    totalDistanceKm += parseFloat(row.distanceKm ?? "0");
    anomalyCount += row.anomalies;
  }

  const maintenanceRows = await db
    .select({
      maintenanceType: maintenanceOrders.maintenanceType,
      costSar: sql<number>`COALESCE(SUM(${maintenanceOrders.totalCostSar}), 0)::int`,
    })
    .from(maintenanceOrders)
    .where(
      and(
        eq(maintenanceOrders.tenantId, tenantId),
        eq(maintenanceOrders.status, "COMPLETED"),
        gte(maintenanceOrders.completedAt, periodStart),
        lte(maintenanceOrders.completedAt, periodEnd)
      )
    )
    .groupBy(maintenanceOrders.maintenanceType);

  let tyreActual = 0;
  let maintenanceActual = 0;
  for (const row of maintenanceRows) {
    if (row.maintenanceType === "TIRE_SERVICE") tyreActual += row.costSar;
    else maintenanceActual += row.costSar;
  }

  const makeBudgetLine = (
    key: BudgetLine["key"],
    labelEn: string,
    labelAr: string,
    budgetSar: number,
    actualSar: number
  ): BudgetLine => {
    const utilisationPct = budgetSar > 0 ? round2((actualSar / budgetSar) * 100) : 0;
    const variancePct =
      budgetSar > 0 ? round2(((actualSar - budgetSar) / budgetSar) * 100) : 0;
    return {
      key,
      labelEn,
      labelAr,
      budgetSar,
      actualSar,
      variancePct,
      utilisationPct,
      status: budgetStatus(utilisationPct),
    };
  };

  const lines: BudgetLine[] = [
    makeBudgetLine(
      "HEAVY_FUEL",
      "Heavy fleet fuel",
      "وقود الأسطول الثقيل",
      config.heavyFuelBudgetSar,
      heavyFuelActual
    ),
    makeBudgetLine(
      "LIGHT_FUEL",
      "Light fleet fuel",
      "وقود المركبات الخفيفة",
      config.lightFuelBudgetSar,
      lightFuelActual
    ),
    makeBudgetLine("TYRE", "Tyres", "الإطارات", config.tyreBudgetSar, tyreActual),
    makeBudgetLine(
      "MAINTENANCE",
      "Maintenance",
      "الصيانة",
      config.maintenanceBudgetSar,
      maintenanceActual
    ),
  ];

  const budgetSar = lines.reduce((sum, line) => sum + line.budgetSar, 0);
  const actualSar = lines.reduce((sum, line) => sum + line.actualSar, 0);
  const perVehicleRows = await db
    .select({
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      litres: sql<string>`COALESCE(SUM(CAST(${fuelLogs.litresAdded} AS DECIMAL)), 0)::text`,
      distanceKm: sql<string>`COALESCE(SUM(CAST(${fuelLogs.distanceTravelledKm} AS DECIMAL)), 0)::text`,
      anomalies: sql<number>`COALESCE(SUM(CASE WHEN ${fuelLogs.isAnomaly} THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(fuelLogs)
    .innerJoin(
      fleetVehicles,
      and(
        eq(fuelLogs.vehicleId, fleetVehicles.id),
        eq(fleetVehicles.tenantId, tenantId)
      )
    )
    .where(
      and(
        eq(fuelLogs.tenantId, tenantId),
        gte(fuelLogs.loggedAt, periodStart),
        lte(fuelLogs.loggedAt, periodEnd)
      )
    )
    .groupBy(
      fleetVehicles.vehicleCode,
      fleetVehicles.plateNumber,
      fleetVehicles.vehicleType
    );

  const worstPerformers = perVehicleRows
    .map((vehicle) => {
      const litres = parseFloat(vehicle.litres ?? "0");
      const km = parseFloat(vehicle.distanceKm ?? "0");
      const avgKmPerLitre = km > 0 && litres > 0 ? round3(km / litres) : null;
      const variancePct =
        avgKmPerLitre !== null && config.podEffTargetKmPerLitre > 0
          ? round2(
              ((avgKmPerLitre - config.podEffTargetKmPerLitre) /
                config.podEffTargetKmPerLitre) *
                100
            )
          : null;
      return {
        vehicleCode: vehicle.vehicleCode,
        plateNumber: vehicle.plateNumber,
        vehicleType: vehicle.vehicleType,
        avgKmPerLitre,
        variancePct,
        anomalyCount: vehicle.anomalies,
        litresConsumed: round2(litres),
      };
    })
    .sort((a, b) => {
      if (b.anomalyCount !== a.anomalyCount) return b.anomalyCount - a.anomalyCount;
      return (a.variancePct ?? 0) - (b.variancePct ?? 0);
    })
    .slice(0, 10);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    lines,
    totals: {
      budgetSar,
      actualSar,
      remainingSar: budgetSar - actualSar,
      utilisationPct: budgetSar > 0 ? round2((actualSar / budgetSar) * 100) : 0,
    },
    fuel: {
      totalLitres: round2(totalLitres),
      totalDistanceKm: round2(totalDistanceKm),
      fleetAverageKmPerLitre:
        totalLitres > 0 && totalDistanceKm > 0
          ? round3(totalDistanceKm / totalLitres)
          : null,
      targetKmPerLitre: config.podEffTargetKmPerLitre,
      anomalyCount,
    },
    worstPerformers,
  };
}

// ─── POST — post-trip refuel webhook ──────────────────────────────────────────

const RefuelSchema = z.object({
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  tripId: z.string().uuid().optional(),
  litresAdded: z.number().positive("Litres must be positive").max(1000),
  odometreKm: z.number().nonnegative("Odometer must be non-negative"),
  costPerLitreSarCents: z.number().int().positive().optional(),
  fuelStationName: z.string().max(100).optional(),
  receiptNumber: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FUEL_LOG_RECORD);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = RefuelSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid refuel payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const vehicleRows = await db
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, parsed.data.vehicleId),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (vehicleRows.length === 0) {
    return errorResponse("NOT_FOUND", "Vehicle not found", 404);
  }

  if (parsed.data.tripId) {
    const tripRows = await db
      .select({ id: trips.id })
      .from(trips)
      .where(
        and(
          eq(trips.id, parsed.data.tripId),
          eq(trips.tenantId, auth.user.tenantId)
        )
      )
      .limit(1);

    if (tripRows.length === 0) {
      return errorResponse("NOT_FOUND", "Trip not found", 404);
    }
  }

  try {
    const result = await processPostTripRefuel({
      ...parsed.data,
      loggedById: auth.user.sub,
    });

    const message = result.isAnomaly
      ? `⚠️ FUEL_ANOMALY on ${result.vehicleCode}: ${result.findings.length} finding(s). Efficiency ${result.actualKmPerLitre ?? "n/a"} km/L vs ${result.targetKmPerLitre} km/L target.`
      : `Fuel log recorded for ${result.vehicleCode}. Efficiency ${result.actualKmPerLitre ?? "n/a"} km/L (within ±${result.toleranceP}% tolerance).`;

    return successResponse(result, message, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("FUEL_LOG_FAILED", message, 422);
  }
}

// ─── GET — logs, anomalies, or budget report ──────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FUEL_LOG_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);

  // Budget report mode
  if (url.searchParams.get("budget") === "1" || url.searchParams.has("month")) {
    const year = url.searchParams.get("year");
    const month = url.searchParams.get("month");
    try {
      const report = await buildTenantMonthlyBudgetReport(
        auth.user.tenantId,
        year ? parseInt(year) : undefined,
        month ? parseInt(month) : undefined
      );
      const overBudget = report.lines.filter((l) => l.status === "OVER_BUDGET");
      return successResponse(
        report,
        overBudget.length > 0
          ? `⚠️ ${overBudget.length} budget line(s) exceeded: ${overBudget.map((l) => l.labelEn).join(", ")}.`
          : `Budget utilisation ${report.totals.utilisationPct}% — all lines within plan.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return errorResponse("BUDGET_REPORT_ERROR", message, 500);
    }
  }

  // Log feed mode
  const vehicleId = url.searchParams.get("vehicleId");
  const anomalyOnly = url.searchParams.get("anomalyOnly") === "true";
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30")));
  const since = new Date(Date.now() - days * 24 * 3600_000);

  if (vehicleId) {
    const vehicleRows = await db
      .select({ id: fleetVehicles.id })
      .from(fleetVehicles)
      .where(
        and(
          eq(fleetVehicles.id, vehicleId),
          eq(fleetVehicles.tenantId, auth.user.tenantId)
        )
      )
      .limit(1);

    if (vehicleRows.length === 0) {
      return errorResponse("NOT_FOUND", "Vehicle not found", 404);
    }
  }

  const conditions = [
    eq(fuelLogs.tenantId, auth.user.tenantId),
    gte(fuelLogs.loggedAt, since),
  ];
  if (vehicleId) conditions.push(eq(fuelLogs.vehicleId, vehicleId));
  if (anomalyOnly) conditions.push(eq(fuelLogs.isAnomaly, true));

  const logs = await db
    .select({
      id: fuelLogs.id,
      logType: fuelLogs.logType,
      loggedAt: fuelLogs.loggedAt,
      litresAdded: fuelLogs.litresAdded,
      odometreKm: fuelLogs.odometreKm,
      distanceTravelledKm: fuelLogs.distanceTravelledKm,
      actualLPer100Km: fuelLogs.actualLPer100Km,
      targetLPer100Km: fuelLogs.targetLPer100Km,
      efficiencyVariance: fuelLogs.efficiencyVariance,
      totalFuelCostSar: fuelLogs.totalFuelCostSar,
      isAnomaly: fuelLogs.isAnomaly,
      anomalyNotes: fuelLogs.anomalyNotes,
      fuelStationName: fuelLogs.fuelStationName,
      receiptNumber: fuelLogs.receiptNumber,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
    })
    .from(fuelLogs)
    .innerJoin(
      fleetVehicles,
      and(
        eq(fuelLogs.vehicleId, fleetVehicles.id),
        eq(fleetVehicles.tenantId, auth.user.tenantId)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(fuelLogs.loggedAt))
    .limit(100);

  const anomalies = logs.filter((l) => l.isAnomaly).length;

  return successResponse({
    logs,
    summary: {
      totalLogs: logs.length,
      anomalies,
      anomalyRatePct:
        logs.length > 0 ? Math.round((anomalies / logs.length) * 100) : 0,
      windowDays: days,
    },
  });
}
