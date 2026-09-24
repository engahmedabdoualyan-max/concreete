/**
 * ============================================================
 *  /api/driver-bonus — Monthly Driver Performance Bonus
 * ============================================================
 *
 *  GET /api/driver-bonus?year=2026&month=8                 Fleet report
 *  GET /api/driver-bonus?driverId=<uuid>&year=2026&month=8 Single driver
 *
 *  RBAC: SUPER_ADMIN (full access) · FINANCE (read-only) ·
 *        DISPATCHER (read-only)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { trips, users } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { computeDriverMonthlyBonus } from "@/lib/services/driver-bonus.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.AUDIT_LOG_READ,
  ]);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");
  const driverId = url.searchParams.get("driverId");

  const now = new Date();
  const year = yearStr ? parseInt(yearStr) : now.getUTCFullYear();
  const month = monthStr ? parseInt(monthStr) : now.getUTCMonth() + 1;

  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return errorResponse("INVALID_PERIOD", "Invalid year or month", 400);
  }

  try {
    if (driverId) {
      const driverRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, driverId), eq(users.tenantId, auth.user.tenantId)))
        .limit(1);

      if (driverRows.length === 0) {
        return errorResponse("NOT_FOUND", "Driver not found", 404);
      }

      const report = await computeDriverMonthlyBonus(driverId, year, month);
      const topEarners = report.bonus.finalBonusSar;
      return successResponse(
        report,
        `${report.driverName} (${report.employeeCode}) completed ${report.trips.completed} trip(s) in ${year}-${String(month).padStart(2, "0")}. Grade: ${report.grade}. Bonus: SAR ${topEarners.toLocaleString()}.`
      );
    }

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));
    const driverRows = await db
      .select({ driverId: trips.driverId })
      .from(trips)
      .innerJoin(
        users,
        and(eq(users.id, trips.driverId), eq(users.tenantId, auth.user.tenantId))
      )
      .where(
        and(
          eq(trips.tenantId, auth.user.tenantId),
          eq(trips.isCompleted, true),
          gte(trips.updatedAt, periodStart),
          lte(trips.updatedAt, periodEnd)
        )
      );

    const driverIds = Array.from(new Set(driverRows.map((row) => row.driverId)));
    const drivers = await Promise.all(
      driverIds.map((id) => computeDriverMonthlyBonus(id, year, month))
    );
    drivers.sort((a, b) => b.bonus.finalBonusSar - a.bonus.finalBonusSar);

    const totalCompletedTrips = drivers.reduce(
      (sum, driver) => sum + driver.trips.completed,
      0
    );
    const totalBaseBonusSar = drivers.reduce(
      (sum, driver) => sum + driver.bonus.baseBonusSar,
      0
    );
    const totalFinalBonusSar = drivers.reduce(
      (sum, driver) => sum + driver.bonus.finalBonusSar,
      0
    );
    const fleetAverageMultiplier =
      drivers.length > 0
        ? Math.round(
            (drivers.reduce((sum, driver) => sum + driver.bonus.multiplier, 0) /
              drivers.length) *
              100
          ) / 100
        : 0;

    const report = {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      drivers,
      totals: {
        totalCompletedTrips,
        totalBaseBonusSar,
        totalFinalBonusSar,
        fleetAverageMultiplier,
      },
    };
    const periodLabel = `${year}-${String(month).padStart(2, "0")}`;
    return successResponse(
      report,
      `${periodLabel} fleet bonus: ${report.drivers.length} driver(s), ${report.totals.totalCompletedTrips} trip(s), SAR ${report.totals.totalFinalBonusSar.toLocaleString()} paid out. Fleet avg multiplier ${report.totals.fleetAverageMultiplier}×.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("BONUS_CALC_ERROR", message, 500);
  }
}
