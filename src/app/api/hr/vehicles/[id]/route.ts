import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * PUT /api/hr/vehicles/[id] — edit vehicle master data (HR_WRITE)
 *
 * HR owns the paperwork side of the fleet: vehicle code, plate number, type,
 * make, model and year. The GPS device serial (IMEI) is deliberately NOT
 * editable here — devices are coded/moved from /api/fleet/devices (FleetCoding
 * screen), where global serial uniqueness and primary-per-type rules are
 * enforced. Letting HR retype an IMEI would silently re-point live telemetry.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UpdateVehicleSchema = z.object({
  vehicleCode: z.string().trim().min(2).max(20).optional(),
  plateNumber: z.string().trim().min(1).max(30).optional(),
  vehicleType: z
    .enum([
      "MIXER_TRUCK",
      "CONCRETE_PUMP",
      "TRANSIT_MIXER",
      "WATER_TANKER",
      "SERVICE_TRUCK",
      "TIPPER_TRUCK",
    ])
    .optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  year: z.number().int().min(1990).max(2100).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid vehicle id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = UpdateVehicleSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid vehicle payload", 400);
  const d = parsed.data;
  if (
    d.vehicleCode === undefined &&
    d.plateNumber === undefined &&
    d.vehicleType === undefined &&
    d.make === undefined &&
    d.model === undefined &&
    d.year === undefined
  ) {
    return errorResponse("VALIDATION_ERROR", "Nothing to update", 400);
  }

  const patch: Record<string, string | number | null> = {};
  if (d.vehicleCode !== undefined) patch.vehicleCode = d.vehicleCode;
  if (d.plateNumber !== undefined) patch.plateNumber = d.plateNumber;
  if (d.vehicleType !== undefined) patch.vehicleType = d.vehicleType;
  if (d.make !== undefined) patch.make = d.make || null;
  if (d.model !== undefined) patch.model = d.model || null;
  if (d.year !== undefined) patch.year = d.year;

  try {
    const [updated] = await db
      .update(fleetVehicles)
      .set(patch)
      .where(and(eq(fleetVehicles.id, id), eq(fleetVehicles.tenantId, auth.user.tenantId)))
      .returning({ id: fleetVehicles.id });
    if (!updated) return errorResponse("VEHICLE_NOT_FOUND", "Vehicle not found", 404);
    return successResponse({ id: updated.id }, "تم حفظ بيانات المركبة");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("fleet_vehicles_vehicle_code_unique"))
      return errorResponse("DUPLICATE_CODE", "كود المركبة مستخدم بالفعل", 409);
    if (msg.includes("fleet_vehicles_plate_number_unique"))
      return errorResponse("DUPLICATE_PLATE", "رقم اللوحة مستخدم بالفعل", 409);
    throw e;
  }
}
