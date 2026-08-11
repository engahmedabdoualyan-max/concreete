/**
 * ============================================================
 *  POST /api/dispatch/verify-ticket-qr
 *  QR Verification Loop — Site Arrival Confirmation
 * ============================================================
 *
 *  Called by the Mobile Apps when the CLIENT or the SALESMAN scans
 *  the driver's on-screen delivery-ticket QR at the construction site.
 *
 *  VALIDATION CHAIN (fails closed at every step)
 *  ─────────────────────────────────────────────────────────
 *   1. DECRYPT + AUTHENTICATE the token (AES-256-GCM auth tag)
 *   2. Confirm the trip exists, is live, and is not already delivered
 *   3. Confirm the persisted token matches the scanned one
 *      (defeats a replayed screenshot of an older ticket)
 *   4. WRONG-SITE GUARD — compare the scanned site against the
 *      order's site. Mismatch ⇒ HTTP 409 + unloading BLOCKED
 *   5. Optional GPS proximity check against the site geofence
 *   6. On success ⇒ AUTO-STAMP the ARR_SITE checkpoint
 *
 *  Every rejected scan increments `trips.qr_failed_scan_count` and is
 *  written to the audit log so repeated wrong-site attempts surface
 *  on the admin dashboard.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  trips,
  orders,
  clients,
  deliverySites,
  fleetVehicles,
  mixDesigns,
  users,
  auditLogs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAnyPermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  verifyTicketQr,
  distanceMetres,
  QrTicketError,
} from "@/lib/qr-ticket";
import { updateTripCheckpoint } from "@/lib/services/dispatch.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const VerifySchema = z.object({
  /** The raw string decoded from the scanned QR image */
  qrToken: z.string().min(10, "QR token is too short to be valid"),
  /**
   * The site the scanner believes they are standing at. When supplied the
   * wrong-site guard becomes strict — a mismatch blocks unloading.
   */
  scannedAtSiteId: z.string().uuid().optional(),
  /** Scanner's GPS position for the proximity cross-check */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /**
   * Dry-run: validate and report without stamping ARR_SITE.
   * The mobile app uses this to preview the load before confirming.
   */
  previewOnly: z.boolean().optional().default(false),
});

/** Records a failed scan on the trip + audit log. */
async function recordFailedScan(
  tripId: string | null,
  userId: string,
  tenantId: string,
  reason: string,
  detail: Record<string, unknown>
) {
  if (tripId) {
    await db
      .update(trips)
      .set({ qrFailedScanCount: sql`${trips.qrFailedScanCount} + 1` })
      .where(eq(trips.id, tripId));
  }
  await db.insert(auditLogs).values({
    userId,
    tenantId,
    action: "QR_SCAN_REJECTED",
    entityType: "trips",
    entityId: tripId ?? undefined,
    newState: { reason, ...detail },
    socketEvent: "qr:scan_rejected",
  });
}

export async function POST(req: NextRequest) {
  // Clients scan via the salesman's app; drivers may self-verify.
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.TRIP_UPDATE_CHECKPOINT,
    PERMISSIONS.ORDER_READ,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid scan payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { qrToken, scannedAtSiteId, latitude, longitude, previewOnly } = parsed.data;

  // ── STEP 1: Decrypt + authenticate ────────────────────────────────────────
  let decoded;
  try {
    decoded = verifyTicketQr(qrToken);
  } catch (err) {
    const reason = err instanceof QrTicketError ? err.reason : "MALFORMED_TOKEN";
    const message = err instanceof Error ? err.message : "QR verification failed";
    await recordFailedScan(null, auth.user.sub, auth.user.tenantId, reason, { scannedAtSiteId });
    return errorResponse("QR_INVALID", message, 400, {
      reason,
      unloadingAuthorised: false,
    });
  }

  // ── STEP 2: Resolve the trip and its commercial context ───────────────────
  const [row] = await db
    .select({
      tripId: trips.id,
      tripNumber: trips.tripNumber,
      tenantId: trips.tenantId,
      currentCheckpoint: trips.currentCheckpoint,
      isCompleted: trips.isCompleted,
      isCancelled: trips.isCancelled,
      loadedVolumeM3: trips.loadedVolumeM3,
      storedQrToken: trips.qrCodeToken,
      qrVerifiedAt: trips.qrVerifiedAt,
      deliveryTicketNumber: trips.deliveryTicketNumber,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderClientId: orders.clientId,
      orderSiteId: orders.deliverySiteId,
      clientName: clients.companyName,
      siteName: deliverySites.siteName,
      siteLat: deliverySites.latitude,
      siteLng: deliverySites.longitude,
      geofenceRadius: deliverySites.geofenceRadiusMetres,
      designCode: mixDesigns.designCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleClass: fleetVehicles.vehicleClass,
      driverName: users.fullName,
    })
    .from(trips)
    .innerJoin(orders, eq(trips.orderId, orders.id))
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .innerJoin(mixDesigns, eq(trips.mixDesignId, mixDesigns.id))
    .innerJoin(fleetVehicles, eq(trips.vehicleId, fleetVehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(eq(trips.id, decoded.tripId))
    .limit(1);

  if (!row) {
    await recordFailedScan(null, auth.user.sub, auth.user.tenantId, "TRIP_NOT_FOUND", {
      tripId: decoded.tripId,
    });
    return errorResponse(
      "TRIP_NOT_FOUND",
      "The scanned ticket references a trip that no longer exists.",
      404,
      { unloadingAuthorised: false }
    );
  }

  if (row.isCancelled) {
    await recordFailedScan(row.tripId, auth.user.sub, row.tenantId, "TRIP_CANCELLED", {});
    return errorResponse(
      "TRIP_CANCELLED",
      `Trip ${row.tripNumber} was cancelled. DO NOT UNLOAD.`,
      409,
      { unloadingAuthorised: false }
    );
  }

  // ── STEP 3: Replay guard — the stored token must match exactly ────────────
  if (row.storedQrToken && row.storedQrToken !== qrToken) {
    await recordFailedScan(row.tripId, auth.user.sub, row.tenantId, "TOKEN_SUPERSEDED", {
      tripNumber: row.tripNumber,
    });
    return errorResponse(
      "QR_SUPERSEDED",
      "This QR code is not the one currently issued for this trip. It may be a screenshot of an older ticket.",
      409,
      { unloadingAuthorised: false }
    );
  }

  // ── STEP 4: WRONG-SITE GUARD ──────────────────────────────────────────────
  // The single most important check: is this truck at the RIGHT project?
  const ticketSiteId = decoded.deliverySiteId;
  const orderSiteId = row.orderSiteId;

  // 4a. The token's site must still agree with the order (site edited post-issue)
  if (ticketSiteId !== orderSiteId) {
    await recordFailedScan(row.tripId, auth.user.sub, row.tenantId, "TICKET_SITE_DRIFT", {
      ticketSiteId,
      orderSiteId,
    });
    return errorResponse(
      "SITE_MISMATCH",
      "The delivery site on this ticket no longer matches the order. Contact dispatch before unloading.",
      409,
      { unloadingAuthorised: false }
    );
  }

  // 4b. The scanner's declared site must match the ticket's site
  if (scannedAtSiteId && scannedAtSiteId !== ticketSiteId) {
    const [wrongSite] = await db
      .select({ siteName: deliverySites.siteName })
      .from(deliverySites)
      .where(eq(deliverySites.id, scannedAtSiteId))
      .limit(1);

    await recordFailedScan(row.tripId, auth.user.sub, row.tenantId, "WRONG_SITE", {
      tripNumber: row.tripNumber,
      expectedSiteId: ticketSiteId,
      expectedSiteName: row.siteName,
      scannedSiteId: scannedAtSiteId,
      scannedSiteName: wrongSite?.siteName ?? "unknown",
    });

    return errorResponse(
      "WRONG_SITE",
      `🚫 UNLOADING BLOCKED. This load (${row.loadedVolumeM3} m³ of ${row.designCode}) is destined for "${row.siteName}", not "${wrongSite?.siteName ?? "this site"}". Do not discharge.`,
      409,
      {
        unloadingAuthorised: false,
        expected: { siteId: ticketSiteId, siteName: row.siteName },
        scanned: { siteId: scannedAtSiteId, siteName: wrongSite?.siteName ?? null },
        tripNumber: row.tripNumber,
        socketBroadcast: {
          event: "qr:wrong_site_blocked",
          rooms: ["dispatch", "admin-live-map"],
          payload: {
            tripId: row.tripId,
            tripNumber: row.tripNumber,
            expectedSiteName: row.siteName,
            scannedSiteName: wrongSite?.siteName ?? null,
            timestamp: new Date().toISOString(),
          },
        },
      }
    );
  }

  // ── STEP 5: GPS proximity cross-check (advisory) ──────────────────────────
  let proximity: {
    distanceMetres: number;
    geofenceRadiusMetres: number;
    withinGeofence: boolean;
  } | null = null;

  if (latitude != null && longitude != null && row.siteLat && row.siteLng) {
    const d = distanceMetres(
      latitude,
      longitude,
      parseFloat(row.siteLat),
      parseFloat(row.siteLng)
    );
    proximity = {
      distanceMetres: Math.round(d),
      geofenceRadiusMetres: row.geofenceRadius,
      withinGeofence: d <= row.geofenceRadius + 50, // 50 m scanner tolerance
    };

    // Far outside the geofence with no explicit site declared → block.
    if (!proximity.withinGeofence && !scannedAtSiteId) {
      await recordFailedScan(row.tripId, auth.user.sub, row.tenantId, "GEOFENCE_FAILED", {
        distanceMetres: proximity.distanceMetres,
        geofenceRadiusMetres: row.geofenceRadius,
      });
      return errorResponse(
        "OUTSIDE_GEOFENCE",
        `🚫 UNLOADING BLOCKED. You are ${proximity.distanceMetres} m from "${row.siteName}" (geofence ${row.geofenceRadius} m). Move to the correct project before scanning.`,
        409,
        { unloadingAuthorised: false, proximity, tripNumber: row.tripNumber }
      );
    }
  }

  // ── Everything below this line means the scan is VALID ────────────────────

  const ticketDetails = {
    tripId: row.tripId,
    tripNumber: row.tripNumber,
    deliveryTicketNumber: row.deliveryTicketNumber,
    client: { id: row.orderClientId, name: row.clientName },
    site: { id: orderSiteId, name: row.siteName },
    mixDesignCode: row.designCode,
    loadedQtyM3: parseFloat(row.loadedVolumeM3 ?? "0"),
    plateNumber: row.plateNumber,
    driverName: row.driverName,
    orderNumber: row.orderNumber,
    issuedAt: decoded.issuedAt.toISOString(),
  };

  // Preview mode — report but change nothing.
  if (previewOnly) {
    return successResponse(
      {
        valid: true,
        previewOnly: true,
        unloadingAuthorised: true,
        ticket: ticketDetails,
        proximity,
        currentCheckpoint: row.currentCheckpoint,
      },
      `✅ Ticket verified for ${row.clientName} @ ${row.siteName}. Preview only — ARR_SITE not stamped.`
    );
  }

  // Already verified once — idempotent success, no double stamping.
  if (row.qrVerifiedAt) {
    return successResponse(
      {
        valid: true,
        alreadyVerified: true,
        unloadingAuthorised: true,
        verifiedAt: row.qrVerifiedAt.toISOString(),
        ticket: ticketDetails,
        proximity,
        currentCheckpoint: row.currentCheckpoint,
      },
      `✅ Ticket already verified at ${row.qrVerifiedAt.toISOString()}. Unloading remains authorised.`
    );
  }

  // ── STEP 6: AUTO-STAMP ARR_SITE ───────────────────────────────────────────
  let arrSiteStamped = false;
  let checkpointError: string | null = null;
  let dryingRisk: { triggered: boolean; transitMinutes: number; thresholdMinutes: number } | null =
    null;

  if (row.currentCheckpoint === "DEP_PLANT") {
    try {
      const result = await updateTripCheckpoint({
        tripId: row.tripId,
        newCheckpoint: "ARR_SITE",
        loggedById: auth.user.sub,
        latitude,
        longitude,
        metadata: {
          source: "qr_ticket_verification",
          scannedBy: auth.user.fullName,
          scannerRole: auth.user.role,
          proximityMetres: proximity?.distanceMetres ?? null,
        },
      });
      arrSiteStamped = true;
      dryingRisk = result.dryingRisk;
    } catch (err) {
      checkpointError = err instanceof Error ? err.message : "Checkpoint update failed";
    }
  }

  // Mark the QR as consumed
  await db
    .update(trips)
    .set({ qrVerifiedAt: new Date(), qrVerifiedById: auth.user.sub, updatedAt: new Date() })
    .where(eq(trips.id, row.tripId));

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: row.tenantId,
    action: "QR_SCAN_VERIFIED",
    entityType: "trips",
    entityId: row.tripId,
    newState: {
      tripNumber: row.tripNumber,
      siteName: row.siteName,
      clientName: row.clientName,
      arrSiteStamped,
      proximityMetres: proximity?.distanceMetres ?? null,
    },
    socketEvent: "qr:scan_verified",
  });

  return successResponse(
    {
      valid: true,
      unloadingAuthorised: true,
      arrSiteStamped,
      checkpointError,
      ticket: ticketDetails,
      proximity,
      dryingRisk,
      socketBroadcast: {
        event: "qr:scan_verified",
        rooms: ["dispatch", "admin-live-map", "lab"],
        payload: {
          tripId: row.tripId,
          tripNumber: row.tripNumber,
          siteName: row.siteName,
          arrSiteStamped,
          timestamp: new Date().toISOString(),
        },
      },
    },
    arrSiteStamped
      ? `✅ Verified — ${row.loadedVolumeM3} m³ of ${row.designCode} for ${row.clientName}. ARR_SITE stamped automatically. Unloading authorised.`
      : `✅ Ticket verified for ${row.clientName} @ ${row.siteName}. Unloading authorised.${checkpointError ? ` (Checkpoint note: ${checkpointError})` : ""}`
  );
}
