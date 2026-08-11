/**
 * ============================================================
 *  /api/fleet/pump-sessions — PUMP Class Static Operation Hours
 * ============================================================
 *
 *  Concrete pumps are NOT on the 7-checkpoint delivery timeline.
 *  They are STATIC assets billed by operating hours at the client
 *  site. This route manages the full session lifecycle:
 *
 *    MOBILISING → SETUP → PUMPING ⇄ STANDBY → TEARDOWN → COMPLETED
 *
 *  POST  /api/fleet/pump-sessions        Open a new session
 *  PATCH /api/fleet/pump-sessions        Advance status / close & bill
 *  GET   /api/fleet/pump-sessions        List sessions + utilisation KPIs
 *
 *  Cost accounting honours `fleet_vehicles.is_external` so outsourced
 *  pump hire is reported separately from in-house CAPEX assets.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  pumpOperationLogs,
  fleetVehicles,
  deliverySites,
  orders,
  users,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requirePermission, requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { assertCapability, VehicleClassViolation } from "@/lib/vehicle-class";
import { z } from "zod";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── POST — open a pump session ───────────────────────────────────────────────

const OpenSchema = z.object({
  pumpVehicleId: z.string().uuid("Invalid pump vehicle ID"),
  deliverySiteId: z.string().uuid("Invalid delivery site ID"),
  orderId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.TRIP_CREATE,
    PERMISSIONS.FLEET_UPDATE,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = OpenSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid pump session payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const [pump] = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      vehicleClass: fleetVehicles.vehicleClass,
      isExternal: fleetVehicles.isExternal,
      hourlyRateSar: fleetVehicles.hourlyRateSar,
      currentStatus: fleetVehicles.currentStatus,
      externalVendorName: fleetVehicles.externalVendorName,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, parsed.data.pumpVehicleId))
    .limit(1);

  if (!pump) return errorResponse("NOT_FOUND", "Pump vehicle not found", 404);

  // ── CLASS GUARD: only PUMP class runs static operating sessions ──────────
  try {
    assertCapability(pump.vehicleClass, "staticOperationHours", pump.vehicleCode);
  } catch (err) {
    if (err instanceof VehicleClassViolation) {
      return errorResponse("VEHICLE_CLASS_VIOLATION", err.message, 409, {
        vehicleClass: err.vehicleClass,
        capability: err.capability,
      });
    }
    throw err;
  }

  if (["IN_WORKSHOP", "MAJOR_BREAKDOWN", "OUT_OF_SERVICE"].includes(pump.currentStatus)) {
    return errorResponse(
      "PUMP_UNAVAILABLE",
      `Pump ${pump.vehicleCode} is ${pump.currentStatus} and cannot be dispatched.`,
      409
    );
  }

  // Prevent double-booking an active pump
  const [openSession] = await db
    .select({ sessionNumber: pumpOperationLogs.sessionNumber })
    .from(pumpOperationLogs)
    .where(
      and(
        eq(pumpOperationLogs.pumpVehicleId, pump.id),
        eq(pumpOperationLogs.tenantId, auth.user.tenantId),
        sql`${pumpOperationLogs.status} NOT IN ('COMPLETED','CANCELLED')`
      )
    )
    .limit(1);

  if (openSession) {
    return errorResponse(
      "PUMP_ALREADY_ENGAGED",
      `Pump ${pump.vehicleCode} already has an open session (${openSession.sessionNumber}). Close it first.`,
      409
    );
  }

  const countRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pumpOperationLogs)
    .where(eq(pumpOperationLogs.tenantId, auth.user.tenantId));
  const seq = ((countRows[0]?.count ?? 0) + 1).toString().padStart(5, "0");
  const sessionNumber = `PMP-${new Date().getFullYear()}-${seq}`;
  const now = new Date();

  const [session] = await db
    .insert(pumpOperationLogs)
    .values({
      sessionNumber,
      tenantId: auth.user.tenantId,
      pumpVehicleId: pump.id,
      orderId: parsed.data.orderId,
      deliverySiteId: parsed.data.deliverySiteId,
      operatorId: auth.user.sub,
      status: "MOBILISING",
      mobilisedAt: now,
      wasExternal: pump.isExternal,
      hourlyRateSar: pump.hourlyRateSar ?? 0,
      notes: parsed.data.notes,
    })
    .returning();

  await db
    .update(fleetVehicles)
    .set({ currentStatus: "IN_TRANSIT", updatedAt: now })
    .where(eq(fleetVehicles.id, pump.id));

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "PUMP_SESSION_OPENED",
    entityType: "pump_operation_logs",
    entityId: session.id,
    newState: {
      sessionNumber,
      pumpCode: pump.vehicleCode,
      isExternal: pump.isExternal,
      vendor: pump.externalVendorName,
    },
    socketEvent: "pump:session_opened",
  });

  return successResponse(
    {
      sessionId: session.id,
      sessionNumber,
      pumpCode: pump.vehicleCode,
      status: session.status,
      isExternal: pump.isExternal,
      externalVendorName: pump.externalVendorName,
      hourlyRateSar: pump.hourlyRateSar,
      socketBroadcast: {
        event: "pump:session_opened",
        rooms: ["dispatch", "admin-live-map"],
        payload: { sessionId: session.id, sessionNumber, pumpCode: pump.vehicleCode },
      },
    },
    `Pump session ${sessionNumber} opened for ${pump.vehicleCode}${pump.isExternal ? " (EXTERNAL — billed to vendor)" : ""}.`,
    201
  );
}

// ─── PATCH — advance status / close & bill ────────────────────────────────────

const AdvanceSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  status: z.enum([
    "SETUP",
    "PUMPING",
    "STANDBY",
    "TEARDOWN",
    "COMPLETED",
    "CANCELLED",
  ]),
  /** Cumulative volume pumped so far (m³) — supplied when closing */
  volumePumpedM3: z.number().nonnegative().max(5000).optional(),
  /** Number of mixer loads discharged through the pump */
  mixerLoadsServed: z.number().int().nonnegative().max(500).optional(),
  vendorInvoiceRef: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.TRIP_UPDATE_CHECKPOINT,
    PERMISSIONS.FLEET_UPDATE,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = AdvanceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid status payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const [session] = await db
    .select()
    .from(pumpOperationLogs)
    .where(eq(pumpOperationLogs.id, parsed.data.sessionId))
    .limit(1);

  if (!session) return errorResponse("NOT_FOUND", "Pump session not found", 404);
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    return errorResponse(
      "SESSION_CLOSED",
      `Session ${session.sessionNumber} is already ${session.status}.`,
      409
    );
  }

  const now = new Date();
  const update: Partial<typeof pumpOperationLogs.$inferInsert> = {
    status: parsed.data.status,
    updatedAt: now,
  };

  if (parsed.data.notes) update.notes = parsed.data.notes;
  if (parsed.data.vendorInvoiceRef) update.vendorInvoiceRef = parsed.data.vendorInvoiceRef;
  if (parsed.data.mixerLoadsServed != null) {
    update.mixerLoadsServed = parsed.data.mixerLoadsServed;
  }
  if (parsed.data.volumePumpedM3 != null) {
    update.volumePumpedM3 = parsed.data.volumePumpedM3.toFixed(2);
  }

  // ── Stamp lifecycle timestamps ────────────────────────────────────────────
  switch (parsed.data.status) {
    case "SETUP":
      if (!session.arrivedOnSiteAt) update.arrivedOnSiteAt = now;
      break;
    case "PUMPING":
      if (!session.setupCompletedAt) update.setupCompletedAt = now;
      if (!session.pumpingStartedAt) update.pumpingStartedAt = now;
      break;
    case "TEARDOWN":
      if (!session.pumpingEndedAt) update.pumpingEndedAt = now;
      break;
    case "COMPLETED":
      if (!session.pumpingEndedAt) update.pumpingEndedAt = now;
      update.departedSiteAt = now;
      break;
  }

  // ── Compute billable metrics on close ─────────────────────────────────────
  let billing: Record<string, unknown> | null = null;

  if (parsed.data.status === "COMPLETED") {
    const arrived = session.arrivedOnSiteAt ?? session.mobilisedAt ?? now;
    const pumpStart = session.pumpingStartedAt;
    const pumpEnd = session.pumpingEndedAt ?? now;

    const onSiteMinutes = Math.max(0, Math.round((now.getTime() - arrived.getTime()) / 60000));
    const pumpingMinutes = pumpStart
      ? Math.max(0, Math.round((pumpEnd.getTime() - pumpStart.getTime()) / 60000))
      : 0;
    const standbyMinutes = Math.max(0, onSiteMinutes - pumpingMinutes);

    const volume = parsed.data.volumePumpedM3 ?? parseFloat(session.volumePumpedM3 ?? "0");
    const actualM3PerHour =
      pumpingMinutes > 0 ? r2(volume / (pumpingMinutes / 60)) : 0;

    // Billed on TOTAL on-site hours (industry standard for pump hire)
    const billableHours = onSiteMinutes / 60;
    const rate = session.hourlyRateSar ?? 0;
    const totalChargeSar = Math.round(billableHours * rate);

    update.onSiteMinutes = onSiteMinutes;
    update.pumpingMinutes = pumpingMinutes;
    update.standbyMinutes = standbyMinutes;
    update.actualM3PerHour = actualM3PerHour.toFixed(2);
    update.totalChargeSar = totalChargeSar;

    billing = {
      onSiteMinutes,
      pumpingMinutes,
      standbyMinutes,
      billableHours: r2(billableHours),
      hourlyRateSar: rate,
      totalChargeSar,
      volumePumpedM3: volume,
      actualM3PerHour,
      utilisationPct: onSiteMinutes > 0 ? r2((pumpingMinutes / onSiteMinutes) * 100) : 0,
      wasExternal: session.wasExternal,
      costCentre: session.wasExternal ? "OUTSOURCED_EQUIPMENT" : "IN_HOUSE_FLEET",
    };

    // Release the pump back into the available pool
    await db
      .update(fleetVehicles)
      .set({ currentStatus: "AVAILABLE", updatedAt: now })
      .where(eq(fleetVehicles.id, session.pumpVehicleId));
  } else if (parsed.data.status === "PUMPING") {
    await db
      .update(fleetVehicles)
      .set({ currentStatus: "POURING", updatedAt: now })
      .where(eq(fleetVehicles.id, session.pumpVehicleId));
  } else if (parsed.data.status === "CANCELLED") {
    await db
      .update(fleetVehicles)
      .set({ currentStatus: "AVAILABLE", updatedAt: now })
      .where(eq(fleetVehicles.id, session.pumpVehicleId));
  }

  await db
    .update(pumpOperationLogs)
    .set(update)
    .where(eq(pumpOperationLogs.id, session.id));

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: session.tenantId,
    action: `PUMP_SESSION_${parsed.data.status}`,
    entityType: "pump_operation_logs",
    entityId: session.id,
    previousState: { status: session.status },
    newState: { status: parsed.data.status, billing },
    socketEvent: "pump:session_updated",
  });

  return successResponse(
    {
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
      previousStatus: session.status,
      newStatus: parsed.data.status,
      billing,
    },
    billing
      ? `Session ${session.sessionNumber} closed. ${billing.billableHours}h on site (${billing.pumpingMinutes} min pumping, ${billing.utilisationPct}% utilisation) → SAR ${(billing.totalChargeSar as number).toLocaleString()}.`
      : `Session ${session.sessionNumber} advanced to ${parsed.data.status}.`
  );
}

// ─── GET — sessions + utilisation KPIs ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30")));
  const externalOnly = url.searchParams.get("externalOnly") === "true";
  const since = new Date(Date.now() - days * 86400_000);

  const conditions = [
    gte(pumpOperationLogs.createdAt, since),
    eq(pumpOperationLogs.tenantId, auth.user.tenantId),
  ];
  if (externalOnly) conditions.push(eq(pumpOperationLogs.wasExternal, true));

  const sessions = await db
    .select({
      id: pumpOperationLogs.id,
      sessionNumber: pumpOperationLogs.sessionNumber,
      status: pumpOperationLogs.status,
      onSiteMinutes: pumpOperationLogs.onSiteMinutes,
      pumpingMinutes: pumpOperationLogs.pumpingMinutes,
      standbyMinutes: pumpOperationLogs.standbyMinutes,
      volumePumpedM3: pumpOperationLogs.volumePumpedM3,
      actualM3PerHour: pumpOperationLogs.actualM3PerHour,
      mixerLoadsServed: pumpOperationLogs.mixerLoadsServed,
      wasExternal: pumpOperationLogs.wasExternal,
      totalChargeSar: pumpOperationLogs.totalChargeSar,
      vendorInvoiceRef: pumpOperationLogs.vendorInvoiceRef,
      createdAt: pumpOperationLogs.createdAt,
      pumpCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      externalVendorName: fleetVehicles.externalVendorName,
      siteName: deliverySites.siteName,
      operatorName: users.fullName,
    })
    .from(pumpOperationLogs)
    .innerJoin(fleetVehicles, eq(pumpOperationLogs.pumpVehicleId, fleetVehicles.id))
    .innerJoin(deliverySites, eq(pumpOperationLogs.deliverySiteId, deliverySites.id))
    .innerJoin(users, eq(pumpOperationLogs.operatorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(pumpOperationLogs.createdAt))
    .limit(100);

  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const totalPumpingMin = completed.reduce((s, x) => s + (x.pumpingMinutes ?? 0), 0);
  const totalOnSiteMin = completed.reduce((s, x) => s + (x.onSiteMinutes ?? 0), 0);
  const totalVolume = completed.reduce(
    (s, x) => s + parseFloat(x.volumePumpedM3 ?? "0"),
    0
  );
  const internalCost = completed
    .filter((s) => !s.wasExternal)
    .reduce((s, x) => s + (x.totalChargeSar ?? 0), 0);
  const externalCost = completed
    .filter((s) => s.wasExternal)
    .reduce((s, x) => s + (x.totalChargeSar ?? 0), 0);

  return successResponse(
    {
      sessions,
      kpis: {
        windowDays: days,
        totalSessions: sessions.length,
        completedSessions: completed.length,
        activeSessions: sessions.filter(
          (s) => !["COMPLETED", "CANCELLED"].includes(s.status)
        ).length,
        pumpingHours: r2(totalPumpingMin / 60),
        onSiteHours: r2(totalOnSiteMin / 60),
        standbyHours: r2((totalOnSiteMin - totalPumpingMin) / 60),
        utilisationPct:
          totalOnSiteMin > 0 ? r2((totalPumpingMin / totalOnSiteMin) * 100) : 0,
        totalVolumePumpedM3: r2(totalVolume),
        fleetAvgM3PerHour:
          totalPumpingMin > 0 ? r2(totalVolume / (totalPumpingMin / 60)) : 0,
      },
      costBreakdown: {
        inHouseSar: internalCost,
        outsourcedSar: externalCost,
        totalSar: internalCost + externalCost,
        outsourcedSharePct:
          internalCost + externalCost > 0
            ? r2((externalCost / (internalCost + externalCost)) * 100)
            : 0,
      },
    },
    `${sessions.length} pump session(s) in the last ${days} day(s). Outsourced equipment cost: SAR ${externalCost.toLocaleString()}.`
  );
}
