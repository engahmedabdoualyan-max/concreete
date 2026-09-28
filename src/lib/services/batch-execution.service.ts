/**
 * ============================================================
 *  Batch execution — fire a batch and record what the plant really consumed
 * ============================================================
 *  Two jobs, and the second one is the valuable one:
 *
 *  1. FIRE A BATCH
 *     Send the panel the design code and the target weights per material, but
 *     only when the controller is explicitly commissioned for remote writes
 *     (`allowRemoteWrite: true`). Otherwise the API answers "the operator
 *     fires it on the panel" and records the intent, which is the safe default:
 *     a mistyped register on a live plant costs concrete.
 *
 *  2. RECORD THE ACTUAL CONSUMPTION
 *     When the plant reports a finished ticket, the weights it actually used are
 *     written to `inventory_transactions` and the silos are decremented. This
 *     is what makes cost per m³ a measured number instead of a recipe
 *     estimate — and it is the difference between knowing you lost money on a
 *     mix and guessing.
 *
 *  The write path is deliberately unusable until a plant is commissioned:
 *  deploy/BATCHING-COMMISSIONING.md lists what has to be confirmed with the
 *  vendor for each controller.
 * ============================================================
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  batchControllers,
  batchPlants,
  mixDesigns,
  inventorySilos,
  inventoryTransactions,
  users,
} from "@/db/schema";
import type { BatchCommand } from "@/lib/integrations/batch/controller";
import { controllerFor } from "@/lib/services/batch-control.service";

/** Material keys as they come off the plant, mapped to silo categories. */
const WEIGHT_TO_CATEGORY: Record<string, string> = {
  cement: "CEMENT",
  sand: "SAND",
  gravel10: "GRAVEL_10MM",
  gravel20: "GRAVEL_20MM",
  gravel40: "GRAVEL_40MM",
  water: "WATER",
  admixture1: "ADMIXTURE_PLASTICIZER",
  admixture2: "ADMIXTURE_RETARDER",
  flyAsh: "FLY_ASH",
  silicaFume: "SILICA_FUME",
};

/** kg per m³ in the recipe, used as the target weights for a 1 m³ batch. */
const RECIPE_KG_PER_M3: Record<string, number> = {
  cement: 300,
  sand: 800,
  gravel10: 350,
  gravel20: 250,
  gravel40: 150,
  water: 175,
  admixture1: 2.5,
  admixture2: 0,
  flyAsh: 0,
  silicaFume: 0,
};

const FireSchema = z.object({
  controllerId: z.string().uuid(),
  mixDesignId: z.string().uuid(),
  /** the panel's own design id when it differs from our design code */
  panelDesignCode: z.coerce.number().int().min(0).max(65535).optional(),
  /** 1 m³ by default; a truck batch is usually 1–2 m³ */
  batchSizeM3: z.coerce.number().positive().max(4).default(1),
});

/** Only a controller that was explicitly commissioned may be written to. */
export function canWriteRemote(settings: Record<string, unknown>): boolean {
  return settings.allowRemoteWrite === true;
}

async function loadController(tenantId: string, controllerId: string) {
  const rows = await db
    .select({
      id: batchControllers.id,
      provider: batchControllers.provider,
      settings: batchControllers.settings,
      plantId: batchPlants.id,
    })
    .from(batchControllers)
    .innerJoin(batchPlants, eq(batchControllers.batchPlantId, batchPlants.id))
    .where(
      and(
        eq(batchControllers.id, controllerId),
        eq(batchControllers.tenantId, tenantId),
        eq(batchControllers.isActive, true)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function fireBatch(tenantId: string, input: unknown) {
  const parsed = FireSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "VALIDATION_ERROR", message: parsed.error.flatten() };
  }
  const { controllerId, mixDesignId, panelDesignCode, batchSizeM3 } = parsed.data;

  const controllerRow = await loadController(tenantId, controllerId);
  if (!controllerRow) {
    return { ok: false as const, code: "NOT_FOUND", message: "Controller not found" };
  }
  const provider = controllerFor(controllerRow.provider);
  if (!provider) {
    return { ok: false as const, code: "UNKNOWN_PROVIDER", message: "Unknown controller provider" };
  }

  const designRows = await db
    .select({
      id: mixDesigns.id,
      designCode: mixDesigns.designCode,
      cementKgPerM3: mixDesigns.cementKgPerM3,
      sandKgPerM3: mixDesigns.sandKgPerM3,
      gravel10mmKgPerM3: mixDesigns.gravel10mmKgPerM3,
      gravel20mmKgPerM3: mixDesigns.gravel20mmKgPerM3,
      gravel40mmKgPerM3: mixDesigns.gravel40mmKgPerM3,
      waterLitresPerM3: mixDesigns.waterLitresPerM3,
      admixturePlasiticzer: mixDesigns.admixturePlasiticzerLPerM3,
      admixtureRetarder: mixDesigns.admixtureRetarderLPerM3,
      flyAsh: mixDesigns.flyAshKgPerM3,
      silicaFume: mixDesigns.silicaFumeKgPerM3,
    })
    .from(mixDesigns)
    .where(
      and(eq(mixDesigns.id, mixDesignId), eq(mixDesigns.tenantId, tenantId))
    )
    .limit(1);
  const design = designRows[0];
  if (!design) {
    return { ok: false as const, code: "NOT_FOUND", message: "Mix design not found" };
  }

  // Target weights for this batch, straight from the signed-off recipe.
  const targetWeightsKg: Record<string, number> = {
    cement: round1(Number(design.cementKgPerM3 ?? RECIPE_KG_PER_M3.cement) * batchSizeM3),
    sand: round1(Number(design.sandKgPerM3 ?? RECIPE_KG_PER_M3.sand) * batchSizeM3),
    gravel10: round1(Number(design.gravel10mmKgPerM3 ?? 0) * batchSizeM3),
    gravel20: round1(Number(design.gravel20mmKgPerM3 ?? 0) * batchSizeM3),
    gravel40: round1(Number(design.gravel40mmKgPerM3 ?? 0) * batchSizeM3),
    water: round1(Number(design.waterLitresPerM3 ?? RECIPE_KG_PER_M3.water) * batchSizeM3),
    admixture1: round1(Number(design.admixturePlasiticzer ?? 0) * batchSizeM3),
    admixture2: round1(Number(design.admixtureRetarder ?? 0) * batchSizeM3),
    flyAsh: round1(Number(design.flyAsh ?? 0) * batchSizeM3),
    silicaFume: round1(Number(design.silicaFume ?? 0) * batchSizeM3),
  };

  const command: BatchCommand = {
    action: "startBatch",
    designCode: panelDesignCode,
    targetWeightsKg,
  };

  const settings = (controllerRow.settings ?? {}) as Record<string, unknown>;
  const writable = provider.writeCommand && canWriteRemote(settings);

  if (!writable) {
    // The safe path: record the intent, let the operator fire it on the panel.
    return {
      ok: true as const,
      fired: false as const,
      simulated: false,
      code: "MANUAL_FIRE_REQUIRED",
      message:
        "الخلطة جاهزة — المشغّل يبدأ الباتش من لوحة المصنع. (الكتابة عن بُعد غير مفعّلة على هذا الكنترولر)",
      design: { id: design.id, designCode: design.designCode },
      batchSizeM3,
      targetWeightsKg,
    };
  }

  const result = await provider.writeCommand!(settings, command);
  await db
    .update(batchControllers)
    .set({
      // last_status is a jsonb column: keep the shape the read path expects.
      lastStatus: { state: result.ok ? "online" : "error", at: new Date().toISOString() },
      lastSeenAt: new Date(),
    })
    .where(eq(batchControllers.id, controllerId));

  return {
    ok: result.ok,
    fired: result.ok,
    simulated: result.simulated ?? false,
    code: result.ok ? "FIRED" : "WRITE_FAILED",
    message: result.message,
    written: result.written,
    latencyMs: result.latencyMs ?? null,
    design: { id: design.id, designCode: design.designCode },
    batchSizeM3,
    targetWeightsKg,
  };
}

const RecordSchema = z.object({
  controllerId: z.string().uuid(),
  ticketNumber: z.string().trim().min(1).max(40),
  /** batch size the ticket represents, for the cost per m³ figure */
  batchSizeM3: z.coerce.number().positive().max(4).default(1),
  performedById: z.string().uuid().optional(),
});

/**
 * Pull a finished ticket from the plant and post the real consumption.
 * Idempotent per (controller, ticket): a ticket is only booked once, so a
 * retried poll cannot shrink the silos twice.
 */
export async function recordBatchConsumption(tenantId: string, input: unknown) {
  const parsed = RecordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "VALIDATION_ERROR", message: parsed.error.flatten() };
  }
  const { controllerId, ticketNumber, batchSizeM3 } = parsed.data;

  const controllerRow = await loadController(tenantId, controllerId);
  if (!controllerRow) {
    return { ok: false as const, code: "NOT_FOUND", message: "Controller not found" };
  }
  const provider = controllerFor(controllerRow.provider);
  if (!provider) {
    return { ok: false as const, code: "UNKNOWN_PROVIDER", message: "Unknown controller provider" };
  }

  const settings = (controllerRow.settings ?? {}) as Record<string, unknown>;
  const ticket = await provider.readTicket(settings, ticketNumber);

  // Idempotency: one booking per ticket per controller.
  const existing = await db
    .select({ id: inventoryTransactions.id })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.tenantId, tenantId),
        eq(inventoryTransactions.referenceDoc, `BATCH:${controllerId}:${ticketNumber}`),
        eq(inventoryTransactions.transactionType, "ISSUE")
      )
    )
    .limit(1);
  if (existing[0]) {
    return {
      ok: true as const,
      code: "ALREADY_RECORDED",
      message: "This ticket is already booked",
      ticket,
    };
  }

  const silos = await db
    .select({
      id: inventorySilos.id,
      category: inventorySilos.materialCategory,
      name: inventorySilos.siloName ?? null,
      currentStockKg: inventorySilos.currentStockKg,
    })
    .from(inventorySilos)
    .where(
      and(
        eq(inventorySilos.tenantId, tenantId),
        eq(inventorySilos.isActive, true)
      )
    );

  const posted: { material: string; kg: number; siloId: string | null; balanceAfterKg: number | null }[] = [];
  const shortages: string[] = [];

  for (const [key, kgRaw] of Object.entries(ticket.weightsKg ?? {})) {
    const kg = Number(kgRaw ?? 0) || 0;
    if (kg <= 0) continue;
    const category = WEIGHT_TO_CATEGORY[key];
    if (!category) continue;
    const silo = silos.find((s) => String(s.category) === category);
    if (!silo) {
      shortages.push(`${category} (no silo configured)`);
      continue;
    }
    const stock = Number(silo.currentStockKg ?? 0);
    if (stock < kg) {
      shortages.push(`${category} (stock ${Math.round(stock)} kg < ${Math.round(kg)} kg)`);
    }
    const balanceAfter = Math.round((stock - kg) * 1000) / 1000;
    await db.insert(inventoryTransactions).values({
      tenantId,
      siloId: silo.id,
      transactionType: "ISSUE",
      quantityKg: String(-kg),
      balanceAfterKg: String(balanceAfter),
      referenceDoc: `BATCH:${controllerId}:${ticketNumber}`,
      performedById: parsed.data.performedById ?? null,
      notes: `batch ${ticketNumber} · ${batchSizeM3} m³ · ${ticket.source}`,
    });
    await db
      .update(inventorySilos)
      .set({ currentStockKg: String(balanceAfter), updatedAt: new Date() })
      .where(eq(inventorySilos.id, silo.id));
    posted.push({ material: category, kg: round1(kg), siloId: silo.id, balanceAfterKg: balanceAfter });
  }

  return {
    ok: true as const,
    code: "RECORDED",
    message:
      posted.length > 0
        ? `Booked ${posted.length} material(s) for ticket ${ticketNumber}`
        : `Ticket ${ticketNumber} had no usable weights`,
    ticket,
    posted,
    shortages,
    source: ticket.source,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
