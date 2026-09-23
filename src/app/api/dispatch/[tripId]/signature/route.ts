/**
 * ============================================================
 *  POST /api/dispatch/[tripId]/signature — Customer sign-on-glass
 * ============================================================
 *  Captures the site recipient's signature on the driver device
 *  at/after DEP_SITE. Stored as a PNG data URL on the trip —
 *  self-contained proof of delivery (no object storage needed).
 *
 *  Body: { signatureImage: "data:image/png;base64,...", signedBy: "..." }
 *
 *  RBAC: TRIP_UPDATE_CHECKPOINT or ORDER_READ.
 *  DRIVER role restricted to own trips.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { saveTripSignature } from "@/lib/services/dispatch.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SignatureSchema = z.object({
  signatureImage: z.string().min(100).max(400_000),
  signedBy: z.string().min(1).max(120),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.TRIP_UPDATE_CHECKPOINT,
    PERMISSIONS.ORDER_READ,
  ]);
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

  const parsed = SignatureSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid signature payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Drivers can only sign their own trips
  if (auth.user.role === "DRIVER") {
    const driverRows = await db
      .select({ driverId: trips.driverId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!driverRows[0] || driverRows[0].driverId !== auth.user.sub) {
      return errorResponse("FORBIDDEN", "You can only sign your own trips", 403);
    }
  }

  try {
    const saved = await saveTripSignature({
      tripId,
      tenantId: auth.user.tenantId,
      signatureImage: parsed.data.signatureImage,
      signedBy: parsed.data.signedBy,
    });
    return successResponse(saved, "Delivery signed — proof of delivery recorded", 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("SIGNATURE_FAILED", message, 422);
  }
}
