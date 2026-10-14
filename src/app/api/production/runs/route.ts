import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  inventorySilos,
  inventoryTransactions,
  mixDesigns,
  productionRuns,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  Production runs (manual batching without a PLC link)
 *  GET  /api/production/runs — recent runs
 *  POST /api/production/runs — record a run, auto-consume silos
 * ============================================================
 *  Concrete: mixDesignId + volumeM3 required; the mix × volume explodes
 *  into CONSUMPTION transactions against the first active silo of each
 *  material category. Missing silos fail loudly (naming them) instead of
 *  silently running stock negative.
 *  Blocks: blockUnits with optional mix (consumes when a mix is given).
 */
const RunSchema = z.object({
  mixDesignId: z.string().uuid().optional(),
  volumeM3: z.number().nonnegative().max(10000).optional(),
  blockUnits: z.number().int().nonnegative().max(1000000).optional(),
  producedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),
});

const MIX_FIELDS: { col: string; cat: string }[] = [
  { col: "cementKgPerM3", cat: "CEMENT" },
  { col: "sandKgPerM3", cat: "SAND" },
  { col: "gravel10mmKgPerM3", cat: "GRAVEL_10MM" },
  { col: "gravel20mmKgPerM3", cat: "GRAVEL_20MM" },
  { col: "gravel40mmKgPerM3", cat: "GRAVEL_40MM" },
  { col: "waterLitresPerM3", cat: "WATER" },
  { col: "admixturePlasiticzerLPerM3", cat: "ADMIXTURE_PLASTICIZER" },
  { col: "admixtureRetarderLPerM3", cat: "ADMIXTURE_RETARDER" },
  { col: "flyAshKgPerM3", cat: "FLY_ASH" },
  { col: "silicaFumeKgPerM3", cat: "SILICA_FUME" },
];

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;
  const rows = await db
    .select({
      id: productionRuns.id,
      mixDesignId: productionRuns.mixDesignId,
      designCode: mixDesigns.designCode,
      volumeM3: productionRuns.volumeM3,
      blockUnits: productionRuns.blockUnits,
      producedAt: productionRuns.producedAt,
      notes: productionRuns.notes,
    })
    .from(productionRuns)
    .leftJoin(mixDesigns, eq(mixDesigns.id, productionRuns.mixDesignId))
    .where(eq(productionRuns.tenantId, auth.user.tenantId))
    .orderBy(desc(productionRuns.producedAt))
    .limit(200);
  return successResponse({ runs: rows }, `${rows.length} run(s)`);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_RECEIVE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid run payload", 400);
  const d = parsed.data;
  const vol = d.volumeM3 ?? 0;
  const units = d.blockUnits ?? 0;
  if (vol <= 0 && units <= 0)
    return errorResponse("VALIDATION_ERROR", "volumeM3 أو blockUnits مطلوب", 400);
  if (vol > 0 && !d.mixDesignId)
    return errorResponse("VALIDATION_ERROR", "الخلطة مطلوبة لتشغيل الخرسانة", 400);

  let mix: Record<string, unknown> | null = null;
  if (d.mixDesignId) {
    const [m] = await db
      .select()
      .from(mixDesigns)
      .where(and(eq(mixDesigns.id, d.mixDesignId), eq(mixDesigns.tenantId, auth.user.tenantId)))
      .limit(1);
    if (!m) return errorResponse("MIX_NOT_FOUND", "الخلطة غير موجودة", 404);
    mix = m as unknown as Record<string, unknown>;
  }

  // Resolve one active silo per material BEFORE writing anything.
  const needs: { cat: string; kg: number }[] = [];
  if (mix && vol > 0) {
    for (const f of MIX_FIELDS) {
      const perM3 = Number(mix[f.col] ?? 0);
      if (perM3 > 0) needs.push({ cat: f.cat, kg: perM3 * vol });
    }
  }
  const silos = await db
    .select({ id: inventorySilos.id, category: inventorySilos.materialCategory, stock: inventorySilos.currentStockKg, cap: inventorySilos.capacityKg })
    .from(inventorySilos)
    .where(and(eq(inventorySilos.tenantId, auth.user.tenantId), eq(inventorySilos.isActive, true)));
  const byCat = new Map<string, { id: string; stock: number; cap: number }>();
  for (const s of silos) {
    if (!byCat.has(s.category as string))
      byCat.set(s.category as string, { id: s.id, stock: Number(s.stock), cap: Number(s.cap) });
  }
  const missing = needs.filter((n) => !byCat.has(n.cat)).map((n) => n.cat);
  if (missing.length)
    return errorResponse("NO_SILO", `لا صومعة مسجلة لـ: ${missing.join("، ")} — سجل الصوامع أولاً`, 400);
  const short = needs.filter((n) => (byCat.get(n.cat)?.stock ?? 0) < n.kg);
  if (short.length)
    return errorResponse(
      "LOW_STOCK",
      `مخزون لا يكفي: ${short.map((n) => `${n.cat} (يلزم ${n.kg.toFixed(0)} كجم)`).join("، ")}`,
      409
    );

  const [run] = await db
    .insert(productionRuns)
    .values({
      tenantId: auth.user.tenantId,
      mixDesignId: d.mixDesignId ?? null,
      volumeM3: String(vol),
      blockUnits: units,
      producedAt: d.producedAt ? new Date(d.producedAt) : new Date(),
      notes: d.notes || null,
      createdById: auth.user.sub,
    })
    .returning({ id: productionRuns.id });

  for (const n of needs) {
    const s = byCat.get(n.cat)!;
    const balance = Math.max(0, s.stock - n.kg);
    await db.insert(inventoryTransactions).values({
      tenantId: auth.user.tenantId,
      siloId: s.id,
      transactionType: "CONSUMPTION",
      quantityKg: (-n.kg).toFixed(3),
      balanceAfterKg: balance.toFixed(3),
      referenceDoc: `RUN-${run.id.slice(0, 8)}`,
      performedById: auth.user.sub,
      notes: `تشغيل ${vol} م³`,
    });
    await db
      .update(inventorySilos)
      .set({ currentStockKg: balance.toFixed(3) })
      .where(eq(inventorySilos.id, s.id));
    s.stock = balance;
  }

  return successResponse({ id: run.id, consumed: needs.length }, "تم تسجيل التشغيل وخصم الصوامع", 201);
}
