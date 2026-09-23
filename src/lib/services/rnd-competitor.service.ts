/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Competitor Intelligence Service (المصانع المنافسة)
 * ============================================================
 *
 *  R&D tracks rival plants and compares grade-by-grade:
 *    THEIR mixes & prices  vs  OUR mixes & prices
 *
 *  Comparison output per product row:
 *    diffSar  = theirPrice - ourPrice   (positive → we are cheaper)
 *    diffPct  = diff / theirPrice * 100
 *    verdict  = "CHEAPER" | "EQUAL" | "PRICIER"
 * ============================================================
 */

import { db } from "@/db";
import {
  rndCompetitors,
  rndCompetitorProducts,
  mixDesigns,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

// ─── Competitors ──────────────────────────────────────────────────────────────

export async function listCompetitors(tenantId: string, activeOnly = true) {
  const where = activeOnly
    ? and(
        eq(rndCompetitors.tenantId, tenantId),
        eq(rndCompetitors.isActive, true)
      )
    : eq(rndCompetitors.tenantId, tenantId);
  return db
    .select()
    .from(rndCompetitors)
    .where(where)
    .orderBy(rndCompetitors.name);
}

export async function createCompetitor(
  tenantId: string,
  userId: string,
  input: {
    name: string;
    city?: string;
    phone?: string;
    email?: string;
    website?: string;
    notes?: string;
  }
) {
  const [created] = await db
    .insert(rndCompetitors)
    .values({
      tenantId,
      name: input.name,
      city: input.city,
      phone: input.phone,
      email: input.email,
      website: input.website,
      notes: input.notes,
      createdById: userId,
    })
    .returning();
  return created;
}

export async function updateCompetitor(
  tenantId: string,
  competitorId: string,
  input: Partial<{
    name: string;
    city: string;
    phone: string;
    email: string;
    website: string;
    notes: string;
    isActive: boolean;
  }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "city", "phone", "email", "website", "notes", "isActive"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const [updated] = await db
    .update(rndCompetitors)
    .set(patch)
    .where(
      and(
        eq(rndCompetitors.id, competitorId),
        eq(rndCompetitors.tenantId, tenantId)
      )
    )
    .returning();
  return updated ?? null;
}

export async function deleteCompetitor(tenantId: string, competitorId: string) {
  // Soft-delete: keeps price history, hides from active lists
  const [updated] = await db
    .update(rndCompetitors)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(rndCompetitors.id, competitorId),
        eq(rndCompetitors.tenantId, tenantId)
      )
    )
    .returning({ id: rndCompetitors.id });
  return !!updated;
}

// ─── Competitor Products (their mixes & prices vs ours) ───────────────────────

export async function listCompetitorProducts(
  tenantId: string,
  competitorId?: string
) {
  const where = competitorId
    ? and(
        eq(rndCompetitorProducts.tenantId, tenantId),
        eq(rndCompetitorProducts.competitorId, competitorId)
      )
    : eq(rndCompetitorProducts.tenantId, tenantId);

  const rows = await db
    .select({
      id: rndCompetitorProducts.id,
      competitorId: rndCompetitorProducts.competitorId,
      competitorName: rndCompetitors.name,
      grade: rndCompetitorProducts.grade,
      productName: rndCompetitorProducts.productName,
      theirPriceSar: rndCompetitorProducts.theirPriceSar,
      ourMixDesignId: rndCompetitorProducts.ourMixDesignId,
      ourMixCode: mixDesigns.designCode,
      ourPriceSar: rndCompetitorProducts.ourPriceSar,
      extrasNote: rndCompetitorProducts.extrasNote,
      observedAt: rndCompetitorProducts.observedAt,
      source: rndCompetitorProducts.source,
      notes: rndCompetitorProducts.notes,
      createdAt: rndCompetitorProducts.createdAt,
    })
    .from(rndCompetitorProducts)
    .innerJoin(
      rndCompetitors,
      eq(rndCompetitorProducts.competitorId, rndCompetitors.id)
    )
    .leftJoin(
      mixDesigns,
      eq(rndCompetitorProducts.ourMixDesignId, mixDesigns.id)
    )
    .where(where)
    .orderBy(rndCompetitors.name, rndCompetitorProducts.grade);

  return rows.map((r) => withVerdict(r));
}

export type PriceVerdict = "CHEAPER" | "EQUAL" | "PRICIER" | "UNKNOWN";

export function withVerdict<T extends { theirPriceSar: number; ourPriceSar: number }>(
  row: T
): T & { diffSar: number; diffPct: number; verdict: PriceVerdict } {
  const their = row.theirPriceSar ?? 0;
  const ours = row.ourPriceSar ?? 0;
  if (their <= 0 || ours <= 0) {
    return { ...row, diffSar: 0, diffPct: 0, verdict: "UNKNOWN" };
  }
  const diffSar = their - ours;
  const diffPct = Math.round((diffSar / their) * 1000) / 10;
  const verdict: PriceVerdict =
    diffSar > 0 ? "CHEAPER" : diffSar < 0 ? "PRICIER" : "EQUAL";
  return { ...row, diffSar, diffPct, verdict };
}

export async function createCompetitorProduct(
  tenantId: string,
  userId: string,
  input: {
    competitorId: string;
    grade: string;
    productName?: string;
    theirPriceSar: number;
    ourMixDesignId?: string;
    ourPriceSar: number;
    extrasNote?: string;
    observedAt?: string;
    source?: string;
    notes?: string;
  }
) {
  // Verify the competitor belongs to this tenant
  const comp = await db
    .select({ id: rndCompetitors.id })
    .from(rndCompetitors)
    .where(
      and(
        eq(rndCompetitors.id, input.competitorId),
        eq(rndCompetitors.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!comp[0]) return null;

  const [created] = await db
    .insert(rndCompetitorProducts)
    .values({
      tenantId,
      competitorId: input.competitorId,
      grade: input.grade,
      productName: input.productName,
      theirPriceSar: input.theirPriceSar,
      ourMixDesignId: input.ourMixDesignId || null,
      ourPriceSar: input.ourPriceSar,
      extrasNote: input.extrasNote,
      observedAt: input.observedAt ? new Date(input.observedAt) : null,
      source: input.source ?? "MARKET",
      notes: input.notes,
      createdById: userId,
    })
    .returning();
  return withVerdict(created);
}

export async function updateCompetitorProduct(
  tenantId: string,
  productId: string,
  input: Partial<{
    grade: string;
    productName: string;
    theirPriceSar: number;
    ourMixDesignId: string;
    ourPriceSar: number;
    extrasNote: string;
    observedAt: string;
    source: string;
    notes: string;
  }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.grade !== undefined) patch.grade = input.grade;
  if (input.productName !== undefined) patch.productName = input.productName;
  if (input.theirPriceSar !== undefined) patch.theirPriceSar = input.theirPriceSar;
  if (input.ourMixDesignId !== undefined)
    patch.ourMixDesignId = input.ourMixDesignId || null;
  if (input.ourPriceSar !== undefined) patch.ourPriceSar = input.ourPriceSar;
  if (input.extrasNote !== undefined) patch.extrasNote = input.extrasNote;
  if (input.observedAt !== undefined)
    patch.observedAt = input.observedAt ? new Date(input.observedAt) : null;
  if (input.source !== undefined) patch.source = input.source;
  if (input.notes !== undefined) patch.notes = input.notes;

  const [updated] = await db
    .update(rndCompetitorProducts)
    .set(patch)
    .where(
      and(
        eq(rndCompetitorProducts.id, productId),
        eq(rndCompetitorProducts.tenantId, tenantId)
      )
    )
    .returning();
  return updated ? withVerdict(updated) : null;
}

export async function deleteCompetitorProduct(
  tenantId: string,
  productId: string
) {
  const deleted = await db
    .delete(rndCompetitorProducts)
    .where(
      and(
        eq(rndCompetitorProducts.id, productId),
        eq(rndCompetitorProducts.tenantId, tenantId)
      )
    )
    .returning({ id: rndCompetitorProducts.id });
  return deleted.length > 0;
}

// ─── Comparison summary ───────────────────────────────────────────────────────

export async function getPriceComparison(tenantId: string, grade?: string) {
  const products = await listCompetitorProducts(tenantId);
  const filtered = grade
    ? products.filter((p) => p.grade.toUpperCase() === grade.toUpperCase())
    : products;

  const comparable = filtered.filter((p) => p.verdict !== "UNKNOWN");
  const cheaper = comparable.filter((p) => p.verdict === "CHEAPER").length;
  const pricier = comparable.filter((p) => p.verdict === "PRICIER").length;
  const equal = comparable.filter((p) => p.verdict === "EQUAL").length;

  // Per-grade market view: lowest rival price vs ours
  const byGrade = new Map<
    string,
    {
      grade: string;
      lowestRival: number;
      lowestRivalBy: string;
      ourPrice: number;
      rows: number;
    }
  >();
  for (const p of filtered) {
    const g = p.grade.toUpperCase();
    const cur = byGrade.get(g) ?? {
      grade: p.grade,
      lowestRival: Number.MAX_SAFE_INTEGER,
      lowestRivalBy: "",
      ourPrice: p.ourPriceSar,
      rows: 0,
    };
    if (p.theirPriceSar > 0 && p.theirPriceSar < cur.lowestRival) {
      cur.lowestRival = p.theirPriceSar;
      cur.lowestRivalBy = p.competitorName;
    }
    if (p.ourPriceSar > 0) cur.ourPrice = p.ourPriceSar;
    cur.rows += 1;
    byGrade.set(g, cur);
  }

  return {
    products: filtered,
    summary: {
      total: filtered.length,
      comparable: comparable.length,
      cheaper,
      pricier,
      equal,
    },
    byGrade: [...byGrade.values()].map((g) => ({
      ...g,
      lowestRival: g.lowestRival === Number.MAX_SAFE_INTEGER ? 0 : g.lowestRival,
    })),
  };
}
