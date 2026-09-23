/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Sustainability Service (Epic 11 — Competitive Parity)
 * ============================================================
 *
 *  Carbon footprint per order (Saudi Green Initiative readiness):
 *   • carbon_factors — editable kgCO2e intensities, seeded lazily
 *     with IPCC-style defaults (cement ~0.9/kg dominates, as expected)
 *   • footprint = Σ(mix BOM × volume × factors) + haul
 *     (distance × load × HAUL_TKM factor)
 *   • snapshots saved on orders.carbon_kgco2e for trend reporting
 * ============================================================
 */

import { db } from "@/db";
import {
  carbonFactors,
  orders,
  mixDesigns,
  deliverySites,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export interface CarbonFactor {
  key: string;
  unit: string;
  kgco2ePerUnit: number;
  source: string;
}

/** IPCC-style defaults (kgCO2e per unit). Reviewed Sep-2026. */
export const DEFAULT_FACTORS: CarbonFactor[] = [
  { key: "CEMENT_KG", unit: "kg", kgco2ePerUnit: 0.9, source: "IPCC default clinker factor" },
  { key: "SAND_KG", unit: "kg", kgco2ePerUnit: 0.005, source: "Aggregates extraction avg" },
  { key: "GRAVEL_KG", unit: "kg", kgco2ePerUnit: 0.008, source: "Crushed stone avg" },
  { key: "WATER_L", unit: "L", kgco2ePerUnit: 0.0003, source: "Mains water supply" },
  { key: "ADMIXTURE_L", unit: "L", kgco2ePerUnit: 1.5, source: "Chemical admixture LCA avg" },
  { key: "FLYASH_KG", unit: "kg", kgco2ePerUnit: 0.01, source: "By-product allocation" },
  { key: "SILICAFUME_KG", unit: "kg", kgco2ePerUnit: 0.02, source: "By-product allocation" },
  { key: "DIESEL_L", unit: "L", kgco2ePerUnit: 2.68, source: "Diesel combustion" },
  { key: "HAUL_TKM", unit: "tkm", kgco2ePerUnit: 0.1, source: "Road freight avg" },
];

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export async function ensureDefaultFactors(tenantId: string): Promise<void> {
  const existing = await db
    .select({ key: carbonFactors.factorKey })
    .from(carbonFactors)
    .where(eq(carbonFactors.tenantId, tenantId));
  const have = new Set(existing.map((r) => r.key));
  const missing = DEFAULT_FACTORS.filter((f) => !have.has(f.key));
  if (missing.length === 0) return;
  await db.insert(carbonFactors).values(
    missing.map((f) => ({
      tenantId,
      factorKey: f.key,
      unit: f.unit,
      kgco2ePerUnit: String(f.kgco2ePerUnit),
      source: f.source,
    }))
  );
}

export async function listFactors(tenantId: string) {
  await ensureDefaultFactors(tenantId);
  return db
    .select()
    .from(carbonFactors)
    .where(eq(carbonFactors.tenantId, tenantId))
    .orderBy(carbonFactors.factorKey);
}

export async function updateFactor(
  tenantId: string,
  factorKey: string,
  kgco2ePerUnit: number
) {
  if (!Number.isFinite(kgco2ePerUnit) || kgco2ePerUnit < 0) {
    throw new Error("Factor must be a non-negative number");
  }
  await ensureDefaultFactors(tenantId);
  const [updated] = await db
    .update(carbonFactors)
    .set({ kgco2ePerUnit: String(kgco2ePerUnit), updatedAt: new Date() })
    .where(
      and(
        eq(carbonFactors.tenantId, tenantId),
        eq(carbonFactors.factorKey, factorKey)
      )
    )
    .returning();
  return updated ?? null;
}

async function factorMap(tenantId: string): Promise<Map<string, number>> {
  await ensureDefaultFactors(tenantId);
  const rows = await db
    .select()
    .from(carbonFactors)
    .where(eq(carbonFactors.tenantId, tenantId));
  return new Map(rows.map((r) => [r.factorKey, num(r.kgco2ePerUnit)]));
}

export interface OrderFootprint {
  orderId: string;
  orderNumber: string;
  volumeM3: number;
  materialsKgco2e: number;
  haulKgco2e: number;
  totalKgco2e: number;
  intensityKgco2ePerM3: number;
  breakdown: Record<string, number>;
}

export async function computeOrderFootprint(
  tenantId: string,
  orderId: string,
  saveSnapshot = true
): Promise<OrderFootprint | null> {
  const o = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalVolumeM3: orders.totalVolumeM3,
      mix: mixDesigns,
      distanceKm: deliverySites.distanceFromPlantKm,
    })
    .from(orders)
    .innerJoin(mixDesigns, eq(orders.mixDesignId, mixDesigns.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  const row = o[0];
  if (!row) return null;

  const f = await factorMap(tenantId);
  const vol = num(row.totalVolumeM3);
  const m = row.mix;

  // Per-m³ material emissions
  const perM3: Record<string, number> = {
    cement: num(m.cementKgPerM3) * (f.get("CEMENT_KG") ?? 0),
    sand: num(m.sandKgPerM3) * (f.get("SAND_KG") ?? 0),
    gravel:
      (num(m.gravel10mmKgPerM3) + num(m.gravel20mmKgPerM3) + num(m.gravel40mmKgPerM3)) *
      (f.get("GRAVEL_KG") ?? 0),
    water: num(m.waterLitresPerM3) * (f.get("WATER_L") ?? 0),
    admixture:
      (num(m.admixturePlasiticzerLPerM3) + num(m.admixtureRetarderLPerM3)) *
      (f.get("ADMIXTURE_L") ?? 0),
    flyAsh: num(m.flyAshKgPerM3) * (f.get("FLYASH_KG") ?? 0),
    silicaFume: num(m.silicaFumeKgPerM3) * (f.get("SILICAFUME_KG") ?? 0),
  };
  const materialsPerM3 = Object.values(perM3).reduce((s, v) => s + v, 0);
  const materials = materialsPerM3 * vol;

  // Haul: ~2.4 t/m³ concrete × round-trip km × HAUL_TKM
  const distKm = num(row.distanceKm);
  const haul = distKm > 0 ? vol * 2.4 * distKm * 2 * (f.get("HAUL_TKM") ?? 0) : 0;

  const total = materials + haul;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (saveSnapshot) {
    await db
      .update(orders)
      .set({ carbonKgco2e: String(r2(total)), carbonComputedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  const breakdown: Record<string, number> = {};
  for (const [k, v] of Object.entries(perM3)) breakdown[k] = r2(v * vol);
  breakdown.haul = r2(haul);

  return {
    orderId,
    orderNumber: row.orderNumber,
    volumeM3: vol,
    materialsKgco2e: r2(materials),
    haulKgco2e: r2(haul),
    totalKgco2e: r2(total),
    intensityKgco2ePerM3: vol > 0 ? r2(total / vol) : 0,
    breakdown,
  };
}

export async function carbonSummary(tenantId: string, limit = 200) {
  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      productType: orders.productType,
      totalVolumeM3: orders.totalVolumeM3,
      carbonKgco2e: orders.carbonKgco2e,
    })
    .from(orders)
    .where(
      and(eq(orders.tenantId, tenantId), sql`${orders.carbonKgco2e} IS NOT NULL`)
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  const byProduct: Record<string, { orders: number; volumeM3: number; kgco2e: number }> = {};
  let totalKg = 0;
  let totalVol = 0;
  for (const r of rows) {
    const p = r.productType ?? "READY_MIX";
    const cur = byProduct[p] ?? { orders: 0, volumeM3: 0, kgco2e: 0 };
    cur.orders += 1;
    cur.volumeM3 += num(r.totalVolumeM3);
    cur.kgco2e += num(r.carbonKgco2e);
    byProduct[p] = cur;
    totalKg += num(r.carbonKgco2e);
    totalVol += num(r.totalVolumeM3);
  }

  return {
    ordersCount: rows.length,
    totalVolumeM3: Math.round(totalVol * 100) / 100,
    totalKgco2e: Math.round(totalKg * 100) / 100,
    totalTco2e: Math.round((totalKg / 1000) * 100) / 100,
    intensityKgco2ePerM3: totalVol > 0 ? Math.round((totalKg / totalVol) * 100) / 100 : 0,
    byProduct,
  };
}
