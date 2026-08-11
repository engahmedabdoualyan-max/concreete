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
import { fuelLogs, fleetVehicles } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  processPostTripRefuel,
  buildMonthlyBudgetReport,
} from "@/lib/services/fuel-efficiency.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

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
      const report = await buildMonthlyBudgetReport(
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

  const conditions = [gte(fuelLogs.loggedAt, since)];
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
    .innerJoin(fleetVehicles, eq(fuelLogs.vehicleId, fleetVehicles.id))
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
