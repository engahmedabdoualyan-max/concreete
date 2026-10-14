/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Customer Portal Service (Epic 2 — Competitive Parity)
 * ============================================================
 *
 *  Passwordless magic-link portal (Jonel Load Tracking /
 *  Dispatch360 portal parity):
 *    SCOPE=ORDER  → one delivery: live timeline + ticket + statement
 *    SCOPE=CLIENT → customer home: all orders + statements + balance
 *
 *  Tokens are random 22-char strings (NOT sequential, NOT UUIDs),
 *  expirable, revocable and view-counted. The public endpoint
 *  requires no login — the token is the credential.
 * ============================================================
 */

import { randomBytes } from "node:crypto";
import { db, withDbRetry } from "@/db";
import { predictEtaMinutes } from "./dispatch-optimization.service";
import { getTripTelemetry } from "./telematics.service";
import {
  shareTokens,
  orders,
  trips,
  tripCheckpoints,
  clients,
  deliverySites,
  mixDesigns,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export type ShareScope = "ORDER" | "CLIENT";

function newToken(): string {
  return randomBytes(16).toString("base64url"); // 22 unguessable chars
}

export function portalBaseUrl(): string {
  return (
    process.env.PUBLIC_PORTAL_BASE_URL ?? "https://concrete.fimtosoft.com/#/track"
  );
}

export function portalLink(token: string): string {
  const base = portalBaseUrl().replace(/\/$/, "");
  return `${base}/${token}`;
}

// ─── Token issuance (authenticated staff only) ────────────────────────────────

export async function createShareToken(
  tenantId: string,
  userId: string,
  input: {
    scope: ShareScope;
    orderId?: string;
    clientId?: string;
    expiresInDays?: number;
    label?: string;
  }
) {
  if (input.scope === "ORDER") {
    if (!input.orderId) return null;
    const own = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.tenantId, tenantId)))
      .limit(1);
    if (!own[0]) return null;
  } else {
    if (!input.clientId) return null;
    const own = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, tenantId)))
      .limit(1);
    if (!own[0]) return null;
  }

  const days = Math.min(365, Math.max(1, input.expiresInDays ?? 30));
  const [row] = await db
    .insert(shareTokens)
    .values({
      tenantId,
      scope: input.scope,
      orderId: input.scope === "ORDER" ? input.orderId : null,
      clientId: input.scope === "CLIENT" ? input.clientId : null,
      token: newToken(),
      expiresAt: new Date(Date.now() + days * 86_400_000),
      label: input.label,
      createdById: userId,
    })
    .returning();

  return { ...row, link: portalLink(row.token) };
}

export async function revokeShareToken(tenantId: string, token: string) {
  const [row] = await db
    .update(shareTokens)
    .set({ isRevoked: true })
    .where(and(eq(shareTokens.token, token), eq(shareTokens.tenantId, tenantId)))
    .returning({ token: shareTokens.token });
  return !!row;
}

export async function listShareTokens(tenantId: string) {
  return db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.tenantId, tenantId))
    .orderBy(desc(shareTokens.createdAt))
    .limit(100);
}

// ─── Public resolution (NO auth — token is the credential) ────────────────────

async function consumeView(tokenId: string) {
  await db
    .update(shareTokens)
    .set({
      viewCount: sql`${shareTokens.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(shareTokens.id, tokenId));
}

export async function resolvePortalToken(token: string) {
  // A pure read, so a dropped pooled connection is safe to retry once. Without
  // it a customer occasionally saw "link invalid" during a server cold start.
  return withDbRetry(() => resolvePortalTokenOnce(token), "portal.resolve-token");
}

async function resolvePortalTokenOnce(token: string) {
  const rows = await db
    .select()
    .from(shareTokens)
    .where(and(eq(shareTokens.token, token), eq(shareTokens.isRevoked, false)))
    .limit(1);
  const share = rows[0];
  if (!share) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    return null;
  }

  // Count the view (best-effort, never blocks the response)
  void consumeView(share.id).catch(() => {});

  if (share.scope === "ORDER" && share.orderId) {
    const data = await getOrderPortal(share.tenantId, share.orderId);
    if (!data) return null;
    return { scope: "ORDER" as const, ...data };
  }
  if (share.scope === "CLIENT" && share.clientId) {
    const data = await getClientPortal(share.tenantId, share.clientId);
    if (!data) return null;
    return { scope: "CLIENT" as const, ...data };
  }
  return null;
}

// ─── Portal payloads (public-safe: NO internal costs, NO staff names) ─────────

const CHECKPOINT_LABELS: Record<string, { ar: string; en: string; emoji: string }> = {
  ARR_PLANT: { ar: "وصول المحطة", en: "At plant", emoji: "🏭" },
  ARR_BSTC: { ar: "التعبئة", en: "Loading", emoji: "📥" },
  DEP_PLANT: { ar: "انطلاق للموقع", en: "Departed", emoji: "🚚" },
  ARR_SITE: { ar: "وصول الموقع", en: "At site", emoji: "📍" },
  POUR_START: { ar: "بدء الصب", en: "Pouring", emoji: "💧" },
  DEP_SITE: { ar: "انتهاء الصب", en: "Finished", emoji: "✅" },
  RETURN_PLANT: { ar: "عودة للمصنع", en: "Returned", emoji: "🔄" },
};

async function getOrderPortal(tenantId: string, orderId: string) {
  const o = await db
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Cents: orders.pricePerM3Sar,
      scheduledDate: orders.scheduledDate,
      companyName: clients.companyName,
      siteName: deliverySites.siteName,
      city: deliverySites.city,
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
    })
    .from(orders)
    .innerJoin(
      clients,
      and(eq(orders.clientId, clients.id), eq(clients.tenantId, tenantId))
    )
    .innerJoin(
      deliverySites,
      and(
        eq(orders.deliverySiteId, deliverySites.id),
        eq(deliverySites.tenantId, tenantId)
      )
    )
    .innerJoin(
      mixDesigns,
      and(eq(orders.mixDesignId, mixDesigns.id), eq(mixDesigns.tenantId, tenantId))
    )
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  const order = o[0];
  if (!order) return null;

  const tripRows = await db
    .select({
      id: trips.id,
      tripNumber: trips.tripNumber,
      loadedVolumeM3: trips.loadedVolumeM3,
      currentCheckpoint: trips.currentCheckpoint,
      deliveryTicketNumber: trips.deliveryTicketNumber,
      isCompleted: trips.isCompleted,
      createdAt: trips.createdAt,
      signatureImage: trips.signatureImage,
      signedBy: trips.signedBy,
      signedAt: trips.signedAt,
    })
    .from(trips)
    .where(and(eq(trips.orderId, orderId), eq(trips.tenantId, tenantId)))
    .orderBy(trips.createdAt);

  const tripsWithTimeline = await Promise.all(
    tripRows.map(async (t) => {
      const cps = await db
        .select({
          checkpoint: tripCheckpoints.checkpoint,
          loggedAt: tripCheckpoints.loggedAt,
        })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, t.id),
            eq(tripCheckpoints.tenantId, tenantId)
          )
        )
        .orderBy(tripCheckpoints.loggedAt);
      // Live ETA for trucks still rolling (Epic 4)
      let predictedEtaMinutes: number | null = null;
      let etaBasis: string | null = null;
      if (["DEP_PLANT", "ARR_BSTC", "ARR_PLANT"].includes(t.currentCheckpoint)) {
        try {
          const eta = await predictEtaMinutes(tenantId, t.id);
          if (eta) {
            predictedEtaMinutes = eta.etaMinutes;
            etaBasis = eta.basis;
          }
        } catch {
          // ETA is a bonus — portal must render regardless
        }
      }
      // Drum QA snapshot (Epic 5) — aggregates only, no raw series
      let drum: {
        avgRpm: number | null;
        maxTempC: number | null;
        rotationStops: number;
        workability: string;
        remainingMinutes: number | null;
      } | null = null;
      try {
        const tele = await getTripTelemetry(tenantId, t.id, 60);
        if (tele && tele.aggregate.count > 0) {
          drum = {
            avgRpm: tele.aggregate.avgRpm,
            maxTempC: tele.aggregate.maxTempC,
            rotationStops: tele.aggregate.rotationStops,
            workability: tele.workability.status,
            remainingMinutes: tele.workability.remainingMinutes,
          };
        }
      } catch {
        // Telemetry is a bonus — portal must render regardless
      }
      return {
        ...t,
        predictedEtaMinutes,
        etaBasis,
        drum,
        timeline: cps.map((c) => ({
          ...c,
          ...(CHECKPOINT_LABELS[c.checkpoint] ?? {
            ar: c.checkpoint,
            en: c.checkpoint,
            emoji: "•",
          }),
        })),
      };
    })
  );

  const totalM3 = Number(order.totalVolumeM3 ?? 0);
  const remainingM3 = Number(order.remainingVolumeM3 ?? 0);
  const deliveredM3 = Math.max(0, totalM3 - remainingM3);
  const priceSar = (order.pricePerM3Cents ?? 0) / 100;
  const deliveredValueSar = Math.round(deliveredM3 * priceSar * 100) / 100;
  const totalValueSar = Math.round(totalM3 * priceSar * 100) / 100;

  return {
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      clientName: order.companyName,
      siteName: order.siteName,
      city: order.city,
      mix: `${order.designCode} — ${order.gradeDescription}`,
      scheduledDate: order.scheduledDate,
      totalM3,
      deliveredM3,
      remainingM3,
      progressPct: totalM3 > 0 ? Math.round((deliveredM3 / totalM3) * 100) : 0,
    },
    statement: {
      pricePerM3Sar: priceSar,
      deliveredValueSar,
      totalValueSar,
      currency: "SAR",
    },
    trips: tripsWithTimeline,
  };
}

async function getClientPortal(tenantId: string, clientId: string) {
  const c = await db
    .select({
      companyName: clients.companyName,
      creditLimitCents: clients.creditLimitSar,
      outstandingCents: clients.outstandingBalanceSar,
    })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  const client = c[0];
  if (!client) return null;

  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Cents: orders.pricePerM3Sar,
      scheduledDate: orders.scheduledDate,
      siteName: deliverySites.siteName,
      city: deliverySites.city,
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
    })
    .from(orders)
    .innerJoin(
      deliverySites,
      and(
        eq(orders.deliverySiteId, deliverySites.id),
        eq(deliverySites.tenantId, tenantId)
      )
    )
    .innerJoin(
      mixDesigns,
      and(eq(orders.mixDesignId, mixDesigns.id), eq(mixDesigns.tenantId, tenantId))
    )
    .where(and(eq(orders.clientId, clientId), eq(orders.tenantId, tenantId)))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  const statements = orderRows.map((o) => {
    const totalM3 = Number(o.totalVolumeM3 ?? 0);
    const remainingM3 = Number(o.remainingVolumeM3 ?? 0);
    const deliveredM3 = Math.max(0, totalM3 - remainingM3);
    const priceSar = (o.pricePerM3Cents ?? 0) / 100;
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      siteName: o.siteName,
      city: o.city ?? null,
      mix: o.designCode,
      // The customer asks "which mix and how much is left" more than anything
      // else, so both belong in the public payload.
      gradeDescription: o.gradeDescription ?? null,
      scheduledDate: o.scheduledDate,
      totalM3,
      remainingM3,
      deliveredM3,
      pricePerM3Sar: priceSar,
      deliveredValueSar: Math.round(deliveredM3 * priceSar * 100) / 100,
      totalValueSar: Math.round(totalM3 * priceSar * 100) / 100,
    };
  });

  const totalBilledSar =
    Math.round(statements.reduce((s, x) => s + x.deliveredValueSar, 0) * 100) / 100;

  // The order form needs the customer's own sites and the plant's active mixes.
  // Both are public-safe: a site name and a concrete grade are what the customer
  // already knows, and nothing internal (cost, staff, margin) is included.
  const siteRows = await db
    .select({
      id: deliverySites.id,
      siteName: deliverySites.siteName,
      city: deliverySites.city,
    })
    .from(deliverySites)
    .where(
      and(
        eq(deliverySites.tenantId, tenantId),
        eq(deliverySites.clientId, clientId),
        eq(deliverySites.isActive, true)
      )
    )
    .orderBy(deliverySites.siteName);

  const mixRows = await db
    .select({
      id: mixDesigns.id,
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
      targetSlumpCm: mixDesigns.targetSlumpCm,
    })
    .from(mixDesigns)
    .where(and(eq(mixDesigns.tenantId, tenantId), eq(mixDesigns.isActive, true)))
    .orderBy(mixDesigns.designCode);

  return {
    client: {
      companyName: client.companyName,
      creditLimitSar: (client.creditLimitCents ?? 0) / 100,
      outstandingSar: (client.outstandingCents ?? 0) / 100,
    },
    summary: {
      ordersCount: statements.length,
      totalBilledSar,
      currency: "SAR",
    },
    statements,
    sites: siteRows.map((r) => ({
      id: r.id,
      siteName: r.siteName,
      city: r.city ?? null,
    })),
    mixDesigns: mixRows.map((r) => ({
      id: r.id,
      designCode: r.designCode,
      gradeDescription: r.gradeDescription ?? null,
      targetSlumpCm: r.targetSlumpCm ? Number(r.targetSlumpCm) : null,
    })),
  };
}
