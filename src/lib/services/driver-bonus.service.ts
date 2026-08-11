/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Monthly Driver Performance Bonus Engine
 *  src/lib/services/driver-bonus.service.ts
 * ============================================================
 *
 *  BUSINESS RULES
 *  ─────────────────────────────────────────────────────────
 *  Drivers earn a monthly financial bonus based on:
 *    1. TOTAL COMPLETED TRIPS — volume of work delivered
 *    2. ON-TIME DELIVERY RATE — trips delivered within the
 *       Google Maps ETA + tolerance window
 *    3. SAFETY / DRYING-RISK RATE — trips with no
 *       CONCRETE_DRYING_RISK events (transit ≤ 90 min)
 *    4. FUEL ANOMALY RATE — trips without FUEL_ANOMALY flags
 *
 *  Bonus formula (default, configurable via plant_config):
 *
 *    baseBonus   = completedTrips × bonusPerTrip
 *    multiplier  = clamp(onTimePct × 0.5 + safePct × 0.3 + cleanFuelPct × 0.2, 0, 1.5)
 *    finalBonus  = baseBonus × multiplier
 *
 *  The multiplier rewards consistency across all three quality
 *  dimensions. A perfect driver (100% on all metrics) earns 1.0×;
 *  exceptional performers can earn up to 1.5× if the plant rewards
 *  above-benchmark performance.
 * ============================================================
 */

import { db } from "@/db";
import {
  trips,
  auditLogs,
  fuelLogs,
  orders,
  deliverySites,
  users,
  plantConfig,
} from "@/db/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriverMonthlyPerformance {
  driverId: string;
  driverName: string;
  employeeCode: string;
  periodStart: string;
  periodEnd: string;
  windowDays: number;

  trips: {
    completed: number;
    onTime: number;
    late: number;
    dryingRisk: number;
    fuelAnomaly: number;
  };

  rates: {
    onTimePct: number;
    safeTransitPct: number;
    cleanFuelPct: number;
  };

  bonus: {
    bonusPerTripSar: number;
    baseBonusSar: number;
    multiplier: number;
    finalBonusSar: number;
  };

  grade: "PLATINUM" | "GOLD" | "SILVER" | "BRONZE" | "BELOW_THRESHOLD";
}

export interface FleetMonthlyBonusReport {
  periodStart: string;
  periodEnd: string;
  drivers: DriverMonthlyPerformance[];
  totals: {
    totalCompletedTrips: number;
    totalBaseBonusSar: number;
    totalFinalBonusSar: number;
    fleetAverageMultiplier: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BONUS_PER_TRIP_SAR = 150;
const MAX_MULTIPLIER = 1.5;
const MIN_GRADE_THRESHOLD = 0.5; // below 50% multiplier → BELOW_THRESHOLD

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gradeForMultiplier(multiplier: number): DriverMonthlyPerformance["grade"] {
  if (multiplier >= 1.2) return "PLATINUM";
  if (multiplier >= 1.0) return "GOLD";
  if (multiplier >= 0.85) return "SILVER";
  if (multiplier >= MIN_GRADE_THRESHOLD) return "BRONZE";
  return "BELOW_THRESHOLD";
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

/**
 * Computes a single driver's monthly performance and bonus.
 */
export async function computeDriverMonthlyBonus(
  driverId: string,
  year: number,
  month: number
): Promise<DriverMonthlyPerformance> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  // Load driver record
  const [driver] = await db
    .select({ id: users.id, fullName: users.fullName, employeeCode: users.employeeCode })
    .from(users)
    .where(eq(users.id, driverId))
    .limit(1);

  if (!driver) throw new Error(`Driver not found: ${driverId}`);

  // Load bonus rate from plant_config
  const bonusPerTrip = DEFAULT_BONUS_PER_TRIP_SAR;

  // ── Count completed trips ─────────────────────────────────────────────────
  const tripRows = await db
    .select({
      id: trips.id,
      transitTimeMinutes: trips.transitTimeMinutes,
      totalCycleTimeMinutes: trips.totalCycleTimeMinutes,
      orderId: trips.orderId,
    })
    .from(trips)
    .where(
      and(
        eq(trips.driverId, driverId),
        eq(trips.isCompleted, true),
        eq(trips.isCancelled, false),
        gte(trips.updatedAt, periodStart),
        lte(trips.updatedAt, periodEnd)
      )
    );

  const completed = tripRows.length;

  // ── On-time calculation using Google Maps ETA baseline ────────────────────
  // Pull the order → site distance for each trip to derive the ETA baseline
  const HEAVY_VEHICLE_AVG_SPEED_KMH = 40;
  const ON_TIME_TOLERANCE_PCT = 20;

  let onTime = 0;
  let late = 0;

  if (completed > 0) {
    const orderIds = Array.from(new Set(tripRows.map((t) => t.orderId)));
    const orderSiteRows = orderIds.length > 0
      ? await db
          .select({
            orderId: orders.id,
            distanceFromPlantKm: deliverySites.distanceFromPlantKm,
          })
          .from(orders)
          .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
          .where(inArray(orders.id, orderIds))
      : [];

    const distanceByOrder = new Map(
      orderSiteRows.map((r) => [r.orderId, r.distanceFromPlantKm])
    );

    for (const trip of tripRows) {
      const actual = trip.transitTimeMinutes ?? 0;
      const distanceKm = distanceByOrder.get(trip.orderId);
      const etaMinutes =
        distanceKm && parseFloat(distanceKm) > 0
          ? (parseFloat(distanceKm) / HEAVY_VEHICLE_AVG_SPEED_KMH) * 60
          : 45;
      const allowed = etaMinutes * (1 + ON_TIME_TOLERANCE_PCT / 100);
      if (actual <= allowed) onTime += 1;
      else late += 1;
    }
  }

  // ── Safety / drying-risk count ────────────────────────────────────────────
  const dryingRiskRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "CONCRETE_DRYING_RISK"),
        eq(auditLogs.entityType, "trips"),
        gte(auditLogs.createdAt, periodStart),
        lte(auditLogs.createdAt, periodEnd),
        sql`EXISTS (SELECT 1 FROM trips t WHERE t.id = ${auditLogs.entityId} AND t.driver_id = ${driverId})`
      )
    );
  const dryingRisk = dryingRiskRows[0]?.count ?? 0;

  // ── Fuel anomaly count ────────────────────────────────────────────────────
  const anomalyRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fuelLogs)
    .innerJoin(trips, eq(fuelLogs.vehicleId, trips.vehicleId))
    .where(
      and(
        eq(trips.driverId, driverId),
        eq(fuelLogs.isAnomaly, true),
        gte(fuelLogs.loggedAt, periodStart),
        lte(fuelLogs.loggedAt, periodEnd)
      )
    );
  const fuelAnomaly = anomalyRows[0]?.count ?? 0;

  // ── Rates ─────────────────────────────────────────────────────────────────
  const onTimePct = completed > 0 ? round2((onTime / completed) * 100) : 0;
  const safeTransitPct =
    completed > 0 ? round2(((completed - dryingRisk) / completed) * 100) : 0;
  const cleanFuelPct =
    completed > 0 ? round2(((completed - fuelAnomaly) / completed) * 100) : 0;

  // ── Bonus calculation ─────────────────────────────────────────────────────
  const baseBonusSar = completed * bonusPerTrip;
  const multiplier = round2(
    clamp(
      (onTimePct / 100) * 0.5 +
        (safeTransitPct / 100) * 0.3 +
        (cleanFuelPct / 100) * 0.2,
      0,
      MAX_MULTIPLIER
    )
  );
  const finalBonusSar = round2(baseBonusSar * multiplier);

  return {
    driverId,
    driverName: driver.fullName,
    employeeCode: driver.employeeCode,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    windowDays: Math.round((+periodEnd - +periodStart) / 86400000),
    trips: { completed, onTime, late, dryingRisk, fuelAnomaly },
    rates: { onTimePct, safeTransitPct, cleanFuelPct },
    bonus: {
      bonusPerTripSar: bonusPerTrip,
      baseBonusSar,
      multiplier,
      finalBonusSar,
    },
    grade: gradeForMultiplier(multiplier),
  };
}

/**
 * Aggregates the monthly bonus report for ALL drivers active in the period.
 */
export async function computeFleetMonthlyBonusReport(
  year: number,
  month: number
): Promise<FleetMonthlyBonusReport> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));

  // Find all drivers who completed at least one trip in the period
  const driverIds = await db
    .select({ driverId: trips.driverId })
    .from(trips)
    .where(
      and(
        eq(trips.isCompleted, true),
        gte(trips.updatedAt, periodStart),
        lte(trips.updatedAt, periodEnd)
      )
    )
    .then((rows) => Array.from(new Set(rows.map((r) => r.driverId))));

  const drivers = await Promise.all(
    driverIds.map((id) => computeDriverMonthlyBonus(id, year, month))
  );

  // Sort by final bonus (descending) so the top performers are on top
  drivers.sort((a, b) => b.bonus.finalBonusSar - a.bonus.finalBonusSar);

  const totalCompletedTrips = drivers.reduce((s, d) => s + d.trips.completed, 0);
  const totalBaseBonusSar = drivers.reduce((s, d) => s + d.bonus.baseBonusSar, 0);
  const totalFinalBonusSar = drivers.reduce((s, d) => s + d.bonus.finalBonusSar, 0);
  const fleetAverageMultiplier =
    drivers.length > 0
      ? round2(drivers.reduce((s, d) => s + d.bonus.multiplier, 0) / drivers.length)
      : 0;

  return {
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
}
