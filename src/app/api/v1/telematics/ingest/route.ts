/**
 * ============================================================
 *  POST /api/v1/telematics/ingest — Drum/IoT probe ingestion
 * ============================================================
 *
 *  Open, authenticated endpoint for drum-RPM probes, temperature
 *  sensors and GPS vendors streaming mixer telemetry.
 *
 *  AUTH: static `X-Integration-Key` (constant-time compare against
 *  TELEMATICS_INGEST_KEY). Tenant is resolved from the matched
 *  vehicle — readings are grouped per tenant before insert.
 *
 *  ACCEPTS single reading or batch (max 500):
 *    { truck_id, drum_rpm?, concrete_temp_c?, water_added_l?,
 *      latitude?, longitude?, speed_kmh?, captured_at?, source? }
 *    { readings: [ ... ] }
 * ============================================================
 */

import { NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { fleetVehicles } from "@/db/schema";
import { or, eq } from "drizzle-orm";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { ingestReadings, type TelemetryReadingInput } from "@/lib/services/telematics.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const INGEST_KEY =
  process.env.TELEMATICS_INGEST_KEY ?? "fimto-telematics-dev-key-change-me";

function keyMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(INGEST_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const ReadingSchema = z.object({
  truck_id: z.string().min(1, "truck_id is required"),
  drum_rpm: z.number().min(0).max(30).optional(),
  concrete_temp_c: z.number().min(-10).max(80).optional(),
  water_added_l: z.number().min(0).max(5000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  speed_kmh: z.number().min(0).max(400).optional(),
  captured_at: z.string().datetime().optional(),
  source: z.enum(["DEVICE", "DRIVER_APP", "GPS_VENDOR"]).optional(),
});

const PayloadSchema = z.union([
  ReadingSchema,
  z.object({ readings: z.array(ReadingSchema).min(1).max(500) }),
]);

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`telematics-ingest:${ip}`);
  if (!rl.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      `Too many requests. Retry in ${rl.retryAfterSeconds}s.`,
      429
    );
  }

  if (!keyMatches(req.headers.get("x-integration-key"))) {
    return errorResponse("INVALID_INTEGRATION_KEY", "Missing or invalid X-Integration-Key", 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid telemetry payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const list: TelemetryReadingInput[] = Array.isArray(
    (parsed.data as { readings?: unknown }).readings
  )
    ? ((parsed.data as { readings: TelemetryReadingInput[] }).readings as TelemetryReadingInput[]).map(
        (r) => ({
          truckId: r.truck_id,
          drumRpm: r.drum_rpm,
          concreteTempC: r.concrete_temp_c,
          waterAddedL: r.water_added_l,
          latitude: r.latitude,
          longitude: r.longitude,
          speedKmh: r.speed_kmh,
          capturedAt: r.captured_at,
          source: r.source,
        })
      )
    : [
        {
          truckId: (parsed.data as TelemetryReadingInput & { truck_id: string }).truck_id,
          drumRpm: (parsed.data as { drum_rpm?: number }).drum_rpm,
          concreteTempC: (parsed.data as { concrete_temp_c?: number }).concrete_temp_c,
          waterAddedL: (parsed.data as { water_added_l?: number }).water_added_l,
          latitude: (parsed.data as { latitude?: number }).latitude,
          longitude: (parsed.data as { longitude?: number }).longitude,
          speedKmh: (parsed.data as { speed_kmh?: number }).speed_kmh,
          capturedAt: (parsed.data as { captured_at?: string }).captured_at,
          source: (parsed.data as { source?: TelemetryReadingInput["source"] }).source,
        },
      ];

  try {
    // Resolve tenants from vehicles (mirrors gps-webhook), group, ingest
    const tenantOf = new Map<string, string>(); // truckId → tenantId
    for (const r of list) {
      if (tenantOf.has(r.truckId)) continue;
      const byId = UUID_RE.test(r.truckId);
      const v = await db
        .select({ tenantId: fleetVehicles.tenantId })
        .from(fleetVehicles)
        .where(
          byId
            ? eq(fleetVehicles.id, r.truckId)
            : eq(fleetVehicles.vehicleCode, r.truckId)
        )
        .limit(1);
      if (v[0]) tenantOf.set(r.truckId, v[0].tenantId);
    }

    const unknown = list.filter((r) => !tenantOf.has(r.truckId)).length;

    const groups = new Map<string, TelemetryReadingInput[]>();
    for (const r of list) {
      const t = tenantOf.get(r.truckId);
      if (!t) continue;
      const g = groups.get(t) ?? [];
      g.push(r);
      groups.set(t, g);
    }

    let accepted = 0;
    const rejected: { index: number; error: string }[] = [];
    for (const [tenantId, batch] of groups) {
      const res = await ingestReadings(tenantId, batch);
      accepted += res.accepted;
      rejected.push(...res.rejected);
    }

    return successResponse(
      { accepted, rejected, unknownTrucks: unknown },
      `${accepted} reading(s) ingested`
    );
  } catch (err) {
    console.error("[POST /api/v1/telematics/ingest]", err);
    return errorResponse("TELEMETRY_INGEST_FAILED", "Failed to ingest readings", 500);
  }
}
