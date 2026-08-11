/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Quality Control & Lab Module — Smart Environment Compensation
 *  + Atomic StartBatch with Inventory Deduction & Reorder Triggers
 * ============================================================
 *
 *  MODULES:
 *  ─────────────────────────────────────────────────────────
 *  1. calculateAdjustedRecipe — Al-Sharqia climate compensation
 *  2. startBatchAtomic        — Atomic inventory deduction + reorder
 *  3. checkReorderLevels      — Purchase request auto-generation
 *
 *  BUSINESS RULES:
 *  ─────────────────────────────────────────────────────────
 *  • If Ambient Temp > 35°C → +1.5L water per °C above baseline
 *  • If Humidity < 40%      → additional retarder dosage
 *  • Max W/C ratio ceiling is NEVER violated; plasticiser compensates
 *  • StartBatch is a single atomic transaction:
 *    - Check ALL silo stocks have sufficient material
 *    - Reserve/lock rows (SELECT ... FOR UPDATE)
 *    - Decrement all silos
 *    - Log inventory_transactions
 *    - Trigger purchase requests if any silo < reorder level
 *  • If any silo is below required qty, transaction rolls back entirely
 * ============================================================
 */

import { db } from "@/db";
import {
  mixDesigns,
  inventorySilos,
  inventoryTransactions,
  purchaseRequests,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { MaterialCategory } from "@/db/schema";

type MixDesign = InferSelectModel<typeof mixDesigns>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmbientConditions {
  temperatureC: number;
  humidityPct: number;
  estimatedTransitMinutes?: number;
}

export interface AdjustedRecipe {
  mixDesignCode: string;
  baseDesign: {
    waterLitresPerM3: number;
    retarderLPerM3: number;
    plasticiserLPerM3: number;
    targetSlumpCm: number;
    targetStrengthMpa: number;
  };
  compensated: {
    waterLitresPerM3: number;
    retarderLPerM3: number;
    plasticiserLPerM3: number;
    wcRatio: number;
    wcRatioCeilingHit: boolean;
    estimatedSiteSlumpCm: number;
  };
  totalQuantitiesForVolume: {
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
  };
  batchNotes: string[];
  warnings: string[];
}

export interface MaterialRequirement {
  category: MaterialCategory;
  requiredKg: number;
  siloId: string;
  siloCode: string;
  currentStockKg: number;
  sufficient: boolean;
  shortByKg?: number;
}

export interface StartBatchResult {
  success: boolean;
  tripId: string;
  mixDesignCode: string;
  volumeM3: number;
  materialsDeducted: {
    siloId: string;
    siloCode: string;
    deductedKg: number;
    previousStockKg: number;
    newStockKg: number;
  }[];
  purchaseRequestsGenerated: {
    prNumber: string;
    siloCode: string;
    materialCategory: string;
    requestedQuantityKg: number;
  }[];
  compensationApplied: boolean;
  warnings: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOT_CLIMATE_TEMP_THRESHOLD_C = 35;
const LOW_HUMIDITY_THRESHOLD_PCT = 40;
const WATER_INCREASE_PER_DEG_C = 1.5;
const RETARDER_INCREASE_PER_DEG_C = 0.03; // L/m³ per °C above threshold
const RETARDER_INCREASE_PER_LOW_HUMIDITY_PCT = 0.01;
const SLUMP_LOSS_PER_10MIN_CM = 0.8;
const MAX_TRANSIT_MINUTES = 90;
const REORDER_BUFFER_FACTOR = 1.5; // Request 150% of reorder level in PR

// ─── Core Recipe Adjustment ───────────────────────────────────────────────────

/**
 * Calculates the environmentally adjusted recipe for Al-Sharqia conditions.
 *
 * Adjustment rules:
 * 1. If Temp > 35°C → increase water by 1.5L per °C above 35
 * 2. If Humidity < 40% → increase retarder to compensate for rapid curing
 * 3. If W/C ratio hits ceiling → boost plasticiser instead of water
 * 4. Estimate slump at site arrival (accounts for transit slump loss)
 */
export function calculateAdjustedRecipe(
  baseMixId: string,
  ambientTemp: number,
  humidityPct: number,
  requestedM3: number,
  estimatedTransitMinutes = 30
): Promise<AdjustedRecipe> {
  return (async () => {
    const mixRows = await db
      .select()
      .from(mixDesigns)
      .where(eq(mixDesigns.id, baseMixId))
      .limit(1);

    if (mixRows.length === 0) {
      throw new Error(`Mix design not found: ${baseMixId}`);
    }

    const mix: MixDesign = mixRows[0];

    // Parse base values
    const baseWater = parseFloat(mix.waterLitresPerM3 ?? "0");
    const baseCement = parseFloat(mix.cementKgPerM3 ?? "0");
    const baseRetarder = parseFloat(mix.admixtureRetarderLPerM3 ?? "0");
    const basePlasticiser = parseFloat(mix.admixturePlasiticzerLPerM3 ?? "0");
    const targetSlumpCm = parseFloat(mix.targetSlumpCm ?? "12");
    const targetStrengthMpa = parseFloat(mix.targetStrengthMpa ?? "25");
    const maxWcRatio = parseFloat(mix.maxWcRatio ?? "0.5");

    const batchNotes: string[] = [];
    const warnings: string[] = [];

    // ── Step 1: Temperature Adjustment ──────────────────────────────────────
    let waterAdjustment = 0;
    let retarderAdjustment = 0;

    if (ambientTemp > HOT_CLIMATE_TEMP_THRESHOLD_C) {
      const tempDelta = ambientTemp - HOT_CLIMATE_TEMP_THRESHOLD_C;
      waterAdjustment = tempDelta * WATER_INCREASE_PER_DEG_C;
      retarderAdjustment = tempDelta * RETARDER_INCREASE_PER_DEG_C;
      batchNotes.push(
        `Hot climate: ${ambientTemp}°C > ${HOT_CLIMATE_TEMP_THRESHOLD_C}°C threshold. ` +
          `Water +${waterAdjustment.toFixed(2)}L/m³, Retarder +${retarderAdjustment.toFixed(3)}L/m³`
      );
    }

    // ── Step 2: Humidity Adjustment ─────────────────────────────────────────
    if (humidityPct < LOW_HUMIDITY_THRESHOLD_PCT) {
      const humidityDelta = LOW_HUMIDITY_THRESHOLD_PCT - humidityPct;
      // Low humidity = faster evaporation = need more retarder
      retarderAdjustment += humidityDelta * RETARDER_INCREASE_PER_LOW_HUMIDITY_PCT;
      batchNotes.push(
        `Low humidity: ${humidityPct}% < ${LOW_HUMIDITY_THRESHOLD_PCT}%. ` +
          `Retarder +${(humidityDelta * RETARDER_INCREASE_PER_LOW_HUMIDITY_PCT).toFixed(3)}L/m³`
      );
    }

    // ── Step 3: Apply Adjustments ───────────────────────────────────────────
    const rawWater = baseWater + waterAdjustment;
    const adjustedRetarder = baseRetarder + retarderAdjustment;

    // ── Step 4: W/C Ratio Ceiling Check ─────────────────────────────────────
    const maxAllowedWater = maxWcRatio * baseCement;
    let adjustedWater = rawWater;
    let wcRatioCeilingHit = false;
    let plasticiserBoost = 0;

    if (rawWater > maxAllowedWater && baseCement > 0) {
      wcRatioCeilingHit = true;
      adjustedWater = maxAllowedWater;
      const waterDeficit = rawWater - maxAllowedWater;
      // Boost plasticiser to maintain workability
      plasticiserBoost = waterDeficit * 0.15;
      warnings.push(
        `W/C ceiling hit: capped water at ${maxAllowedWater.toFixed(2)}L/m³. ` +
          `Plasticiser boosted +${plasticiserBoost.toFixed(3)}L/m³ to maintain slump.`
      );
    }

    const adjustedPlasticiser = basePlasticiser + plasticiserBoost;
    const wcRatio = baseCement > 0 ? adjustedWater / baseCement : 0;

    // ── Step 5: Transit Slump Forecast ──────────────────────────────────────
    const slumpLoss = (estimatedTransitMinutes / 10) * SLUMP_LOSS_PER_10MIN_CM;
    const estimatedSiteSlumpCm = Math.max(0, targetSlumpCm - slumpLoss);

    if (estimatedTransitMinutes > MAX_TRANSIT_MINUTES) {
      warnings.push(
        `Transit time (${estimatedTransitMinutes}min) exceeds ${MAX_TRANSIT_MINUTES}min limit. Concrete may be unacceptable.`
      );
    }

    if (estimatedSiteSlumpCm < 8) {
      warnings.push(
        `Estimated site slump (${estimatedSiteSlumpCm.toFixed(1)}cm) is critically low. Consider additional admixture.`
      );
    }

    // ── Step 6: Total Quantities for Requested Volume ───────────────────────
    const quantities = {
      volumeM3: requestedM3,
      cementKg: baseCement * requestedM3,
      sandKg: parseFloat(mix.sandKgPerM3 ?? "0") * requestedM3,
      gravel10mmKg: parseFloat(mix.gravel10mmKgPerM3 ?? "0") * requestedM3,
      gravel20mmKg: parseFloat(mix.gravel20mmKgPerM3 ?? "0") * requestedM3,
      gravel40mmKg: parseFloat(mix.gravel40mmKgPerM3 ?? "0") * requestedM3,
      waterLitres: adjustedWater * requestedM3,
      plasticiserLitres: adjustedPlasticiser * requestedM3,
      retarderLitres: adjustedRetarder * requestedM3,
      flyAshKg: parseFloat(mix.flyAshKgPerM3 ?? "0") * requestedM3,
      silicaFumeKg: parseFloat(mix.silicaFumeKgPerM3 ?? "0") * requestedM3,
    };

    batchNotes.push(
      `Final batch (${requestedM3}m³): Water ${adjustedWater.toFixed(2)}L/m³, ` +
        `Retarder ${adjustedRetarder.toFixed(3)}L/m³, Plasticiser ${adjustedPlasticiser.toFixed(3)}L/m³`
    );

    return {
      mixDesignCode: mix.designCode,
      baseDesign: {
        waterLitresPerM3: baseWater,
        retarderLPerM3: baseRetarder,
        plasticiserLPerM3: basePlasticiser,
        targetSlumpCm,
        targetStrengthMpa,
      },
      compensated: {
        waterLitresPerM3: parseFloat(adjustedWater.toFixed(3)),
        retarderLPerM3: parseFloat(adjustedRetarder.toFixed(4)),
        plasticiserLPerM3: parseFloat(adjustedPlasticiser.toFixed(4)),
        wcRatio: parseFloat(wcRatio.toFixed(4)),
        wcRatioCeilingHit,
        estimatedSiteSlumpCm: parseFloat(estimatedSiteSlumpCm.toFixed(1)),
      },
      totalQuantitiesForVolume: quantities,
      batchNotes,
      warnings,
    };
  })();
}

// ─── Material Requirements Validation ─────────────────────────────────────────

/**
 * Given a set of material requirements (kg), validates that all silos
 * have sufficient stock. Returns detailed per-silo report.
 */
export async function validateMaterialAvailability(
  requirements: { category: MaterialCategory; requiredKg: number }[],
  tenantId: string
): Promise<{
  allSufficient: boolean;
  materials: MaterialRequirement[];
}> {
  const materials: MaterialRequirement[] = [];
  let allSufficient = true;

  for (const req of requirements) {
    const siloRows = await db
      .select({
        id: inventorySilos.id,
        siloCode: inventorySilos.siloCode,
        currentStockKg: inventorySilos.currentStockKg,
      })
      .from(inventorySilos)
      .where(
        and(
          eq(inventorySilos.materialCategory, req.category),
          eq(inventorySilos.tenantId, tenantId),
          eq(inventorySilos.isActive, true)
        )
      )
      .limit(1);

    if (siloRows.length === 0) {
      allSufficient = false;
      materials.push({
        category: req.category,
        requiredKg: req.requiredKg,
        siloId: "",
        siloCode: `[NO SILO for ${req.category}]`,
        currentStockKg: 0,
        sufficient: false,
        shortByKg: req.requiredKg,
      });
      continue;
    }

    const silo = siloRows[0];
    const currentStock = parseFloat(silo.currentStockKg ?? "0");
    const sufficient = currentStock >= req.requiredKg;

    if (!sufficient) allSufficient = false;

    materials.push({
      category: req.category,
      requiredKg: req.requiredKg,
      siloId: silo.id,
      siloCode: silo.siloCode,
      currentStockKg: currentStock,
      sufficient,
      shortByKg: sufficient ? undefined : req.requiredKg - currentStock,
    });
  }

  return { allSufficient, materials };
}

// ─── Atomic StartBatch Transaction ────────────────────────────────────────────

/**
 * ATOMIC TRANSACTION: StartBatch
 *
 * Steps:
 * 1. Calculate adjusted recipe based on ambient conditions
 * 2. Validate ALL silos have sufficient stock (if not, ROLLBACK entire batch)
 * 3. Lock rows using SELECT ... FOR UPDATE within transaction
 * 4. Decrement each silo's stock
 * 5. Log inventory_transactions
 * 6. Check reorder levels → auto-generate purchase requests
 * 7. Return comprehensive result
 *
 * If ANY silo is insufficient, the entire batch fails atomically — no partial deductions.
 */
export async function startBatchAtomic(params: {
  tripId: string;
  tenantId: string;
  mixDesignId: string;
  requestedVolumeM3: number;
  ambientTempC: number;
  ambientHumidityPct: number;
  estimatedTransitMinutes?: number;
  operatorId: string;
}): Promise<StartBatchResult> {
  // 1. Calculate adjusted recipe
  const recipe = await calculateAdjustedRecipe(
    params.mixDesignId,
    params.ambientTempC,
    params.ambientHumidityPct,
    params.requestedVolumeM3,
    params.estimatedTransitMinutes
  );

  // 2. Map recipe to material requirements
  const materialRequirements = [
    { category: "CEMENT" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.cementKg },
    { category: "SAND" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.sandKg },
    { category: "GRAVEL_10MM" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.gravel10mmKg },
    { category: "GRAVEL_20MM" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.gravel20mmKg },
    { category: "GRAVEL_40MM" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.gravel40mmKg },
    { category: "WATER" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.waterLitres },
    { category: "ADMIXTURE_PLASTICIZER" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.plasticiserLitres * 1.05 },
    { category: "ADMIXTURE_RETARDER" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.retarderLitres * 1.08 },
    { category: "FLY_ASH" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.flyAshKg },
    { category: "SILICA_FUME" as MaterialCategory, requiredKg: recipe.totalQuantitiesForVolume.silicaFumeKg },
  ].filter((r) => r.requiredKg > 0.001);

  // 3. Validate availability — FAIL FAST before transaction if insufficient
  const availability = await validateMaterialAvailability(materialRequirements, params.tenantId);
  if (!availability.allSufficient) {
    const insufficient = availability.materials.filter((m) => !m.sufficient);
    throw new Error(
      `Batch cannot start: insufficient stock in ${insufficient.length} silo(s): ` +
        insufficient
          .map((m) => `${m.siloCode} (need ${m.requiredKg.toFixed(1)}kg, have ${m.currentStockKg.toFixed(1)}kg)`)
          .join("; ")
    );
  }

  // 4. Execute atomic transaction
  return await db.transaction(async (tx) => {
    const materialsDeducted: StartBatchResult["materialsDeducted"] = [];
    const purchaseRequestsGenerated: StartBatchResult["purchaseRequestsGenerated"] = [];

    for (const req of materialRequirements) {
      const siloRow = await tx
        .select({
          id: inventorySilos.id,
          siloCode: inventorySilos.siloCode,
          currentStockKg: inventorySilos.currentStockKg,
          reorderLevelKg: inventorySilos.reorderLevelKg,
          capacityKg: inventorySilos.capacityKg,
        })
        .from(inventorySilos)
        .where(
          and(
            eq(inventorySilos.id, availability.materials.find((m) => m.category === req.category)!.siloId),
            eq(inventorySilos.isActive, true)
          )
        )
        .limit(1)
        .for("update");

      if (siloRow.length === 0) {
        throw new Error(`Silo for ${req.category} not found or inactive`);
      }

      const silo = siloRow[0];
      const currentStock = parseFloat(silo.currentStockKg ?? "0");
      const reorderLevel = parseFloat(silo.reorderLevelKg ?? "0");
      const newStock = currentStock - req.requiredKg;

      if (newStock < 0) {
        throw new Error(
          `RACE: Silo ${silo.siloCode} stock changed during transaction. Aborting.`
        );
      }

      // Decrement stock
      await tx
        .update(inventorySilos)
        .set({
          currentStockKg: newStock.toFixed(3),
          updatedAt: new Date(),
        })
        .where(eq(inventorySilos.id, silo.id));

      // Log inventory transaction
      await tx.insert(inventoryTransactions).values({
        siloId: silo.id,
        tenantId: params.tenantId,
        tripId: params.tripId,
        transactionType: "CONSUMPTION",
        quantityKg: (-req.requiredKg).toFixed(3),
        balanceAfterKg: newStock.toFixed(3),
        performedById: params.operatorId,
        referenceDoc: params.tripId,
        notes: `Batch production: ${recipe.mixDesignCode} × ${params.requestedVolumeM3}m³`,
      });

      materialsDeducted.push({
        siloId: silo.id,
        siloCode: silo.siloCode,
        deductedKg: req.requiredKg,
        previousStockKg: currentStock,
        newStockKg: newStock,
      });

      // 5. Check reorder level → auto-generate PR
      if (newStock <= reorderLevel) {
        const pr = await generatePurchaseRequest(tx, {
          siloId: silo.id,
          siloCode: silo.siloCode,
          materialCategory: req.category,
          currentStockKg: newStock,
          reorderLevelKg: reorderLevel,
          triggeringTripId: params.tripId,
          generatedById: params.operatorId,
          tenantId: params.tenantId,
        });
        if (pr) {
          purchaseRequestsGenerated.push(pr);
        }
      }
    }

    // 6. Audit log
    await tx.insert(auditLogs).values({
      userId: params.operatorId,
      tenantId: params.tenantId,
      action: "BATCH_STARTED",
      entityType: "trips",
      entityId: params.tripId,
      newState: {
        mixDesignCode: recipe.mixDesignCode,
        volumeM3: params.requestedVolumeM3,
        ambientTempC: params.ambientTempC,
        ambientHumidityPct: params.ambientHumidityPct,
        compensationApplied: recipe.compensated.wcRatioCeilingHit || recipe.compensated.waterLitresPerM3 !== recipe.baseDesign.waterLitresPerM3,
        silosDeducted: materialsDeducted.length,
        purchaseRequestsGenerated: purchaseRequestsGenerated.length,
      },
    });

    return {
      success: true,
      tripId: params.tripId,
      mixDesignCode: recipe.mixDesignCode,
      volumeM3: params.requestedVolumeM3,
      materialsDeducted,
      purchaseRequestsGenerated,
      compensationApplied:
        recipe.compensated.wcRatioCeilingHit ||
        recipe.compensated.waterLitresPerM3 !== recipe.baseDesign.waterLitresPerM3,
      warnings: recipe.warnings,
    };
  });
}

// ─── Purchase Request Generation ──────────────────────────────────────────────

/**
 * Generates a purchase request when a silo drops below reorder level.
 * Called automatically within the StartBatch transaction.
 *
 * Quantity to order = (reorderLevel × REORDER_BUFFER_FACTOR) - currentStock
 * This ensures the silo gets back to a comfortable buffer above the reorder level.
 */
async function generatePurchaseRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    siloId: string;
    siloCode: string;
    materialCategory: MaterialCategory;
    currentStockKg: number;
    reorderLevelKg: number;
    triggeringTripId: string;
    generatedById: string;
    tenantId: string;
  }
): Promise<StartBatchResult["purchaseRequestsGenerated"][0] | null> {
  // Count existing PRs for this silo that aren't yet received
  const existingPRRows = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(purchaseRequests)
    .where(
      and(
        eq(purchaseRequests.siloId, params.siloId),
        eq(purchaseRequests.tenantId, params.tenantId),
        sql`status NOT IN ('RECEIVED', 'CANCELLED')`
      )
    );

  const existingCount = existingPRRows[0]?.count ?? 0;

  // Don't generate duplicate PRs for the same silo within a short window
  if (existingCount > 0) {
    return null;
  }

  // Calculate quantity: target buffer minus current stock
  const targetStock = params.reorderLevelKg * REORDER_BUFFER_FACTOR;
  const quantityToOrder = Math.max(0, targetStock - params.currentStockKg);

  if (quantityToOrder <= 0) return null;

  // Generate PR number
  const prCountRows = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.tenantId, params.tenantId));
  const prSeq = ((prCountRows[0]?.count ?? 0) + 1).toString().padStart(5, "0");
  const year = new Date().getFullYear();
  const prNumber = `PR-${year}-${prSeq}`;

  await tx.insert(purchaseRequests).values({
    prNumber,
    tenantId: params.tenantId,
    siloId: params.siloId,
    materialCategory: params.materialCategory,
    requestedQuantityKg: quantityToOrder.toFixed(3),
    triggeringTripId: params.triggeringTripId,
    stockAtGenerationKg: params.currentStockKg.toFixed(3),
    reorderLevelKg: params.reorderLevelKg.toFixed(3),
    status: "AUTO_GENERATED",
    generatedById: params.generatedById,
    notes: `Auto-generated: silo ${params.siloCode} dropped below reorder level (${params.reorderLevelKg.toFixed(0)}kg) during batch production`,
  });

  return {
    prNumber,
    siloCode: params.siloCode,
    materialCategory: params.materialCategory,
    requestedQuantityKg: quantityToOrder,
  };
}
