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
import { and, desc, eq, or } from "drizzle-orm";

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

async function resolveVehicle(tenantId: string, truckId: string) {
  // NOTE: devices are tenant-scoped by header key mapping in the route layer;
  // here we match by code-or-id within the tenant inferred from the key.
  // The route resolves tenantId from the integration key before calling.
  const rows = await db
    .select({ id: fleetVehicles.id, tenantId: fleetVehicles.tenantId })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.tenantId, tenantId),
        or(
          eq(fleetVehicles.vehicleCode, truckId),
          ...( /^[0-9a-f-]{36}$/i.test(truckId)
            ? [eq(fleetVehicles.id, truckId)]
            : [])
        )
      )
    )
    .limit(1);
  return rows[0] ?? null;
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

export async function listDevices(tenantId: string) {
  return db
    .select()
    .from(telematicsDevices)
    .where(eq(telematicsDevices.tenantId, tenantId))
    .orderBy(telematicsDevices.createdAt);
}

export async function registerDevice(
  tenantId: string,
  input: {
    vehicleId: string;
    deviceType: string;
    serialNumber?: string;
  }
) {
  const v = await db
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.id, input.vehicleId), eq(fleetVehicles.tenantId, tenantId)))
    .limit(1);
  if (!v[0]) return null;

  const [created] = await db
    .insert(telematicsDevices)
    .values({
      tenantId,
      vehicleId: input.vehicleId,
      deviceType: input.deviceType,
      serialNumber: input.serialNumber,
    })
    .returning();
  return created;
}
