/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/fleet/devices — Device coding (ربط وتكويد الأجهزة)
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET    /api/fleet/devices              — List coded devices for the tenant
 *  GET    /api/fleet/devices?serial=IMEI  — Where is this device right now?
 *  POST   /api/fleet/devices              — Code a device onto a vehicle
 *
 *  A device (drum-RPM probe, temperature probe, water-add meter, GPS tracker)
 *  is useless until it is coded onto a specific vehicle: that link is what makes
 *  its readings attributable to a truck. This is the only place that link is
 *  created, and it refuses to code the same serial onto a second vehicle —
 *  including across tenants, because a serial is a physical identity.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";
import {
  DEVICE_TYPES,
  listDevices,
  codeDevice,
  findDeviceBySerial,
  type CodeDeviceResult,
} from "@/lib/services/telematics.service";

export const dynamic = "force-dynamic";

// ─── validation ───────────────────────────────────────────────────────────────

// Valid values are listed in the header above and in DEVICE_TYPES; the error
// body returns the offending field, so a plain enum matches the rest of the API.
const DeviceTypeEnum = z.enum(DEVICE_TYPES);

const CodeDeviceSchema = z
  .object({
    vehicleId: z.string().uuid("vehicleId must be a UUID"),
    deviceType: DeviceTypeEnum,
    /** Vendor serial / IMEI printed on the hardware. Trimmed, unique globally. */
    serialNumber: z
      .string()
      .trim()
      .min(4, "serialNumber is too short to be a real serial")
      .max(80)
      .optional()
      .nullable(),
    /** Short code staff read off the dashboard, e.g. DRUM-01. Unique per tenant. */
    deviceCode: z
      .string()
      .trim()
      .min(2, "deviceCode is too short")
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/, "deviceCode may only contain letters, digits, dot, dash and underscore")
      .optional()
      .nullable(),
    isPrimary: z.boolean().optional(),
    mountedAt: z.string().datetime().optional().nullable(),
  })
  .refine((v) => v.serialNumber != null || v.deviceCode != null, {
    message:
      "Provide serialNumber (the vendor IMEI) or deviceCode so the device has an identity",
    path: ["serialNumber"],
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const serial = url.searchParams.get("serial")?.trim();

  // "Where did I put this tracker?" — the question the workshop actually asks.
  if (serial) {
    const found = await findDeviceBySerial(serial);
    if (!found) {
      return errorResponse(
        "DEVICE_NOT_CODED",
        `No device is coded with serial ${serial}. It is available to code onto a vehicle.`,
        404
      );
    }
    // A serial is not tenant data, but where a device sits is. Another tenant's
    // answer is "not coded", never their fleet layout.
    if (found.tenantId !== auth.user.tenantId) {
      return errorResponse(
        "DEVICE_NOT_CODED",
        `No device is coded with serial ${serial} in your company.`,
        404
      );
    }
    // An uncoded device still reports where it came from — that history is what
    // makes the answer useful — but the message must not read as "it is on that
    // truck now", or a workshop would stop searching for a probe that is gone.
    if (!found.isActive) {
      return successResponse(
        found,
        `Serial ${serial} was uncoded from ${found.vehicleCode}. It is available to code onto a vehicle.`
      );
    }
    return successResponse(found, `Serial ${serial} is coded on ${found.vehicleCode}.`);
  }

  const typeFilter = url.searchParams.get("type");
  if (typeFilter && !DEVICE_TYPES.includes(typeFilter as never)) {
    return errorResponse(
      "INVALID_DEVICE_TYPE",
      `type must be one of: ${DEVICE_TYPES.join(", ")}`,
      400
    );
  }

  const devices = await listDevices(auth.user.tenantId, {
    vehicleId: url.searchParams.get("vehicleId") ?? undefined,
    deviceType: typeFilter ?? undefined,
    activeOnly: url.searchParams.get("includeInactive") !== "true",
  });

  return successResponse(devices, `${devices.length} device(s) coded.`);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CodeDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid device data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // The uniqueness rules in migration 0020 are the real authority; the checks
  // inside codeDevice only turn them into a readable message. A concurrent
  // request can still win the race between our read and our insert, in which
  // case Postgres rejects the write with 23505 and we name the identity from
  // the index that rejected it.
  let result: CodeDeviceResult;
  try {
    result = await codeDevice(auth.user.tenantId, {
      ...parsed.data,
      linkedById: auth.user.sub,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const identity = parsed.data.serialNumber
        ? `serial ${parsed.data.serialNumber}`
        : `code ${parsed.data.deviceCode}`;
      return errorResponse(
        "DEVICE_IDENTITY_TAKEN",
        `Another request coded that ${identity} onto a vehicle a moment ago. Reload the fleet and try again.`,
        409,
        { constraint: (err as { constraint?: string }).constraint ?? null }
      );
    }
    throw err;
  }

  if (!result.ok) {
    return conflictResponse(result, parsed.data);
  }

  const device = result.device;

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "DEVICE_CODED",
    entityType: "telematics_devices",
    entityId: device.id,
    newState: {
      vehicleId: device.vehicleId,
      deviceType: device.deviceType,
      deviceCode: device.deviceCode,
      serialNumber: device.serialNumber,
      isPrimary: device.isPrimary,
    },
  });

  return successResponse(
    {
      id: device.id,
      vehicleId: device.vehicleId,
      deviceType: device.deviceType,
      deviceCode: device.deviceCode,
      serialNumber: device.serialNumber,
      isPrimary: device.isPrimary,
      linkedAt: device.linkedAt,
    },
    `Device ${device.deviceCode ?? device.serialNumber} coded onto vehicle ${device.vehicleId}.`,
    201
  );
}

// ─── conflict mapping ──────────────────────────────────────────────────────────


/**
 * Every "this device is already somewhere else" case is a 409 with the vehicle
 * that currently holds it, so the workshop can go and fix the real truck
 * instead of guessing. `VEHICLE_NOT_FOUND` is the one case that is a 404.
 */
function conflictResponse(
  result: Exclude<CodeDeviceResult, { ok: true }>,
  input: { deviceCode?: string | null; serialNumber?: string | null }
) {
  switch (result.reason) {
    case "VEHICLE_NOT_FOUND":
      return errorResponse(
        "VEHICLE_NOT_FOUND",
        "That vehicle does not exist in your company.",
        404
      );

    case "VEHICLE_INACTIVE":
      return errorResponse(
        "VEHICLE_INACTIVE",
        `Vehicle ${result.vehicleCode} is archived. Reactivate it before coding a device onto it.`,
        409
      );

    case "SERIAL_ALREADY_CODED":
      return errorResponse(
        "SERIAL_ALREADY_CODED",
        `This device is already coded onto vehicle ${result.existingVehicleCode}. ` +
          `Uncode it there first — a device serial identifies one physical unit.`,
        409,
        {
          serialNumber: input.serialNumber,
          existingDeviceId: result.existingDeviceId,
          existingVehicleId: result.existingVehicleId,
          existingVehicleCode: result.existingVehicleCode,
        }
      );

    case "DEVICE_CODE_TAKEN":
      return errorResponse(
        "DEVICE_CODE_TAKEN",
        `Device code ${input.deviceCode} is already used by the device on vehicle ${result.existingVehicleCode}.`,
        409,
        {
          deviceCode: input.deviceCode,
          existingDeviceId: result.existingDeviceId,
          existingVehicleCode: result.existingVehicleCode,
        }
      );
  }
}
