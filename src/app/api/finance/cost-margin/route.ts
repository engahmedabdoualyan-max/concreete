/**
 * ============================================================
 *  GET /api/finance/cost-margin — cost and margin per m³
 * ============================================================
 *  WHAT THIS ANSWERS
 *  The question every ready-mix plant owner asks first: "am I making money on
 *  this order, and which client and which mix are eating the margin?" No
 *  competitor in this region publishes it, and it is the fastest thing to show
 *  a new customer.
 *
 *  HOW THE NUMBERS ARE BUILT (all from data the plant already records)
 *  ─────────────────────────────────────────────────────────────────
 *  Revenue        = orders.price_per_m3_sar × volume            (SAR cents)
 *  Material cost  = the mix recipe (kg per m³) × the current silo
 *                   cost per tonne (inventory_silos.cost_sar_per_tonne),
 *                   matched per material category
 *  Transport cost = trips.total_cost_sar (or cost_per_tonne × loaded
 *                   volume) attributed to the order's trips
 *  Margin         = revenue − material − transport
 *
 *  Costs that are not per-m³ (fixed overhead, salaries, plant depreciation)
 *  are intentionally NOT added: this is a contribution margin, which is the
 *  number that should drive pricing and mix decisions.
 *
 *  WHAT IS NEEDED FROM THE PLANT
 *  `inventory_silos.cost_sar_per_tonne` — the one input this cannot invent.
 *  Where it is zero, the report says so instead of quietly reporting a
 *  flattering margin.
 *
 *  QUERY
 *    from, to        ISO dates (default: the current calendar month)
 *    clientId        optional UUID
 *    mixDesignId     optional UUID
 *    limit           1..200, default 50
 *    groupBy         "mix" | "client" | null (default: per order)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  orders,
  clients,
  mixDesigns,
  trips,
  inventorySilos,
} from "@/db/schema";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  clientId: z.string().uuid().optional(),
  mixDesignId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  groupBy: z.enum(["mix", "client"]).optional(),
});

/**
 * One row per material in the mix recipe. `column` is the key the value arrives
 * under in the recipe JSON, and it matches material_category so it can be priced
 * from the silo. Liquids are converted with the usual ~1 kg/l assumption.
 */
const RECIPE_MATERIALS: { category: string; unit: "kg" | "l" }[] = [
  { category: "CEMENT", unit: "kg" },
  { category: "SAND", unit: "kg" },
  { category: "GRAVEL_10MM", unit: "kg" },
  { category: "GRAVEL_20MM", unit: "kg" },
  { category: "GRAVEL_40MM", unit: "kg" },
  { category: "FLY_ASH", unit: "kg" },
  { category: "SILICA_FUME", unit: "kg" },
  { category: "WATER", unit: "l" },
  { category: "ADMIXTURE_PLASTICIZER", unit: "l" },
  { category: "ADMIXTURE_RETARDER", unit: "l" },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    clientId: url.searchParams.get("clientId") ?? undefined,
    mixDesignId: url.searchParams.get("mixDesignId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    groupBy: url.searchParams.get("groupBy") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid filters", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const q = parsed.data;

  const now = new Date();
  const from = q.from ? new Date(q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.to ? new Date(q.to) : now;
  // Whole-day upper bound so an order scheduled today is included.
  to.setHours(23, 59, 59, 999);

  const conditions: SQL[] = [
    gte(orders.scheduledDate, from),
    lte(orders.scheduledDate, to),
  ];
  if (q.clientId) conditions.push(eq(orders.clientId, q.clientId));
  if (q.mixDesignId) conditions.push(eq(orders.mixDesignId, q.mixDesignId));

  // ── current material prices, averaged per category ────────────────────────
  const siloRows = await db
    .select({
      category: inventorySilos.materialCategory,
      cost: sql<string>`COALESCE(AVG(CAST(${inventorySilos.costSarPerTonne} AS numeric)), 0)::text`,
    })
    .from(inventorySilos)
    .where(eq(inventorySilos.isActive, true))
    .groupBy(inventorySilos.materialCategory);
  const priceByCategory = new Map<string, number>(
    siloRows.map((r) => [String(r.category), Number(r.cost) || 0])
  );

  // ── the orders in range with their recipe ─────────────────────────────────
  const orderRows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      clientId: orders.clientId,
      clientName: clients.companyName,
      mixDesignId: orders.mixDesignId,
      designCode: mixDesigns.designCode,
      grade: mixDesigns.gradeDescription,
      volumeM3: sql<string>`CAST(${orders.totalVolumeM3} AS text)`,
      pricePerM3Sar: orders.pricePerM3Sar,
      status: orders.status,
      scheduledDate: sql<string>`to_char(${orders.scheduledDate}::date, 'YYYY-MM-DD')`,
      recipe: sql<Record<string, string | null>>`json_build_object(
        'CEMENT', to_jsonb(${mixDesigns.cementKgPerM3}),
        'SAND', to_jsonb(${mixDesigns.sandKgPerM3}),
        'GRAVEL_10MM', to_jsonb(${mixDesigns.gravel10mmKgPerM3}),
        'GRAVEL_20MM', to_jsonb(${mixDesigns.gravel20mmKgPerM3}),
        'GRAVEL_40MM', to_jsonb(${mixDesigns.gravel40mmKgPerM3}),
        'FLY_ASH', to_jsonb(${mixDesigns.flyAshKgPerM3}),
        'SILICA_FUME', to_jsonb(${mixDesigns.silicaFumeKgPerM3}),
        'WATER', to_jsonb(${mixDesigns.waterLitresPerM3}),
        'ADMIXTURE_PLASTICIZER', to_jsonb(${mixDesigns.admixturePlasiticzerLPerM3}),
        'ADMIXTURE_RETARDER', to_jsonb(${mixDesigns.admixtureRetarderLPerM3})
      )`,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .innerJoin(mixDesigns, eq(orders.mixDesignId, mixDesigns.id))
    .where(and(...conditions))
    .limit(q.limit);

  // ── delivery cost per order, from the trips that belong to it ─────────────
  const tripRows = orderRows.length
    ? await db
        .select({
          orderId: trips.orderId,
          volumeM3: sql<string>`COALESCE(SUM(CAST(${trips.loadedVolumeM3} AS numeric)), 0)::text`,
          transportCostSar: sql<string>`COALESCE(SUM(${trips.transportCostSar}), 0)::text`,
          volumeDeliveredM3: sql<string>`COALESCE(SUM(COALESCE(CAST(${trips.confirmedVolumeM3} AS numeric), CAST(${trips.loadedVolumeM3} AS numeric))), 0)::text`,
        })
        .from(trips)
        .where(
          and(
            eq(trips.tenantId, auth.user.tenantId),
            sql`${trips.orderId} IN (${sql.join(
              orderRows.map((o) => sql`${o.orderId}::uuid`),
              sql`, `
            )})`
          )
        )
        .groupBy(trips.orderId)
    : [];
  const transportByOrder = new Map<string, { volumeDeliveredM3: number; transportCostSar: number }>(
    tripRows.map((t) => [
      String(t.orderId),
      {
        volumeDeliveredM3: Number(t.volumeDeliveredM3) || 0,
        transportCostSar: Number(t.transportCostSar) || 0,
      },
    ])
  );

  // ── cost roll-up ──────────────────────────────────────────────────────────
  const missingPriceCategories = new Set<string>();
  const rollup = (recipe: Record<string, string | null> | null, volume: number) => {
    const lines: { material: string; kgPerM3: number; sarPerTonne: number; costSarPerM3: number }[] = [];
    let perM3 = 0;
    for (const c of RECIPE_MATERIALS) {
      const amount = Number(recipe?.[c.category] ?? 0) || 0;
      if (amount <= 0) continue;
      // Litres are treated as kilograms (~1 kg/l), the usual approximation for
      // water and liquid admixtures.
      const kgPerM3 = amount;
      const sarPerTonne = priceByCategory.get(c.category) ?? 0;
      if (sarPerTonne <= 0) missingPriceCategories.add(c.category);
      const costPerM3 = (kgPerM3 / 1000) * sarPerTonne;
      perM3 += costPerM3;
      lines.push({
        material: c.category,
        kgPerM3: round2(kgPerM3),
        sarPerTonne: round2(sarPerTonne),
        costSarPerM3: round2(costPerM3),
      });
    }
    return { materialCostSarPerM3: round2(perM3), materialCostSar: round2(perM3 * volume), lines };
  };

  const items = orderRows.map((o) => {
    const volume = Number(o.volumeM3) || 0;
    const { materialCostSarPerM3, materialCostSar, lines } = rollup(
      o.recipe as Record<string, string | null> | null,
      volume
    );
    const transport = transportByOrder.get(o.orderId);
    const transportCents = transport ? transport.transportCostSar : 0;
    // Trips with no recorded delivery cost: the report must say so rather than
    // quietly showing a margin that ignores transport.
    const uncostedTrips = transport
      ? Math.max(0, Math.round(transport.volumeDeliveredM3 / (volume || 1)) - (transportCents > 0 ? 1 : 0))
      : 0;
    const revenueSar = (Number(o.pricePerM3Sar) || 0) * volume; // price is SAR cents/m³
    const totalCostSar = materialCostSar + transportCents / 100;
    const marginSar = revenueSar / 100 - totalCostSar;
    return {
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      scheduledDate: o.scheduledDate,
      status: o.status,
      client: { id: o.clientId, name: o.clientName },
      mix: { id: o.mixDesignId, code: o.designCode, grade: o.grade },
      volumeM3: round2(volume),
      revenueSar: round2(revenueSar / 100),
      materialCostSar: round2(materialCostSar),
      transportCostSar: round2(transportCents / 100),
      transportIsCosted: transportCents > 0,
      uncostedTrips: uncostedTrips || undefined,
      totalCostSar: round2(totalCostSar),
      marginSar: round2(marginSar),
      marginPerM3: round2(marginSar / (volume || 1)),
      marginPct:
        revenueSar > 0 ? round2((marginSar / (revenueSar / 100)) * 100) : 0,
      costBreakdown: lines,
    };
  });

  // ── grouping ──────────────────────────────────────────────────────────────
  const groupRows = (key: "mix" | "client") => {
    const map = new Map<
      string,
      { label: string; volumeM3: number; revenueSar: number; totalCostSar: number; marginSar: number; orders: number }
    >();
    for (const it of items) {
      const id = key === "mix" ? it.mix.id : it.client.id;
      const label = key === "mix"
        ? `${it.mix.code ?? "—"} ${it.mix.grade ?? ""}`.trim()
        : it.client.name ?? "—";
      const row = map.get(id) ?? {
        label,
        volumeM3: 0,
        revenueSar: 0,
        totalCostSar: 0,
        marginSar: 0,
        orders: 0,
      };
      row.volumeM3 += it.volumeM3;
      row.revenueSar += it.revenueSar;
      row.totalCostSar += it.totalCostSar;
      row.marginSar += it.marginSar;
      row.orders += 1;
      map.set(id, row);
    }
    return [...map.entries()]
      .map(([id, r]) => ({
        id,
        label: r.label,
        orders: r.orders,
        volumeM3: round2(r.volumeM3),
        revenueSar: round2(r.revenueSar),
        totalCostSar: round2(r.totalCostSar),
        marginSar: round2(r.marginSar),
        marginPerM3: round2(r.marginSar / (r.volumeM3 || 1)),
        marginPct: r.revenueSar > 0 ? round2((r.marginSar / r.revenueSar) * 100) : 0,
      }))
      .sort((a, b) => b.marginSar - a.marginSar);
  };

  const totals: {
    volumeM3: number;
    revenueSar: number;
    materialCostSar: number;
    transportCostSar: number;
    marginSar: number;
    marginPerM3: number;
    marginPct: number;
  } = items.reduce(
    (acc, it) => {
      acc.volumeM3 += it.volumeM3;
      acc.revenueSar += it.revenueSar;
      acc.materialCostSar += it.materialCostSar;
      acc.transportCostSar += it.transportCostSar;
      acc.marginSar += it.marginSar;
      return acc;
    },
    { volumeM3: 0, revenueSar: 0, materialCostSar: 0, transportCostSar: 0, marginSar: 0, marginPerM3: 0, marginPct: 0 }
  );
  totals.marginPerM3 = round2(totals.marginSar / (totals.volumeM3 || 1));
  totals.marginPct = totals.revenueSar > 0 ? round2((totals.marginSar / totals.revenueSar) * 100) : 0;
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
    if (k !== "marginPerM3" && k !== "marginPct") totals[k] = round2(totals[k]);
  }

  return successResponse({
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    totals,
    items: q.groupBy ? undefined : items,
    byMix: q.groupBy === "mix" ? groupRows("mix") : undefined,
    byClient: q.groupBy === "client" ? groupRows("client") : undefined,
    dataQuality: {
      /** materials with no silo cost configured — the report is incomplete for these */
      missingMaterialPrices: [...missingPriceCategories],
      /** true when no trip in the range recorded a delivery cost (see trips.transport_cost_sar) */
      transportNotCosted: items.every((it) => it.transportIsCosted === false),
      pricedMaterials: [...priceByCategory.entries()]
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ material: k, sarPerTonne: v })),
    },
  });
}
