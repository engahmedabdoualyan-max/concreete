/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Dispatch Service — Smart Scheduling & Trip Lifecycle
 * ============================================================
 *
 *  BUSINESS RULES:
 *  ─────────────────────────────────────────────────────────
 *  1. Only APPROVED orders may be dispatched
 *  2. Vehicles with status IN_WORKSHOP | MAJOR_BREAKDOWN are
 *     hard-excluded from the dispatch pool
 *  3. Curfew windows block truck assignments during banned hours
 *  4. Trip checkpoint progression is strictly sequential:
 *     ARR_PLANT → ARR_BSTC → DEP_PLANT → ARR_SITE →
 *     POUR_START → DEP_SITE → RETURN_PLANT
 *  5. ARR_SITE triggers geofence verification
 *  6. DEP_PLANT generates the digital delivery ticket
 *  7. RETURN_PLANT resets vehicle status to AVAILABLE
 * ============================================================
 */

import { db } from "@/db";
import {
  trips,
  tripCheckpoints,
  orders,
  fleetVehicles,
  users,
  inventoryTransactions,
  inventorySilos,
  curfewZones,
  auditLogs,
} from "@/db/schema";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import type { TripCheckpoint } from "@/db/schema";
import {
  computeEnvironmentCompensation,
  calculateBatchQuantities,
} from "./environment-compensation.service";
import { mixDesigns } from "@/db/schema";
import { notifyTgaOfDeparture } from "@/lib/integrations/saudi-tga";
import { mintTicketQr } from "@/lib/qr-ticket";
import { capabilitiesFor, assertCapability } from "@/lib/vehicle-class";

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * STRICT TRANSIT WINDOW (Al-Sharqia specification)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ready-mix concrete must be discharged within 90 minutes of leaving the
 * batching plant. Exceeding this threshold risks:
 *   • Slump loss below the pour-point minimum
 *   • Partial hydration onset inside the drum
 *   • Rejection by the site engineer at pour
 *
 * When a trip's ARR_SITE timestamp exceeds this window relative to DEP_PLANT,
 * a CRITICAL Socket.io broadcast is emitted so the admin dashboard can alert
 * the driver, the site supervisor, and the QA lab immediately.
 */
export const MAX_TRANSIT_MINUTES_STRICT = 90;

// ─── Checkpoint Ordering (Sequential Enforcement) ─────────────────────────────

export const CHECKPOINT_ORDER: TripCheckpoint[] = [
  "ARR_PLANT",
  "ARR_BSTC",
  "DEP_PLANT",
  "ARR_SITE",
  "POUR_START",
  "DEP_SITE",
  "RETURN_PLANT",
];

export function getNextCheckpoint(current: TripCheckpoint): TripCheckpoint | null {
  const idx = CHECKPOINT_ORDER.indexOf(current);
  if (idx === -1 || idx === CHECKPOINT_ORDER.length - 1) return null;
  return CHECKPOINT_ORDER[idx + 1];
}

export function isValidCheckpointProgression(
  current: TripCheckpoint,
  next: TripCheckpoint
): boolean {
  const currentIdx = CHECKPOINT_ORDER.indexOf(current);
  const nextIdx = CHECKPOINT_ORDER.indexOf(next);
  return nextIdx === currentIdx + 1;
}

// ─── Available Fleet Query ────────────────────────────────────────────────────

/**
 * Returns all vehicles that can be dispatched:
 * - AVAILABLE or STANDBY status
 * - Not currently in workshop or broken down
 * - Not under a curfew window for the requested dispatch time
 */
export async function getDispatchableVehicles(dispatchDateTime: Date, tenantId: string) {
  // Excluded vehicle statuses
  const excludedStatuses = ["IN_WORKSHOP", "MAJOR_BREAKDOWN", "OUT_OF_SERVICE"] as const;

  const availableVehicles = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      drumCapacityM3: fleetVehicles.drumCapacityM3,
      currentStatus: fleetVehicles.currentStatus,
      assignedDriverId: fleetVehicles.assignedDriverId,
    })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.tenantId, tenantId),
        eq(fleetVehicles.isActive, true),
        // Exclude workshop and breakdown statuses
        ne(fleetVehicles.currentStatus, "IN_WORKSHOP"),
        ne(fleetVehicles.currentStatus, "MAJOR_BREAKDOWN"),
        ne(fleetVehicles.currentStatus, "OUT_OF_SERVICE")
      )
    );

  // Check curfew windows for the dispatch time
  const dayOfWeek = dispatchDateTime.getDay(); // 0=Sunday
  const timeStr = dispatchDateTime.toTimeString().slice(0, 5); // "HH:MM"

  const activeCurfews = await db
    .select()
    .from(curfewZones)
    .where(and(eq(curfewZones.tenantId, tenantId), eq(curfewZones.isActive, true)));

  const isUnderCurfew = activeCurfews.some((zone) => {
    const days = zone.activeDays as number[];
    if (!days.includes(dayOfWeek)) return false;
    // Time comparison (HH:MM string comparison works for same-day ranges)
    return timeStr >= zone.startTime && timeStr <= zone.endTime;
  });

  if (isUnderCurfew) {
    return {
      vehicles: [],
      curfewActive: true,
      message: "Dispatch blocked: Heavy vehicle curfew is active for this time window.",
    };
  }

  return {
    vehicles: availableVehicles,
    curfewActive: false,
    message: `${availableVehicles.length} vehicle(s) available for dispatch.`,
  };
}

// ─── Trip Creation ────────────────────────────────────────────────────────────

export interface CreateTripParams {
  tenantId: string;
  orderId: string;
  vehicleId: string;
  driverId: string;
  loadedVolumeM3: number;
  mixDesignId: string;
  pumpVehicleId?: string;
  dispatchedById: string;
  ambientTempC: number;
  ambientHumidityPct: number;
  estimatedTransitMinutes?: number;
}

/**
 * Creates a new trip and applies environment compensation to the batch.
 * Deducts raw materials from inventory silos.
 */
export async function createTrip(params: CreateTripParams) {
  // 1. Verify order is APPROVED or APPROVED_SCHEDULED
  const orderRows = await db
    .select({
      id: orders.id,
      status: orders.status,
      orderNumber: orders.orderNumber,
      remainingVolumeM3: orders.remainingVolumeM3,
      deliverySiteId: orders.deliverySiteId,
    })
    .from(orders)
    .where(eq(orders.id, params.orderId))
    .limit(1);

  if (orderRows.length === 0) throw new Error("Order not found");
  const allowedStatuses = ["APPROVED", "APPROVED_SCHEDULED", "SCHEDULED"];
  if (!allowedStatuses.includes(orderRows[0].status)) {
    throw new Error(
      `Order is not approved for dispatch. Current status: ${orderRows[0].status}`
    );
  }

  const remainingVol = parseFloat(orderRows[0].remainingVolumeM3 ?? "0");
  if (params.loadedVolumeM3 > remainingVol + 0.01) {
    throw new Error(
      `Load volume (${params.loadedVolumeM3}m³) exceeds remaining order volume (${remainingVol}m³)`
    );
  }

  // 1b. Curfew check — block dispatch during municipality heavy-vehicle curfew windows
  const { checkCurfewRestrictions } = await import("@/lib/middleware/curfew-guard");
  const curfewCheck = await checkCurfewRestrictions(new Date(), orderRows[0].deliverySiteId);
  if (curfewCheck.blocked) {
    throw new Error(
      `Dispatch BLOCKED by curfew: ${curfewCheck.message}` +
        (curfewCheck.earliestAvailableAt
          ? ` Earliest available slot: ${curfewCheck.earliestAvailableAt.toISOString()}`
          : "")
    );
  }

  // 2. Verify vehicle is available
  const vehicleRows = await db
    .select({
      id: fleetVehicles.id,
      currentStatus: fleetVehicles.currentStatus,
      vehicleCode: fleetVehicles.vehicleCode,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, params.vehicleId))
    .limit(1);

  if (vehicleRows.length === 0) throw new Error("Vehicle not found");
  if (["IN_WORKSHOP", "MAJOR_BREAKDOWN", "OUT_OF_SERVICE"].includes(vehicleRows[0].currentStatus)) {
    throw new Error(
      `Vehicle ${vehicleRows[0].vehicleCode} is not available (status: ${vehicleRows[0].currentStatus})`
    );
  }

  // 3. Get mix design and compute environment compensation
  const mixDesignRows = await db
    .select()
    .from(mixDesigns)
    .where(eq(mixDesigns.id, params.mixDesignId))
    .limit(1);

  if (mixDesignRows.length === 0) throw new Error("Mix design not found");
  const mixDesign = mixDesignRows[0];

  const compensation = computeEnvironmentCompensation(mixDesign, {
    temperatureC: params.ambientTempC,
    humidityPct: params.ambientHumidityPct,
    estimatedTransitMinutes: params.estimatedTransitMinutes,
  });

  const batchQty = calculateBatchQuantities(mixDesign, params.loadedVolumeM3, compensation);

  // 4. Generate trip number
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const tripNumber = `TRP-${datePart}-${vehicleRows[0].vehicleCode}-${Date.now().toString().slice(-4)}`;

  // 5. Insert trip
  const [newTrip] = await db
    .insert(trips)
    .values({
      tripNumber,
      tenantId: params.tenantId,
      orderId: params.orderId,
      vehicleId: params.vehicleId,
      driverId: params.driverId,
      pumpVehicleId: params.pumpVehicleId,
      mixDesignId: params.mixDesignId,
      loadedVolumeM3: params.loadedVolumeM3.toFixed(2),
      currentCheckpoint: "ARR_PLANT",
      actualWaterLitresPerM3: compensation.adjustedWaterLitresPerM3.toFixed(3),
      actualRetarderLPerM3: compensation.adjustedRetarderLPerM3.toFixed(4),
      batchTempC: params.ambientTempC.toFixed(1),
      batchHumidityPct: params.ambientHumidityPct.toFixed(2),
      dispatchedById: params.dispatchedById,
    })
    .returning();

  // 6. Mark vehicle as LOADING
  await db
    .update(fleetVehicles)
    .set({ currentStatus: "LOADING", updatedAt: new Date() })
    .where(eq(fleetVehicles.id, params.vehicleId));

  // 7. Update order status to IN_PRODUCTION and reduce remaining volume
  await db
    .update(orders)
    .set({
      status: "IN_PRODUCTION",
      remainingVolumeM3: (remainingVol - params.loadedVolumeM3).toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, params.orderId));

  // 8. Deduct raw materials from inventory (fire-and-forget — log failures, don't block)
  await deductInventoryForBatch(newTrip.id, batchQty, params.dispatchedById, params.tenantId);

  // 9. Log the ARR_PLANT checkpoint automatically
  await db.insert(tripCheckpoints).values({
    tripId: newTrip.id,
    tenantId: params.tenantId,
    checkpoint: "ARR_PLANT",
    loggedAt: new Date(),
    metadata: { source: "dispatch_system", createdByDispatch: true },
    loggedById: params.dispatchedById,
  });

  return {
    trip: newTrip,
    compensation,
    batchQuantities: batchQty,
    tripNumber,
  };
}

// ─── Inventory Deduction ──────────────────────────────────────────────────────

async function deductInventoryForBatch(
  tripId: string,
  batchQty: ReturnType<typeof calculateBatchQuantities>,
  performedById: string,
  tenantId: string
) {
  try {
    // Map material quantities to silo categories
    const deductions: { category: string; kg: number }[] = [
      { category: "CEMENT", kg: batchQty.cementKg },
      { category: "SAND", kg: batchQty.sandKg },
      { category: "GRAVEL_10MM", kg: batchQty.gravel10mmKg },
      { category: "GRAVEL_20MM", kg: batchQty.gravel20mmKg },
      { category: "GRAVEL_40MM", kg: batchQty.gravel40mmKg },
      { category: "WATER", kg: batchQty.waterLitres }, // 1L water ≈ 1kg
      { category: "ADMIXTURE_PLASTICIZER", kg: batchQty.plasticiserLitres * 1.05 }, // density ~1.05 kg/L
      { category: "ADMIXTURE_RETARDER", kg: batchQty.retarderLitres * 1.08 },
      { category: "FLY_ASH", kg: batchQty.flyAshKg },
      { category: "SILICA_FUME", kg: batchQty.silicaFumeKg },
    ].filter((d) => d.kg > 0.001);

    for (const deduction of deductions) {
      // Find the first active silo for this category
      const siloRows = await db
        .select({ id: inventorySilos.id, currentStockKg: inventorySilos.currentStockKg })
        .from(inventorySilos)
        .where(
          and(
            eq(inventorySilos.materialCategory, deduction.category as never),
            eq(inventorySilos.tenantId, tenantId),
            eq(inventorySilos.isActive, true)
          )
        )
        .limit(1);

      if (siloRows.length === 0) continue;

      const silo = siloRows[0];
      const currentStock = parseFloat(silo.currentStockKg ?? "0");
      const newBalance = Math.max(0, currentStock - deduction.kg);

      // Update silo stock
      await db
        .update(inventorySilos)
        .set({
          currentStockKg: newBalance.toFixed(3),
          updatedAt: new Date(),
        })
        .where(eq(inventorySilos.id, silo.id));

      // Log the transaction
      await db.insert(inventoryTransactions).values({
        siloId: silo.id,
        tenantId,
        tripId,
        transactionType: "CONSUMPTION",
        quantityKg: (-deduction.kg).toFixed(3), // negative for deductions
        balanceAfterKg: newBalance.toFixed(3),
        performedById,
        notes: `Auto-deduction for batch production (Trip ${tripId})`,
      });
    }
  } catch (err) {
    console.error("[InventoryDeduction] Failed to deduct inventory:", err);
    // Log to audit log but do not block the trip creation
    await db.insert(auditLogs).values({
      action: "INVENTORY_DEDUCTION_FAILED",
      tenantId,
      entityType: "trips",
      entityId: tripId,
      newState: { error: String(err) },
      userId: performedById,
    });
  }
}

// ─── Checkpoint Update ────────────────────────────────────────────────────────

export interface UpdateCheckpointParams {
  tripId: string;
  newCheckpoint: TripCheckpoint;
  loggedById: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracyMetres?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Advances a trip to the next checkpoint.
 * Enforces sequential progression and triggers side effects.
 */
export type UpdateCheckpointResult = {
  success: true;
  checkpoint: TripCheckpoint;
  tripId: string;
  /** Present when the checkpoint was DEP_PLANT */
  tgaNotification: {
    tripId: string;
    tripNumber: string;
    deliveryTicketNumber: string;
    status: string;
    declarationId: string;
    submittedAt: string;
    response: { httpStatus: number | null; tgaReferenceId: string | null; message: string };
    payload: {
      plateNumber: string;
      tripNumber: string;
      deliveryTicketNumber: string;
      destination: { siteName: string; latitude: number | null; longitude: number | null; city: string | null };
      [k: string]: unknown;
    };
  } | null;
  /** Present when the checkpoint was ARR_SITE */
  dryingRisk: {
    triggered: boolean;
    transitMinutes: number;
    thresholdMinutes: number;
  };
  /** Encrypted delivery-ticket QR minted at DEP_PLANT (null otherwise) */
  qrCodeToken: string | null;
  socketEvent: "CONCRETE_DRYING_RISK" | "trip:checkpoint_updated";
};

export async function updateTripCheckpoint(
  params: UpdateCheckpointParams
): Promise<UpdateCheckpointResult> {
  const tripRows = await db
    .select()
    .from(trips)
    .where(eq(trips.id, params.tripId))
    .limit(1);

  if (tripRows.length === 0) throw new Error("Trip not found");
  const trip = tripRows[0];

  if (trip.isCompleted) throw new Error("Trip is already completed");
  if (trip.isCancelled) throw new Error("Trip has been cancelled");

  // ── VEHICLE CLASS GUARD ────────────────────────────────────────────────────
  // Only MIXER class vehicles run the 7-checkpoint delivery timeline.
  // PUMP / TIPPER / SERVICE / REGULAR are hard-excluded here so a service
  // pickup can never be pushed through the concrete delivery flow.
  const timelineVehicle = await db
    .select({
      vehicleCode: fleetVehicles.vehicleCode,
      vehicleClass: fleetVehicles.vehicleClass,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, trip.vehicleId))
    .limit(1);

  if (timelineVehicle.length > 0) {
    assertCapability(
      timelineVehicle[0].vehicleClass,
      "deliveryTimeline",
      timelineVehicle[0].vehicleCode
    );
  }

  // Validate sequential progression
  if (!isValidCheckpointProgression(trip.currentCheckpoint, params.newCheckpoint)) {
    throw new Error(
      `Invalid checkpoint progression: ${trip.currentCheckpoint} → ${params.newCheckpoint}. ` +
        `Expected next: ${getNextCheckpoint(trip.currentCheckpoint)}`
    );
  }

  const now = new Date();

  // Log the checkpoint (append-only)
  await db.insert(tripCheckpoints).values({
    tripId: params.tripId,
    tenantId: trip.tenantId,
    checkpoint: params.newCheckpoint,
    loggedAt: now,
    latitude: params.latitude?.toFixed(7),
    longitude: params.longitude?.toFixed(7),
    gpsAccuracyMetres: params.gpsAccuracyMetres,
    metadata: params.metadata ?? {},
    loggedById: params.loggedById,
  });

  // Update trip current checkpoint
  const tripUpdate: Partial<typeof trips.$inferInsert> = {
    currentCheckpoint: params.newCheckpoint,
    updatedAt: now,
  };

  // ── Side Effects per Checkpoint ────────────────────────────────────────────
  switch (params.newCheckpoint) {
    case "ARR_BSTC":
      // Vehicle is now under the batch plant
      await db
        .update(fleetVehicles)
        .set({ currentStatus: "LOADING", updatedAt: now })
        .where(eq(fleetVehicles.id, trip.vehicleId));
      break;

    case "DEP_PLANT": {
      // Generate Digital Delivery Ticket
      const ticketNumber = `DDT-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${trip.tripNumber.slice(-6)}`;
      tripUpdate.deliveryTicketNumber = ticketNumber;
      tripUpdate.deliveryTicketIssuedAt = now;

      // ── MINT THE IMMUTABLE ENCRYPTED DELIVERY-TICKET QR ────────────────
      // Payload: trip_id + client_id + mix_design_code + loaded_qty
      // The driver shows this on their phone; the client scans it at the
      // site to prove the right load reached the right project.
      try {
        const [orderRow] = await db
          .select({
            clientId: orders.clientId,
            deliverySiteId: orders.deliverySiteId,
          })
          .from(orders)
          .where(eq(orders.id, trip.orderId))
          .limit(1);

        const [mixRow] = await db
          .select({ designCode: mixDesigns.designCode })
          .from(mixDesigns)
          .where(eq(mixDesigns.id, trip.mixDesignId))
          .limit(1);

        const [vehRow] = await db
          .select({ plateNumber: fleetVehicles.plateNumber })
          .from(fleetVehicles)
          .where(eq(fleetVehicles.id, trip.vehicleId))
          .limit(1);

        if (orderRow) {
          const qrToken = mintTicketQr({
            tripId: trip.id,
            clientId: orderRow.clientId,
            mixDesignCode: mixRow?.designCode ?? "UNKNOWN",
            loadedQtyM3: parseFloat(trip.loadedVolumeM3 ?? "0"),
            deliverySiteId: orderRow.deliverySiteId,
            deliveryTicketNumber: ticketNumber,
            plateNumber: vehRow?.plateNumber ?? "UNKNOWN",
          });
          tripUpdate.qrCodeToken = qrToken;
          tripUpdate.qrCodeIssuedAt = now;
          (tripUpdate as unknown as Record<string, unknown>).__qrToken = qrToken;
        }
      } catch (err) {
        // QR minting must never block the truck from leaving the gate.
        console.error("[dispatch] QR mint failed:", err);
      }

      // Vehicle is now in transit
      await db
        .update(fleetVehicles)
        .set({ currentStatus: "IN_TRANSIT", updatedAt: now })
        .where(eq(fleetVehicles.id, trip.vehicleId));

      // ── Saudi TGA (Bayan/Naql) compliance webhook ─────────────────────
      // When a mixer leaves the plant gate with a sealed delivery ticket,
      // the trip manifest is transmitted to the Transport General Authority.
      // This is fail-soft: a TGA outage must never block the truck.
      let tgaNotification: Awaited<ReturnType<typeof notifyTgaOfDeparture>> | null = null;
      try {
        tgaNotification = await notifyTgaOfDeparture({
          tripId: params.tripId,
          deliveryTicketNumber: ticketNumber,
          loggedById: params.loggedById,
          tenantId: trip.tenantId,
        });
      } catch (err) {
        // Already logged inside notifyTgaOfDeparture; capture the error here
        // so the caller can still surface it in the response.
        console.error("[dispatch] TGA notification failed:", err);
      }
      // Stash on tripUpdate so the caller sees the TGA result
      (tripUpdate as unknown as Record<string, unknown>).__tgaNotification = tgaNotification;
      break;
    }

    case "ARR_SITE": {
      // Geofence triggered — vehicle confirmed at site
      await db
        .update(fleetVehicles)
        .set({ currentStatus: "IN_TRANSIT", updatedAt: now })
        .where(eq(fleetVehicles.id, trip.vehicleId));

      // ── 90-MINUTE STRICT TRANSIT WINDOW CHECK ─────────────────────
      // If the driver arrived more than 90 minutes after DEP_PLANT, the
      // concrete may be drying inside the drum. Emit a CRITICAL Socket.io
      // broadcast so the admin dashboard can alert all stakeholders.
      const depPlantForDryRisk = await db
        .select({ loggedAt: tripCheckpoints.loggedAt })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, params.tripId),
            eq(tripCheckpoints.checkpoint, "DEP_PLANT")
          )
        )
        .limit(1);

      let transitMinutes = 0;
      let dryingRiskTriggered = false;

      // The 90-minute drying countdown only applies to MIXER class vehicles —
      // a pump or tipper carries no hydrating concrete in a drum.
      const dryingApplies = timelineVehicle.length > 0
        ? capabilitiesFor(timelineVehicle[0].vehicleClass).dryingCountdown
        : false;

      if (depPlantForDryRisk.length > 0) {
        transitMinutes = Math.round(
          (now.getTime() - depPlantForDryRisk[0].loggedAt.getTime()) / 60000
        );

        if (dryingApplies && transitMinutes > MAX_TRANSIT_MINUTES_STRICT) {
          dryingRiskTriggered = true;

          // Capture the drying-risk event on the audit trail so the QA
          // lab and the site supervisor can investigate.
          await db.insert(auditLogs).values({
            userId: params.loggedById,
            tenantId: trip.tenantId,
            action: "CONCRETE_DRYING_RISK",
            entityType: "trips",
            entityId: params.tripId,
            newState: {
              transitMinutes,
              thresholdMinutes: MAX_TRANSIT_MINUTES_STRICT,
              severity: "CRITICAL",
              previousCheckpoint: trip.currentCheckpoint,
              message: `Trip ${trip.tripNumber} exceeded the ${MAX_TRANSIT_MINUTES_STRICT}-minute transit window (${transitMinutes} min). Concrete drying risk — immediate QA review required.`,
            },
            socketEvent: "CONCRETE_DRYING_RISK",
          });
        }
      }
      // Stash on tripUpdate for the caller
      (tripUpdate as unknown as Record<string, unknown>).__transitMinutes = transitMinutes;
      (tripUpdate as unknown as Record<string, unknown>).__dryingRiskTriggered = dryingRiskTriggered;
      break;
    }

    case "POUR_START":
      // Pouring has started
      await db
        .update(fleetVehicles)
        .set({ currentStatus: "POURING", updatedAt: now })
        .where(eq(fleetVehicles.id, trip.vehicleId));
      break;

    case "DEP_SITE": {
      // Calculate on-site duration
      const arrSiteRow = await db
        .select({ loggedAt: tripCheckpoints.loggedAt })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, params.tripId),
            eq(tripCheckpoints.checkpoint, "ARR_SITE")
          )
        )
        .limit(1);

      if (arrSiteRow.length > 0) {
        const onSiteMs = now.getTime() - arrSiteRow[0].loggedAt.getTime();
        tripUpdate.onSiteDurationMinutes = Math.round(onSiteMs / 60000);
      }

      // Calculate transit time (DEP_PLANT → ARR_SITE)
      const depPlantRow = await db
        .select({ loggedAt: tripCheckpoints.loggedAt })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, params.tripId),
            eq(tripCheckpoints.checkpoint, "DEP_PLANT")
          )
        )
        .limit(1);

      const arrSiteForTransit = await db
        .select({ loggedAt: tripCheckpoints.loggedAt })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, params.tripId),
            eq(tripCheckpoints.checkpoint, "ARR_SITE")
          )
        )
        .limit(1);

      if (depPlantRow.length > 0 && arrSiteForTransit.length > 0) {
        const transitMs =
          arrSiteForTransit[0].loggedAt.getTime() - depPlantRow[0].loggedAt.getTime();
        tripUpdate.transitTimeMinutes = Math.round(transitMs / 60000);
      }

      await db
        .update(fleetVehicles)
        .set({ currentStatus: "RETURNING", updatedAt: now })
        .where(eq(fleetVehicles.id, trip.vehicleId));
      break;
    }

    case "RETURN_PLANT": {
      // Trip completed — reset vehicle to AVAILABLE
      tripUpdate.isCompleted = true;

      // Calculate return time
      const depSiteRow = await db
        .select({ loggedAt: tripCheckpoints.loggedAt })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, params.tripId),
            eq(tripCheckpoints.checkpoint, "DEP_SITE")
          )
        )
        .limit(1);

      if (depSiteRow.length > 0) {
        const returnMs = now.getTime() - depSiteRow[0].loggedAt.getTime();
        tripUpdate.returnTimeMinutes = Math.round(returnMs / 60000);
      }

      // Calculate total cycle time (ARR_PLANT → RETURN_PLANT)
      const arrPlantRow = await db
        .select({ loggedAt: tripCheckpoints.loggedAt })
        .from(tripCheckpoints)
        .where(
          and(
            eq(tripCheckpoints.tripId, params.tripId),
            eq(tripCheckpoints.checkpoint, "ARR_PLANT")
          )
        )
        .limit(1);

      if (arrPlantRow.length > 0) {
        const totalMs = now.getTime() - arrPlantRow[0].loggedAt.getTime();
        tripUpdate.totalCycleTimeMinutes = Math.round(totalMs / 60000);
      }

      // Reset vehicle to AVAILABLE
      await db
        .update(fleetVehicles)
        .set({ currentStatus: "AVAILABLE", updatedAt: now })
        .where(eq(fleetVehicles.id, trip.vehicleId));

      break;
    }
  }

  // Apply updates to the trip
  await db
    .update(trips)
    .set(tripUpdate as Parameters<typeof db.update>[0] extends typeof trips ? typeof tripUpdate : typeof tripUpdate)
    .where(eq(trips.id, params.tripId));

  // Audit log
  await db.insert(auditLogs).values({
    userId: params.loggedById,
    tenantId: trip.tenantId,
    action: `TRIP_CHECKPOINT_${params.newCheckpoint}`,
    entityType: "trips",
    entityId: params.tripId,
    previousState: { checkpoint: trip.currentCheckpoint },
    newState: { checkpoint: params.newCheckpoint, metadata: params.metadata },
    socketEvent: "trip:checkpoint_updated",
  });

  // Pull out the metadata stashed on tripUpdate by the per-checkpoint blocks
  const meta = tripUpdate as unknown as Record<string, unknown>;
  const tgaNotification = (meta.__tgaNotification ?? null) as UpdateCheckpointResult["tgaNotification"];
  const dryingRiskTriggered = (meta.__dryingRiskTriggered ?? false) as boolean;
  const transitMinutes = (meta.__transitMinutes ?? 0) as number;
  const qrCodeToken = (meta.__qrToken ?? null) as string | null;
  delete meta.__tgaNotification;
  delete meta.__dryingRiskTriggered;
  delete meta.__transitMinutes;
  delete meta.__qrToken;

  return {
    success: true,
    checkpoint: params.newCheckpoint,
    tripId: params.tripId,
    /** Present when the checkpoint was DEP_PLANT */
    tgaNotification,
    /** Present when the checkpoint was ARR_SITE */
    dryingRisk: {
      triggered: dryingRiskTriggered,
      transitMinutes,
      thresholdMinutes: MAX_TRANSIT_MINUTES_STRICT,
    },
    /** Encrypted delivery-ticket QR minted at DEP_PLANT (null otherwise) */
    qrCodeToken,
    /** Socket.io event the route should emit to the admin dashboard */
    socketEvent: dryingRiskTriggered ? "CONCRETE_DRYING_RISK" : "trip:checkpoint_updated",
  };
}

// ─── Customer e-signature (sign-on-glass — Epic 3) ─────────────────────────────

/** Maximum accepted signature payload (~350 KB data URL). */
export const MAX_SIGNATURE_BYTES = 350_000;

export interface SaveSignatureParams {
  tripId: string;
  tenantId: string;
  /** PNG/JPEG data URL from the driver device signature pad */
  signatureImage: string;
  /** Printed name of the site person who signed */
  signedBy: string;
}

export async function saveTripSignature(params: SaveSignatureParams) {
  const { tripId, tenantId, signatureImage, signedBy } = params;

  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signatureImage)) {
    throw new Error("Signature must be a PNG/JPEG data URL");
  }
  if (signatureImage.length > MAX_SIGNATURE_BYTES) {
    throw new Error("Signature image too large (max ~350 KB)");
  }
  if (!signedBy.trim()) {
    throw new Error("Signer name is required");
  }

  const tripRows = await db
    .select({ id: trips.id, isCancelled: trips.isCancelled })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.tenantId, tenantId)))
    .limit(1);
  if (tripRows.length === 0) {
    throw new Error("Trip not found");
  }
  if (tripRows[0].isCancelled) {
    throw new Error("Cannot sign a cancelled trip");
  }

  const [updated] = await db
    .update(trips)
    .set({
      signatureImage,
      signedBy: signedBy.trim().slice(0, 120),
      signedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(trips.id, tripId), eq(trips.tenantId, tenantId)))
    .returning({
      id: trips.id,
      tripNumber: trips.tripNumber,
      signedBy: trips.signedBy,
      signedAt: trips.signedAt,
    });

  // Audit trail — proof of delivery chain
  await db.insert(auditLogs).values({
    tenantId,
    userId: null,
    action: "TRIP_SIGNED",
    entityType: "trip",
    entityId: tripId,
    newState: { signedBy: updated.signedBy, signedAt: updated.signedAt },
  });

  return updated;
}
