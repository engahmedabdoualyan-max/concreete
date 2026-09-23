/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/dispatch — Dispatch & Fleet Scheduling Module
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET    /api/dispatch           — List active trips + fleet status dashboard
 *  POST   /api/dispatch           — Create a new trip / dispatch a truck
 *
 *  RBAC:
 *  GET  → SUPER_ADMIN, DISPATCHER, FINANCE, DRIVER, SALES_REP (read-only)
 *  POST → SUPER_ADMIN, DISPATCHER
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  trips,
  fleetVehicles,
  orders,
  users,
} from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  createTrip,
  getDispatchableVehicles,
} from "@/lib/services/dispatch.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ─── GET /api/dispatch ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;

  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status"); // e.g. "active"
    const driverFilter = url.searchParams.get("driverId");
    const dateFilter = url.searchParams.get("date"); // YYYY-MM-DD

    // ── Fleet Status Overview ────────────────────────────────────────────────
    const fleetStatusCounts = await db
      .select({
        status: fleetVehicles.currentStatus,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(fleetVehicles)
      .where(eq(fleetVehicles.isActive, true))
      .groupBy(fleetVehicles.currentStatus);

    // ── Active Trips (not completed or cancelled) ────────────────────────────
    const conditions = [eq(trips.isCompleted, false), eq(trips.isCancelled, false)];

    if (driverFilter) {
      conditions.push(eq(trips.driverId, driverFilter));
    }

    const activeTrips = await db
      .select({
        id: trips.id,
        tripNumber: trips.tripNumber,
        currentCheckpoint: trips.currentCheckpoint,
        loadedVolumeM3: trips.loadedVolumeM3,
        deliveryTicketNumber: trips.deliveryTicketNumber,
        batchTempC: trips.batchTempC,
        createdAt: trips.createdAt,
        // Related data via nested selects
        vehicleCode: fleetVehicles.vehicleCode,
        vehiclePlate: fleetVehicles.plateNumber,
        vehicleStatus: fleetVehicles.currentStatus,
        driverName: users.fullName,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
      })
      .from(trips)
      .innerJoin(fleetVehicles, eq(trips.vehicleId, fleetVehicles.id))
      .innerJoin(users, eq(trips.driverId, users.id))
      .innerJoin(orders, eq(trips.orderId, orders.id))
      .where(and(...conditions))
      .orderBy(desc(trips.createdAt))
      .limit(100);

    // ── Available vehicles for dispatch ──────────────────────────────────────
    const dispatchTime = dateFilter ? new Date(dateFilter) : new Date();
    const dispatchPool = await getDispatchableVehicles(dispatchTime, auth.user.tenantId);

    return successResponse({
      fleetStatusOverview: fleetStatusCounts,
      activeTrips,
      dispatchPool: {
        availableCount: dispatchPool.vehicles.length,
        curfewActive: dispatchPool.curfewActive,
        message: dispatchPool.message,
        vehicles: dispatchPool.vehicles,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/dispatch]", err);
    return errorResponse("DISPATCH_FETCH_ERROR", "Failed to fetch dispatch data", 500);
  }
}

// ─── POST /api/dispatch ───────────────────────────────────────────────────────

const CreateTripSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  vehicleId: z.string().uuid("Invalid vehicle ID"),
  driverId: z.string().uuid("Invalid driver ID"),
  loadedVolumeM3: z.number().positive("Load volume must be positive").max(20, "Max 20m³ per load"),
  mixDesignId: z.string().uuid("Invalid mix design ID"),
  pumpVehicleId: z.string().uuid().optional(),
  /** Current ambient conditions at batch plant */
  ambientTempC: z.number().min(-10).max(60).default(25),
  ambientHumidityPct: z.number().min(0).max(100).default(50),
  estimatedTransitMinutes: z.number().min(1).max(480).optional(),
});

export async function POST(req: NextRequest) {
  // Only DISPATCHER and SUPER_ADMIN can create trips
  const auth = await requirePermission(req, PERMISSIONS.TRIP_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateTripSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid trip data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await createTrip({
      ...parsed.data,
      dispatchedById: auth.user.sub,
      tenantId: auth.user.tenantId,
    });

    // Tree-plane mirror (Epic 13 — best-effort: IN_PRODUCTION + remaining)
    void import("@/lib/services/tree-sync.service")
      .then((m) => m.mirrorOrderById(auth.user.tenantId, parsed.data.orderId))
      .catch(() => {});

    return successResponse(
      {
        trip: result.trip,
        tripNumber: result.tripNumber,
        environmentCompensation: result.compensation,
        batchQuantities: result.batchQuantities,
      },
      `Trip ${result.tripNumber} created. Vehicle dispatched successfully.`,
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("TRIP_CREATE_FAILED", message, 422);
  }
}
