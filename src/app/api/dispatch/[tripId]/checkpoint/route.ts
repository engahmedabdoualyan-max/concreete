/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  POST /api/dispatch/[tripId]/checkpoint
 *  ─────────────────────────────────────────────────────────
 *  Updates a trip's current checkpoint in the 7-stage timeline.
 *  Called by the Driver mobile app (or geofencing service).
 *
 *  BUSINESS RULES:
 *  • Checkpoints must progress sequentially (no skipping)
 *  • Each checkpoint is logged once (unique constraint enforced in DB)
 *  • DEP_PLANT auto-generates the Digital Delivery Ticket
 *  • RETURN_PLANT resets vehicle to AVAILABLE and closes the trip
 *  • All events are broadcast via Socket.io (handled separately)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { trips, tripCheckpoints } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateTripCheckpoint, CHECKPOINT_ORDER } from "@/lib/services/dispatch.service";
import { z } from "zod";
import type { TripCheckpoint } from "@/db/schema";

export const dynamic = "force-dynamic";

const CHECKPOINT_VALUES = [
  "ARR_PLANT",
  "ARR_BSTC",
  "DEP_PLANT",
  "ARR_SITE",
  "POUR_START",
  "DEP_SITE",
  "RETURN_PLANT",
] as const;

const UpdateCheckpointSchema = z.object({
  checkpoint: z.enum(CHECKPOINT_VALUES),
  /** GPS coordinates at checkpoint (from mobile device) */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  gpsAccuracyMetres: z.number().min(0).max(10000).optional(),
  /** Extra metadata: pump hookup code, site contact, notes, etc. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  // Drivers and dispatchers can update checkpoints
  const auth = await requirePermission(req, PERMISSIONS.TRIP_UPDATE_CHECKPOINT);
  if ("status" in auth) return auth;

  const { tripId } = await params;

  if (!tripId || !/^[0-9a-f-]{36}$/i.test(tripId)) {
    return errorResponse("INVALID_TRIP_ID", "Trip ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateCheckpointSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid checkpoint data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch current trip to validate ownership (drivers can only update their own trips)
  const tripRows = await db
    .select({
      id: trips.id,
      driverId: trips.driverId,
      currentCheckpoint: trips.currentCheckpoint,
      isCompleted: trips.isCompleted,
      isCancelled: trips.isCancelled,
      tripNumber: trips.tripNumber,
    })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip not found", 404);
  }

  const trip = tripRows[0];

  // Drivers can only update their own trips (Admin/Dispatcher can update any)
  if (
    auth.user.role === "DRIVER" &&
    trip.driverId !== auth.user.sub
  ) {
    return errorResponse(
      "FORBIDDEN",
      "You can only update checkpoints for your own trips",
      403
    );
  }

  if (trip.isCompleted) {
    return errorResponse("TRIP_COMPLETED", "This trip has already been completed", 409);
  }

  if (trip.isCancelled) {
    return errorResponse("TRIP_CANCELLED", "This trip has been cancelled", 409);
  }

  try {
    const result = await updateTripCheckpoint({
      tripId,
      newCheckpoint: parsed.data.checkpoint as TripCheckpoint,
      loggedById: auth.user.sub,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      gpsAccuracyMetres: parsed.data.gpsAccuracyMetres,
      metadata: parsed.data.metadata,
    });

    // Fetch the updated trip for the response
    const updatedTripRows = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    // Fetch all checkpoints for the timeline view
    const allCheckpoints = await db
      .select()
      .from(tripCheckpoints)
      .where(eq(tripCheckpoints.tripId, tripId))
      .orderBy(tripCheckpoints.loggedAt);

    const isLastCheckpoint = parsed.data.checkpoint === "RETURN_PLANT";

    // ── Build the Socket.io event payload based on checkpoint ─────────────
    const socketEvent = result.dryingRisk?.triggered
      ? {
          event: "CONCRETE_DRYING_RISK",
          rooms: ["admin-live-map", "dispatch", "lab", "quality"],
          payload: {
            tripId,
            tripNumber: trip.tripNumber,
            transitMinutes: result.dryingRisk.transitMinutes,
            thresholdMinutes: result.dryingRisk.thresholdMinutes,
            severity: "CRITICAL",
            timestamp: new Date().toISOString(),
          },
        }
      : {
          event: "trip:checkpoint_updated",
          rooms: ["dispatch", "admin-live-map", "lab", "workshop"],
          payload: {
            tripId,
            tripNumber: trip.tripNumber,
            checkpoint: parsed.data.checkpoint,
            timestamp: new Date().toISOString(),
          },
        };

    return successResponse(
      {
        tripId,
        tripNumber: trip.tripNumber,
        previousCheckpoint: trip.currentCheckpoint,
        currentCheckpoint: parsed.data.checkpoint,
        isCompleted: isLastCheckpoint,
        deliveryTicketNumber: updatedTripRows[0]?.deliveryTicketNumber,
        timeline: allCheckpoints.map((cp) => ({
          checkpoint: cp.checkpoint,
          loggedAt: cp.loggedAt,
          latitude: cp.latitude,
          longitude: cp.longitude,
          metadata: cp.metadata,
        })),
        remainingCheckpoints: CHECKPOINT_ORDER.filter(
          (cp) =>
            !allCheckpoints.some((logged) => logged.checkpoint === cp)
        ),
        /**
         * Encrypted delivery-ticket QR — minted at DEP_PLANT.
         * The driver app renders this string as a QR code for the client
         * to scan at the site via POST /api/dispatch/verify-ticket-qr.
         */
        qrCodeToken: result.qrCodeToken ?? undefined,
        /** Saudi TGA (Bayan/Naql) compliance — only present at DEP_PLANT */
        tga: result.tgaNotification
          ? {
              declarationId: result.tgaNotification.declarationId,
              status: result.tgaNotification.status,
              plateNumber: result.tgaNotification.payload.plateNumber,
              destination: result.tgaNotification.payload.destination.siteName,
              submittedAt: result.tgaNotification.submittedAt,
              message: result.tgaNotification.response.message,
            }
          : undefined,
        /** Transit time & drying-risk alert — only present at ARR_SITE */
        dryingRisk: result.dryingRisk?.triggered
          ? {
              triggered: true,
              transitMinutes: result.dryingRisk.transitMinutes,
              thresholdMinutes: result.dryingRisk.thresholdMinutes,
              severity: "CRITICAL",
              message: `⚠️ CONCRETE DRYING RISK: Transit took ${result.dryingRisk.transitMinutes} min (threshold ${result.dryingRisk.thresholdMinutes} min). Immediate QA review required.`,
            }
          : result.dryingRisk
            ? {
                triggered: false,
                transitMinutes: result.dryingRisk.transitMinutes,
                thresholdMinutes: result.dryingRisk.thresholdMinutes,
              }
            : undefined,
        socketEvent,
      },
      isLastCheckpoint
        ? `Trip ${trip.tripNumber} completed. Vehicle is now available.`
        : result.dryingRisk?.triggered
          ? `🚨 CRITICAL: ${parsed.data.checkpoint} logged but transit exceeded ${result.dryingRisk.thresholdMinutes} minutes — concrete drying risk.`
          : result.tgaNotification
            ? `Checkpoint ${parsed.data.checkpoint} logged. TGA Bayan/Naql notification ${result.tgaNotification.status}.`
            : `Checkpoint ${parsed.data.checkpoint} logged successfully.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("CHECKPOINT_UPDATE_FAILED", message, 422);
  }
}

// GET: Retrieve the full timeline for a trip
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;

  const { tripId } = await params;

  const tripRows = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip not found", 404);
  }

  const checkpoints = await db
    .select()
    .from(tripCheckpoints)
    .where(eq(tripCheckpoints.tripId, tripId))
    .orderBy(tripCheckpoints.loggedAt);

  const trip = tripRows[0];

  return successResponse({
    tripId,
    tripNumber: trip.tripNumber,
    currentCheckpoint: trip.currentCheckpoint,
    isCompleted: trip.isCompleted,
    isCancelled: trip.isCancelled,
    deliveryTicketNumber: trip.deliveryTicketNumber,
    deliveryTicketIssuedAt: trip.deliveryTicketIssuedAt,
    metrics: {
      transitTimeMinutes: trip.transitTimeMinutes,
      onSiteDurationMinutes: trip.onSiteDurationMinutes,
      returnTimeMinutes: trip.returnTimeMinutes,
      totalCycleTimeMinutes: trip.totalCycleTimeMinutes,
    },
    timeline: CHECKPOINT_ORDER.map((cp) => {
      const logged = checkpoints.find((c) => c.checkpoint === cp);
      return {
        checkpoint: cp,
        status: logged ? "COMPLETED" : cp === trip.currentCheckpoint ? "CURRENT" : "PENDING",
        loggedAt: logged?.loggedAt ?? null,
        latitude: logged?.latitude ?? null,
        longitude: logged?.longitude ?? null,
        metadata: logged?.metadata ?? null,
      };
    }),
  });
}
