/**
 * Express dispatch router with tenant-aware checkpoint handling.
 */

import { Router } from "express";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "@/lib/express-auth";
import { db } from "@/db";
import { trips, tripCheckpoints } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { updateTripCheckpoint } from "@/lib/services/dispatch.service";
import { verifyTicketQr } from "@/lib/qr-ticket";

export const dispatchRouter = Router();

dispatchRouter.use(requireAuth);

dispatchRouter.post(
  "/dispatch/:tripId/checkpoint",
  requireRoles("DRIVER", "DISPATCHER", "BATCH_OPERATOR", "PLANT_MGR", "SUPER_ADMIN"),
  async (req, res) => {
    const auth = req as AuthenticatedRequest;
    const tripId = String(req.params.tripId);
    const { checkpoint, latitude, longitude, gpsAccuracyMetres, metadata } = req.body;
    const ownsTenant = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.id, tripId), sql`tenant_id = ${auth.tenantId}`))
      .limit(1);
    if (!ownsTenant.length) return res.status(404).json({ success: false, errorCode: "NOT_FOUND" });
    const result = await updateTripCheckpoint({
      tripId,
      newCheckpoint: checkpoint,
      loggedById: auth.user.sub,
      latitude,
      longitude,
      gpsAccuracyMetres,
      metadata,
    });
    res.json({ success: true, data: result });
  }
);

dispatchRouter.post(
  "/dispatch/verify-ticket-qr",
  requireRoles("SALES_REP", "DRIVER", "PLANT_MGR", "SUPER_ADMIN"),
  async (req, res) => {
    const auth = req as AuthenticatedRequest;
    const decoded = verifyTicketQr(String(req.body.qrToken));
    const rows = await db
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.id, decoded.tripId), sql`tenant_id = ${auth.tenantId}`))
      .limit(1);
    if (!rows.length) return res.status(404).json({ success: false, errorCode: "NOT_FOUND" });
    res.json({ success: true, data: decoded });
  }
);

export default dispatchRouter;
