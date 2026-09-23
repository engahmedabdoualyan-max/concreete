/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/orders — Sales Order Management
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/orders  — List orders (filtered by role automatically)
 *  POST /api/orders  — Create new order (Sales Rep / Admin only)
 *
 *  PIPELINE RULE:
 *  New orders are ALWAYS created with status = PENDING_FINANCE.
 *  They cannot be dispatched until Finance approves electronically.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  orders,
  clients,
  deliverySites,
  mixDesigns,
  users,
  auditLogs,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const clientId = url.searchParams.get("clientId");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "25"));
  const offset = (page - 1) * limit;

  const conditions = [];

  // Sales reps can only see their own orders
  if (auth.user.role === "SALES_REP") {
    conditions.push(eq(orders.createdByRepId, auth.user.sub));
  }

  if (statusFilter) {
    conditions.push(eq(orders.status, statusFilter as never));
  }

  if (clientId) {
    conditions.push(eq(orders.clientId, clientId));
  }

  const query = db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Sar: orders.pricePerM3Sar,
      scheduledDate: orders.scheduledDate,
      paperClearanceGranted: orders.paperClearanceGranted,
      financeApprovedAt: orders.financeApprovedAt,
      financeRejectionReason: orders.financeRejectionReason,
      createdAt: orders.createdAt,
      // Client
      companyName: clients.companyName,
      clientCode: clients.clientCode,
      // Site
      siteName: deliverySites.siteName,
      // Mix Design
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
      // Rep
      repName: users.fullName,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .innerJoin(mixDesigns, eq(orders.mixDesignId, mixDesigns.id))
    .innerJoin(users, eq(orders.createdByRepId, users.id))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    const result = await query.where(and(...conditions));
    return successResponse({ orders: result, page, limit });
  }

  const result = await query;
  return successResponse({ orders: result, page, limit });
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  deliverySiteId: z.string().uuid("Invalid delivery site ID"),
  mixDesignId: z.string().uuid("Invalid mix design ID"),
  totalVolumeM3: z.number().positive().max(5000, "Volume too large"),
  pricePerM3Sar: z.number().int().positive("Price must be positive integer (SAR cents)").optional(),
  // Accept both "YYYY-MM-DD" (mobile) and full ISO-8601 datetime; normalize to ISO.
  scheduledDate: z
    .string()
    .transform((v) => {
      const trimmed = v.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
      }
      return trimmed;
    })
    .pipe(z.string().datetime("Invalid scheduled date (ISO 8601 required)")),
  requestedPourRateM3PerHour: z.number().positive().max(100).optional(),
  specialInstructions: z.string().max(1000).optional(),
  ambientTempC: z.number().min(-10).max(60).optional(),
  ambientHumidityPct: z.number().min(0).max(100).optional(),
});

export async function POST(req: NextRequest) {
  // Sales reps and admins can create orders
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid order data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Verify client exists and is not blacklisted
  const clientRows = await db
    .select({
      id: clients.id,
      isBlacklisted: clients.isBlacklisted,
      isActive: clients.isActive,
      companyName: clients.companyName,
    })
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);

  if (clientRows.length === 0) {
    return errorResponse("CLIENT_NOT_FOUND", "Client not found", 404);
  }

  if (!clientRows[0].isActive) {
    return errorResponse("CLIENT_INACTIVE", "Client account is inactive", 422);
  }

  if (clientRows[0].isBlacklisted) {
    return errorResponse(
      "CLIENT_BLACKLISTED",
      `${clientRows[0].companyName} is blacklisted. New orders cannot be placed. Contact finance.`,
      403
    );
  }

  // Verify delivery site belongs to this client
  const siteRows = await db
    .select({ id: deliverySites.id, clientId: deliverySites.clientId })
    .from(deliverySites)
    .where(
      and(
        eq(deliverySites.id, parsed.data.deliverySiteId),
        eq(deliverySites.clientId, parsed.data.clientId)
      )
    )
    .limit(1);

  if (siteRows.length === 0) {
    return errorResponse("SITE_NOT_FOUND", "Delivery site not found or does not belong to this client", 404);
  }

  // Verify mix design is active
  const mixRows = await db
    .select({ id: mixDesigns.id, isActive: mixDesigns.isActive })
    .from(mixDesigns)
    .where(eq(mixDesigns.id, parsed.data.mixDesignId))
    .limit(1);

  if (mixRows.length === 0 || !mixRows[0].isActive) {
    return errorResponse("MIX_DESIGN_INVALID", "Mix design not found or inactive", 404);
  }

  // Generate order number
  const orderCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(orders)
    .where(eq(orders.tenantId, auth.user.tenantId));
  const orderSeq = (orderCount[0].count + 1).toString().padStart(5, "0");
  const year = new Date().getFullYear();
  const orderNumber = `ORD-${year}-${orderSeq}`;

  // Create the order — ALWAYS starts as PENDING_FINANCE
  const [newOrder] = await db
    .insert(orders)
    .values({
      orderNumber,
      tenantId: auth.user.tenantId,
      clientId: parsed.data.clientId,
      deliverySiteId: parsed.data.deliverySiteId,
      mixDesignId: parsed.data.mixDesignId,
      totalVolumeM3: parsed.data.totalVolumeM3.toFixed(2),
      remainingVolumeM3: parsed.data.totalVolumeM3.toFixed(2),
      pricePerM3Sar: parsed.data.pricePerM3Sar ?? 0,
      scheduledDate: new Date(parsed.data.scheduledDate),
      requestedPourRateM3PerHour: parsed.data.requestedPourRateM3PerHour?.toFixed(2),
      specialInstructions: parsed.data.specialInstructions,
      ambientTempC: parsed.data.ambientTempC?.toFixed(1),
      ambientHumidityPct: parsed.data.ambientHumidityPct?.toFixed(2),
      /** CRITICAL: Always PENDING_FINANCE — never skip the approval gate */
      status: "PENDING_FINANCE",
      createdByRepId: auth.user.sub,
    })
    .returning();

  // Audit log
  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "ORDER_CREATED",
    entityType: "orders",
    entityId: newOrder.id,
    newState: { orderNumber, status: "PENDING_FINANCE", createdBy: auth.user.fullName },
    socketEvent: "order:created",
  });

  // Tree-plane mirror (Epic 13 — best-effort, never blocks order flow)
  void import("@/lib/services/tree-sync.service")
    .then((m) => m.mirrorOrderById(auth.user.tenantId, newOrder.id))
    .catch(() => {});

  return successResponse(
    {
      id: newOrder.id,
      orderNumber,
      status: "PENDING_FINANCE",
      message:
        "Order submitted to Finance for approval. Production will begin only after electronic clearance.",
      socketBroadcast: {
        event: "order:created",
        rooms: ["finance"],
        payload: { orderId: newOrder.id, orderNumber, submittedBy: auth.user.fullName },
      },
    },
    `Order ${orderNumber} created and sent to Finance for review.`,
    201
  );
}
