/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  RFQ Quoting + Sales Commissions (Epic 8 — Competitive Parity)
 * ============================================================
 *
 *  Enforced-margin quoting (D4A / MAS parity):
 *   • RFQ: DRAFT → SUBMITTED → COSTED → APPROVED → CONVERTED
 *   • Costing: auto material estimate from silo costs × mix BOM
 *     + manual haul/pump/overhead → total → margin → FLOOR price
 *   • APPROVE is BLOCKED below floor — no under-priced order
 *     can ever leave the system.
 *   • CONVERTED creates PENDING_FINANCE orders (finance gate intact).
 *
 *  Commissions: named % schemes on delivered revenue, computed
 *  per rep/period, stored PENDING → APPROVED → PAID.
 * ============================================================
 */

import { db } from "@/db";
import {
  rfqs,
  rfqItems,
  commissionSchemes,
  salesCommissions,
  mixDesigns,
  inventorySilos,
  clients,
  orders,
  deliverySites,
  users,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export type RfqStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "COSTED"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "EXPIRED";

// ─── Auto material estimate (mix BOM × silo costs) ────────────────────────────

const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Average SAR/tonne per material category across active silos. */
async function siloCostMap(tenantId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      category: inventorySilos.materialCategory,
      cost: inventorySilos.costSarPerTonne,
    })
    .from(inventorySilos)
    .where(
      and(eq(inventorySilos.tenantId, tenantId), eq(inventorySilos.isActive, true))
    );
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    const c = num(r.cost);
    if (c <= 0) continue;
    const cur = sums.get(r.category) ?? { total: 0, n: 0 };
    cur.total += c;
    cur.n += 1;
    sums.set(r.category, cur);
  }
  const avg = new Map<string, number>();
  for (const [k, v] of sums) avg.set(k, v.total / v.n);
  return avg;
}

export async function estimateMaterialCostPerM3(
  tenantId: string,
  mixDesignId: string
): Promise<{ estimateSar: number; breakdown: Record<string, number> }> {
  const m = await db
    .select()
    .from(mixDesigns)
    .where(and(eq(mixDesigns.id, mixDesignId), eq(mixDesigns.tenantId, tenantId)))
    .limit(1);
  const mix = m[0];
  if (!mix) throw new Error("Mix design not found");

  const costs = await siloCostMap(tenantId);
  const perKg = (cat: string): number => (costs.get(cat) ?? 0) / 1000;
  const perLitre = (cat: string): number => (costs.get(cat) ?? 0) / 1000; // ≈1 kg/L

  const breakdown: Record<string, number> = {
    cement: num(mix.cementKgPerM3) * perKg("CEMENT"),
    sand: num(mix.sandKgPerM3) * perKg("SAND"),
    gravel10: num(mix.gravel10mmKgPerM3) * perKg("GRAVEL_10MM"),
    gravel20: num(mix.gravel20mmKgPerM3) * perKg("GRAVEL_20MM"),
    gravel40: num(mix.gravel40mmKgPerM3) * perKg("GRAVEL_40MM"),
    water: num(mix.waterLitresPerM3) * perLitre("WATER"),
    plasticizer: num(mix.admixturePlasiticzerLPerM3) * perLitre("ADMIXTURE_PLASTICIZER"),
    retarder: num(mix.admixtureRetarderLPerM3) * perLitre("ADMIXTURE_RETARDER"),
    flyAsh: num(mix.flyAshKgPerM3) * perKg("FLY_ASH"),
    silicaFume: num(mix.silicaFumeKgPerM3) * perKg("SILICA_FUME"),
  };
  const estimateSar =
    Math.round(Object.values(breakdown).reduce((s, v) => s + v, 0) * 100) / 100;
  return { estimateSar, breakdown };
}

// ─── RFQ CRUD ─────────────────────────────────────────────────────────────────

export async function listRfqs(tenantId: string, status?: string) {
  const where = status
    ? and(eq(rfqs.tenantId, tenantId), eq(rfqs.status, status))
    : eq(rfqs.tenantId, tenantId);
  const rows = await db
    .select({
      id: rfqs.id,
      rfqNumber: rfqs.rfqNumber,
      clientId: rfqs.clientId,
      companyName: clients.companyName,
      status: rfqs.status,
      validUntil: rfqs.validUntil,
      createdAt: rfqs.createdAt,
    })
    .from(rfqs)
    .innerJoin(clients, eq(rfqs.clientId, clients.id))
    .where(where)
    .orderBy(desc(rfqs.createdAt));
  return rows;
}

export async function getRfq(tenantId: string, rfqId: string) {
  const rows = await db
    .select()
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return null;
  const items = await db
    .select({
      id: rfqItems.id,
      mixDesignId: rfqItems.mixDesignId,
      designCode: mixDesigns.designCode,
      volumeM3: rfqItems.volumeM3,
      materialCostPerM3: rfqItems.materialCostPerM3,
      haulCostPerM3: rfqItems.haulCostPerM3,
      pumpCostPerM3: rfqItems.pumpCostPerM3,
      overheadCostPerM3: rfqItems.overheadCostPerM3,
      totalCostPerM3: rfqItems.totalCostPerM3,
      marginPct: rfqItems.marginPct,
      floorPricePerM3: rfqItems.floorPricePerM3,
      quotedPricePerM3: rfqItems.quotedPricePerM3,
    })
    .from(rfqItems)
    .innerJoin(mixDesigns, eq(rfqItems.mixDesignId, mixDesigns.id))
    .where(and(eq(rfqItems.rfqId, rfqId), eq(rfqItems.tenantId, tenantId)));
  return { ...rows[0], items };
}

export async function createRfq(
  tenantId: string,
  userId: string,
  input: {
    clientId: string;
    deliverySiteId?: string;
    notes?: string;
    validUntil?: string;
    items: { mixDesignId: string; volumeM3: number }[];
  }
) {
  const count = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(rfqs)
    .where(eq(rfqs.tenantId, tenantId));
  const seq = ((count[0]?.count ?? 0) + 1).toString().padStart(5, "0");
  const rfqNumber = `RFQ-${new Date().getFullYear()}-${seq}`;

  const [rfq] = await db
    .insert(rfqs)
    .values({
      tenantId,
      rfqNumber,
      clientId: input.clientId,
      deliverySiteId: input.deliverySiteId || null,
      notes: input.notes,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      requestedById: userId,
      createdById: userId,
    })
    .returning();

  for (const it of input.items) {
    await db.insert(rfqItems).values({
      tenantId,
      rfqId: rfq.id,
      mixDesignId: it.mixDesignId,
      volumeM3: String(it.volumeM3),
    });
  }

  return getRfq(tenantId, rfq.id);
}

export async function deleteRfq(tenantId: string, rfqId: string) {
  const deleted = await db
    .delete(rfqs)
    .where(
      and(eq(rfqs.id, rfqId), eq(rfqs.tenantId, tenantId), eq(rfqs.status, "DRAFT"))
    )
    .returning({ id: rfqs.id });
  return deleted.length > 0;
}

// ─── Items + costing ──────────────────────────────────────────────────────────

export async function addRfqItem(
  tenantId: string,
  rfqId: string,
  input: { mixDesignId: string; volumeM3: number }
) {
  const rfq = await db
    .select({ status: rfqs.status })
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.tenantId, tenantId)))
    .limit(1);
  if (!rfq[0] || rfq[0].status !== "DRAFT") {
    throw new Error("Items can only be added to DRAFT quotations");
  }
  const [item] = await db
    .insert(rfqItems)
    .values({
      tenantId,
      rfqId,
      mixDesignId: input.mixDesignId,
      volumeM3: String(input.volumeM3),
    })
    .returning();
  return item;
}

export async function updateRfqItem(
  tenantId: string,
  itemId: string,
  input: Partial<{
    volumeM3: number;
    materialCostPerM3: number;
    haulCostPerM3: number;
    pumpCostPerM3: number;
    overheadCostPerM3: number;
    marginPct: number;
    quotedPricePerM3: number;
    autoMaterial: boolean;
  }>
) {
  const rows = await db
    .select({ item: rfqItems, rfqStatus: rfqs.status })
    .from(rfqItems)
    .innerJoin(rfqs, eq(rfqItems.rfqId, rfqs.id))
    .where(and(eq(rfqItems.id, itemId), eq(rfqItems.tenantId, tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!["DRAFT", "SUBMITTED"].includes(row.rfqStatus)) {
    throw new Error("Costing is locked once the quote leaves estimation");
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.volumeM3 !== undefined) patch.volumeM3 = String(input.volumeM3);

  let material = input.materialCostPerM3;
  if (input.autoMaterial) {
    const est = await estimateMaterialCostPerM3(tenantId, row.item.mixDesignId);
    material = est.estimateSar;
  }
  if (material !== undefined) patch.materialCostPerM3 = String(material);
  if (input.haulCostPerM3 !== undefined) patch.haulCostPerM3 = String(input.haulCostPerM3);
  if (input.pumpCostPerM3 !== undefined) patch.pumpCostPerM3 = String(input.pumpCostPerM3);
  if (input.overheadCostPerM3 !== undefined)
    patch.overheadCostPerM3 = String(input.overheadCostPerM3);
  if (input.marginPct !== undefined) patch.marginPct = String(input.marginPct);
  if (input.quotedPricePerM3 !== undefined)
    patch.quotedPricePerM3 = String(input.quotedPricePerM3);

  // Recompute total + floor from the merged row
  const merged = {
    material: material ?? num(row.item.materialCostPerM3),
    haul: input.haulCostPerM3 ?? num(row.item.haulCostPerM3),
    pump: input.pumpCostPerM3 ?? num(row.item.pumpCostPerM3),
    overhead: input.overheadCostPerM3 ?? num(row.item.overheadCostPerM3),
    margin: input.marginPct ?? num(row.item.marginPct),
  };
  const total = merged.material + merged.haul + merged.pump + merged.overhead;
  const floor = total * (1 + merged.margin / 100);
  patch.totalCostPerM3 = String(Math.round(total * 100) / 100);
  patch.floorPricePerM3 = String(Math.round(floor * 100) / 100);

  const [updated] = await db
    .update(rfqItems)
    .set(patch)
    .where(eq(rfqItems.id, itemId))
    .returning();
  return updated;
}

export async function deleteRfqItem(tenantId: string, itemId: string) {
  const rows = await db
    .select({ rfqStatus: rfqs.status })
    .from(rfqItems)
    .innerJoin(rfqs, eq(rfqItems.rfqId, rfqs.id))
    .where(and(eq(rfqItems.id, itemId), eq(rfqItems.tenantId, tenantId)))
    .limit(1);
  if (!rows[0] || rows[0].rfqStatus !== "DRAFT") return false;
  await db.delete(rfqItems).where(eq(rfqItems.id, itemId));
  return true;
}

// ─── Status machine ───────────────────────────────────────────────────────────

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["COSTED", "REJECTED"],
  COSTED: ["APPROVED", "REJECTED"],
  APPROVED: ["CONVERTED"],
  REJECTED: [],
  CONVERTED: [],
  EXPIRED: [],
};

export async function transitionRfq(
  tenantId: string,
  userId: string,
  rfqId: string,
  action: "SUBMIT" | "MARK_COSTED" | "APPROVE" | "REJECT",
  rejectionReason?: string
) {
  const full = await getRfq(tenantId, rfqId);
  if (!full) return { ok: false as const, error: "RFQ_NOT_FOUND" };

  const target =
    action === "SUBMIT"
      ? "SUBMITTED"
      : action === "MARK_COSTED"
        ? "COSTED"
        : action === "APPROVE"
          ? "APPROVED"
          : "REJECTED";

  if (!TRANSITIONS[full.status]?.includes(target)) {
    return {
      ok: false as const,
      error: `Cannot move RFQ from ${full.status} to ${target}`,
    };
  }

  if (action === "SUBMIT" && full.items.length === 0) {
    return { ok: false as const, error: "Add at least one mix before submitting" };
  }

  if (action === "APPROVE") {
    // THE MARGIN GATE — no under-priced quote leaves the system
    const below = full.items.filter(
      (i) => num(i.quotedPricePerM3) < num(i.floorPricePerM3) - 0.005
    );
    if (below.length > 0) {
      return {
        ok: false as const,
        error: `Below floor price: ${below.map((i) => i.designCode).join(", ")}`,
      };
    }
  }

  const patch: Record<string, unknown> = { status: target, updatedAt: new Date() };
  if (action === "MARK_COSTED") {
    patch.costedById = userId;
    patch.costedAt = new Date();
  }
  if (action === "APPROVE") {
    patch.approvedById = userId;
    patch.approvedAt = new Date();
  }
  if (action === "REJECT") {
    patch.rejectionReason = rejectionReason ?? null;
  }

  const [updated] = await db
    .update(rfqs)
    .set(patch)
    .where(eq(rfqs.id, rfqId))
    .returning();

  await db.insert(auditLogs).values({
    tenantId,
    userId,
    action: `RFQ_${target}`,
    entityType: "rfq",
    entityId: rfqId,
    newState: { rfqNumber: full.rfqNumber, status: target },
  });

  return { ok: true as const, rfq: updated };
}

/** APPROVED → one PENDING_FINANCE order per item (finance gate intact). */
export async function convertRfq(
  tenantId: string,
  userId: string,
  rfqId: string,
  scheduledDate: string
) {
  const full = await getRfq(tenantId, rfqId);
  if (!full) return { ok: false as const, error: "RFQ_NOT_FOUND" };
  if (full.status !== "APPROVED") {
    return { ok: false as const, error: "Only APPROVED quotes can be converted" };
  }
  if (full.validUntil && new Date(full.validUntil).getTime() < Date.now()) {
    await db.update(rfqs).set({ status: "EXPIRED" }).where(eq(rfqs.id, rfqId));
    return { ok: false as const, error: "Quote expired — re-quote required" };
  }

  const count = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));
  let seq = (count[0]?.count ?? 0) + 1;
  const year = new Date().getFullYear();

  // RFQ may target the client generally — fall back to their first site
  let siteId = full.deliverySiteId;
  if (!siteId) {
    const firstSite = await db
      .select({ id: deliverySites.id })
      .from(deliverySites)
      .where(
        and(
          eq(deliverySites.tenantId, tenantId),
          eq(deliverySites.clientId, full.clientId),
          eq(deliverySites.isActive, true)
        )
      )
      .orderBy(deliverySites.createdAt)
      .limit(1);
    if (!firstSite[0]) {
      return { ok: false as const, error: "Client has no delivery site — add one first" };
    }
    siteId = firstSite[0].id;
  }

  const created: { orderId: string; orderNumber: string; designCode: string }[] = [];
  for (const item of full.items) {
    const orderNumber = `ORD-${year}-${String(seq++).padStart(5, "0")}`;
    const volume = num(item.volumeM3);
    const priceCents = Math.round(num(item.quotedPricePerM3) * 100);
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        tenantId,
        clientId: full.clientId,
        deliverySiteId: siteId,
        mixDesignId: item.mixDesignId,
        totalVolumeM3: volume.toFixed(2),
        remainingVolumeM3: volume.toFixed(2),
        pricePerM3Sar: priceCents,
        scheduledDate: new Date(scheduledDate),
        status: "PENDING_FINANCE",
        createdByRepId: full.requestedById ?? userId,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    created.push({ orderId: order.id, orderNumber: order.orderNumber, designCode: item.designCode });
  }

  await db
    .update(rfqs)
    .set({ status: "CONVERTED", updatedAt: new Date() })
    .where(eq(rfqs.id, rfqId));

  await db.insert(auditLogs).values({
    tenantId,
    userId,
    action: "RFQ_CONVERTED",
    entityType: "rfq",
    entityId: rfqId,
    newState: { rfqNumber: full.rfqNumber, orders: created.map((c) => c.orderNumber) },
  });

  return { ok: true as const, orders: created };
}

// ─── Commissions ──────────────────────────────────────────────────────────────

export async function listSchemes(tenantId: string) {
  return db
    .select()
    .from(commissionSchemes)
    .where(eq(commissionSchemes.tenantId, tenantId))
    .orderBy(desc(commissionSchemes.createdAt));
}

export async function createScheme(
  tenantId: string,
  userId: string,
  input: { name: string; ratePct: number; minDeliveredM3?: number }
) {
  const [created] = await db
    .insert(commissionSchemes)
    .values({
      tenantId,
      name: input.name,
      ratePct: String(input.ratePct),
      minDeliveredM3: String(input.minDeliveredM3 ?? 0),
      createdById: userId,
    })
    .returning();
  return created;
}

export async function updateScheme(
  tenantId: string,
  schemeId: string,
  input: Partial<{ name: string; ratePct: number; minDeliveredM3: number; isActive: boolean }>
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.ratePct !== undefined) patch.ratePct = String(input.ratePct);
  if (input.minDeliveredM3 !== undefined)
    patch.minDeliveredM3 = String(input.minDeliveredM3);
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const [updated] = await db
    .update(commissionSchemes)
    .set(patch)
    .where(and(eq(commissionSchemes.id, schemeId), eq(commissionSchemes.tenantId, tenantId)))
    .returning();
  return updated ?? null;
}

export async function deleteScheme(tenantId: string, schemeId: string) {
  const deleted = await db
    .delete(commissionSchemes)
    .where(and(eq(commissionSchemes.id, schemeId), eq(commissionSchemes.tenantId, tenantId)))
    .returning({ id: commissionSchemes.id });
  return deleted.length > 0;
}

/** Preview earnings: delivered orders in period × active scheme rate. */
export async function previewCommissions(
  tenantId: string,
  salesRepId: string,
  periodStart: string,
  periodEnd: string
) {
  const schemes = await db
    .select()
    .from(commissionSchemes)
    .where(and(eq(commissionSchemes.tenantId, tenantId), eq(commissionSchemes.isActive, true)))
    .orderBy(desc(commissionSchemes.createdAt))
    .limit(1);
  const scheme = schemes[0];
  if (!scheme) return { ok: false as const, error: "No active commission scheme" };

  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T23:59:59.999Z`);

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Cents: orders.pricePerM3Sar,
      status: orders.status,
      scheduledDate: orders.scheduledDate,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.createdByRepId, salesRepId)
      )
    );

  // Attribution rule (documented): orders scheduled inside the window that
  // have poured volume. Exact cash-collection attribution lives in finance.
  const inWindow = rows.filter((o) => {
    const t = new Date(o.scheduledDate).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });

  const lines = inWindow
    .map((o) => {
      const total = num(o.totalVolumeM3);
      const delivered = Math.max(0, total - num(o.remainingVolumeM3));
      const revenue = (delivered * (o.pricePerM3Cents ?? 0)) / 100;
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        deliveredM3: Math.round(delivered * 100) / 100,
        revenueSar: Math.round(revenue * 100) / 100,
      };
    })
    .filter((l) => l.deliveredM3 > 0.01);

  const totalDeliveredM3 = lines.reduce((s, l) => s + l.deliveredM3, 0);
  const totalRevenue = lines.reduce((s, l) => s + l.revenueSar, 0);
  const qualified = totalDeliveredM3 >= num(scheme.minDeliveredM3);
  const rate = qualified ? num(scheme.ratePct) : 0;

  return {
    ok: true as const,
    scheme: { id: scheme.id, name: scheme.name, ratePct: rate },
    totals: {
      ordersCount: lines.length,
      deliveredM3: Math.round(totalDeliveredM3 * 100) / 100,
      revenueSar: Math.round(totalRevenue * 100) / 100,
      qualified,
      commissionSar: Math.round(totalRevenue * (rate / 100) * 100) / 100,
    },
    lines: lines.map((l) => ({
      ...l,
      commissionSar: Math.round(l.revenueSar * (rate / 100) * 100) / 100,
    })),
  };
}

/** Persist preview lines as PENDING rows (dedupe by order+scheme). */
export async function approveCommissions(
  tenantId: string,
  userId: string,
  input: {
    salesRepId: string;
    schemeId: string;
    ratePct: number;
    period: string;
    lines: { orderId: string; revenueSar: number; commissionSar: number }[];
  }
) {
  let created = 0;
  for (const l of input.lines) {
    const existing = await db
      .select({ id: salesCommissions.id })
      .from(salesCommissions)
      .where(
        and(
          eq(salesCommissions.tenantId, tenantId),
          eq(salesCommissions.orderId, l.orderId),
          eq(salesCommissions.schemeId, input.schemeId)
        )
      )
      .limit(1);
    if (existing[0]) continue;
    await db.insert(salesCommissions).values({
      tenantId,
      salesRepId: input.salesRepId,
      orderId: l.orderId,
      schemeId: input.schemeId,
      period: input.period,
      basisRevenueSar: String(l.revenueSar),
      ratePct: String(input.ratePct),
      amountSar: String(l.commissionSar),
      approvedById: userId,
      approvedAt: new Date(),
    });
    created++;
  }
  return { created };
}

export async function listCommissions(
  tenantId: string,
  filters: { salesRepId?: string; period?: string; status?: string }
) {
  const conds = [eq(salesCommissions.tenantId, tenantId)];
  if (filters.salesRepId) conds.push(eq(salesCommissions.salesRepId, filters.salesRepId));
  if (filters.period) conds.push(eq(salesCommissions.period, filters.period));
  if (filters.status) conds.push(eq(salesCommissions.status, filters.status));

  return db
    .select({
      id: salesCommissions.id,
      salesRepId: salesCommissions.salesRepId,
      repName: users.fullName,
      orderId: salesCommissions.orderId,
      period: salesCommissions.period,
      basisRevenueSar: salesCommissions.basisRevenueSar,
      ratePct: salesCommissions.ratePct,
      amountSar: salesCommissions.amountSar,
      status: salesCommissions.status,
      createdAt: salesCommissions.createdAt,
    })
    .from(salesCommissions)
    .innerJoin(users, eq(salesCommissions.salesRepId, users.id))
    .where(and(...conds))
    .orderBy(desc(salesCommissions.createdAt))
    .limit(200);
}

export async function setCommissionStatus(
  tenantId: string,
  commissionId: string,
  status: "APPROVED" | "PAID"
) {
  const patch: Record<string, unknown> = {};
  if (status === "APPROVED") {
    // approveCommissions already stamps approval; this path re-approves PENDING rows
    patch.status = "APPROVED";
  } else {
    patch.status = "PAID";
    patch.paidAt = new Date();
  }
  const [updated] = await db
    .update(salesCommissions)
    .set(patch)
    .where(
      and(
        eq(salesCommissions.id, commissionId),
        eq(salesCommissions.tenantId, tenantId)
      )
    )
    .returning({ id: salesCommissions.id, status: salesCommissions.status });
  return updated ?? null;
}
