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
import { requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  computeDriverMonthlyBonus,
  computeFleetMonthlyBonusReport,
} from "@/lib/services/driver-bonus.service";

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
      const report = await computeDriverMonthlyBonus(driverId, year, month);
      const topEarners = report.bonus.finalBonusSar;
      return successResponse(
        report,
        `${report.driverName} (${report.employeeCode}) completed ${report.trips.completed} trip(s) in ${year}-${String(month).padStart(2, "0")}. Grade: ${report.grade}. Bonus: SAR ${topEarners.toLocaleString()}.`
      );
    }

    const report = await computeFleetMonthlyBonusReport(year, month);
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
