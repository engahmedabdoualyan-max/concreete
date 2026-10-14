/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Drum Telematics Service (Epic 5 — Competitive Parity)
 * ============================================================
 *
 *  Live drum intelligence (InfoRMC / Coretex / BatchLogic parity):
 *   • ingestReading — validated probe ingestion (single or batch)
 *   • getTripTelemetry — per-trip RPM/temp/water series + aggregates
 *   • checkWorkability — concrete age vs threshold countdown:
 *       FRESH (age < 70%) · AGING (70–100%) · EXPIRED (> 100%)
 *     with rotation-stop detection (RPM ≈ 0 while loaded = agitation gap)
 *
 *  Threshold default 90 min mirrors MAX_TRANSIT_MINUTES_STRICT.
 * ============================================================
 */

import { db } from "@/db";
import {
  telematicsReadings,
  telematicsDevices,
  fleetVehicles,
  trips,
  tripCheckpoints,
} from "@/db/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";

export const WORKABILITY_THRESHOLD_MINUTES = 90;
/** RPM below this counts as a stopped drum. */
export const DRUM_STOPPED_RPM = 0.5;

export interface TelemetryReadingInput {
  truckId: string; // vehicle_code OR vehicle UUID
  drumRpm?: number;
  concreteTempC?: number;
  waterAddedL?: number;
  latitude?: number;
  longitude?: number;
  speedKmh?: number;
  capturedAt?: string;
  source?: "DEVICE" | "DRIVER_APP" | "GPS_VENDOR";
}

export interface IngestResult {
  accepted: number;
  rejected: { index: number; error: string }[];
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Which vehicle a probe's `truck_id` refers to.
 *
 * Probes report whatever they were configured with, and in practice that is one
 * of three things:
 *   1. the vehicle code   — "MIX-01"   (works before any device is coded)
 *   2. the vehicle UUID    — from the mobile app
 *   3. the device serial   — "867994045123456", the IMEI printed on the probe
 *
 * (3) is what makes coding worth doing: the probe is installed blind, with no
 * knowledge of which mixer it will end up on, and it keeps reporting under the
 * same IMEI for its whole life. So the serial is resolved through the device
 * registry to the vehicle it is currently coded onto. That is precisely why a
 * serial may only ever be coded once (migration 0020) — a duplicate here would
 * silently send one probe's readings to two trucks.
 *
 * Vehicle code is still tried first, so existing integrations are unaffected.
 * Uncoded devices are skipped: a probe that has been removed from a truck must
 * stop resolving rather than keep feeding readings to its last vehicle.
 */
async function resolveVehicle(tenantId: string, truckId: string) {
  // NOTE: the tenant is inferred from the integration key by the route layer
  // before calling, so every lookup below is scoped to it.
  const rows = await db
    .select({ id: fleetVehicles.id, tenantId: fleetVehicles.tenantId })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.tenantId, tenantId),
        or(
          eq(fleetVehicles.vehicleCode, truckId),
          ...(/^[0-9a-f-]{36}$/i.test(truckId)
            ? [eq(fleetVehicles.id, truckId)]
            : [])
        )
      )
    )
    .limit(1);
  if (rows[0]) return { ...rows[0], deviceId: null };

  const viaDevice = await db
    .select({
      id: fleetVehicles.id,
      tenantId: fleetVehicles.tenantId,
      deviceId: telematicsDevices.id,
    })
    .from(telematicsDevices)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
    .where(
      and(
        eq(telematicsDevices.tenantId, tenantId),
        eq(telematicsDevices.serialNumber, truckId),
        eq(telematicsDevices.isActive, true),
        eq(fleetVehicles.isActive, true)
      )
    )
    .limit(1);

  return viaDevice[0] ?? null;
}

/**
 * Stamp the devices that just reported, so the registry can show which hardware
 * is actually alive. An uncoded probe has no row, so this is a silent no-op for
 * anything arriving by vehicle code — which is the point: `lastSeenAt` empty
 * means "nobody has wired this hardware up yet".
 */
async function touchDevices(
  deviceIds: string[],
  seenAt: Date
): Promise<void> {
  const unique = [...new Set(deviceIds)].filter(Boolean);
  if (unique.length === 0) return;
  await db
    .update(telematicsDevices)
    .set({ lastSeenAt: seenAt, updatedAt: seenAt })
    .where(inArray(telematicsDevices.id, unique));
}

/**
 * Which tenant a probe's `truck_id` belongs to — used by the ingest route
 * *before* the tenant is known, which is why it is not tenant-scoped.
 *
 * Accepts the same three identifiers as `resolveVehicle`, and looks them up in
 * the same order, so the route and the service can never disagree about who a
 * reading came from. Keeping one implementation matters: if the route resolved
 * serials but the service did not (or the reverse), readings would be attributed
 * to a tenant that then rejects them, or silently dropped as "unknown truck".
 */
export async function findIngestOwner(
  truckId: string
): Promise<{ tenantId: string; vehicleId: string; deviceId: string | null } | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(truckId);

  const byVehicle = await db
    .select({
      tenantId: fleetVehicles.tenantId,
      vehicleId: fleetVehicles.id,
    })
    .from(fleetVehicles)
    .where(isUuid ? eq(fleetVehicles.id, truckId) : eq(fleetVehicles.vehicleCode, truckId))
    .limit(1);
  if (byVehicle[0]) {
    return { ...byVehicle[0], deviceId: null };
  }

  const bySerial = await db
    .select({
      tenantId: fleetVehicles.tenantId,
      vehicleId: fleetVehicles.id,
      deviceId: telematicsDevices.id,
    })
    .from(telematicsDevices)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
    .where(
      and(
        eq(telematicsDevices.serialNumber, truckId),
        eq(telematicsDevices.isActive, true),
        eq(fleetVehicles.isActive, true)
      )
    )
    .limit(1);
  return bySerial[0] ?? null;
}

async function activeTripFor(tenantId: string, vehicleId: string) {
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.tenantId, tenantId),
        eq(trips.vehicleId, vehicleId),
        eq(trips.isCompleted, false),
        eq(trips.isCancelled, false)
      )
    )
    .orderBy(desc(trips.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

function validateReading(r: TelemetryReadingInput): string | null {
  if (!r.truckId) return "truckId is required";
  if (r.drumRpm !== undefined && (r.drumRpm < 0 || r.drumRpm > 30))
    return "drumRpm out of range 0–30";
  if (r.concreteTempC !== undefined && (r.concreteTempC < -10 || r.concreteTempC > 80))
    return "concreteTempC out of range";
  if (r.waterAddedL !== undefined && (r.waterAddedL < 0 || r.waterAddedL > 5000))
    return "waterAddedL out of range";
  if (r.latitude !== undefined && (r.latitude < -90 || r.latitude > 90))
    return "latitude out of range";
  if (r.longitude !== undefined && (r.longitude < -180 || r.longitude > 180))
    return "longitude out of range";
  if (r.speedKmh !== undefined && (r.speedKmh < 0 || r.speedKmh > 400))
    return "speedKmh out of range";
  return null;
}

export async function ingestReadings(
  tenantId: string,
  readings: TelemetryReadingInput[]
): Promise<IngestResult> {
  const accepted: {
    tenantId: string;
    vehicleId: string;
    tripId: string | null;
    drumRpm?: string;
    concreteTempC?: string;
    waterAddedL?: string;
    latitude?: string;
    longitude?: string;
    speedKmh?: string;
    source: string;
    capturedAt: Date;
  }[] = [];
  const rejected: { index: number; error: string }[] = [];

  // Vehicle resolution cache for batch efficiency
  const vehicleCache = new Map<string, string>();
  const tripCache = new Map<string, string | null>();
  /** Devices that reported under their own IMEI, so they can be stamped alive. */
  const reportingDevices: string[] = [];

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const err = validateReading(r);
    if (err) {
      rejected.push({ index: i, error: err });
      continue;
    }

    let vehicleId = vehicleCache.get(r.truckId);
    if (vehicleId === undefined) {
      const v = await resolveVehicle(tenantId, r.truckId);
      vehicleId = v?.id ?? "";
      vehicleCache.set(r.truckId, vehicleId);
      if (v?.deviceId) reportingDevices.push(v.deviceId);
    }
    if (!vehicleId) {
      rejected.push({ index: i, error: "Unknown truck_id" });
      continue;
    }

    let tripId = tripCache.get(vehicleId);
    if (tripId === undefined) {
      tripId = await activeTripFor(tenantId, vehicleId);
      tripCache.set(vehicleId, tripId);
    }

    accepted.push({
      tenantId,
      vehicleId,
      tripId,
      drumRpm: r.drumRpm !== undefined ? String(r.drumRpm) : undefined,
      concreteTempC: r.concreteTempC !== undefined ? String(r.concreteTempC) : undefined,
      waterAddedL: r.waterAddedL !== undefined ? String(r.waterAddedL) : undefined,
      latitude: r.latitude !== undefined ? String(r.latitude) : undefined,
      longitude: r.longitude !== undefined ? String(r.longitude) : undefined,
      speedKmh: r.speedKmh !== undefined ? String(r.speedKmh) : undefined,
      source: r.source ?? "DEVICE",
      capturedAt: r.capturedAt ? new Date(r.capturedAt) : new Date(),
    });
  }

  if (accepted.length > 0) {
    await db.insert(telematicsReadings).values(accepted);
    // Bump device last-seen + vehicle live position from the freshest fix
    const seen = new Map<string, Date>();
    for (const a of accepted) {
      const prev = seen.get(a.vehicleId);
      if (!prev || a.capturedAt > prev) seen.set(a.vehicleId, a.capturedAt);
    }
    for (const [vehicleId, at] of seen) {
      await db
        .update(fleetVehicles)
        .set({ lastGpsAt: at, updatedAt: new Date() })
        .where(eq(fleetVehicles.id, vehicleId));
    }
    // Only probes that identified themselves by IMEI land here; anything
    // reporting under a vehicle code has no device row to stamp.
    await touchDevices(reportingDevices, new Date());
  }

  return { accepted: accepted.length, rejected };
}

// ─── Per-trip telemetry + workability ─────────────────────────────────────────

export interface TripTelemetry {
  tripId: string;
  readings: {
    capturedAt: string;
    drumRpm: number | null;
    concreteTempC: number | null;
    waterAddedL: number | null;
    speedKmh: number | null;
  }[];
  aggregate: {
    count: number;
    avgRpm: number | null;
    maxTempC: number | null;
    totalWaterAddedL: number | null;
    rotationStops: number;
  };
  workability: {
    status: "FRESH" | "AGING" | "EXPIRED" | "UNKNOWN";
    ageMinutes: number | null;
    remainingMinutes: number | null;
    thresholdMinutes: number;
  };
}

export async function getTripTelemetry(
  tenantId: string,
  tripId: string,
  limit = 200
): Promise<TripTelemetry | null> {
  const t = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.tenantId, tenantId)))
    .limit(1);
  if (!t[0]) return null;

  const rows = await db
    .select()
    .from(telematicsReadings)
    .where(
      and(
        eq(telematicsReadings.tripId, tripId),
        eq(telematicsReadings.tenantId, tenantId)
      )
    )
    .orderBy(desc(telematicsReadings.capturedAt))
    .limit(limit);

  const readings = [...rows].reverse().map((r) => ({
    capturedAt: r.capturedAt.toISOString(),
    drumRpm: toNum(r.drumRpm) ?? null,
    concreteTempC: toNum(r.concreteTempC) ?? null,
    waterAddedL: toNum(r.waterAddedL) ?? null,
    speedKmh: toNum(r.speedKmh) ?? null,
  }));

  const rpms = readings.map((r) => r.drumRpm).filter((n): n is number => n !== null);
  const temps = readings
    .map((r) => r.concreteTempC)
    .filter((n): n is number => n !== null);
  const waters = readings
    .map((r) => r.waterAddedL)
    .filter((n): n is number => n !== null);

  // Rotation stops: transitions from spinning → stopped
  let rotationStops = 0;
  let wasSpinning = false;
  for (const rpm of rpms) {
    const spinning = rpm > DRUM_STOPPED_RPM;
    if (wasSpinning && !spinning) rotationStops++;
    wasSpinning = spinning;
  }

  // Workability: age since batch (DEP_PLANT, else ticket issue, else trip start)
  const dep = await db
    .select({ loggedAt: tripCheckpoints.loggedAt })
    .from(tripCheckpoints)
    .where(
      and(
        eq(tripCheckpoints.tripId, tripId),
        eq(tripCheckpoints.checkpoint, "DEP_PLANT")
      )
    )
    .limit(1);
  const batchAt = dep[0]?.loggedAt
    ? new Date(dep[0].loggedAt).getTime()
    : null;
  let workability: TripTelemetry["workability"] = {
    status: "UNKNOWN",
    ageMinutes: null,
    remainingMinutes: null,
    thresholdMinutes: WORKABILITY_THRESHOLD_MINUTES,
  };
  if (batchAt) {
    const age = Math.max(0, Math.round((Date.now() - batchAt) / 60_000));
    const ratio = age / WORKABILITY_THRESHOLD_MINUTES;
    workability = {
      status: ratio >= 1 ? "EXPIRED" : ratio >= 0.7 ? "AGING" : "FRESH",
      ageMinutes: age,
      remainingMinutes: Math.max(0, WORKABILITY_THRESHOLD_MINUTES - age),
      thresholdMinutes: WORKABILITY_THRESHOLD_MINUTES,
    };
  }

  return {
    tripId,
    readings,
    aggregate: {
      count: readings.length,
      avgRpm:
        rpms.length > 0
          ? Math.round((rpms.reduce((s, n) => s + n, 0) / rpms.length) * 10) / 10
          : null,
      maxTempC: temps.length > 0 ? Math.max(...temps) : null,
      totalWaterAddedL: waters.length > 0 ? waters[waters.length - 1] : null,
      rotationStops,
    },
    workability,
  };
}

// ─── Device registry ──────────────────────────────────────────────────────────

/** The four coded device families we mount on a vehicle. */
export const DEVICE_TYPES = [
  "DRUM_RPM",
  "CONCRETE_TEMP",
  "WATER_ADD_METER",
  "GPS_TRACKER",
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface DeviceFilters {
  vehicleId?: string;
  deviceType?: string;
  activeOnly?: boolean;
}

/**
 * Devices for a tenant, joined to the vehicle they are coded onto.
 *
 * Ordered so the vehicle's primary device of each type comes first — that is
 * the pairing the fleet screens and the workshop actually read.
 */
export async function listDevices(tenantId: string, filters: DeviceFilters = {}) {
  const conditions = [eq(telematicsDevices.tenantId, tenantId)];
  if (filters.vehicleId) {
    conditions.push(eq(telematicsDevices.vehicleId, filters.vehicleId));
  }
  if (filters.deviceType) {
    conditions.push(eq(telematicsDevices.deviceType, filters.deviceType));
  }
  if (filters.activeOnly) {
    conditions.push(eq(telematicsDevices.isActive, true));
  }

  return db
    .select({
      id: telematicsDevices.id,
      vehicleId: telematicsDevices.vehicleId,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      deviceType: telematicsDevices.deviceType,
      deviceCode: telematicsDevices.deviceCode,
      serialNumber: telematicsDevices.serialNumber,
      isPrimary: telematicsDevices.isPrimary,
      isActive: telematicsDevices.isActive,
      mountedAt: telematicsDevices.mountedAt,
      linkedAt: telematicsDevices.linkedAt,
      lastSeenAt: telematicsDevices.lastSeenAt,
      createdAt: telematicsDevices.createdAt,
    })
    .from(telematicsDevices)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
    .where(and(...conditions))
    .orderBy(
      desc(telematicsDevices.isPrimary),
      fleetVehicles.vehicleCode,
      telematicsDevices.createdAt
    );
}

/** Outcome of a coding attempt, so the route can pick the right HTTP status. */
export type CodeDeviceResult =
  | { ok: true; device: typeof telematicsDevices.$inferSelect }
  | { ok: false; reason: "VEHICLE_NOT_FOUND" }
  | { ok: false; reason: "VEHICLE_INACTIVE"; vehicleCode: string }
  | {
      ok: false;
      reason: "SERIAL_ALREADY_CODED";
      existingVehicleId: string;
      existingVehicleCode: string;
      existingDeviceId: string;
    }
  | {
      ok: false;
      reason: "DEVICE_CODE_TAKEN";
      existingDeviceId: string;
      existingVehicleCode: string;
    };

export interface CodeDeviceInput {
  vehicleId: string;
  deviceType: DeviceType | string;
  serialNumber?: string | null;
  deviceCode?: string | null;
  isPrimary?: boolean;
  mountedAt?: string | null;
  linkedById?: string | null;
}

/**
 * Code a device onto a vehicle — the "ربط وتكويد" operation.
 *
 * A device serial is a physical identity, so it can only ever be coded once
 * globally. The database enforces that too (0020); this function exists to turn
 * the constraint violation into a message that names the vehicle already
 * holding the device, instead of surfacing a raw Postgres error. The check and
 * the insert are separated on purpose: a concurrent coding of the same IMEI is
 * still caught by the unique index, and the route maps 23505 the same way.
 */
export async function codeDevice(
  tenantId: string,
  input: CodeDeviceInput
): Promise<CodeDeviceResult> {
  const serial = input.serialNumber?.trim() || null;
  const code = input.deviceCode?.trim().toUpperCase() || null;

  const vehicle = await db
    .select({
      id: fleetVehicles.id,
      code: fleetVehicles.vehicleCode,
      isActive: fleetVehicles.isActive,
    })
    .from(fleetVehicles)
    .where(
      and(eq(fleetVehicles.id, input.vehicleId), eq(fleetVehicles.tenantId, tenantId))
    )
    .limit(1);

  if (!vehicle[0]) return { ok: false, reason: "VEHICLE_NOT_FOUND" };
  if (!vehicle[0].isActive) {
    return {
      ok: false,
      reason: "VEHICLE_INACTIVE",
      vehicleCode: vehicle[0].code,
    };
  }

  if (serial) {
    const clash = await db
      .select({
        deviceId: telematicsDevices.id,
        vehicleId: telematicsDevices.vehicleId,
        vehicleCode: fleetVehicles.vehicleCode,
      })
      .from(telematicsDevices)
      .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
      .where(
        and(
          eq(telematicsDevices.serialNumber, serial),
          eq(telematicsDevices.isActive, true)
        )
      )
      .limit(1);

    if (clash[0]) {
      return {
        ok: false,
        reason: "SERIAL_ALREADY_CODED",
        existingDeviceId: clash[0].deviceId,
        existingVehicleId: clash[0].vehicleId,
        existingVehicleCode: clash[0].vehicleCode,
      };
    }
  }

  if (code) {
    const clash = await db
      .select({
        deviceId: telematicsDevices.id,
        vehicleCode: fleetVehicles.vehicleCode,
      })
      .from(telematicsDevices)
      .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
      .where(
        and(
          eq(telematicsDevices.tenantId, tenantId),
          eq(telematicsDevices.deviceCode, code),
          eq(telematicsDevices.isActive, true)
        )
      )
      .limit(1);

    if (clash[0]) {
      return {
        ok: false,
        reason: "DEVICE_CODE_TAKEN",
        existingDeviceId: clash[0].deviceId,
        existingVehicleCode: clash[0].vehicleCode,
      };
    }
  }

  // One primary per type per vehicle: demote whatever held it before, so the
  // partial unique index in 0020 cannot reject a legitimate replacement.
  if (input.isPrimary) {
    await db
      .update(telematicsDevices)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(telematicsDevices.vehicleId, vehicle[0].id),
          eq(telematicsDevices.deviceType, input.deviceType as never),
          eq(telematicsDevices.isPrimary, true)
        )
      );
  }

  const [created] = await db
    .insert(telematicsDevices)
    .values({
      tenantId,
      vehicleId: vehicle[0].id,
      deviceType: input.deviceType,
      serialNumber: serial,
      deviceCode: code,
      isPrimary: input.isPrimary ?? false,
      mountedAt: input.mountedAt ? new Date(input.mountedAt) : new Date(),
      linkedAt: new Date(),
      linkedById: input.linkedById ?? null,
    })
    .returning();

  return { ok: true, device: created };
}

export type RelinkDeviceResult =
  | { ok: true; device: typeof telematicsDevices.$inferSelect }
  | { ok: false; reason: "DEVICE_NOT_FOUND" }
  | { ok: false; reason: "VEHICLE_NOT_FOUND" }
  | { ok: false; reason: "SERIAL_ALREADY_CODED"; existingVehicleCode: string }
  | { ok: false; reason: "DEVICE_CODE_TAKEN"; existingVehicleCode: string };

/**
 * Move an already-coded device to another vehicle (a tracker swapped between
 * trucks). The device keeps its identity, so its historical readings stay
 * attached to it; only the vehicle it reports against changes.
 */
export async function relinkDevice(
  tenantId: string,
  deviceId: string,
  input: { vehicleId: string; isPrimary?: boolean }
): Promise<RelinkDeviceResult> {
  const existing = await db
    .select({ id: telematicsDevices.id, serialNumber: telematicsDevices.serialNumber })
    .from(telematicsDevices)
    .where(
      and(
        eq(telematicsDevices.id, deviceId),
        eq(telematicsDevices.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!existing[0]) return { ok: false, reason: "DEVICE_NOT_FOUND" };

  const vehicle = await db
    .select({ id: fleetVehicles.id, code: fleetVehicles.vehicleCode })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, input.vehicleId),
        eq(fleetVehicles.tenantId, tenantId),
        eq(fleetVehicles.isActive, true)
      )
    )
    .limit(1);
  if (!vehicle[0]) return { ok: false, reason: "VEHICLE_NOT_FOUND" };

  const [updated] = await db
    .update(telematicsDevices)
    .set({
      vehicleId: vehicle[0].id,
      isPrimary: input.isPrimary ?? undefined,
      linkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(telematicsDevices.id, deviceId))
    .returning();

  return { ok: true, device: updated };
}

export type UnlinkDeviceResult =
  | { ok: true }
  | { ok: false; reason: "DEVICE_NOT_FOUND" };

/**
 * Uncode a device from a vehicle.
 *
 * The row is deactivated rather than deleted, for two reasons.
 *
 * `telematics_devices.vehicle_id` is `ON DELETE CASCADE`, so deleting a device
 * is fine — but the row is the only record that this IMEI ever existed on this
 * fleet, and `telematics_readings` attributes to the vehicle rather than to the
 * device. Deleting would leave no trace of which physical probe produced a
 * given drum series, which is exactly the audit trail a concrete dispute needs.
 *
 * Deactivating also stops the serial resolving again: `resolveVehicle` skips
 * inactive devices, so a probe pulled off a truck for repair can no longer feed
 * readings into its last vehicle, while the history stays readable.
 */
export async function unlinkDevice(
  tenantId: string,
  deviceId: string
): Promise<UnlinkDeviceResult> {
  const rows = await db
    .update(telematicsDevices)
    .set({ isActive: false, isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(telematicsDevices.id, deviceId),
        eq(telematicsDevices.tenantId, tenantId)
      )
    )
    .returning({ id: telematicsDevices.id });

  if (!rows[0]) return { ok: false, reason: "DEVICE_NOT_FOUND" };
  return { ok: true };
}

/**
 * Find the device a serial is currently coded onto, across all tenants.
 *
 * Active devices win over uncoded history for the same IMEI: the question this
 * answers is "where is this hardware right now", and after a re-code the current
 * truck is the useful answer. When every match is inactive the latest one is
 * returned, so a lookup of a probe taken off a truck still reports where it came
 * from rather than looking like it never existed.
 */
export async function findDeviceBySerial(serial: string) {
  const rows = await db
    .select({
      id: telematicsDevices.id,
      tenantId: telematicsDevices.tenantId,
      vehicleId: telematicsDevices.vehicleId,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      deviceType: telematicsDevices.deviceType,
      deviceCode: telematicsDevices.deviceCode,
      isActive: telematicsDevices.isActive,
      linkedAt: telematicsDevices.linkedAt,
    })
    .from(telematicsDevices)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
    .where(eq(telematicsDevices.serialNumber, serial))
    .orderBy(desc(telematicsDevices.isActive), desc(telematicsDevices.linkedAt))
    .limit(1);
  return rows[0] ?? null;
}
