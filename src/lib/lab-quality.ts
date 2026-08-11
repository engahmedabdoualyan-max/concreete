/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Batching Panel, Lab Calibration & Climate Compensation
 *  src/lib/lab-quality.ts
 * ============================================================
 *
 *  THREE COOPERATING SUBSYSTEMS
 *  ─────────────────────────────────────────────────────────
 *  A. calculateAdjustedRecipe()  — Al-Sharqia climate compensation
 *  B. assertScaleCalibration()   — ±1 % scale deviation guard
 *  C. startBatching()            — atomic silo deduction + purchase guard
 *
 *  ── A. CLIMATE COMPENSATION (Al-Sharqia summer) ─────────────
 *  Eastern Province routinely exceeds 45 °C with single-digit
 *  humidity. Hot, dry air accelerates cement hydration causing
 *  slump loss in transit and cold-joint risk at the pour.
 *
 *  Engineering rules applied to the 1 m³ recipe matrix:
 *    • Temperature: for each °C above the 35 °C baseline
 *        water   += 1.5 L        (configurable: waterPerDegCLitres)
 *        retarder+= 0.030 kg     (hydration delay)
 *    • Humidity: for each % below the 40 % baseline
 *        retarder+= 0.008 kg     (compensates evaporation)
 *        water   += 0.25 L       (surface-loss make-up)
 *    • Plasticiser is raised whenever water must be capped so the
 *      target slump is preserved WITHOUT raising the w/c ratio.
 *    • HARD CONSTRAINT: the water/cement ratio may never exceed
 *      mixDesign.maxWcRatio — 28-day compressive strength is
 *      protected at all costs. Excess demand is converted into
 *      plasticiser dosage instead of water.
 *
 *  ── B. SCALE CALIBRATION MIDDLEWARE ─────────────────────────
 *  Before any batch fires, the most recent calibration_control
 *  record for each scale on the station is inspected. If ANY
 *  scale deviates by more than ±1 % the plant is flagged
 *  OUT_OF_SERVICE and batching is blocked.
 *
 *  ── C. ATOMIC SILO DEDUCTION + PURCHASE GUARD ───────────────
 *  StartBatching runs as ONE transaction:
 *    1. calibration gate
 *    2. compute adjusted recipe × requested_m3
 *    3. SELECT … FOR UPDATE every silo (deadlock-safe order)
 *    4. verify sufficiency — insufficient ⇒ full ROLLBACK
 *    5. decrement stock + write inventory_transactions
 *    6. any silo ≤ reorder_level ⇒ append URGENT purchase_requests
 * ============================================================
 */

import { db } from "@/db";
import {
  mixDesigns,
  inventorySilos,
  inventoryTransactions,
  purchaseRequests,
  calibrationControl,
  batchPlants,
  plantConfig,
  auditLogs,
  trips,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { MaterialCategory } from "@/db/schema";

type MixDesignRow = InferSelectModel<typeof mixDesigns>;

// ─── Engineering Constants ────────────────────────────────────────────────────

/** Al-Sharqia design baselines */
export const CLIMATE_BASELINE = {
  temperatureC: 35,
  humidityPct: 40,
} as const;

/** Water added per °C above the 35 °C baseline (litres / m³) */
export const WATER_PER_DEG_C_LITRES = 1.5;

/** Retarder added per °C above baseline (kg / m³) */
export const RETARDER_PER_DEG_C_KG = 0.03;

/** Retarder added per % of humidity BELOW the 40 % baseline (kg / m³) */
export const RETARDER_PER_DRY_PCT_KG = 0.008;

/** Water added per % of humidity BELOW baseline (litres / m³) */
export const WATER_PER_DRY_PCT_LITRES = 0.25;

/** Plasticiser required to replace 1 L of capped water (litres / m³) */
export const PLASTICISER_PER_CAPPED_LITRE = 0.15;

/** Slump loss during transit (cm per 10 minutes) */
export const SLUMP_LOSS_PER_10MIN_CM = 0.8;

/** ACI 304R maximum recommended transit time (minutes) */
export const MAX_TRANSIT_MINUTES = 90;

/** Scale calibration tolerance (± percent) */
export const CALIBRATION_TOLERANCE_PCT = 1.0;

/** A calibration older than this many hours is considered expired */
export const CALIBRATION_VALIDITY_HOURS = 24;

/** Purchase request target = reorder level × this factor */
export const REORDER_BUFFER_FACTOR = 1.5;

/** Specific gravity of liquid admixtures (kg per litre) */
export const ADMIXTURE_DENSITY = {
  plasticiser: 1.05,
  retarder: 1.08,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdjustedRecipe {
  mixDesignId: string;
  mixDesignCode: string;
  gradeDescription: string;
  requestedM3: number;

  climate: {
    ambientTempC: number;
    humidityPct: number;
    baselineTempC: number;
    baselineHumidityPct: number;
    tempDeltaC: number;
    humidityDeficitPct: number;
    compensationTriggered: boolean;
  };

  /** Per 1 m³ — the base design as authored by the lab */
  basePerM3: {
    cementKg: number;
    sandKg: number;
    gravel10mmKg: number;
    gravel20mmKg: number;
    gravel40mmKg: number;
    waterLitres: number;
    plasticiserLitres: number;
    retarderLitres: number;
    flyAshKg: number;
    silicaFumeKg: number;
  };

  /** Per 1 m³ — after climate compensation */
  adjustedPerM3: {
    cementKg: number;
    sandKg: number;
    gravel10mmKg: number;
    gravel20mmKg: number;
    gravel40mmKg: number;
    waterLitres: number;
    plasticiserLitres: number;
    retarderKg: number;
    retarderLitres: number;
    flyAshKg: number;
    silicaFumeKg: number;
  };

  /** Total batch quantities = adjustedPerM3 × requestedM3 */
  batchTotals: {
    cementKg: number;
    sandKg: number;
    gravel10mmKg: number;
    gravel20mmKg: number;
    gravel40mmKg: number;
    waterLitres: number;
    plasticiserLitres: number;
    retarderLitres: number;
    flyAshKg: number;
    silicaFumeKg: number;
  };

  quality: {
    targetSlumpCm: number;
    targetStrengthMpa: number;
    maxWcRatio: number;
    resultingWcRatio: number;
    wcRatioCapped: boolean;
    estimatedSiteSlumpCm: number;
    strengthProtected: boolean;
  };

  batchNotes: string[];
  warnings: string[];
}

export interface CalibrationStatus {
  passed: boolean;
  batchPlantId: string | null;
  plantCode: string | null;
  plantStatus: string | null;
  checkedScales: {
    scaleIdentifier: string;
    deviationPct: number;
    tolerancePct: number;
    result: string;
    verifiedAt: string;
    expired: boolean;
  }[];
  failingScales: string[];
  expiredScales: string[];
  message: string;
}

export interface MaterialLine {
  category: MaterialCategory;
  requiredKg: number;
}

export interface StartBatchingParams {
  tripId: string;
  tenantId: string;
  mixDesignId: string;
  requestedM3: number;
  ambientTempC: number;
  humidityPct: number;
  operatorId: string;
  /** Station whose scales must be calibrated. Omit to skip station binding. */
  batchPlantId?: string;
  estimatedTransitMinutes?: number;
  /** Emergency bypass — requires SUPER_ADMIN at the route layer */
  overrideCalibration?: boolean;
}

export interface StartBatchingResult {
  success: boolean;
  tripId: string;
  recipe: AdjustedRecipe;
  calibration: CalibrationStatus;
  deductions: {
    siloId: string;
    siloCode: string;
    materialCategory: string;
    deductedKg: number;
    previousStockKg: number;
    newStockKg: number;
    belowReorder: boolean;
  }[];
  purchaseRequests: {
    prNumber: string;
    siloCode: string;
    materialCategory: string;
    requestedQuantityKg: number;
    priority: string;
  }[];
  warnings: string[];
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | null | undefined, fallback = 0) =>
  v == null ? fallback : parseFloat(v);

// ══════════════════════════════════════════════════════════════════════════════
//  A.  CLIMATE COMPENSATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Computes the climate-adjusted mix recipe for Al-Sharqia conditions.
 *
 * @param baseMixId    UUID of the approved lab mix design
 * @param ambientTemp  Current ambient temperature (°C)
 * @param humidity     Current relative humidity (%)
 * @param requestedM3  Volume to batch (m³)
 */
export async function calculateAdjustedRecipe(
  baseMixId: string,
  ambientTemp: number,
  humidity: number,
  requestedM3: number,
  estimatedTransitMinutes = 30
): Promise<AdjustedRecipe> {
  if (requestedM3 <= 0) {
    throw new Error("Requested volume must be greater than zero m³");
  }

  const rows = await db
    .select()
    .from(mixDesigns)
    .where(eq(mixDesigns.id, baseMixId))
    .limit(1);

  if (rows.length === 0) throw new Error(`Mix design not found: ${baseMixId}`);
  const mix: MixDesignRow = rows[0];
  if (!mix.isActive) {
    throw new Error(
      `Mix design ${mix.designCode} is inactive and cannot be batched.`
    );
  }

  const config = await db
    .select()
    .from(plantConfig)
    .where(eq(plantConfig.isActive, true))
    .limit(1);

  const baselineTempC = config[0]
    ? num(config[0].baselineTempC, CLIMATE_BASELINE.temperatureC)
    : CLIMATE_BASELINE.temperatureC;
  const baselineHumidityPct = config[0]
    ? num(config[0].baselineHumidityPct, CLIMATE_BASELINE.humidityPct)
    : CLIMATE_BASELINE.humidityPct;
  const waterPerDegC = config[0]
    ? num(config[0].waterPerDegCLitres, WATER_PER_DEG_C_LITRES)
    : WATER_PER_DEG_C_LITRES;

  // ── Base recipe (per 1 m³) ────────────────────────────────────────────────
  const basePerM3 = {
    cementKg: num(mix.cementKgPerM3),
    sandKg: num(mix.sandKgPerM3),
    gravel10mmKg: num(mix.gravel10mmKgPerM3),
    gravel20mmKg: num(mix.gravel20mmKgPerM3),
    gravel40mmKg: num(mix.gravel40mmKgPerM3),
    waterLitres: num(mix.waterLitresPerM3),
    plasticiserLitres: num(mix.admixturePlasiticzerLPerM3),
    retarderLitres: num(mix.admixtureRetarderLPerM3),
    flyAshKg: num(mix.flyAshKgPerM3),
    silicaFumeKg: num(mix.silicaFumeKgPerM3),
  };

  const targetSlumpCm = num(mix.targetSlumpCm, 12);
  const targetStrengthMpa = num(mix.targetStrengthMpa, 25);
  const maxWcRatio = num(mix.maxWcRatio, 0.5);

  const batchNotes: string[] = [];
  const warnings: string[] = [];

  // ── Deltas ────────────────────────────────────────────────────────────────
  const tempDeltaC = Math.max(0, ambientTemp - baselineTempC);
  const humidityDeficitPct = Math.max(0, baselineHumidityPct - humidity);
  const compensationTriggered = tempDeltaC > 0 || humidityDeficitPct > 0;

  // ── Water & retarder demand ───────────────────────────────────────────────
  let waterDemand = basePerM3.waterLitres;
  let retarderKg =
    basePerM3.retarderLitres * ADMIXTURE_DENSITY.retarder; // convert to kg

  if (tempDeltaC > 0) {
    const addWater = tempDeltaC * waterPerDegC;
    const addRetarder = tempDeltaC * RETARDER_PER_DEG_C_KG;
    waterDemand += addWater;
    retarderKg += addRetarder;
    batchNotes.push(
      `Heat compensation: ambient ${ambientTemp} °C is ${tempDeltaC.toFixed(1)} °C above the ${baselineTempC} °C baseline → water +${addWater.toFixed(2)} L/m³, retarder +${addRetarder.toFixed(3)} kg/m³.`
    );
  }

  if (humidityDeficitPct > 0) {
    const addWater = humidityDeficitPct * WATER_PER_DRY_PCT_LITRES;
    const addRetarder = humidityDeficitPct * RETARDER_PER_DRY_PCT_KG;
    waterDemand += addWater;
    retarderKg += addRetarder;
    batchNotes.push(
      `Dry-air compensation: humidity ${humidity}% is ${humidityDeficitPct.toFixed(1)}% below the ${baselineHumidityPct}% baseline → water +${addWater.toFixed(2)} L/m³, retarder +${addRetarder.toFixed(3)} kg/m³.`
    );
  }

  if (!compensationTriggered) {
    batchNotes.push(
      `Ambient conditions (${ambientTemp} °C / ${humidity}%) are within design baselines — no climate compensation applied.`
    );
  }

  // ── HARD CONSTRAINT: protect the 28-day strength via w/c ratio ────────────
  const maxAllowedWater = maxWcRatio * basePerM3.cementKg;
  let adjustedWater = waterDemand;
  let plasticiserLitres = basePerM3.plasticiserLitres;
  let wcRatioCapped = false;

  if (basePerM3.cementKg > 0 && waterDemand > maxAllowedWater) {
    wcRatioCapped = true;
    const cappedLitres = waterDemand - maxAllowedWater;
    adjustedWater = maxAllowedWater;
    const plasticiserBoost = cappedLitres * PLASTICISER_PER_CAPPED_LITRE;
    plasticiserLitres += plasticiserBoost;

    warnings.push(
      `W/C ceiling enforced: water demand of ${waterDemand.toFixed(2)} L/m³ exceeded the ${maxWcRatio} limit. Water capped at ${adjustedWater.toFixed(2)} L/m³ and plasticiser raised by ${plasticiserBoost.toFixed(3)} L/m³ so the ${targetStrengthMpa} MPa 28-day strength is not compromised.`
    );
  }

  const resultingWcRatio =
    basePerM3.cementKg > 0 ? adjustedWater / basePerM3.cementKg : 0;

  // ── Slump forecast at the pour point ──────────────────────────────────────
  const slumpLoss = (estimatedTransitMinutes / 10) * SLUMP_LOSS_PER_10MIN_CM;
  const estimatedSiteSlumpCm = Math.max(0, targetSlumpCm - slumpLoss);

  if (estimatedTransitMinutes > MAX_TRANSIT_MINUTES) {
    warnings.push(
      `Transit estimate of ${estimatedTransitMinutes} min exceeds the ACI 304R ceiling of ${MAX_TRANSIT_MINUTES} min. The load may be rejected at site.`
    );
  }
  if (estimatedSiteSlumpCm < 8) {
    warnings.push(
      `Forecast site slump is only ${estimatedSiteSlumpCm.toFixed(1)} cm (target ${targetSlumpCm} cm). Increase plasticiser or shorten the haul.`
    );
  }
  if (ambientTemp >= 45) {
    warnings.push(
      `Extreme heat (${ambientTemp} °C): substitute part of the mix water with flake ice and shade the aggregate stockpiles.`
    );
  }

  const retarderLitres = retarderKg / ADMIXTURE_DENSITY.retarder;

  const adjustedPerM3 = {
    cementKg: r3(basePerM3.cementKg),
    sandKg: r3(basePerM3.sandKg),
    gravel10mmKg: r3(basePerM3.gravel10mmKg),
    gravel20mmKg: r3(basePerM3.gravel20mmKg),
    gravel40mmKg: r3(basePerM3.gravel40mmKg),
    waterLitres: r3(adjustedWater),
    plasticiserLitres: r3(plasticiserLitres),
    retarderKg: r3(retarderKg),
    retarderLitres: r3(retarderLitres),
    flyAshKg: r3(basePerM3.flyAshKg),
    silicaFumeKg: r3(basePerM3.silicaFumeKg),
  };

  const batchTotals = {
    cementKg: r3(adjustedPerM3.cementKg * requestedM3),
    sandKg: r3(adjustedPerM3.sandKg * requestedM3),
    gravel10mmKg: r3(adjustedPerM3.gravel10mmKg * requestedM3),
    gravel20mmKg: r3(adjustedPerM3.gravel20mmKg * requestedM3),
    gravel40mmKg: r3(adjustedPerM3.gravel40mmKg * requestedM3),
    waterLitres: r3(adjustedPerM3.waterLitres * requestedM3),
    plasticiserLitres: r3(adjustedPerM3.plasticiserLitres * requestedM3),
    retarderLitres: r3(adjustedPerM3.retarderLitres * requestedM3),
    flyAshKg: r3(adjustedPerM3.flyAshKg * requestedM3),
    silicaFumeKg: r3(adjustedPerM3.silicaFumeKg * requestedM3),
  };

  batchNotes.push(
    `Batch total for ${requestedM3} m³: cement ${batchTotals.cementKg} kg, water ${batchTotals.waterLitres} L, plasticiser ${batchTotals.plasticiserLitres} L, retarder ${batchTotals.retarderLitres} L.`
  );
  batchNotes.push(
    `Resulting w/c ratio ${resultingWcRatio.toFixed(3)} (limit ${maxWcRatio}) — 28-day target ${targetStrengthMpa} MPa protected.`
  );

  return {
    mixDesignId: mix.id,
    mixDesignCode: mix.designCode,
    gradeDescription: mix.gradeDescription,
    requestedM3,
    climate: {
      ambientTempC: ambientTemp,
      humidityPct: humidity,
      baselineTempC,
      baselineHumidityPct,
      tempDeltaC: r2(tempDeltaC),
      humidityDeficitPct: r2(humidityDeficitPct),
      compensationTriggered,
    },
    basePerM3,
    adjustedPerM3,
    batchTotals,
    quality: {
      targetSlumpCm,
      targetStrengthMpa,
      maxWcRatio,
      resultingWcRatio: r3(resultingWcRatio),
      wcRatioCapped,
      estimatedSiteSlumpCm: r2(estimatedSiteSlumpCm),
      strengthProtected: resultingWcRatio <= maxWcRatio + 1e-6,
    },
    batchNotes,
    warnings,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  B.  SCALE CALIBRATION MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Records a scale verification result and, on failure, immediately flags the
 * batch plant OUT_OF_SERVICE.
 *
 * deviationPct = ((observed − certified) / certified) × 100
 */
export async function recordCalibration(params: {
  batchPlantId: string;
  scaleIdentifier: string;
  certifiedTestWeightKg: number;
  observedReadingKg: number;
  verifiedById: string;
  tenantId: string;
  tolerancePct?: number;
  notes?: string;
}): Promise<{
  calibrationId: string;
  deviationPct: number;
  result: "PASS" | "WARNING" | "FAIL";
  plantTakenOutOfService: boolean;
}> {
  if (params.certifiedTestWeightKg <= 0) {
    throw new Error("Certified test weight must be greater than zero");
  }

  const tolerancePct = params.tolerancePct ?? CALIBRATION_TOLERANCE_PCT;
  const deviationPct =
    ((params.observedReadingKg - params.certifiedTestWeightKg) /
      params.certifiedTestWeightKg) *
    100;
  const absDeviation = Math.abs(deviationPct);

  // FAIL beyond tolerance; WARNING when within 20 % of the limit
  const result: "PASS" | "WARNING" | "FAIL" =
    absDeviation > tolerancePct
      ? "FAIL"
      : absDeviation > tolerancePct * 0.8
        ? "WARNING"
        : "PASS";

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(calibrationControl)
      .values({
        batchPlantId: params.batchPlantId,
        tenantId: params.tenantId,
        scaleIdentifier: params.scaleIdentifier,
        certifiedTestWeightKg: params.certifiedTestWeightKg.toFixed(3),
        observedReadingKg: params.observedReadingKg.toFixed(3),
        deviationPct: deviationPct.toFixed(3),
        tolerancePct: tolerancePct.toFixed(3),
        result,
        verifiedById: params.verifiedById,
        triggeredOutOfService: result === "FAIL",
        notes: params.notes,
      })
      .returning();

    let plantTakenOutOfService = false;

    if (result === "FAIL") {
      await tx
        .update(batchPlants)
        .set({
          status: "OUT_OF_SERVICE",
          outOfServiceReason: `Scale "${params.scaleIdentifier}" deviated ${deviationPct.toFixed(3)}% (tolerance ±${tolerancePct}%).`,
          outOfServiceAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(batchPlants.id, params.batchPlantId));
      plantTakenOutOfService = true;
    } else {
      await tx
        .update(batchPlants)
        .set({ lastCalibrationAt: new Date(), updatedAt: new Date() })
        .where(eq(batchPlants.id, params.batchPlantId));
    }

    await tx.insert(auditLogs).values({
      userId: params.verifiedById,
      tenantId: params.tenantId,
      action: result === "FAIL" ? "CALIBRATION_FAILED" : "CALIBRATION_RECORDED",
      entityType: "calibration_control",
      entityId: row.id,
      newState: {
        scaleIdentifier: params.scaleIdentifier,
        deviationPct: r3(deviationPct),
        tolerancePct,
        result,
        plantTakenOutOfService,
      },
      socketEvent: result === "FAIL" ? "plant:out_of_service" : undefined,
    });

    return {
      calibrationId: row.id,
      deviationPct: r3(deviationPct),
      result,
      plantTakenOutOfService,
    };
  });
}

/**
 * CALIBRATION GATE — inspects the latest verification for every scale on the
 * station. Throws when batching must be blocked.
 *
 * Blocking conditions:
 *   • The batch plant row is not OPERATIONAL
 *   • Any scale's latest check has result = FAIL
 *   • Any scale's latest check is older than CALIBRATION_VALIDITY_HOURS
 */
export async function assertScaleCalibration(
  batchPlantId: string | undefined,
  options: {
    /**
     * When true the plant's own OUT_OF_SERVICE flag is ignored and only the
     * physical scale readings are judged. Used by `restoreBatchPlant()` to
     * escape the chicken-and-egg deadlock where a station can never be
     * cleared because it is already flagged.
     */
    ignorePlantStatus?: boolean;
  } = {}
): Promise<CalibrationStatus> {
  if (!batchPlantId) {
    return {
      passed: true,
      batchPlantId: null,
      plantCode: null,
      plantStatus: null,
      checkedScales: [],
      failingScales: [],
      expiredScales: [],
      message: "No batching station bound to this request — calibration gate skipped.",
    };
  }

  const plantRows = await db
    .select()
    .from(batchPlants)
    .where(eq(batchPlants.id, batchPlantId))
    .limit(1);

  if (plantRows.length === 0) {
    throw new Error(`Batch plant not found: ${batchPlantId}`);
  }

  const plant = plantRows[0];

  // Latest calibration per scale (DISTINCT ON is a PostgreSQL idiom)
  const latest = await db.execute(sql`
    SELECT DISTINCT ON (scale_identifier)
      scale_identifier,
      deviation_pct,
      tolerance_pct,
      result,
      verified_at
    FROM calibration_control
    WHERE batch_plant_id = ${batchPlantId}
    ORDER BY scale_identifier, verified_at DESC
  `);

  const validityCutoff = Date.now() - CALIBRATION_VALIDITY_HOURS * 3600_000;

  const checkedScales = (latest.rows ?? []).map((raw) => {
    const row = raw as {
      scale_identifier: string;
      deviation_pct: string;
      tolerance_pct: string;
      result: string;
      verified_at: string | Date;
    };
    const verifiedAt = new Date(row.verified_at);
    return {
      scaleIdentifier: row.scale_identifier,
      deviationPct: parseFloat(row.deviation_pct),
      tolerancePct: parseFloat(row.tolerance_pct),
      result: row.result,
      verifiedAt: verifiedAt.toISOString(),
      expired: verifiedAt.getTime() < validityCutoff,
    };
  });

  const failingScales = checkedScales
    .filter(
      (s) => s.result === "FAIL" || Math.abs(s.deviationPct) > s.tolerancePct
    )
    .map((s) => s.scaleIdentifier);

  const expiredScales = checkedScales
    .filter((s) => s.expired)
    .map((s) => s.scaleIdentifier);

  const plantBlocked =
    !options.ignorePlantStatus && plant.status !== "OPERATIONAL";
  const passed =
    !plantBlocked && failingScales.length === 0 && expiredScales.length === 0;

  const parts: string[] = [];
  if (plantBlocked) {
    parts.push(
      `Station ${plant.plantCode} is ${plant.status}${plant.outOfServiceReason ? ` — ${plant.outOfServiceReason}` : ""}`
    );
  }
  if (failingScales.length > 0) {
    parts.push(
      `Scale deviation beyond ±${CALIBRATION_TOLERANCE_PCT}% on: ${failingScales.join(", ")}`
    );
  }
  if (expiredScales.length > 0) {
    parts.push(
      `Calibration expired (> ${CALIBRATION_VALIDITY_HOURS}h) on: ${expiredScales.join(", ")}`
    );
  }
  if (checkedScales.length === 0) {
    parts.push(
      `No calibration records exist for station ${plant.plantCode}. Perform certified weight verification before batching.`
    );
  }

  const status: CalibrationStatus = {
    passed: passed && checkedScales.length > 0,
    batchPlantId,
    plantCode: plant.plantCode,
    plantStatus: plant.status,
    checkedScales,
    failingScales,
    expiredScales,
    message:
      parts.length > 0
        ? parts.join(". ")
        : `All ${checkedScales.length} scale(s) on ${plant.plantCode} are within ±${CALIBRATION_TOLERANCE_PCT}%.`,
  };

  if (!status.passed) {
    // Make sure the plant is visibly flagged for the dashboard
    if (!options.ignorePlantStatus && plant.status === "OPERATIONAL") {
      await db
        .update(batchPlants)
        .set({
          status: "OUT_OF_SERVICE",
          outOfServiceReason: status.message,
          outOfServiceAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(batchPlants.id, batchPlantId));
    }

    const error = new Error(
      `BATCHING BLOCKED — calibration gate failed. ${status.message}`
    );
    (error as Error & { calibration?: CalibrationStatus }).calibration = status;
    throw error;
  }

  return status;
}

// ══════════════════════════════════════════════════════════════════════════════
//  C.  ATOMIC BATCHING + PURCHASE GUARD
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Maps an adjusted recipe into silo-level material demand in kilograms.
 * Liquids are converted to mass using their specific gravity.
 */
export function buildMaterialLines(recipe: AdjustedRecipe): MaterialLine[] {
  const t = recipe.batchTotals;
  return (
    [
      { category: "CEMENT" as MaterialCategory, requiredKg: t.cementKg },
      { category: "SAND" as MaterialCategory, requiredKg: t.sandKg },
      { category: "GRAVEL_10MM" as MaterialCategory, requiredKg: t.gravel10mmKg },
      { category: "GRAVEL_20MM" as MaterialCategory, requiredKg: t.gravel20mmKg },
      { category: "GRAVEL_40MM" as MaterialCategory, requiredKg: t.gravel40mmKg },
      { category: "WATER" as MaterialCategory, requiredKg: t.waterLitres }, // 1 L ≈ 1 kg
      {
        category: "ADMIXTURE_PLASTICIZER" as MaterialCategory,
        requiredKg: t.plasticiserLitres * ADMIXTURE_DENSITY.plasticiser,
      },
      {
        category: "ADMIXTURE_RETARDER" as MaterialCategory,
        requiredKg: t.retarderLitres * ADMIXTURE_DENSITY.retarder,
      },
      { category: "FLY_ASH" as MaterialCategory, requiredKg: t.flyAshKg },
      { category: "SILICA_FUME" as MaterialCategory, requiredKg: t.silicaFumeKg },
    ] as MaterialLine[]
  )
    .filter((l) => l.requiredKg > 0.001)
    .map((l) => ({ ...l, requiredKg: r3(l.requiredKg) }));
}

/**
 * StartBatching — the atomic production command.
 *
 * ORDER OF OPERATIONS (all-or-nothing):
 *   1. Calibration gate (throws before any mutation)
 *   2. Climate-adjusted recipe
 *   3. Lock silos in a deterministic order (prevents deadlocks)
 *   4. Sufficiency check — insufficient ⇒ throw ⇒ full ROLLBACK
 *   5. Decrement + inventory ledger rows
 *   6. URGENT purchase_requests for any silo at/below reorder level
 */
export async function startBatching(
  params: StartBatchingParams
): Promise<StartBatchingResult> {
  // ── 1. CALIBRATION GATE ───────────────────────────────────────────────────
  let calibration: CalibrationStatus;
  if (params.overrideCalibration) {
    calibration = {
      passed: true,
      batchPlantId: params.batchPlantId ?? null,
      plantCode: null,
      plantStatus: "OVERRIDDEN",
      checkedScales: [],
      failingScales: [],
      expiredScales: [],
      message:
        "Calibration gate bypassed by an authorised administrator. This action is audited.",
    };
  } else {
    calibration = await assertScaleCalibration(params.batchPlantId);
  }

  // ── 2. CLIMATE-ADJUSTED RECIPE ────────────────────────────────────────────
  const recipe = await calculateAdjustedRecipe(
    params.mixDesignId,
    params.ambientTempC,
    params.humidityPct,
    params.requestedM3,
    params.estimatedTransitMinutes
  );

  const lines = buildMaterialLines(recipe);
  if (lines.length === 0) {
    throw new Error("Recipe produced no material demand — check the mix design.");
  }

  const warnings = [...recipe.warnings];

  // ── 3–6. ATOMIC TRANSACTION ───────────────────────────────────────────────
  return await db.transaction(async (tx) => {
    const categories = lines.map((l) => l.category);

    // Deterministic lock order (alphabetical by silo code) avoids deadlocks
    const silos = await tx
      .select({
        id: inventorySilos.id,
        siloCode: inventorySilos.siloCode,
        materialCategory: inventorySilos.materialCategory,
        currentStockKg: inventorySilos.currentStockKg,
        reorderLevelKg: inventorySilos.reorderLevelKg,
        capacityKg: inventorySilos.capacityKg,
      })
      .from(inventorySilos)
      .where(
        and(
          inArray(inventorySilos.materialCategory, categories),
          eq(inventorySilos.tenantId, params.tenantId),
          eq(inventorySilos.isActive, true)
        )
      )
      .orderBy(inventorySilos.siloCode)
      .for("update");

    const siloByCategory = new Map(silos.map((s) => [s.materialCategory, s]));

    // ── 4. SUFFICIENCY CHECK (before any mutation) ──────────────────────────
    const shortages: string[] = [];
    for (const line of lines) {
      const silo = siloByCategory.get(line.category);
      if (!silo) {
        shortages.push(`${line.category}: no active silo configured`);
        continue;
      }
      const stock = num(silo.currentStockKg);
      if (stock < line.requiredKg) {
        shortages.push(
          `${silo.siloCode} (${line.category}): need ${line.requiredKg.toFixed(1)} kg, have ${stock.toFixed(1)} kg`
        );
      }
    }

    if (shortages.length > 0) {
      throw new Error(
        `BATCH ABORTED — insufficient raw material in ${shortages.length} silo(s). No inventory was deducted. Details: ${shortages.join("; ")}`
      );
    }

    // ── 5. DEDUCT + LEDGER ──────────────────────────────────────────────────
    const deductions: StartBatchingResult["deductions"] = [];
    const generatedPRs: StartBatchingResult["purchaseRequests"] = [];

    for (const line of lines) {
      const silo = siloByCategory.get(line.category)!;
      const previousStockKg = num(silo.currentStockKg);
      const reorderLevelKg = num(silo.reorderLevelKg);
      const newStockKg = r3(previousStockKg - line.requiredKg);

      await tx
        .update(inventorySilos)
        .set({ currentStockKg: newStockKg.toFixed(3), updatedAt: new Date() })
        .where(eq(inventorySilos.id, silo.id));

      await tx.insert(inventoryTransactions).values({
        siloId: silo.id,
        tenantId: params.tenantId,
        tripId: params.tripId,
        transactionType: "CONSUMPTION",
        quantityKg: (-line.requiredKg).toFixed(3),
        balanceAfterKg: newStockKg.toFixed(3),
        performedById: params.operatorId,
        referenceDoc: params.tripId,
        notes: `Batch ${recipe.mixDesignCode} × ${params.requestedM3} m³ @ ${params.ambientTempC} °C / ${params.humidityPct}% RH`,
      });

      const belowReorder = newStockKg <= reorderLevelKg;

      deductions.push({
        siloId: silo.id,
        siloCode: silo.siloCode,
        materialCategory: line.category,
        deductedKg: line.requiredKg,
        previousStockKg,
        newStockKg,
        belowReorder,
      });

      // ── 6. PURCHASE GUARD ────────────────────────────────────────────────
      if (belowReorder) {
        const pr = await raiseUrgentPurchaseRequest(tx, {
          siloId: silo.id,
          siloCode: silo.siloCode,
          materialCategory: line.category,
          currentStockKg: newStockKg,
          reorderLevelKg,
          capacityKg: num(silo.capacityKg),
          triggeringTripId: params.tripId,
          generatedById: params.operatorId,
          tenantId: params.tenantId,
        });
        if (pr) {
          generatedPRs.push(pr);
          warnings.push(
            `Silo ${silo.siloCode} fell to ${newStockKg.toFixed(0)} kg (reorder ${reorderLevelKg.toFixed(0)} kg). URGENT purchase request ${pr.prNumber} raised.`
          );
        }
      }
    }

    // ── Audit ───────────────────────────────────────────────────────────────
    await tx.insert(auditLogs).values({
      userId: params.operatorId,
      tenantId: params.tenantId,
      action: "BATCHING_STARTED",
      entityType: "trips",
      entityId: params.tripId,
      newState: {
        mixDesignCode: recipe.mixDesignCode,
        requestedM3: params.requestedM3,
        ambientTempC: params.ambientTempC,
        humidityPct: params.humidityPct,
        climateCompensated: recipe.climate.compensationTriggered,
        wcRatio: recipe.quality.resultingWcRatio,
        wcRatioCapped: recipe.quality.wcRatioCapped,
        silosDeducted: deductions.length,
        purchaseRequestsRaised: generatedPRs.length,
        calibrationOverridden: params.overrideCalibration ?? false,
        batchPlantId: params.batchPlantId ?? null,
      },
      socketEvent: "batch:started",
    });

    return {
      success: true,
      tripId: params.tripId,
      recipe,
      calibration,
      deductions,
      purchaseRequests: generatedPRs,
      warnings,
    };
  });
}

/**
 * Appends an URGENT purchase request when a silo breaches its reorder level.
 * Idempotent — will not duplicate an already-open request for the same silo.
 */
async function raiseUrgentPurchaseRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    siloId: string;
    siloCode: string;
    materialCategory: MaterialCategory;
    currentStockKg: number;
    reorderLevelKg: number;
    capacityKg: number;
    triggeringTripId: string;
    generatedById: string;
    tenantId: string;
  }
): Promise<StartBatchingResult["purchaseRequests"][number] | null> {
  // Idempotency guard — one open PR per silo
  const open = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(purchaseRequests)
    .where(
      and(
        eq(purchaseRequests.siloId, params.siloId),
        eq(purchaseRequests.tenantId, params.tenantId),
        sql`status NOT IN ('RECEIVED', 'CANCELLED')`
      )
    );

  if ((open[0]?.count ?? 0) > 0) return null;

  // Replenish to the buffer target, never above physical capacity
  const target = params.reorderLevelKg * REORDER_BUFFER_FACTOR;
  const headroom = params.capacityKg - params.currentStockKg;
  const quantity = r3(Math.max(0, Math.min(target - params.currentStockKg, headroom)));

  if (quantity <= 0) return null;

  const countRows = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.tenantId, params.tenantId));
  const seq = ((countRows[0]?.count ?? 0) + 1).toString().padStart(5, "0");
  const prNumber = `PR-${new Date().getFullYear()}-${seq}`;

  await tx.insert(purchaseRequests).values({
    prNumber,
    tenantId: params.tenantId,
    siloId: params.siloId,
    materialCategory: params.materialCategory,
    requestedQuantityKg: quantity.toFixed(3),
    triggeringTripId: params.triggeringTripId,
    stockAtGenerationKg: params.currentStockKg.toFixed(3),
    reorderLevelKg: params.reorderLevelKg.toFixed(3),
    status: "AUTO_GENERATED",
    priority: "URGENT",
    generatedById: params.generatedById,
    notes: `AUTO/URGENT: silo ${params.siloCode} dropped to ${params.currentStockKg.toFixed(0)} kg during batching (reorder level ${params.reorderLevelKg.toFixed(0)} kg).`,
  });

  return {
    prNumber,
    siloCode: params.siloCode,
    materialCategory: params.materialCategory,
    requestedQuantityKg: quantity,
    priority: "URGENT",
  };
}

/**
 * Clears an OUT_OF_SERVICE flag after a successful re-calibration.
 */
export async function restoreBatchPlant(
  batchPlantId: string,
  restoredById: string,
  tenantId: string
): Promise<{ plantCode: string; status: string }> {
  // Judge the scales only — the station's own OUT_OF_SERVICE flag is what we
  // are trying to clear, so it must not veto its own restoration.
  const status = await assertScaleCalibration(batchPlantId, {
    ignorePlantStatus: true,
  }); // throws if the physical scales are still out of tolerance

  const [plant] = await db
    .update(batchPlants)
    .set({
      status: "OPERATIONAL",
      outOfServiceReason: null,
      outOfServiceAt: null,
      lastCalibrationAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(batchPlants.id, batchPlantId))
    .returning();

  await db.insert(auditLogs).values({
    userId: restoredById,
    tenantId,
    action: "PLANT_RESTORED",
    entityType: "batch_plants",
    entityId: batchPlantId,
    newState: { status: "OPERATIONAL", calibration: status.message },
  });

  return { plantCode: plant.plantCode, status: plant.status };
}
