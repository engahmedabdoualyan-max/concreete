/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  GET /api/dispatch/my-active — Driver's active trip
 *  Returns the caller's most recent non-completed, non-cancelled
 *  trip with the commercial context joined in. Returns `null`
 *  (200) when the driver has no active trip.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { trips, orders, clients, deliverySites, mixDesigns, fleetVehicles } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;

  const rows = await db
    .select({
      id: trips.id,
      tripNumber: trips.tripNumber,
      orderId: trips.orderId,
      vehicleId: trips.vehicleId,
      driverId: trips.driverId,
      mixDesignId: trips.mixDesignId,
      loadedVolumeM3: trips.loadedVolumeM3,
      currentCheckpoint: trips.currentCheckpoint,
      deliveryTicketNumber: trips.deliveryTicketNumber,
      qrCodeToken: trips.qrCodeToken,
      isCompleted: trips.isCompleted,
      isCancelled: trips.isCancelled,
      createdAt: trips.createdAt,
      // E-signature proof (Epic 3) — boolean only on the hot poll path;
      // the full image is fetched on demand via the portal/trip detail.
      hasSignature: sql<boolean>`${trips.signatureImage} IS NOT NULL`,
      signedBy: trips.signedBy,
      signedAt: trips.signedAt,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      clientName: clients.companyName,
      siteName: deliverySites.siteName,
      siteLatitude: deliverySites.latitude,
      siteLongitude: deliverySites.longitude,
      geofenceRadiusMetres: deliverySites.geofenceRadiusMetres,
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
    })
    .from(trips)
    .innerJoin(orders, eq(trips.orderId, orders.id))
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .innerJoin(mixDesigns, eq(trips.mixDesignId, mixDesigns.id))
    .innerJoin(fleetVehicles, eq(trips.vehicleId, fleetVehicles.id))
    .where(
      and(
        eq(trips.driverId, auth.user.sub),
        eq(trips.tenantId, auth.user.tenantId),
        eq(trips.isCompleted, false),
        eq(trips.isCancelled, false)
      )
    )
    .orderBy(desc(trips.createdAt))
    .limit(1);

  return successResponse(rows[0] ?? null);
}
