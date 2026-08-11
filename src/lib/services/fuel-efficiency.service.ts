/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Smart Fuel Efficiency Log & Fleet Budget Engine
 * ============================================================
 *
 *  POST-TRIP WEBHOOK
 *  ─────────────────────────────────────────────────────────
 *  Fires when a truck completes a journey (RETURN_PLANT) and
 *  refuels. The engine:
 *
 *    1. Derives DISTANCE TRAVELLED from the GPS timeline
 *       (driver_locations haversine polyline) with an odometer
 *       fallback when GPS coverage is sparse.
 *
 *    2. Computes ACTUAL EFFICIENCY:
 *         efficiency (km/L) = distanceTravelledKm / litresConsumed
 *
 *    3. Compares against `plant_config.pod_eff_target_km_per_litre`
 *       within a tolerance window (default ±15 %).
 *         variancePct = ((actual − target) / target) × 100
 *       A NEGATIVE variance beyond tolerance means the truck burned
 *       MORE fuel than budgeted → FUEL_ANOMALY.
 *
 *    4. Additional fraud/mechanical heuristics:
 *         • Tank over-fill      (litres > physical tank capacity)
 *         • Impossible distance (GPS distance ≫ odometer delta)
 *         • Phantom refuel      (fuel added while odometer unchanged)
 *         • Repeat offender     (3 consecutive anomalies)
 *
 *    5. Flags the row `isAnomaly = true` so the dashboard can raise it.
 *
 *  BUDGET AGGREGATION
 *  ─────────────────────────────────────────────────────────
 *  Monthly spend is split by vehicle class and mapped against
 *  the configured global budgets:
 *    • light_fuel_budget  → SERVICE_TRUCK, WATER_TANKER
 *    • heavy_fuel_budget  → MIXER_TRUCK, TRANSIT_MIXER, CONCRETE_PUMP
 *    • tyre_budget        → TIRE_SERVICE maintenance orders
 *    • maintenance_budget → all other maintenance orders
 * ============================================================
 */

import { db } from "@/db";
import {
  fuelLogs,
  fleetVehicles,
  driverLocations,
  trips,
  maintenanceOrders,
  plantConfig,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, sql, lte } from "drizzle-orm";
import { haversineDistance } from "./realtime-gps.service";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Vehicle classes billed against the HEAVY fuel budget */
export const HEAVY_VEHICLE_TYPES = [
  "MIXER_TRUCK",
  "TRANSIT_MIXER",
  "CONCRETE_PUMP",
] as const;

/** Vehicle classes billed against the LIGHT fuel budget */
export const LIGHT_VEHICLE_TYPES = ["SERVICE_TRUCK", "WATER_TANKER"] as const;

/** Maximum plausible diesel tank capacity for a mixer (litres) */
export const MAX_TANK_CAPACITY_LITRES = 400;

/** GPS samples closer than this are treated as noise and skipped (metres) */
const MIN_GPS_SEGMENT_METRES = 15;

/** GPS jump larger than this between two samples is discarded (metres) */
const MAX_GPS_SEGMENT_METRES = 5_000;

/** Consecutive anomalies before a vehicle is escalated */
const REPEAT_OFFENDER_THRESHOLD = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnomalyCode =
  | "OVER_CONSUMPTION"
  | "UNDER_CONSUMPTION"
  | "TANK_OVERFILL"
  | "PHANTOM_REFUEL"
  | "GPS_ODOMETER_MISMATCH"
  | "REPEAT_OFFENDER";

export interface AnomalyFinding {
  code: AnomalyCode;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
}

export interface DistanceResolution {
  distanceKm: number;
  source: "GPS_TIMELINE" | "ODOMETER" | "HYBRID";
  gpsDistanceKm: number | null;
  odometerDistanceKm: number | null;
  gpsSampleCount: number;
  /** Absolute % difference between GPS and odometer, when both available */
  discrepancyPct: number | null;
}

export interface PostTripFuelParams {
  vehicleId: string;
  /** Trip that just completed — used to scope the GPS polyline */
  tripId?: string;
  /** Litres dispensed at the pump */
  litresAdded: number;
  /** Odometer reading at the pump (km) */
  odometreKm: number;
  costPerLitreSarCents?: number;
  fuelStationName?: string;
  receiptNumber?: string;
  loggedById: string;
  notes?: string;
}

export interface PostTripFuelResult {
  logId: string;
  vehicleCode: string;
  plateNumber: string;
  distance: DistanceResolution;
  litresConsumed: number;
  actualKmPerLitre: number | null;
  targetKmPerLitre: number;
  variancePct: number | null;
  toleranceP: number;
  withinTolerance: boolean;
  isAnomaly: boolean;
  findings: AnomalyFinding[];
  totalFuelCostSar: number | null;
  /** Convenience payload for the Socket.io broadcast */
  broadcast: {
    event: "workshop:fuel_anomaly" | "fleet:fuel_logged";
    rooms: string[];
    payload: Record<string, unknown>;
  };
}

export interface BudgetLine {
  key: "LIGHT_FUEL" | "HEAVY_FUEL" | "TYRE" | "MAINTENANCE";
  labelEn: string;
  labelAr: string;
  budgetSar: number;
  actualSar: number;
  variancePct: number;
  utilisationPct: number;
  status: "UNDER_BUDGET" | "ON_TRACK" | "AT_RISK" | "OVER_BUDGET";
}

export interface MonthlyBudgetReport {
  periodStart: string;
  periodEnd: string;
  lines: BudgetLine[];
  totals: {
    budgetSar: number;
    actualSar: number;
    remainingSar: number;
    utilisationPct: number;
  };
  fuel: {
    totalLitres: number;
    totalDistanceKm: number;
    fleetAverageKmPerLitre: number | null;
    targetKmPerLitre: number;
    anomalyCount: number;
  };
  worstPerformers: {
    vehicleCode: string;
    plateNumber: string;
    vehicleType: string;
    avgKmPerLitre: number | null;
    variancePct: number | null;
    anomalyCount: number;
    litresConsumed: number;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: string | null | undefined, f = 0) => (v == null ? f : parseFloat(v));

function budgetStatus(utilisationPct: number): BudgetLine["status"] {
  if (utilisationPct > 100) return "OVER_BUDGET";
  if (utilisationPct >= 90) return "AT_RISK";
  if (utilisationPct >= 60) return "ON_TRACK";
  return "UNDER_BUDGET";
}

async function loadConfig() {
  const rows = await db
    .select()
    .from(plantConfig)
    .where(eq(plantConfig.isActive, true))
    .limit(1);
  return {
    podEffTargetKmPerLitre: rows[0] ? num(rows[0].podEffTargetKmPerLitre, 2.6) : 2.6,
    fuelToleranceP: rows[0] ? num(rows[0].fuelToleranceP, 15) : 15,
    lightFuelBudgetSar: rows[0]?.lightFuelBudgetSar ?? 0,
    heavyFuelBudgetSar: rows[0]?.heavyFuelBudgetSar ?? 0,
    tyreBudgetSar: rows[0]?.tyreBudgetSar ?? 0,
    maintenanceBudgetSar: rows[0]?.maintenanceBudgetSar ?? 0,
  };
}

// ─── 1. DISTANCE FROM GPS TIMELINE ────────────────────────────────────────────

/**
 * Reconstructs the driven distance by summing haversine segments across the
 * recorded GPS polyline. Noise and teleport jumps are filtered out.
 *
 * Falls back to the odometer delta when GPS coverage is insufficient
 * (< 3 usable samples), and cross-checks both when available.
 */
export async function resolveDistanceTravelled(params: {
  vehicleId: string;
  tripId?: string;
  currentOdometreKm: number;
  previousOdometreKm: number | null;
  since: Date;
}): Promise<DistanceResolution> {
  const conditions = [
    eq(driverLocations.vehicleId, params.vehicleId),
    gte(driverLocations.capturedAt, params.since),
  ];
  if (params.tripId) {
    conditions.push(eq(driverLocations.tripId, params.tripId));
  }

  const points = await db
    .select({
      latitude: driverLocations.latitude,
      longitude: driverLocations.longitude,
      capturedAt: driverLocations.capturedAt,
    })
    .from(driverLocations)
    .where(and(...conditions))
    .orderBy(driverLocations.capturedAt);

  let gpsMetres = 0;
  let usableSegments = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segment = haversineDistance(
      parseFloat(prev.latitude),
      parseFloat(prev.longitude),
      parseFloat(curr.latitude),
      parseFloat(curr.longitude)
    );
    // Filter GPS jitter and impossible teleports
    if (segment >= MIN_GPS_SEGMENT_METRES && segment <= MAX_GPS_SEGMENT_METRES) {
      gpsMetres += segment;
      usableSegments += 1;
    }
  }

  const gpsDistanceKm = usableSegments >= 2 ? r3(gpsMetres / 1000) : null;

  const odometerDistanceKm =
    params.previousOdometreKm != null
      ? r3(Math.max(0, params.currentOdometreKm - params.previousOdometreKm))
      : null;

  // Decide the authoritative distance
  let distanceKm: number;
  let source: DistanceResolution["source"];
  let discrepancyPct: number | null = null;

  if (gpsDistanceKm != null && odometerDistanceKm != null && odometerDistanceKm > 0) {
    discrepancyPct = r2(
      (Math.abs(gpsDistanceKm - odometerDistanceKm) / odometerDistanceKm) * 100
    );
    // Trust the odometer as the legal record, but keep GPS for cross-checking
    distanceKm = odometerDistanceKm;
    source = "HYBRID";
  } else if (gpsDistanceKm != null) {
    distanceKm = gpsDistanceKm;
    source = "GPS_TIMELINE";
  } else {
    distanceKm = odometerDistanceKm ?? 0;
    source = "ODOMETER";
  }

  return {
    distanceKm,
    source,
    gpsDistanceKm,
    odometerDistanceKm,
    gpsSampleCount: points.length,
    discrepancyPct,
  };
}

// ─── 2. POST-TRIP FUEL WEBHOOK ────────────────────────────────────────────────

/**
 * Post-trip webhook handler. Records a refuelling event, computes real-world
 * efficiency from the GPS timeline, and raises FUEL_ANOMALY when the truck
 * falls outside the configured tolerance window.
 */
export async function processPostTripRefuel(
  params: PostTripFuelParams
): Promise<PostTripFuelResult> {
  if (params.litresAdded <= 0) {
    throw new Error("Litres added must be greater than zero");
  }

  const config = await loadConfig();

  // ── Vehicle ───────────────────────────────────────────────────────────────
  const vehicleRows = await db
    .select({
      id: fleetVehicles.id,
      tenantId: fleetVehicles.tenantId,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      targetFuelLPer100Km: fleetVehicles.targetFuelLPer100Km,
      odometreKm: fleetVehicles.odometreKm,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, params.vehicleId))
    .limit(1);

  if (vehicleRows.length === 0) throw new Error("Vehicle not found");
  const vehicle = vehicleRows[0];

  // ── Previous fuel log (defines the measurement window) ────────────────────
  const lastLog = await db
    .select({
      odometreKm: fuelLogs.odometreKm,
      loggedAt: fuelLogs.loggedAt,
      isAnomaly: fuelLogs.isAnomaly,
    })
    .from(fuelLogs)
    .where(eq(fuelLogs.vehicleId, params.vehicleId))
    .orderBy(desc(fuelLogs.loggedAt))
    .limit(1);

  const previousOdometreKm = lastLog.length > 0 ? num(lastLog[0].odometreKm) : null;
  const since =
    lastLog.length > 0
      ? lastLog[0].loggedAt
      : new Date(Date.now() - 7 * 24 * 3600_000); // default 7-day lookback

  // ── Distance from the GPS timeline ────────────────────────────────────────
  const distance = await resolveDistanceTravelled({
    vehicleId: params.vehicleId,
    tripId: params.tripId,
    currentOdometreKm: params.odometreKm,
    previousOdometreKm,
    since,
  });

  // ── Efficiency ────────────────────────────────────────────────────────────
  const litresConsumed = params.litresAdded;
  const actualKmPerLitre =
    distance.distanceKm > 0 ? r3(distance.distanceKm / litresConsumed) : null;

  // Per-vehicle target overrides the global target when configured
  const vehicleTargetKmPerL = vehicle.targetFuelLPer100Km
    ? r3(100 / num(vehicle.targetFuelLPer100Km))
    : null;
  const targetKmPerLitre = vehicleTargetKmPerL ?? config.podEffTargetKmPerLitre;

  const variancePct =
    actualKmPerLitre != null && targetKmPerLitre > 0
      ? r2(((actualKmPerLitre - targetKmPerLitre) / targetKmPerLitre) * 100)
      : null;

  const toleranceP = config.fuelToleranceP;
  const withinTolerance =
    variancePct == null ? true : Math.abs(variancePct) <= toleranceP;

  // ── Anomaly heuristics ────────────────────────────────────────────────────
  const findings: AnomalyFinding[] = [];

  if (variancePct != null && variancePct < -toleranceP) {
    findings.push({
      code: "OVER_CONSUMPTION",
      severity: variancePct < -toleranceP * 2 ? "CRITICAL" : "HIGH",
      message: `Efficiency ${actualKmPerLitre} km/L is ${Math.abs(variancePct)}% below the ${targetKmPerLitre} km/L target (tolerance ±${toleranceP}%). Possible mechanical fault or fuel theft.`,
    });
  }

  if (variancePct != null && variancePct > toleranceP * 2) {
    findings.push({
      code: "UNDER_CONSUMPTION",
      severity: "MEDIUM",
      message: `Efficiency ${actualKmPerLitre} km/L is implausibly ${variancePct}% above target — verify the odometer reading and dispensed volume.`,
    });
  }

  if (params.litresAdded > MAX_TANK_CAPACITY_LITRES) {
    findings.push({
      code: "TANK_OVERFILL",
      severity: "CRITICAL",
      message: `Dispensed ${params.litresAdded} L exceeds the maximum plausible tank capacity of ${MAX_TANK_CAPACITY_LITRES} L. Suspected siphoning into a secondary container.`,
    });
  }

  if (distance.distanceKm <= 0.5 && params.litresAdded > 20) {
    findings.push({
      code: "PHANTOM_REFUEL",
      severity: "CRITICAL",
      message: `${params.litresAdded} L dispensed while the vehicle travelled only ${distance.distanceKm} km since the last fill. Phantom refuel suspected.`,
    });
  }

  if (distance.discrepancyPct != null && distance.discrepancyPct > 35) {
    findings.push({
      code: "GPS_ODOMETER_MISMATCH",
      severity: "HIGH",
      message: `GPS polyline (${distance.gpsDistanceKm} km) disagrees with the odometer delta (${distance.odometerDistanceKm} km) by ${distance.discrepancyPct}%. Odometer tampering or GPS outage.`,
    });
  }

  // Repeat offender detection
  if (findings.length > 0) {
    const recent = await db
      .select({ isAnomaly: fuelLogs.isAnomaly })
      .from(fuelLogs)
      .where(eq(fuelLogs.vehicleId, params.vehicleId))
      .orderBy(desc(fuelLogs.loggedAt))
      .limit(REPEAT_OFFENDER_THRESHOLD - 1);

    if (
      recent.length === REPEAT_OFFENDER_THRESHOLD - 1 &&
      recent.every((r) => r.isAnomaly)
    ) {
      findings.push({
        code: "REPEAT_OFFENDER",
        severity: "CRITICAL",
        message: `This is the ${REPEAT_OFFENDER_THRESHOLD}rd consecutive anomalous fill for ${vehicle.vehicleCode}. Escalate to the workshop for a full diagnostic and audit the driver's fuel card.`,
      });
    }
  }

  const isAnomaly = findings.length > 0;

  // ── Persist ───────────────────────────────────────────────────────────────
  const totalFuelCostSar = params.costPerLitreSarCents
    ? Math.round(params.litresAdded * params.costPerLitreSarCents)
    : null;

  // Store efficiency in the schema's L/100km convention as well
  const actualLPer100Km =
    distance.distanceKm > 0 ? r2((litresConsumed / distance.distanceKm) * 100) : null;
  const targetLPer100Km = targetKmPerLitre > 0 ? r2(100 / targetKmPerLitre) : null;

  const [log] = await db
    .insert(fuelLogs)
    .values({
      vehicleId: params.vehicleId,
      tenantId: vehicle.tenantId,
      logType: "REFUEL",
      loggedAt: new Date(),
      litresAdded: params.litresAdded.toFixed(2),
      odometreKm: params.odometreKm.toFixed(1),
      previousOdometreKm: previousOdometreKm?.toFixed(1),
      distanceTravelledKm: distance.distanceKm.toFixed(1),
      actualLPer100Km: actualLPer100Km?.toFixed(2),
      targetLPer100Km: targetLPer100Km?.toFixed(2),
      efficiencyVariance:
        actualLPer100Km != null && targetLPer100Km != null
          ? (actualLPer100Km - targetLPer100Km).toFixed(2)
          : undefined,
      costPerLitreSarCents: params.costPerLitreSarCents,
      totalFuelCostSar: totalFuelCostSar ?? undefined,
      fuelStationName: params.fuelStationName,
      receiptNumber: params.receiptNumber,
      loggedById: params.loggedById,
      isAnomaly,
      anomalyNotes: isAnomaly
        ? findings.map((f) => `[${f.code}] ${f.message}`).join(" | ")
        : undefined,
    })
    .returning();

  // Keep the fleet odometer in sync
  await db
    .update(fleetVehicles)
    .set({ odometreKm: params.odometreKm.toFixed(1), updatedAt: new Date() })
    .where(eq(fleetVehicles.id, params.vehicleId));

  if (isAnomaly) {
    await db.insert(auditLogs).values({
      userId: params.loggedById,
      tenantId: vehicle.tenantId,
      action: "FUEL_ANOMALY_DETECTED",
      entityType: "fuel_logs",
      entityId: log.id,
      newState: {
        vehicleCode: vehicle.vehicleCode,
        actualKmPerLitre,
        targetKmPerLitre,
        variancePct,
        distanceSource: distance.source,
        findings,
      },
      socketEvent: "workshop:fuel_anomaly",
    });
  }

  return {
    logId: log.id,
    vehicleCode: vehicle.vehicleCode,
    plateNumber: vehicle.plateNumber,
    distance,
    litresConsumed,
    actualKmPerLitre,
    targetKmPerLitre,
    variancePct,
    toleranceP,
    withinTolerance,
    isAnomaly,
    findings,
    totalFuelCostSar,
    broadcast: {
      event: isAnomaly ? "workshop:fuel_anomaly" : "fleet:fuel_logged",
      rooms: isAnomaly
        ? ["workshop", "admin-live-map", "dispatch"]
        : ["workshop", "fleet"],
      payload: {
        logId: log.id,
        vehicleId: params.vehicleId,
        vehicleCode: vehicle.vehicleCode,
        actualKmPerLitre,
        targetKmPerLitre,
        variancePct,
        isAnomaly,
        findings: findings.map((f) => ({ code: f.code, severity: f.severity })),
        timestamp: new Date().toISOString(),
      },
    },
  };
}

// ─── 3. MONTHLY BUDGET AGGREGATION ────────────────────────────────────────────

/**
 * Aggregates fuel and maintenance spend for a calendar month and maps it
 * against the configured global budgets.
 *
 * @param year   Four-digit year (defaults to current)
 * @param month  1–12 (defaults to current)
 */
export async function buildMonthlyBudgetReport(
  year?: number,
  month?: number
): Promise<MonthlyBudgetReport> {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;

  const periodStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0));

  const config = await loadConfig();

  // ── Fuel spend split by vehicle class ─────────────────────────────────────
  const fuelRows = await db
    .select({
      vehicleType: fleetVehicles.vehicleType,
      costSar: sql<number>`COALESCE(SUM(${fuelLogs.totalFuelCostSar}), 0)::int`,
      litres: sql<string>`COALESCE(SUM(CAST(${fuelLogs.litresAdded} AS DECIMAL)), 0)::text`,
      distanceKm: sql<string>`COALESCE(SUM(CAST(${fuelLogs.distanceTravelledKm} AS DECIMAL)), 0)::text`,
      anomalies: sql<number>`SUM(CASE WHEN ${fuelLogs.isAnomaly} THEN 1 ELSE 0 END)::int`,
    })
    .from(fuelLogs)
    .innerJoin(fleetVehicles, eq(fuelLogs.vehicleId, fleetVehicles.id))
    .where(
      and(gte(fuelLogs.loggedAt, periodStart), lte(fuelLogs.loggedAt, periodEnd))
    )
    .groupBy(fleetVehicles.vehicleType);

  let heavyFuelActual = 0;
  let lightFuelActual = 0;
  let totalLitres = 0;
  let totalDistanceKm = 0;
  let anomalyCount = 0;

  for (const row of fuelRows) {
    const isHeavy = (HEAVY_VEHICLE_TYPES as readonly string[]).includes(
      row.vehicleType
    );
    if (isHeavy) heavyFuelActual += row.costSar;
    else lightFuelActual += row.costSar;

    totalLitres += parseFloat(row.litres ?? "0");
    totalDistanceKm += parseFloat(row.distanceKm ?? "0");
    anomalyCount += row.anomalies;
  }

  // ── Maintenance spend split: tyres vs everything else ─────────────────────
  const maintRows = await db
    .select({
      maintenanceType: maintenanceOrders.maintenanceType,
      costSar: sql<number>`COALESCE(SUM(${maintenanceOrders.totalCostSar}), 0)::int`,
    })
    .from(maintenanceOrders)
    .where(
      and(
        eq(maintenanceOrders.status, "COMPLETED"),
        gte(maintenanceOrders.completedAt, periodStart),
        lte(maintenanceOrders.completedAt, periodEnd)
      )
    )
    .groupBy(maintenanceOrders.maintenanceType);

  let tyreActual = 0;
  let maintenanceActual = 0;
  for (const row of maintRows) {
    if (row.maintenanceType === "TIRE_SERVICE") tyreActual += row.costSar;
    else maintenanceActual += row.costSar;
  }

  // ── Compose budget lines ──────────────────────────────────────────────────
  const mk = (
    key: BudgetLine["key"],
    labelEn: string,
    labelAr: string,
    budgetSar: number,
    actualSar: number
  ): BudgetLine => {
    const utilisationPct = budgetSar > 0 ? r2((actualSar / budgetSar) * 100) : 0;
    const variancePct =
      budgetSar > 0 ? r2(((actualSar - budgetSar) / budgetSar) * 100) : 0;
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
    mk(
      "HEAVY_FUEL",
      "Heavy fleet fuel",
      "وقود الأسطول الثقيل",
      config.heavyFuelBudgetSar,
      heavyFuelActual
    ),
    mk(
      "LIGHT_FUEL",
      "Light fleet fuel",
      "وقود المركبات الخفيفة",
      config.lightFuelBudgetSar,
      lightFuelActual
    ),
    mk("TYRE", "Tyres", "الإطارات", config.tyreBudgetSar, tyreActual),
    mk(
      "MAINTENANCE",
      "Maintenance",
      "الصيانة",
      config.maintenanceBudgetSar,
      maintenanceActual
    ),
  ];

  const budgetSar = lines.reduce((s, l) => s + l.budgetSar, 0);
  const actualSar = lines.reduce((s, l) => s + l.actualSar, 0);

  // ── Worst performing vehicles ─────────────────────────────────────────────
  const perVehicle = await db
    .select({
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      litres: sql<string>`COALESCE(SUM(CAST(${fuelLogs.litresAdded} AS DECIMAL)), 0)::text`,
      distanceKm: sql<string>`COALESCE(SUM(CAST(${fuelLogs.distanceTravelledKm} AS DECIMAL)), 0)::text`,
      anomalies: sql<number>`SUM(CASE WHEN ${fuelLogs.isAnomaly} THEN 1 ELSE 0 END)::int`,
    })
    .from(fuelLogs)
    .innerJoin(fleetVehicles, eq(fuelLogs.vehicleId, fleetVehicles.id))
    .where(
      and(gte(fuelLogs.loggedAt, periodStart), lte(fuelLogs.loggedAt, periodEnd))
    )
    .groupBy(
      fleetVehicles.vehicleCode,
      fleetVehicles.plateNumber,
      fleetVehicles.vehicleType
    );

  const worstPerformers = perVehicle
    .map((v) => {
      const litres = parseFloat(v.litres ?? "0");
      const km = parseFloat(v.distanceKm ?? "0");
      const avg = litres > 0 && km > 0 ? r3(km / litres) : null;
      const variance =
        avg != null
          ? r2(
              ((avg - config.podEffTargetKmPerLitre) /
                config.podEffTargetKmPerLitre) *
                100
            )
          : null;
      return {
        vehicleCode: v.vehicleCode,
        plateNumber: v.plateNumber,
        vehicleType: v.vehicleType,
        avgKmPerLitre: avg,
        variancePct: variance,
        anomalyCount: v.anomalies,
        litresConsumed: r2(litres),
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
      utilisationPct: budgetSar > 0 ? r2((actualSar / budgetSar) * 100) : 0,
    },
    fuel: {
      totalLitres: r2(totalLitres),
      totalDistanceKm: r2(totalDistanceKm),
      fleetAverageKmPerLitre:
        totalLitres > 0 && totalDistanceKm > 0
          ? r3(totalDistanceKm / totalLitres)
          : null,
      targetKmPerLitre: config.podEffTargetKmPerLitre,
      anomalyCount,
    },
    worstPerformers,
  };
}
