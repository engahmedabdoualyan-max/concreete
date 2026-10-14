/**
 * ============================================================
 *  /api/portal/requests — the staff side of customer self-service
 * ============================================================
 *  GET    /api/portal/requests — the queue (PENDING first)
 *
 *  Approving or rejecting lives in ./[requestId]/route.ts (PATCH).
 *
 *  WHY A QUEUE AND NOT A DIRECT EDIT
 *  A customer request arrives through a public magic link, so it is a request,
 *  never an instruction. Staff approve it, and approving a NEW_ORDER turns it
 *  into a real DRAFT order in the normal flow — it still has to pass the credit
 *  check and the finance gate like any other order. Nothing a customer does in
 *  the portal can put a plant into debt.
 *
 *  RBAC:
 *    GET   → ORDER_READ (sales, dispatcher, admin)
 *    PATCH → ORDER_CREATE + ORDER_APPROVE_FINANCE (a senior action: it creates
 *            an order and answers the customer)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  portalRequests,
  clients,
  orders,
  deliverySites,
  mixDesigns,
  users,
} from "@/db/schema";
import { requirePermission, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

// ─── GET: the queue ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const clientId = url.searchParams.get("clientId");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

  const conditions = [eq(portalRequests.tenantId, auth.user.tenantId)];
  if (statusFilter) conditions.push(eq(portalRequests.status, statusFilter as "PENDING"));
  if (clientId) conditions.push(eq(portalRequests.clientId, clientId));

  const rows = await db
    .select({
      id: portalRequests.id,
      type: portalRequests.requestType,
      status: portalRequests.status,
      orderId: portalRequests.orderId,
      orderNumber: orders.orderNumber,
      clientId: portalRequests.clientId,
      client: clients.companyName,
      volumeM3: portalRequests.requestedVolumeM3,
      date: portalRequests.requestedDate,
      site: deliverySites.siteName,
      mix: mixDesigns.designCode,
      grade: mixDesigns.gradeDescription,
      note: portalRequests.note,
      handledBy: users.fullName,
      handledAt: portalRequests.handledAt,
      decisionNote: portalRequests.decisionNote,
      createdAt: portalRequests.createdAt,
    })
    .from(portalRequests)
    .innerJoin(clients, eq(portalRequests.clientId, clients.id))
    .leftJoin(orders, eq(portalRequests.orderId, orders.id))
    .leftJoin(deliverySites, eq(portalRequests.deliverySiteId, deliverySites.id))
    .leftJoin(mixDesigns, eq(portalRequests.mixDesignId, mixDesigns.id))
    .leftJoin(users, eq(portalRequests.handledById, users.id))
    .where(and(...conditions))
    .orderBy(desc(portalRequests.createdAt))
    .limit(limit);

  const items = rows
    .map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      orderId: r.orderId,
      orderNumber: r.orderNumber ?? null,
      client: { id: r.clientId, name: r.client },
      volumeM3: r.volumeM3 ? Number(r.volumeM3) : null,
      date: r.date,
      site: r.site ?? null,
      mix: r.mix ? { code: r.mix, grade: r.grade ?? null } : null,
      note: r.note ?? null,
      handledBy: r.handledBy ?? null,
      handledAt: r.handledAt ?? null,
      decisionNote: r.decisionNote ?? null,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => {
      if (a.status === b.status) return +new Date(a.createdAt) - +new Date(b.createdAt);
      return a.status === "PENDING" ? -1 : 1;
    });

  return successResponse({
    items,
    counts: {
      pending: items.filter((i) => i.status === "PENDING").length,
      approved: items.filter((i) => i.status === "APPROVED").length,
      rejected: items.filter((i) => i.status === "REJECTED").length,
    },
  });
}
