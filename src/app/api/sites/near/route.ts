/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/sites/near — "which site am I near?"
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET /api/sites/near?lat=…&lng=… — every active site of the caller's company,
 *  measured from a point and sorted nearest first.
 *
 *  WHO THIS IS FOR
 *  The driver's phone. Standing at a gate with concrete setting, the two questions
 *  that matter are "which yard am I at" and "how far is the plant". Both are
 *  answered here from one request.
 *
 *  WHY NOT /api/fleet/positions
 *  Different question, smaller answer. This returns the company's own yards
 *  measured from the caller's point — coordinates the caller already had — where
 *  /fleet/positions returns every vehicle in the fleet. The driver app needs the
 *  first and does not use the second.
 *
 *  That endpoint is gated on FLEET_POSITION_READ, which DRIVER does not hold —
 *  a driver does not get the whole fleet's map, by the owner's decision. This is
 *  how the driver answers the question without it: SITE_READ plus the phone's own
 *  coordinates, answering about site geometry and returning nothing about any
 *  other vehicle.
 *
 *  PERMISSION
 *  SITE_READ, the same as reading the site register. Deliberately not SITE_WRITE:
 *  knowing where the plant is must not imply the power to move it, and a driver
 *  account is exactly the kind of long-lived, widely-issued credential where a
 *  write grant would be a standing liability.
 *
 *  INPUT VALIDATION
 *  lat/lng are required and range-checked before they reach the service. They are
 *  bound as parameters, but an out-of-range coordinate is a client bug worth
 *  naming rather than silently computing a distance from 999°.
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { sitesWithDistancesFrom } from "@/lib/services/sites.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SITE_READ);
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const rawLat = sp.get("lat");
  const rawLng = sp.get("lng");

  if (rawLat === null || rawLng === null) {
    return errorResponse("MISSING_COORDINATES", "lat and lng are required", 400);
  }

  // Blank is rejected before Number() sees it. Number("") is 0 and Number("   ") is
  // also 0, so an empty query param would otherwise resolve to a point on the
  // equator in the Gulf of Guinea and be answered with a confident, useless set
  // of distances — a range check alone cannot catch that, because 0 is in range.
  if (rawLat.trim() === "" || rawLng.trim() === "") {
    return errorResponse(
      "MISSING_COORDINATES",
      "lat and lng are required and cannot be blank",
      400
    );
  }

  const latitude = Number(rawLat);
  const longitude = Number(rawLng);

  // NaN fails the range check, which is what rejects "abc"; the bounds are what
  // reject a real number that cannot be a coordinate.
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return errorResponse(
      "INVALID_LATITUDE",
      "lat must be a number between -90 and 90",
      400
    );
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return errorResponse(
      "INVALID_LONGITUDE",
      "lng must be a number between -180 and 180",
      400
    );
  }

  const result = await sitesWithDistancesFrom(auth.user.tenantId, latitude, longitude);

  return successResponse(result, `${result.sites.length} site(s) measured`);
}