/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Plant Technical Performance Evaluation Engine
 *  Mirrors the web dashboard at /#/evaluation
 * ============================================================
 *
 *  SCORING MODEL (live, rolling 24-hour window)
 *  ─────────────────────────────────────────────────────────
 *  The overall plant rating is a WEIGHTED composite out of 100:
 *
 *    Overall = (Workshop    × 0.25)
 *            + (BatchPlant  × 0.25)
 *            + (MixerPump   × 0.30)
 *            + (SalesOrder  × 0.20)
 *
 *  1. WORKSHOP SCORE (weight 25%)
 *     • 100/100 when there are ZERO active CRITICAL breakdowns
 *     • −40 per active CRITICAL breakdown
 *     • −15 per active HIGH severity work order
 *     • −5  per active MEDIUM/LOW work order
 *     • −10 if any vehicle has been IN_WORKSHOP for > 72h (stale WO)
 *
 *  2. BATCH PLANT SCORE (weight 25%)
 *     • Starts at 100
 *     • −8 per pending (OPEN/AWAITING_PARTS) maintenance order on plant assets
 *     • Loading-time penalty: for every full minute the average
 *       ARR_BSTC → DEP_PLANT duration exceeds the configured target
 *       (default 15 min), deduct 4 points (capped at 40)
 *     • −25 if any batch plant station is OUT_OF_SERVICE (calibration fail)
 *     • −10 if a silo is below reorder level (production risk)
 *
 *  3. MIXER / PUMP SCORE (weight 30%)
 *     • Pure on-time delivery percentage:
 *         onTimePct = (tripsDeliveredOnTime / tripsDelivered) × 100
 *     • A trip is ON TIME when its actual transit time is within
 *       `onTimeToleranceP` (default +20%) of the Google Maps ETA baseline.
 *       The ETA baseline is derived from site.distanceFromPlantKm at an
 *       assumed 40 km/h heavy-vehicle average, or the stored ETA if present.
 *     • If no trips were delivered in the window → neutral score of 100
 *       (cannot penalise a plant for having no work)
 *
 *  4. SALES / ORDER SCORE (weight 20%)
 *     • Measures how efficiently the credit queue is being cleared:
 *         approvedRatio = approvedVolume / (approvedVolume + queuedVolume)
 *     • score = approvedRatio × 100
 *     • −15 additional penalty if any order has been sitting in
 *       CREDIT_HOLD for more than 48 hours (stalled cash flow)
 *     • If there is no order activity → neutral score of 100
 *
 *  RECOMMENDATION ENGINE
 *  ─────────────────────────────────────────────────────────
 *  A rules sub-routine inspects each sub-score plus the raw metrics
 *  and emits structured, actionable recommendations (EN + AR) with a
 *  severity level so the dashboard can colour-code them.
 * ============================================================
 */

import { db } from "@/db";
import {
  maintenanceOrders,
  fleetVehicles,
  trips,
  tripCheckpoints,
  orders,
  deliverySites,
  inventorySilos,
  batchPlants,
  plantConfig,
  evaluationSnapshots,
  fuelLogs,
} from "@/db/schema";
import { and, eq, gte, inArray, sql, desc, isNotNull } from "drizzle-orm";

// ─── Tunable Weights ──────────────────────────────────────────────────────────

export const EVALUATION_WEIGHTS = {
  workshop: 0.25,
  batchPlant: 0.25,
  mixerPump: 0.3,
  salesOrder: 0.2,
} as const;

/** Assumed average heavy-vehicle speed (km/h) when no Maps ETA is stored */
const HEAVY_VEHICLE_AVG_SPEED_KMH = 40;

/** A work order older than this (hours) while vehicle is grounded is "stale" */
const STALE_WORK_ORDER_HOURS = 72;

/** A CREDIT_HOLD older than this (hours) is a stalled-cash-flow signal */
const STALLED_CREDIT_HOLD_HOURS = 48;

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Recommendation {
  code: string;
  severity: RecommendationSeverity;
  titleEn: string;
  titleAr: string;
  detail: string;
  /** Which module the recommendation targets */
  module: "WORKSHOP" | "BATCH_PLANT" | "FLEET" | "SALES" | "INVENTORY" | "QUALITY";
  /** Suggested concrete action for the operator */
  actionEn: string;
}

export interface WorkshopMetrics {
  activeCriticalBreakdowns: number;
  activeHighSeverity: number;
  activeOtherSeverity: number;
  vehiclesGrounded: number;
  staleWorkOrders: number;
  fleetTotal: number;
  fleetAvailabilityPct: number;
}

export interface BatchPlantMetrics {
  pendingMaintenanceOrders: number;
  averageLoadingTimeMinutes: number | null;
  targetLoadingTimeMinutes: number;
  loadingSampleSize: number;
  stationsOutOfService: number;
  silosBelowReorder: number;
}

export interface MixerPumpMetrics {
  tripsDelivered: number;
  tripsOnTime: number;
  tripsLate: number;
  onTimePct: number;
  averageTransitMinutes: number | null;
  averageCycleMinutes: number | null;
  fuelAnomalies: number;
}

export interface SalesOrderMetrics {
  approvedVolumeM3: number;
  queuedVolumeM3: number;
  approvedCount: number;
  pendingFinanceCount: number;
  creditHoldCount: number;
  stalledCreditHolds: number;
  approvalRatioPct: number;
}

export interface EvaluationResult {
  overallScore: number;
  grade: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "CRITICAL";
  scores: {
    workshop: number;
    batchPlant: number;
    mixerPump: number;
    salesOrder: number;
  };
  weights: typeof EVALUATION_WEIGHTS;
  metrics: {
    workshop: WorkshopMetrics;
    batchPlant: BatchPlantMetrics;
    mixerPump: MixerPumpMetrics;
    salesOrder: SalesOrderMetrics;
  };
  recommendations: Recommendation[];
  windowHours: number;
  evaluatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function gradeFor(score: number): EvaluationResult["grade"] {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 60) return "FAIR";
  if (score >= 40) return "POOR";
  return "CRITICAL";
}

/**
 * Loads the singleton plant configuration, falling back to sane defaults
 * if the operator has not yet seeded a config row.
 */
export async function getPlantConfig() {
  const rows = await db
    .select()
    .from(plantConfig)
    .where(eq(plantConfig.isActive, true))
    .limit(1);

  if (rows.length > 0) return rows[0];

  return {
    id: "default",
    configKey: "GLOBAL",
    podEffTargetKmPerLitre: "2.600",
    fuelToleranceP: "15.00",
    lightFuelBudgetSar: 0,
    heavyFuelBudgetSar: 0,
    tyreBudgetSar: 0,
    maintenanceBudgetSar: 0,
    targetLoadingTimeMinutes: 15,
    onTimeToleranceP: "20.00",
    baselineTempC: "35.0",
    baselineHumidityPct: "40.00",
    waterPerDegCLitres: "1.500",
    calibrationTolerancePct: "1.000",
    isActive: true,
  } as typeof plantConfig.$inferSelect;
}

// ─── 1. WORKSHOP SCORE ────────────────────────────────────────────────────────

export async function computeWorkshopScore(
  since: Date,
  tenantId: string
): Promise<{ score: number; metrics: WorkshopMetrics }> {
  // Active (not closed) work orders grouped by severity
  const activeWorkOrders = await db
    .select({
      severity: maintenanceOrders.severity,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(maintenanceOrders)
    .where(
      and(
        eq(maintenanceOrders.tenantId, tenantId),
        inArray(maintenanceOrders.status, [
          "OPEN",
          "IN_PROGRESS",
          "AWAITING_PARTS",
          "ESCALATED",
        ])
      )
    )
    .groupBy(maintenanceOrders.severity);

  const bySeverity = Object.fromEntries(
    activeWorkOrders.map((r) => [r.severity, r.count])
  ) as Record<string, number>;

  const activeCriticalBreakdowns = bySeverity["CRITICAL"] ?? 0;
  const activeHighSeverity = bySeverity["HIGH"] ?? 0;
  const activeOtherSeverity = (bySeverity["MEDIUM"] ?? 0) + (bySeverity["LOW"] ?? 0);

  // Stale work orders — open for longer than the threshold
  const staleCutoff = new Date(Date.now() - STALE_WORK_ORDER_HOURS * 3600_000);
  const staleRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(maintenanceOrders)
    .where(
      and(
        eq(maintenanceOrders.tenantId, tenantId),
        inArray(maintenanceOrders.status, ["OPEN", "IN_PROGRESS", "AWAITING_PARTS"]),
        sql`${maintenanceOrders.createdAt} < ${staleCutoff.toISOString()}::timestamp`
      )
    );
  const staleWorkOrders = staleRows[0]?.count ?? 0;

  // Fleet availability
  const fleetRows = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      grounded: sql<number>`SUM(CASE WHEN current_status IN ('IN_WORKSHOP','MAJOR_BREAKDOWN','OUT_OF_SERVICE') THEN 1 ELSE 0 END)::int`,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, tenantId), eq(fleetVehicles.isActive, true)));

  const fleetTotal = fleetRows[0]?.total ?? 0;
  const vehiclesGrounded = fleetRows[0]?.grounded ?? 0;
  const fleetAvailabilityPct =
    fleetTotal > 0 ? round2(((fleetTotal - vehiclesGrounded) / fleetTotal) * 100) : 100;

  // ── Scoring ────────────────────────────────────────────────────────────────
  // Perfect 100 when there are ZERO active CRITICAL breakdowns.
  let score = 100;
  score -= activeCriticalBreakdowns * 40;
  score -= activeHighSeverity * 15;
  score -= activeOtherSeverity * 5;
  if (staleWorkOrders > 0) score -= 10;

  return {
    score: clamp(round2(score)),
    metrics: {
      activeCriticalBreakdowns,
      activeHighSeverity,
      activeOtherSeverity,
      vehiclesGrounded,
      staleWorkOrders,
      fleetTotal,
      fleetAvailabilityPct,
    },
  };
}

// ─── 2. BATCH PLANT SCORE ─────────────────────────────────────────────────────

export async function computeBatchPlantScore(
  since: Date,
  targetLoadingTimeMinutes: number,
  tenantId: string
): Promise<{ score: number; metrics: BatchPlantMetrics }> {
  // Pending maintenance orders across the plant
  const pendingRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(maintenanceOrders)
    .where(
      and(
        eq(maintenanceOrders.tenantId, tenantId),
        inArray(maintenanceOrders.status, ["OPEN", "AWAITING_PARTS"])
      )
    );
  const pendingMaintenanceOrders = pendingRows[0]?.count ?? 0;

  /**
   * Average loading time = ARR_BSTC → DEP_PLANT duration.
   * Computed by self-joining trip_checkpoints on the same trip.
   */
  const loadingRows = await db.execute(sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (dep.logged_at - arr.logged_at)) / 60.0)::numeric AS avg_minutes,
      COUNT(*)::int AS sample_size
    FROM trip_checkpoints arr
    JOIN trip_checkpoints dep
      ON dep.trip_id = arr.trip_id
     AND dep.checkpoint = 'DEP_PLANT'
    WHERE arr.checkpoint = 'ARR_BSTC'
      AND arr.tenant_id = ${tenantId}
      AND arr.logged_at >= ${since.toISOString()}::timestamp
      AND dep.logged_at > arr.logged_at
  `);

  const loadingRow = (loadingRows.rows?.[0] ?? {}) as {
    avg_minutes?: string | number | null;
    sample_size?: number;
  };

  const averageLoadingTimeMinutes =
    loadingRow.avg_minutes != null ? round2(Number(loadingRow.avg_minutes)) : null;
  const loadingSampleSize = Number(loadingRow.sample_size ?? 0);

  // Stations out of service (calibration failures)
  const oosRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(batchPlants)
    .where(
      and(
        eq(batchPlants.tenantId, tenantId),
        eq(batchPlants.isActive, true),
        eq(batchPlants.status, "OUT_OF_SERVICE")
      )
    );
  const stationsOutOfService = oosRows[0]?.count ?? 0;

  // Silos below reorder level
  const siloRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(inventorySilos)
    .where(
      and(
        eq(inventorySilos.tenantId, tenantId),
        eq(inventorySilos.isActive, true),
        sql`CAST(current_stock_kg AS DECIMAL) <= CAST(reorder_level_kg AS DECIMAL)`
      )
    );
  const silosBelowReorder = siloRows[0]?.count ?? 0;

  // ── Scoring ────────────────────────────────────────────────────────────────
  let score = 100;
  score -= pendingMaintenanceOrders * 8;

  if (averageLoadingTimeMinutes !== null && loadingSampleSize > 0) {
    const overrunMinutes = Math.max(
      0,
      Math.floor(averageLoadingTimeMinutes - targetLoadingTimeMinutes)
    );
    score -= Math.min(40, overrunMinutes * 4);
  }

  if (stationsOutOfService > 0) score -= 25;
  if (silosBelowReorder > 0) score -= 10;

  return {
    score: clamp(round2(score)),
    metrics: {
      pendingMaintenanceOrders,
      averageLoadingTimeMinutes,
      targetLoadingTimeMinutes,
      loadingSampleSize,
      stationsOutOfService,
      silosBelowReorder,
    },
  };
}

// ─── 3. MIXER / PUMP SCORE ────────────────────────────────────────────────────

export async function computeMixerPumpScore(
  since: Date,
  onTimeTolerancePct: number,
  tenantId: string
): Promise<{ score: number; metrics: MixerPumpMetrics }> {
  /**
   * Pull completed trips in the window along with the site distance so we can
   * derive the Google-Maps-equivalent ETA baseline:
   *   etaMinutes = (distanceKm / 40 km/h) × 60
   * A trip is ON TIME when actualTransit <= etaMinutes × (1 + tolerance)
   */
  const rows = await db
    .select({
      transitTimeMinutes: trips.transitTimeMinutes,
      totalCycleTimeMinutes: trips.totalCycleTimeMinutes,
      distanceFromPlantKm: deliverySites.distanceFromPlantKm,
    })
    .from(trips)
    .innerJoin(orders, eq(trips.orderId, orders.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .where(
      and(
        eq(trips.tenantId, tenantId),
        eq(trips.isCompleted, true),
        eq(trips.isCancelled, false),
        isNotNull(trips.transitTimeMinutes),
        gte(trips.updatedAt, since)
      )
    );

  let tripsOnTime = 0;
  let tripsLate = 0;
  let transitSum = 0;
  let transitCount = 0;
  let cycleSum = 0;
  let cycleCount = 0;

  for (const row of rows) {
    const actual = row.transitTimeMinutes ?? 0;
    if (actual > 0) {
      transitSum += actual;
      transitCount += 1;
    }
    if (row.totalCycleTimeMinutes && row.totalCycleTimeMinutes > 0) {
      cycleSum += row.totalCycleTimeMinutes;
      cycleCount += 1;
    }

    const distanceKm = row.distanceFromPlantKm
      ? parseFloat(row.distanceFromPlantKm)
      : null;

    // ETA baseline from Google Maps distance; if unknown fall back to target
    const etaMinutes =
      distanceKm && distanceKm > 0
        ? (distanceKm / HEAVY_VEHICLE_AVG_SPEED_KMH) * 60
        : 45; // conservative default ETA

    const allowedMinutes = etaMinutes * (1 + onTimeTolerancePct / 100);

    if (actual <= allowedMinutes) tripsOnTime += 1;
    else tripsLate += 1;
  }

  const tripsDelivered = rows.length;

  // Fuel anomalies in the window (mechanical failure / theft signal)
  const anomalyRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(fuelLogs)
    .where(
      and(
        eq(fuelLogs.tenantId, tenantId),
        eq(fuelLogs.isAnomaly, true),
        gte(fuelLogs.loggedAt, since)
      )
    );
  const fuelAnomalies = anomalyRows[0]?.count ?? 0;

  const onTimePct =
    tripsDelivered > 0 ? round2((tripsOnTime / tripsDelivered) * 100) : 100;

  // Score is the on-time percentage, lightly penalised by fuel anomalies
  let score = onTimePct;
  score -= Math.min(15, fuelAnomalies * 5);

  return {
    score: clamp(round2(score)),
    metrics: {
      tripsDelivered,
      tripsOnTime,
      tripsLate,
      onTimePct,
      averageTransitMinutes: transitCount > 0 ? round2(transitSum / transitCount) : null,
      averageCycleMinutes: cycleCount > 0 ? round2(cycleSum / cycleCount) : null,
      fuelAnomalies,
    },
  };
}

// ─── 4. SALES / ORDER SCORE ───────────────────────────────────────────────────

export async function computeSalesOrderScore(
  since: Date,
  tenantId: string
): Promise<{ score: number; metrics: SalesOrderMetrics }> {
  const rows = await db
    .select({
      status: orders.status,
      count: sql<number>`COUNT(*)::int`,
      volume: sql<string>`COALESCE(SUM(CAST(total_volume_m3 AS DECIMAL)), 0)::text`,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, since)))
    .groupBy(orders.status);

  const byStatus = new Map(rows.map((r) => [r.status, r]));

  const volOf = (status: string) =>
    parseFloat(byStatus.get(status as never)?.volume ?? "0");
  const cntOf = (status: string) => byStatus.get(status as never)?.count ?? 0;

  const approvedVolumeM3 =
    volOf("APPROVED") +
    volOf("APPROVED_SCHEDULED") +
    volOf("SCHEDULED") +
    volOf("IN_PRODUCTION") +
    volOf("IN_TRANSIT") +
    volOf("DELIVERED");

  const queuedVolumeM3 = volOf("PENDING_FINANCE") + volOf("CREDIT_HOLD");

  const approvedCount =
    cntOf("APPROVED") + cntOf("APPROVED_SCHEDULED") + cntOf("SCHEDULED");
  const pendingFinanceCount = cntOf("PENDING_FINANCE");
  const creditHoldCount = cntOf("CREDIT_HOLD");

  // Stalled credit holds (older than threshold)
  const stalledCutoff = new Date(Date.now() - STALLED_CREDIT_HOLD_HOURS * 3600_000);
  const stalledRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, "CREDIT_HOLD"),
        sql`${orders.updatedAt} < ${stalledCutoff.toISOString()}::timestamp`
      )
    );
  const stalledCreditHolds = stalledRows[0]?.count ?? 0;

  const totalVolume = approvedVolumeM3 + queuedVolumeM3;
  const approvalRatioPct =
    totalVolume > 0 ? round2((approvedVolumeM3 / totalVolume) * 100) : 100;

  let score = approvalRatioPct;
  if (stalledCreditHolds > 0) score -= 15;

  return {
    score: clamp(round2(score)),
    metrics: {
      approvedVolumeM3: round2(approvedVolumeM3),
      queuedVolumeM3: round2(queuedVolumeM3),
      approvedCount,
      pendingFinanceCount,
      creditHoldCount,
      stalledCreditHolds,
      approvalRatioPct,
    },
  };
}

// ─── RECOMMENDATION ENGINE (sub-routine) ──────────────────────────────────────

/**
 * Rule-based sub-routine that turns raw scores + metrics into actionable,
 * bilingual recommendations for the evaluation dashboard.
 */
export function generateRecommendations(
  scores: EvaluationResult["scores"],
  metrics: EvaluationResult["metrics"]
): Recommendation[] {
  const recs: Recommendation[] = [];

  // ── Workshop rules ─────────────────────────────────────────────────────────
  if (metrics.workshop.activeCriticalBreakdowns > 0) {
    recs.push({
      code: "WS_CRITICAL_BREAKDOWN",
      severity: "CRITICAL",
      titleEn: "Resolve critical fleet breakdowns immediately",
      titleAr: "معالجة أعطال الأسطول الحرجة فوراً",
      detail: `${metrics.workshop.activeCriticalBreakdowns} vehicle(s) have CRITICAL work orders and are excluded from the dispatch pool.`,
      module: "WORKSHOP",
      actionEn: "Assign mechanics to the highest-priority work orders and expedite spare parts.",
    });
  }

  if (metrics.workshop.staleWorkOrders > 0) {
    recs.push({
      code: "WS_STALE_WORK_ORDERS",
      severity: "HIGH",
      titleEn: "Close ageing workshop orders",
      titleAr: "إغلاق أوامر الورشة المتأخرة",
      detail: `${metrics.workshop.staleWorkOrders} work order(s) have been open for more than ${STALE_WORK_ORDER_HOURS} hours.`,
      module: "WORKSHOP",
      actionEn: "Escalate to the workshop supervisor and review parts availability.",
    });
  }

  if (metrics.workshop.fleetAvailabilityPct < 80 && metrics.workshop.fleetTotal > 0) {
    recs.push({
      code: "WS_LOW_AVAILABILITY",
      severity: "HIGH",
      titleEn: "Update plant preventive maintenance schedules",
      titleAr: "تحديث جداول الصيانة الوقائية للمحطة",
      detail: `Fleet availability is ${metrics.workshop.fleetAvailabilityPct}% — below the 80% operational threshold.`,
      module: "WORKSHOP",
      actionEn: "Shift preventive maintenance to off-peak windows to raise daytime availability.",
    });
  }

  // ── Batch plant rules ──────────────────────────────────────────────────────
  if (metrics.batchPlant.stationsOutOfService > 0) {
    recs.push({
      code: "BP_STATION_OOS",
      severity: "CRITICAL",
      titleEn: "Recalibrate out-of-service batching station",
      titleAr: "إعادة معايرة محطة الخلط المتوقفة",
      detail: `${metrics.batchPlant.stationsOutOfService} batching station(s) are OUT_OF_SERVICE due to scale calibration failure (> ±1%).`,
      module: "BATCH_PLANT",
      actionEn: "Perform certified weight verification and clear the calibration block before batching.",
    });
  }

  if (
    metrics.batchPlant.averageLoadingTimeMinutes !== null &&
    metrics.batchPlant.averageLoadingTimeMinutes > metrics.batchPlant.targetLoadingTimeMinutes
  ) {
    recs.push({
      code: "BP_SLOW_LOADING",
      severity: "MEDIUM",
      titleEn: "Reduce truck loading cycle time",
      titleAr: "تقليل زمن دورة تحميل الشاحنات",
      detail: `Average loading time is ${metrics.batchPlant.averageLoadingTimeMinutes} min versus a ${metrics.batchPlant.targetLoadingTimeMinutes} min target (${metrics.batchPlant.loadingSampleSize} samples).`,
      module: "BATCH_PLANT",
      actionEn: "Review conveyor throughput, hopper discharge rates, and queueing at the batch plant.",
    });
  }

  if (metrics.batchPlant.pendingMaintenanceOrders > 0) {
    recs.push({
      code: "BP_PENDING_MAINTENANCE",
      severity: "MEDIUM",
      titleEn: "Clear pending maintenance backlog",
      titleAr: "إنهاء أوامر الصيانة المعلقة",
      detail: `${metrics.batchPlant.pendingMaintenanceOrders} maintenance order(s) are pending or awaiting parts.`,
      module: "BATCH_PLANT",
      actionEn: "Prioritise parts procurement and reassign idle mechanics.",
    });
  }

  if (metrics.batchPlant.silosBelowReorder > 0) {
    recs.push({
      code: "INV_BELOW_REORDER",
      severity: "HIGH",
      titleEn: "Replenish raw material silos",
      titleAr: "إعادة تعبئة صوامع المواد الخام",
      detail: `${metrics.batchPlant.silosBelowReorder} silo(s) are at or below their reorder level. Production continuity is at risk.`,
      module: "INVENTORY",
      actionEn: "Approve the URGENT purchase requests generated automatically by the batching engine.",
    });
  }

  // ── Mixer / pump rules ─────────────────────────────────────────────────────
  if (metrics.mixerPump.tripsDelivered > 0 && metrics.mixerPump.onTimePct < 85) {
    recs.push({
      code: "FLEET_LOW_ONTIME",
      severity: metrics.mixerPump.onTimePct < 60 ? "HIGH" : "MEDIUM",
      titleEn: "Review Mixer truck performance",
      titleAr: "مراجعة أداء شاحنات الخلط",
      detail: `Only ${metrics.mixerPump.onTimePct}% of ${metrics.mixerPump.tripsDelivered} deliveries met the Google Maps ETA window (${metrics.mixerPump.tripsLate} late).`,
      module: "FLEET",
      actionEn: "Analyse route deviations, curfew windows, and on-site waiting times for the late trips.",
    });
  }

  if (metrics.mixerPump.fuelAnomalies > 0) {
    recs.push({
      code: "FLEET_FUEL_ANOMALY",
      severity: "HIGH",
      titleEn: "Investigate fuel consumption anomalies",
      titleAr: "التحقيق في انحرافات استهلاك الوقود",
      detail: `${metrics.mixerPump.fuelAnomalies} fuel log(s) breached the efficiency tolerance window — possible mechanical fault or fuel theft.`,
      module: "FLEET",
      actionEn: "Cross-check odometer readings against GPS distance and audit the refuelling receipts.",
    });
  }

  if (
    metrics.mixerPump.averageCycleMinutes !== null &&
    metrics.mixerPump.averageCycleMinutes > 180
  ) {
    recs.push({
      code: "FLEET_LONG_CYCLE",
      severity: "MEDIUM",
      titleEn: "Optimise truck cycle time",
      titleAr: "تحسين زمن دورة الشاحنة",
      detail: `Average full cycle is ${metrics.mixerPump.averageCycleMinutes} minutes, exceeding the 180-minute efficiency benchmark.`,
      module: "FLEET",
      actionEn: "Rebalance dispatch assignments toward nearer sites during peak hours.",
    });
  }

  // ── Sales / credit rules ───────────────────────────────────────────────────
  if (metrics.salesOrder.stalledCreditHolds > 0) {
    recs.push({
      code: "SALES_STALLED_CREDIT",
      severity: "HIGH",
      titleEn: "Clear stalled credit holds",
      titleAr: "معالجة الطلبات الموقوفة ائتمانياً",
      detail: `${metrics.salesOrder.stalledCreditHolds} order(s) have been on CREDIT_HOLD for more than ${STALLED_CREDIT_HOLD_HOURS} hours.`,
      module: "SALES",
      actionEn: "Accountant must action the electronic override or reject to unblock the pipeline.",
    });
  }

  if (metrics.salesOrder.pendingFinanceCount > 0 && metrics.salesOrder.approvalRatioPct < 70) {
    recs.push({
      code: "SALES_SLOW_APPROVAL",
      severity: "MEDIUM",
      titleEn: "Accelerate finance approval queue",
      titleAr: "تسريع طابور موافقات الحسابات",
      detail: `${metrics.salesOrder.queuedVolumeM3} m³ is awaiting credit clearance versus ${metrics.salesOrder.approvedVolumeM3} m³ approved (${metrics.salesOrder.approvalRatioPct}%).`,
      module: "SALES",
      actionEn: "Assign an additional accountant to the credit-check queue during peak booking hours.",
    });
  }

  // ── Positive reinforcement when everything is healthy ──────────────────────
  if (recs.length === 0) {
    recs.push({
      code: "ALL_CLEAR",
      severity: "INFO",
      titleEn: "Plant operating within all target parameters",
      titleAr: "المحطة تعمل ضمن جميع المعايير المستهدفة",
      detail: "No workshop, batching, fleet, or credit anomalies detected in the evaluation window.",
      module: "WORKSHOP",
      actionEn: "Maintain current preventive maintenance and dispatch cadence.",
    });
  }

  // Sort by severity so the dashboard shows the most urgent first
  const order: Record<RecommendationSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    INFO: 4,
  };
  return recs.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

/**
 * Runs the full plant technical performance evaluation.
 *
 * @param windowHours  Rolling analysis window (default 24 hours)
 * @param persist      When true, writes an evaluation_snapshots row for trends
 */
export async function evaluatePlantPerformance(
  windowHours = 24,
  persist = false,
  tenantId?: string
): Promise<EvaluationResult> {
  const since = new Date(Date.now() - windowHours * 3600_000);
  const config = await getPlantConfig();

  const targetLoadingTimeMinutes = config.targetLoadingTimeMinutes ?? 15;
  const onTimeTolerancePct = parseFloat(config.onTimeToleranceP ?? "20");

  // Run all four sub-evaluations in parallel for speed
  const [workshop, batchPlant, mixerPump, salesOrder] = await Promise.all([
    computeWorkshopScore(since, tenantId ?? ""),
    computeBatchPlantScore(since, targetLoadingTimeMinutes, tenantId ?? ""),
    computeMixerPumpScore(since, onTimeTolerancePct, tenantId ?? ""),
    computeSalesOrderScore(since, tenantId ?? ""),
  ]);

  const scores = {
    workshop: workshop.score,
    batchPlant: batchPlant.score,
    mixerPump: mixerPump.score,
    salesOrder: salesOrder.score,
  };

  const overallScore = round2(
    scores.workshop * EVALUATION_WEIGHTS.workshop +
      scores.batchPlant * EVALUATION_WEIGHTS.batchPlant +
      scores.mixerPump * EVALUATION_WEIGHTS.mixerPump +
      scores.salesOrder * EVALUATION_WEIGHTS.salesOrder
  );

  const metrics = {
    workshop: workshop.metrics,
    batchPlant: batchPlant.metrics,
    mixerPump: mixerPump.metrics,
    salesOrder: salesOrder.metrics,
  };

  const recommendations = generateRecommendations(scores, metrics);

  const result: EvaluationResult = {
    overallScore,
    grade: gradeFor(overallScore),
    scores,
    weights: EVALUATION_WEIGHTS,
    metrics,
    recommendations,
    windowHours,
    evaluatedAt: new Date().toISOString(),
  };

  if (persist) {
    await db.insert(evaluationSnapshots).values({
      tenantId: tenantId ?? "00000000-0000-0000-0000-000000000000",
      overallScore: overallScore.toFixed(2),
      workshopScore: scores.workshop.toFixed(2),
      batchPlantScore: scores.batchPlant.toFixed(2),
      mixerPumpScore: scores.mixerPump.toFixed(2),
      salesOrderScore: scores.salesOrder.toFixed(2),
      metrics: metrics as unknown as Record<string, unknown>,
      recommendations: recommendations.map((r) => ({
        code: r.code,
        severity: r.severity,
        titleEn: r.titleEn,
        titleAr: r.titleAr,
        detail: r.detail,
      })),
      windowHours,
    });
  }

  return result;
}

/**
 * Returns historical evaluation snapshots for trend charting.
 */
export async function getEvaluationHistory(limit = 30, tenantId?: string) {
  const rows = await db
    .select()
    .from(evaluationSnapshots)
    .where(tenantId ? eq(evaluationSnapshots.tenantId, tenantId) : undefined)
    .orderBy(desc(evaluationSnapshots.createdAt))
    .limit(limit);
  return rows;
}
