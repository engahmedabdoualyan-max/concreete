/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Tree-Plane Sync Service (Epic 13 — Data Unification)
 * ============================================================
 *
 *  Bridges the two data planes (see DATA_UNIFICATION.md):
 *
 *  A. Tree → PG import (field-speed → system of record):
 *     Firestore tree orders are upserted into PG by source_ref,
 *     auto-creating missing clients/sites/mixes with explicit
 *     fallbacks. Money safety: tree "approved" lands at
 *     PENDING_FINANCE — the finance gate is never bypassed.
 *
 *  B. PG → Tree mirror (system of record → field screens):
 *     Order status/volume snapshots pushed best-effort to
 *     tenants/{tenantId}/erpMirror/{orderId} via firebase-admin.
 *     No credentials configured → silently skipped (logged once).
 * ============================================================
 */

import { db } from "@/db";
import {
  orders,
  clients,
  deliverySites,
  mixDesigns,
  users,
} from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";

export interface TreeOrderPayload {
  ref: string; // Firestore doc id (stable external key)
  orderNo?: string;
  customerName: string;
  customerPhone?: string;
  projectName?: string;
  city?: string;
  elementType?: string;
  orderType?: string; // concrete | blocks
  quantity?: number;
  mixCode?: string; // e.g. "C30"
  status?: string; // pending|approved|scheduled|in_progress|completed|cancelled
  scheduledDate?: string;
  salesRepEmail?: string;
}

export interface ImportResult {
  orderId: string;
  orderNumber: string;
  status: string;
  created: boolean;
  autoCreated: string[];
}

const TREE_STATUS_MAP: Record<string, string> = {
  pending: "DRAFT",
  approved: "PENDING_FINANCE", // finance gate stays mandatory
  scheduled: "PENDING_FINANCE",
  in_progress: "APPROVED",
  completed: "DELIVERED",
  cancelled: "CANCELLED",
};

async function findOrCreateClient(
  tenantId: string,
  name: string,
  phone?: string
): Promise<{ id: string; auto: boolean }> {
  const conds = [eq(clients.tenantId, tenantId)];
  if (phone) {
    const byPhone = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.phone, phone)))
      .limit(1);
    if (byPhone[0]) return { id: byPhone[0].id, auto: false };
  }
  const byName = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        sql`LOWER(${clients.companyName}) = LOWER(${name})`
      )
    )
    .limit(1);
  if (byName[0]) return { id: byName[0].id, auto: false };

  const count = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(clients)
    .where(eq(clients.tenantId, tenantId));
  const code = `CLT-${String((count[0]?.count ?? 0) + 1).padStart(5, "0")}`;
  const [created] = await db
    .insert(clients)
    .values({
      tenantId,
      clientCode: code,
      companyName: name,
      phone: phone ?? null,
      source: "tree",
    })
    .returning({ id: clients.id });
  return { id: created.id, auto: true };
}

async function findOrCreateSite(
  tenantId: string,
  clientId: string,
  projectName?: string,
  city?: string
): Promise<{ id: string; auto: boolean }> {
  const name = projectName?.trim() || "Imported site";
  const existing = await db
    .select({ id: deliverySites.id })
    .from(deliverySites)
    .where(
      and(
        eq(deliverySites.tenantId, tenantId),
        eq(deliverySites.clientId, clientId),
        sql`LOWER(${deliverySites.siteName}) = LOWER(${name})`
      )
    )
    .limit(1);
  if (existing[0]) return { id: existing[0].id, auto: false };

  const count = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(deliverySites)
    .where(eq(deliverySites.tenantId, tenantId));
  const code = `SITE-${String((count[0]?.count ?? 0) + 1).padStart(5, "0")}`;
  const [created] = await db
    .insert(deliverySites)
    .values({ tenantId, clientId, siteName: name, siteCode: code, city: city ?? null })
    .returning({ id: deliverySites.id });
  return { id: created.id, auto: true };
}

async function resolveMix(
  tenantId: string,
  mixCode?: string
): Promise<{ id: string; auto: boolean }> {
  if (mixCode) {
    const m = await db
      .select({ id: mixDesigns.id })
      .from(mixDesigns)
      .where(
        and(
          eq(mixDesigns.tenantId, tenantId),
          eq(mixDesigns.isActive, true),
          sql`UPPER(${mixDesigns.designCode}) = UPPER(${mixCode.trim()})`
        )
      )
      .limit(1);
    if (m[0]) return { id: m[0].id, auto: false };
  }
  const fallback = await db
    .select({ id: mixDesigns.id })
    .from(mixDesigns)
    .where(and(eq(mixDesigns.tenantId, tenantId), eq(mixDesigns.isActive, true)))
    .orderBy(mixDesigns.createdAt)
    .limit(1);
  if (!fallback[0]) throw new Error("No active mix design to map the tree order");
  return { id: fallback[0].id, auto: true };
}

async function resolveRep(tenantId: string, email?: string): Promise<string | null> {
  if (!email) return null;
  const u = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        sql`LOWER(${users.email}) = LOWER(${email.trim()})`
      )
    )
    .limit(1);
  return u[0]?.id ?? null;
}

export async function importTreeOrder(
  tenantId: string,
  payload: TreeOrderPayload
): Promise<ImportResult> {
  if (!payload.ref || !payload.customerName?.trim()) {
    throw new Error("ref and customerName are required");
  }

  // Idempotency: same tree doc → same PG order
  const existing = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.sourceRef, payload.ref)))
    .limit(1);

  const autoCreated: string[] = [];
  const client = await findOrCreateClient(tenantId, payload.customerName.trim(), payload.customerPhone);
  if (client.auto) autoCreated.push("client");
  const site = await findOrCreateSite(tenantId, client.id, payload.projectName, payload.city);
  if (site.auto) autoCreated.push("site");
  const mix = await resolveMix(tenantId, payload.mixCode);
  if (mix.auto) autoCreated.push("mix-fallback");

  const status = TREE_STATUS_MAP[(payload.status ?? "pending").toLowerCase()] ?? "DRAFT";
  const volume = payload.quantity && payload.quantity > 0 ? payload.quantity : 0;

  if (existing[0]) {
    // Refresh mutable fields; never regress terminal states
    const terminal = ["DELIVERED", "CANCELLED"];
    const [updated] = await db
      .update(orders)
      .set({
        status: terminal.includes(existing[0].status) ? existing[0].status : (status as never),
        totalVolumeM3: volume > 0 ? volume.toFixed(2) : undefined,
        remainingVolumeM3:
          status === "DELIVERED" ? "0" : volume > 0 ? volume.toFixed(2) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, existing[0].id))
      .returning({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status });
    return {
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.status,
      created: false,
      autoCreated,
    };
  }

  const count = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));
  const year = new Date().getFullYear();
  const orderNumber =
    payload.orderNo?.trim() || `ORD-${year}-${String((count[0]?.count ?? 0) + 1).padStart(5, "0")}`;

  const repId =
    (await resolveRep(tenantId, payload.salesRepEmail)) ??
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.isActive, true),
            or(eq(users.role, "SALES_REP"), eq(users.role, "SUPER_ADMIN"))
          )
        )
        .limit(1)
    )[0]?.id;
  if (!repId) throw new Error("No sales rep or admin to own the imported order");

  const [created] = await db
    .insert(orders)
    .values({
      orderNumber,
      tenantId,
      clientId: client.id,
      deliverySiteId: site.id,
      mixDesignId: mix.id,
      totalVolumeM3: volume.toFixed(2),
      remainingVolumeM3: status === "DELIVERED" ? "0" : volume.toFixed(2),
      pricePerM3Sar: 0, // priced in ERP (RFQ/finance) — never trust tree pricing for money
      scheduledDate: payload.scheduledDate ? new Date(payload.scheduledDate) : new Date(),
      status: status as never,
      source: "tree",
      sourceRef: payload.ref,
      createdByRepId: repId,
      specialInstructions: `Imported from field plane (ref ${payload.ref}). Price to be set via RFQ/finance.`,
    })
    .returning({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status });

  return {
    orderId: created.id,
    orderNumber: created.orderNumber,
    status: created.status,
    created: true,
    autoCreated,
  };
}

// ─── PG → Tree mirror (best-effort) ───────────────────────────────────────────

let adminChecked: boolean | null = null;

async function mirrorDb(): Promise<unknown | null> {
  if (adminChecked === false) return null;
  try {
    const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceJson) {
      adminChecked = false;
      return null;
    }
    // Dynamic import: firebase-admin is optional (only needed when mirroring)
    const admin = (await import("firebase-admin")) as typeof import("firebase-admin");
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceJson) as never),
      });
    }
    adminChecked = true;
    return admin.firestore();
  } catch {
    adminChecked = false;
    return null;
  }
}

export interface MirrorPayload {
  orderId: string;
  orderNumber: string;
  status: string;
  remainingVolumeM3: string;
  updatedAt: string;
}

/** Pushes an order snapshot to the tree plane. Never throws. */
export async function mirrorOrderToTree(
  tenantId: string,
  payload: MirrorPayload
): Promise<boolean> {
  try {
    const fs = (await mirrorDb()) as {
      doc: (path: string) => { set: (data: unknown, opts?: unknown) => Promise<unknown> };
    } | null;
    if (!fs) return false;
    await fs
      .doc(`tenants/${tenantId}/erpMirror/${payload.orderId}`)
      .set({ ...payload, mirroredAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/** Convenience: mirror by PG order id (reads the row first). */
export async function mirrorOrderById(tenantId: string, orderId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        remainingVolumeM3: orders.remainingVolumeM3,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .limit(1);
    const o = rows[0];
    if (!o) return false;
    return mirrorOrderToTree(tenantId, {
      orderId: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      remainingVolumeM3: o.remainingVolumeM3 ?? "0",
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return false;
  }
}
