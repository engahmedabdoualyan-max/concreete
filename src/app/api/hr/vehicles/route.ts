import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, telematicsDevices, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { isUniqueViolation, violationName } from "@/lib/db/pg-errors";
import { codeDevice } from "@/lib/services/telematics.service";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/hr/vehicles — fleet with renewal dates + drivers
 *  PUT /api/hr/vehicles/[id]/renewals — set dates (HR_WRITE)
 * ============================================================
 *  The HR vehicles tab (renewals watch + violation assignment) reads
 *  here. Gre/oily mechanical state stays in /api/workshop; this is the
 *  paperwork side: istimara, insurance, inspection expiries.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const rows = await db
    .select({
      id: fleetVehicles.id,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      make: fleetVehicles.make,
      model: fleetVehicles.model,
      year: fleetVehicles.year,
      currentStatus: fleetVehicles.currentStatus,
      assignedDriverId: fleetVehicles.assignedDriverId,
      driverName: users.fullName,
      istimaraExpiry: fleetVehicles.istimaraExpiry,
      insuranceExpiresAt: fleetVehicles.insuranceExpiresAt,
      inspectionDueAt: fleetVehicles.inspectionDueAt,
      istimaraRenewedAt: fleetVehicles.istimaraRenewedAt,
      insuranceRenewedAt: fleetVehicles.insuranceRenewedAt,
      inspectionRenewedAt: fleetVehicles.inspectionRenewedAt,
      deviceSerial: telematicsDevices.serialNumber,
    })
    .from(fleetVehicles)
    .leftJoin(users, eq(users.id, fleetVehicles.assignedDriverId))
    .leftJoin(
      telematicsDevices,
      and(
        eq(telematicsDevices.vehicleId, fleetVehicles.id),
        eq(telematicsDevices.isActive, true)
      )
    )
    .where(eq(fleetVehicles.tenantId, auth.user.tenantId))
    .orderBy(fleetVehicles.vehicleCode);
  return successResponse({ vehicles: rows }, `${rows.length} vehicle(s)`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateVehicleSchema = z.object({
  vehicleCode: z.string().trim().min(2).max(20),
  plateNumber: z.string().trim().min(1).max(30),
  vehicleType: z.enum([
    "MIXER_TRUCK",
    "CONCRETE_PUMP",
    "TRANSIT_MIXER",
    "WATER_TANKER",
    "SERVICE_TRUCK",
    "TIPPER_TRUCK",
  ]),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  year: z.number().int().min(1990).max(2100).optional(),
  notes: z.string().trim().max(500).optional(),
  assignedDriverId: z.string().uuid().nullable().optional(),
  /** Vendor IMEI to code onto the new vehicle as its primary GPS tracker. */
  deviceSerial: z.string().trim().min(4).max(80).optional(),
});

/**
 * POST /api/hr/vehicles — add a vehicle, optionally with driver + GPS device (HR_WRITE)
 *
 * One call so HR can onboard a truck end-to-end: master data, driver link, and
 * the IMEI coding. The serial path reuses codeDevice, so global IMEI
 * uniqueness and primary-per-type rules are identical to the FleetCoding screen.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = CreateVehicleSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid vehicle payload", 400);
  const d = parsed.data;

  if (d.assignedDriverId) {
    const drv = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, d.assignedDriverId), eq(users.tenantId, auth.user.tenantId)))
      .limit(1);
    if (!drv[0]) return errorResponse("DRIVER_NOT_FOUND", "السائق غير موجود", 404);
  }

  let vehicleId: string;
  try {
    const [v] = await db
      .insert(fleetVehicles)
      .values({
        tenantId: auth.user.tenantId,
        vehicleCode: d.vehicleCode,
        plateNumber: d.plateNumber,
        vehicleType: d.vehicleType,
        make: d.make || null,
        model: d.model || null,
        year: d.year ?? null,
        notes: d.notes || null,
        assignedDriverId: d.assignedDriverId ?? null,
        tareWeightTonnes: "0",
      })
      .returning({ id: fleetVehicles.id });
    vehicleId = v.id;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      const name = violationName(e) ?? "";
      if (name.includes("vehicle_code"))
        return errorResponse("DUPLICATE_CODE", "كود المركبة مستخدم بالفعل", 409);
      if (name.includes("plate_number"))
        return errorResponse("DUPLICATE_PLATE", "رقم اللوحة مستخدم بالفعل", 409);
      return errorResponse("DUPLICATE_VEHICLE", "بيانات المركبة مكررة", 409);
    }
    throw e;
  }

  if (d.deviceSerial) {
    const coded = await codeDevice(auth.user.tenantId, {
      vehicleId,
      deviceType: "GPS_TRACKER",
      serialNumber: d.deviceSerial,
      isPrimary: true,
    });
    if (!coded.ok) {
      return successResponse(
        { id: vehicleId, deviceWarning: coded.reason },
        "تمت إضافة المركبة لكن تعذّر تكويد الجهاز (تحقق من IMEI)"
      );
    }
  }

  return successResponse({ id: vehicleId }, "تمت إضافة المركبة");
}
