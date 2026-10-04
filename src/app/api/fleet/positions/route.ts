/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/fleet/positions — السيارات على الخريطة (where the fleet is)
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET /api/fleet/positions — every active vehicle's last GPS fix, plus which
 *  company site it is nearest to and how far.
 *
 *  WHY THIS IS SEPARATE FROM /api/fleet
 *  /api/fleet is the asset register — codes, types, plates, assignments. It has
 *  no position in it and adding one would mean every fleet screen silently
 *  depends on how fresh the trackers are. Position is a separate question with a
 *  separate failure mode (a dead tracker), a separate permission story, and it
 *  changes constantly, so it gets its own endpoint and its own screen.
 *
 *  PERMISSION
 *  FLEET_POSITION_READ — deliberately NOT FLEET_READ.
 *
 *  FLEET_READ is about the vehicle RECORD: code, type, plate, assignment. A
 *  driver legitimately needs that for the truck he drives, so it is granted
 *  broadly. This endpoint is about where EVERY truck in the company is, and that
 *  is a dispatch-and-above question. Gating it on FLEET_READ would hand every
 *  driver a live map of his colleagues' trucks, which the owner has ruled out.
 *
 *  So the endpoint cannot assume the caller may read the register, and it must
 *  not leak the driver either: rows carry no driver identity at all, only the
 *  plate and code already on the truck. `source` is reported only as where the
 *  fix came from (DEVICE / DRIVER_APP / GPS_VENDOR). A driver who wants his own
 *  distance from the plant calls /api/sites/near, which needs SITE_READ and
 *  returns site geometry without touching the fleet at all.
 *
 *  STALENESS IS IN THE PAYLOAD, NOT LEFT TO THE CLIENT
 *  Each row carries `ageMinutes` and `isStale` (see fleet-position.service). A
 *  client that only got a lat/lng would have no way to tell a truck parked at the
 *  plant from one whose tracker died at the plant an hour ago.
 */

import { NextRequest } from "next/server";
import { requirePermission, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getFleetPositions } from "@/lib/services/fleet-position.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_POSITION_READ);
  if ("status" in auth) return auth;

  // Optional narrowing for a map that has a subset selected. Validated as UUIDs
  // before reaching the query — the service binds them as parameters, but an
  // unvalidated id should not get that far.
  const raw = req.nextUrl.searchParams.get("vehicleIds");
  let vehicleIds: string[] | undefined;
  if (raw) {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const parsed = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const good = parsed.filter((id) => UUID.test(id));
    // A caller sending only garbage gets everything rather than nothing: an empty
    // IN () list is a syntax error, and silently returning zero trucks is a worse
    // answer than returning all of them.
    if (good.length > 0) vehicleIds = good;
    else if (parsed.length > 0) vehicleIds = undefined;
  }

  const result = await getFleetPositions(auth.user.tenantId, { vehicleIds });

  return successResponse(
    result,
    `${result.positions.length} vehicle(s) positioned against ${result.siteCount} site(s)`
  );
}