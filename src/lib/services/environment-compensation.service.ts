/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Environment Compensation Algorithm
 *  Al-Sharqia Region — Temperature & Humidity Corrections
 * ============================================================
 *
 *  CONCRETE SCIENCE BACKGROUND:
 *  ─────────────────────────────────────────────────────────
 *  Al-Sharqia (Eastern Province) routinely exceeds 45–50°C in
 *  summer. High temperatures accelerate hydration, causing:
 *    • Premature stiffening / slump loss during transit
 *    • Reduced workability at pour site
 *    • Compromised final compressive strength
 *
 *  COMPENSATION STRATEGY:
 *  ─────────────────────────────────────────────────────────
 *  1. Water adjustment: Add extra water per °C above base design
 *     temperature (within max w/c ratio constraint)
 *  2. Retarder admixture: Increase dosage per °C to slow hydration
 *  3. Plasticizer boost: If water ceiling hit, boost plasticizer
 *     to maintain slump without increasing w/c ratio
 *  4. Humidity factor: High humidity reduces free evaporation,
 *     so water is slightly reduced when RH > 50%
 * ============================================================
 */

import type { mixDesigns } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type MixDesign = InferSelectModel<typeof mixDesigns>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmbientConditions {
  /** Current ambient temperature in °C */
  temperatureC: number;
  /** Current relative humidity percentage */
  humidityPct: number;
  /** Estimated transit time to site in minutes */
  estimatedTransitMinutes?: number;
}

export interface CompensatedMix {
  /** Original mix design reference */
  mixDesignCode: string;
  /** Ambient conditions used for this compensation */
  conditions: AmbientConditions;
  /** Adjusted water quantity (litres / m³) */
  adjustedWaterLitresPerM3: number;
  /** Adjusted retarder admixture (litres / m³) */
  adjustedRetarderLPerM3: number;
  /** Adjusted plasticizer admixture (litres / m³) */
  adjustedPlasticiserLPerM3: number;
  /** Calculated w/c ratio after adjustment */
  wcRatio: number;
  /** Whether the max w/c ratio ceiling was hit */
  wcRatioCeilingHit: boolean;
  /** Temperature delta applied (°C above base) */
  tempDeltaC: number;
  /** Humidity delta applied (% above 50% baseline) */
  humidityDeltaPct: number;
  /** Estimated slump at site arrival (cm) — based on transit time */
  estimatedSiteSlumpCm: number;
  /** Human-readable batch notes for lab technician */
  batchNotes: string[];
  /** Warning messages for dispatcher/driver */
  warnings: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Slump loss rate: cm per 10 minutes of transit (empirical for Al-Sharqia) */
const SLUMP_LOSS_PER_10MIN_CM = 0.8;

/** Maximum recommended transit time for RMC (ACI 304R) */
const MAX_RECOMMENDED_TRANSIT_MINUTES = 90;

/** Al-Sharqia extreme heat threshold */
const EXTREME_HEAT_THRESHOLD_C = 40;

/** Reference humidity — corrections applied above this */
const REFERENCE_HUMIDITY_PCT = 50;

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Computes the environmentally compensated mix proportions for a batch.
 *
 * @param mixDesign - Base mix design from database
 * @param conditions - Current ambient temperature and humidity
 * @returns Adjusted quantities and diagnostic information
 */
export function computeEnvironmentCompensation(
  mixDesign: MixDesign,
  conditions: AmbientConditions
): CompensatedMix {
  const batchNotes: string[] = [];
  const warnings: string[] = [];

  // ── Parse base values from DB decimals ───────────────────────────────────
  const baseWater = parseFloat(mixDesign.waterLitresPerM3 ?? "0");
  const baseCement = parseFloat(mixDesign.cementKgPerM3 ?? "0");
  const baseRetarder = parseFloat(mixDesign.admixtureRetarderLPerM3 ?? "0");
  const basePlasticiser = parseFloat(mixDesign.admixturePlasiticzerLPerM3 ?? "0");
  const baseDesignTempC = parseFloat(mixDesign.baseDesignTempC ?? "25");
  const waterAdjPerDegC = parseFloat(mixDesign.waterAdjLitresPerDegC ?? "0.5");
  const retarderAdjPerDegC = parseFloat(mixDesign.retarderAdjLPerDegC ?? "0.02");
  const waterAdjPerHumidityPct = parseFloat(
    mixDesign.waterAdjLitresPerPercentHumidity ?? "0.05"
  );
  const maxWcRatio = parseFloat(mixDesign.maxWcRatio ?? "0.5");
  const targetSlumpCm = parseFloat(mixDesign.targetSlumpCm ?? "12");

  // ── Step 1: Temperature Delta ─────────────────────────────────────────────
  const tempDeltaC = Math.max(0, conditions.temperatureC - baseDesignTempC);

  if (tempDeltaC > 0) {
    batchNotes.push(
      `Temp correction: +${tempDeltaC.toFixed(1)}°C above base design temp of ${baseDesignTempC}°C`
    );
  }

  if (conditions.temperatureC >= EXTREME_HEAT_THRESHOLD_C) {
    warnings.push(
      `⚠️ EXTREME HEAT: ${conditions.temperatureC}°C detected. Expedite batching and transit. Ice substitution for mix water recommended.`
    );
  }

  // ── Step 2: Humidity Delta ────────────────────────────────────────────────
  // Above 50% RH: aggregate surfaces carry moisture, so we reduce water
  const humidityDeltaPct = Math.max(0, conditions.humidityPct - REFERENCE_HUMIDITY_PCT);

  // ── Step 3: Raw Water Adjustment ──────────────────────────────────────────
  const waterFromTemp = tempDeltaC * waterAdjPerDegC;
  const waterFromHumidity = -humidityDeltaPct * waterAdjPerHumidityPct; // negative = reduction
  const rawAdjustedWater = baseWater + waterFromTemp + waterFromHumidity;

  batchNotes.push(
    `Water adjustment: Base ${baseWater}L + Temp +${waterFromTemp.toFixed(2)}L + Humidity ${waterFromHumidity.toFixed(2)}L = ${rawAdjustedWater.toFixed(2)}L/m³`
  );

  // ── Step 4: W/C Ratio Ceiling Check ──────────────────────────────────────
  const maxAllowedWaterForCement = maxWcRatio * baseCement;
  let wcRatioCeilingHit = false;
  let adjustedWater: number;
  let plasticiserBoost = 0;

  if (rawAdjustedWater > maxAllowedWaterForCement) {
    wcRatioCeilingHit = true;
    adjustedWater = maxAllowedWaterForCement;
    // Calculate plasticiser boost to compensate for the water shortfall
    const waterDeficit = rawAdjustedWater - maxAllowedWaterForCement;
    // Rule: 1L water deficit ≈ 0.15L additional plasticiser (Fimto empirical ratio)
    plasticiserBoost = waterDeficit * 0.15;
    warnings.push(
      `⚠️ W/C RATIO CEILING HIT: Water capped at ${adjustedWater.toFixed(2)}L/m³ (max w/c = ${maxWcRatio}). Plasticiser increased by ${plasticiserBoost.toFixed(3)}L/m³ to maintain workability.`
    );
  } else {
    adjustedWater = rawAdjustedWater;
  }

  // ── Step 5: Retarder Adjustment ───────────────────────────────────────────
  const retarderBoost = tempDeltaC * retarderAdjPerDegC;
  const adjustedRetarder = baseRetarder + retarderBoost;

  if (retarderBoost > 0) {
    batchNotes.push(
      `Retarder adjustment: Base ${baseRetarder}L + Temp +${retarderBoost.toFixed(3)}L = ${adjustedRetarder.toFixed(3)}L/m³`
    );
  }

  // ── Step 6: Final Plasticiser ─────────────────────────────────────────────
  const adjustedPlasticiser = basePlasticiser + plasticiserBoost;

  // ── Step 7: W/C Ratio Calculation ─────────────────────────────────────────
  const wcRatio = baseCement > 0 ? adjustedWater / baseCement : 0;

  // ── Step 8: Estimated Site Slump ─────────────────────────────────────────
  const transitMinutes = conditions.estimatedTransitMinutes ?? 30;
  const slumpLoss = (transitMinutes / 10) * SLUMP_LOSS_PER_10MIN_CM;
  const estimatedSiteSlumpCm = Math.max(0, targetSlumpCm - slumpLoss);

  if (estimatedSiteSlumpCm < 8) {
    warnings.push(
      `⚠️ SLUMP RISK: Estimated site slump is ${estimatedSiteSlumpCm.toFixed(1)}cm (target: ${targetSlumpCm}cm). Consider increasing admixture or reducing transit time.`
    );
  }

  if (transitMinutes > MAX_RECOMMENDED_TRANSIT_MINUTES) {
    warnings.push(
      `⚠️ TRANSIT LIMIT: Estimated transit (${transitMinutes}min) exceeds ACI 304R maximum of ${MAX_RECOMMENDED_TRANSIT_MINUTES}min. Concrete may be unacceptable at delivery.`
    );
  }

  // ── Step 9: Additional Al-Sharqia Specific Checks ─────────────────────────
  if (conditions.temperatureC > 35 && conditions.humidityPct < 30) {
    warnings.push(
      "⚠️ HOT & DRY CONDITIONS: High evaporation rate at site. Recommend shade protection, wet burlap curing immediately after pour."
    );
  }

  batchNotes.push(
    `Final mix: Water=${adjustedWater.toFixed(2)}L, Retarder=${adjustedRetarder.toFixed(3)}L, Plasticiser=${adjustedPlasticiser.toFixed(3)}L per m³`
  );
  batchNotes.push(
    `W/C Ratio: ${wcRatio.toFixed(3)} (max allowed: ${maxWcRatio})`
  );

  return {
    mixDesignCode: mixDesign.designCode,
    conditions,
    adjustedWaterLitresPerM3: parseFloat(adjustedWater.toFixed(3)),
    adjustedRetarderLPerM3: parseFloat(adjustedRetarder.toFixed(4)),
    adjustedPlasticiserLPerM3: parseFloat(adjustedPlasticiser.toFixed(4)),
    wcRatio: parseFloat(wcRatio.toFixed(4)),
    wcRatioCeilingHit,
    tempDeltaC,
    humidityDeltaPct,
    estimatedSiteSlumpCm: parseFloat(estimatedSiteSlumpCm.toFixed(1)),
    batchNotes,
    warnings,
  };
}

/**
 * Calculates the total material quantities for a batch run.
 * Deducts from silo inventory in the calling service.
 *
 * @param mixDesign - The (compensated) mix design
 * @param volumeM3  - Total cubic metres to produce
 * @param compensation - Environment compensation result
 */
export function calculateBatchQuantities(
  mixDesign: MixDesign,
  volumeM3: number,
  compensation: CompensatedMix
): BatchQuantities {
  return {
    volumeM3,
    cementKg: parseFloat(mixDesign.cementKgPerM3 ?? "0") * volumeM3,
    sandKg: parseFloat(mixDesign.sandKgPerM3 ?? "0") * volumeM3,
    gravel10mmKg: parseFloat(mixDesign.gravel10mmKgPerM3 ?? "0") * volumeM3,
    gravel20mmKg: parseFloat(mixDesign.gravel20mmKgPerM3 ?? "0") * volumeM3,
    gravel40mmKg: parseFloat(mixDesign.gravel40mmKgPerM3 ?? "0") * volumeM3,
    waterLitres: compensation.adjustedWaterLitresPerM3 * volumeM3,
    plasticiserLitres: compensation.adjustedPlasticiserLPerM3 * volumeM3,
    retarderLitres: compensation.adjustedRetarderLPerM3 * volumeM3,
    flyAshKg: parseFloat(mixDesign.flyAshKgPerM3 ?? "0") * volumeM3,
    silicaFumeKg: parseFloat(mixDesign.silicaFumeKgPerM3 ?? "0") * volumeM3,
  };
}

export interface BatchQuantities {
  volumeM3: number;
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
}
