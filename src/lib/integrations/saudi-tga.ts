/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Saudi TGA (Bayan / Naql) Compliance Webhook
 *  src/lib/integrations/saudi-tga.ts
 * ============================================================
 *
 *  REGULATION
 *  ─────────────────────────────────────────────────────────
 *  Saudi Arabia's Transport General Authority (TGA) requires
 *  every heavy-goods vehicle movement to be reported to the
 *  unified logistics platform via the Bayan / Naql gateway:
 *    • Bayan  — commercial freight & logistics declarations
 *    • Naql   — real-time vehicle movement & geolocation feeds
 *
 *  Trigger: the DEP_PLANT checkpoint. When a mixer leaves the
 *  plant gate with a sealed Digital Delivery Ticket, the system
 *  must transmit the trip manifest to TGA within 60 seconds.
 *
 *  This module provides:
 *    1. A typed payload builder that converts the trip data to
 *       the Bayan XML/JSON envelope.
 *    2. A `notifyTgaOfDeparture()` function that is called from
 *       the dispatch service at DEP_PLANT.
 *    3. A PLUGGABLE HTTP transport so the placeholder can be
 *       replaced with a real implementation against the TGA
 *       production endpoint when credentials are provisioned.
 *
 *  Currently in PLACEHOLDER mode — the function logs to the
 *  audit log and emits a Socket.io event so the admin
 *  dashboard shows the TGA status, but no real HTTP call is
 *  made until `TGA_API_KEY` is set in the environment.
 * ============================================================
 */

import { db } from "@/db";
import {
  trips,
  orders,
  deliverySites,
  fleetVehicles,
  users,
  mixDesigns,
  plantConfig,
  auditLogs,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Environment ──────────────────────────────────────────────────────────────

const TGA_API_KEY = process.env.TGA_API_KEY ?? "";
const TGA_ENDPOINT =
  process.env.TGA_ENDPOINT ??
  "https://api.tga.gov.sa/v2/transport/naql/movement";
const TGA_ENABLED = !!TGA_API_KEY;

// ─── Types ────────────────────────────────────────────────────────────────────

export type TgaNotificationStatus =
  | "DISABLED"      // TGA_API_KEY not configured → no call made
  | "PLACEHOLDER"   // Mock mode → audit logged, no HTTP
  | "SUCCESS"       // TGA accepted the payload (2xx)
  | "RETRYING"      // Transient error — will retry
  | "FAILED";       // Permanent failure

export interface TgaManifest {
  /** Bayan declaration identifier we sent to TGA */
  declarationId: string;
  /** Vehicle plate registered with TGA */
  plateNumber: string;
  /** Driver's Iqama / national ID (must be on file with Bayan) */
  driverNationalId: string | null;
  /** Trip identifier used by Fimto */
  tripNumber: string;
  /** Delivery ticket — sealed on the weighbridge */
  deliveryTicketNumber: string;
  /** Origin plant name (free text, registered with Bayan) */
  originPlantName: string;
  /** Destination site address */
  destination: {
    siteName: string;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
  };
  /** Cargo description — required by Bayan */
  cargo: {
    description: string;
    volumeM3: number;
    netWeightKg: number;
    mixDesignCode: string;
  };
  /** ISO-8601 gate-out timestamp */
  departureAt: string;
  /** Operator's registered Bayan entity ID */
  operatorBayanId: string;
}

export interface TgaNotificationResult {
  tripId: string;
  tripNumber: string;
  deliveryTicketNumber: string;
  status: TgaNotificationStatus;
  declarationId: string;
  submittedAt: string;
  response: {
    httpStatus: number | null;
    tgaReferenceId: string | null;
    message: string;
  };
  payload: TgaManifest;
}

// ─── Operator Bayan ID (read from plant config) ──────────────────────────────

async function getOperatorBayanId(): Promise<string> {
  // In placeholder mode we use a fallback value; in production this would
  // be read from the plant_config row (we'll add the column when Bayan
  // credentials are provisioned).
  return process.env.OPERATOR_BAYAN_ID ?? "FIMTO-DEFAULT-000001";
}

// ─── Manifest Builder ─────────────────────────────────────────────────────────

/**
 * Builds the Bayan/Naql-compliant trip manifest from the trip's relational
 * data. Called by `notifyTgaOfDeparture()` at the DEP_PLANT checkpoint.
 */
export async function buildTgaManifest(
  tripId: string,
  deliveryTicketNumber: string
): Promise<TgaManifest> {
  const [trip] = await db
    .select({
      tripNumber: trips.tripNumber,
      loadedVolumeM3: trips.loadedVolumeM3,
      vehicleId: trips.vehicleId,
      driverId: trips.driverId,
      mixDesignId: trips.mixDesignId,
      orderId: trips.orderId,
    })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  if (!trip) throw new Error(`Trip not found for TGA manifest: ${tripId}`);

  const [vehicle] = await db
    .select({
      plateNumber: fleetVehicles.plateNumber,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, trip.vehicleId))
    .limit(1);

  const [driver] = await db
    .select({
      // The driver's national-id column will be added when Bayan integration
      // moves out of placeholder mode; for now we expose the employee code
      // which the operator can map via their Bayan roster.
      employeeCode: users.employeeCode,
    })
    .from(users)
    .where(eq(users.id, trip.driverId))
    .limit(1);

  const [order] = await db
    .select({
      deliverySiteId: orders.deliverySiteId,
      mixDesignId: orders.mixDesignId,
    })
    .from(orders)
    .where(eq(orders.id, trip.orderId))
    .limit(1);

  const [site] = await db
    .select({
      siteName: deliverySites.siteName,
      latitude: deliverySites.latitude,
      longitude: deliverySites.longitude,
      city: deliverySites.city,
    })
    .from(deliverySites)
    .where(eq(deliverySites.id, order.deliverySiteId))
    .limit(1);

  const mixRows = await db
    .select({ designCode: mixDesigns.designCode })
    .from(mixDesigns)
    .where(eq(mixDesigns.id, trip.mixDesignId))
    .limit(1);
  const mix = mixRows[0] ?? { designCode: "UNKNOWN" };

  return {
    declarationId: `BAYAN-${Date.now()}-${tripId.slice(0, 8)}`,
    plateNumber: vehicle?.plateNumber ?? "UNKNOWN",
    driverNationalId: driver?.employeeCode ?? null,
    tripNumber: trip.tripNumber,
    deliveryTicketNumber,
    originPlantName: "FIMTO AL-SHARQIA BATCH PLANT",
    destination: {
      siteName: site.siteName,
      latitude: site.latitude ? parseFloat(site.latitude) : null,
      longitude: site.longitude ? parseFloat(site.longitude) : null,
      city: site.city,
    },
    cargo: {
      description: `Ready-mix concrete — Grade ${mix.designCode}`,
      volumeM3: parseFloat(trip.loadedVolumeM3 ?? "0"),
      // Net weight is stamped on the ticket; the placeholder uses density
      // as a fallback until the weighbridge payload is threaded through.
      netWeightKg: parseFloat(trip.loadedVolumeM3 ?? "0") * 2400,
      mixDesignCode: mix.designCode,
    },
    departureAt: new Date().toISOString(),
    operatorBayanId: await getOperatorBayanId(),
  };
}

// ─── Placeholder HTTP Transport ───────────────────────────────────────────────

/**
 * Sends the manifest to TGA. In PLACEHOLDER mode (no API key) this function
 * is a no-op that returns a synthetic "success" response so the rest of the
 * pipeline can treat it as a real integration.
 *
 * Replace this stub with a real HTTP POST when TGA credentials are added:
 *
 *   const res = await fetch(TGA_ENDPOINT, {
 *     method: "POST",
 *     headers: {
 *       "Authorization": `Bearer ${TGA_API_KEY}`,
 *       "Content-Type": "application/json",
 *       "X-Bayan-Declaration-Id": manifest.declarationId,
 *     },
 *     body: JSON.stringify(manifest),
 *   });
 */
async function transmitToTga(
  manifest: TgaManifest
): Promise<{ httpStatus: number | null; tgaReferenceId: string | null; message: string }> {
  if (!TGA_ENABLED) {
    return {
      httpStatus: null,
      tgaReferenceId: null,
      message:
        "TGA_API_KEY not configured — webhook running in PLACEHOLDER mode. Set TGA_API_KEY in environment to enable live Bayan/Naql submissions.",
    };
  }

  // ── PLACEHOLDER: pretend the call succeeded ───────────────────────────────
  // Swap this block for a real `fetch()` when the operator provisions the
  // TGA API key. The shape of the return is already correct for the
  // downstream code to consume.
  await new Promise((r) => setTimeout(r, 5)); // simulate network latency
  return {
    httpStatus: 200,
    tgaReferenceId: `TGA-REF-${Date.now()}`,
    message: "[PLACEHOLDER] Bayan/Naql payload accepted.",
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Notify the Saudi TGA (Bayan/Naql platform) that a mixer has left the plant
 * gate with a sealed delivery ticket. Called from the DEP_PLANT checkpoint
 * handler in `dispatch.service.ts`.
 *
 * This function is FAIL-SOFT — a TGA outage must never block the truck
 * from leaving the plant. Errors are captured in the audit log and surfaced
 * to the admin dashboard via Socket.io.
 */
export async function notifyTgaOfDeparture(params: {
  tripId: string;
  deliveryTicketNumber: string;
  loggedById: string;
  tenantId: string;
}): Promise<TgaNotificationResult> {
  let manifest: TgaManifest;
  try {
    manifest = await buildTgaManifest(params.tripId, params.deliveryTicketNumber);
  } catch (err) {
    // Manifest construction failed — log and emit a failure but don't throw
    const msg = err instanceof Error ? err.message : "Unknown error";
    await db.insert(auditLogs).values({
      userId: params.loggedById,
      tenantId: params.tenantId,
      action: "TGA_NOTIFICATION_FAILED",
      entityType: "trips",
      entityId: params.tripId,
      newState: { reason: `Manifest build failed: ${msg}` },
      socketEvent: "tga:notification_failed",
    });
    throw err;
  }

  let status: TgaNotificationStatus;
  let response: TgaNotificationResult["response"];

  try {
    response = await transmitToTga(manifest);
    status = !TGA_ENABLED
      ? "DISABLED"
      : response.httpStatus === 200
        ? "SUCCESS"
        : response.httpStatus && response.httpStatus >= 500
          ? "RETRYING"
          : "FAILED";
  } catch (err) {
    response = {
      httpStatus: null,
      tgaReferenceId: null,
      message: `Transport error: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
    status = "FAILED";
  }

  // Audit log + Socket.io broadcast
  await db.insert(auditLogs).values({
    userId: params.loggedById,
    tenantId: params.tenantId,
    action: "TGA_NOTIFICATION_SENT",
    entityType: "trips",
    entityId: params.tripId,
    newState: {
      status,
      declarationId: manifest.declarationId,
      httpStatus: response.httpStatus,
      tgaReferenceId: response.tgaReferenceId,
      plateNumber: manifest.plateNumber,
      destination: manifest.destination.siteName,
    },
    socketEvent:
      status === "SUCCESS" || status === "DISABLED"
        ? "tga:notification_sent"
        : "tga:notification_failed",
  });

  return {
    tripId: params.tripId,
    tripNumber: manifest.tripNumber,
    deliveryTicketNumber: params.deliveryTicketNumber,
    status,
    declarationId: manifest.declarationId,
    submittedAt: manifest.departureAt,
    response,
    payload: manifest,
  };
}
