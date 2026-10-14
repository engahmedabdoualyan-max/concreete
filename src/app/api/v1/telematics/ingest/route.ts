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
 *
 *  `truck_id` may be the vehicle code, the vehicle UUID, or the IMEI of a
 *  device coded onto the vehicle in /api/fleet/devices — a probe is installed
 *  blind and keeps reporting under the same IMEI, so the serial is what ties its
 *  readings to a truck.
 * ============================================================
 */

import { NextRequest } from "next/server";
import crypto from "crypto";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { ingestReadings, findIngestOwner, type TelemetryReadingInput } from "@/lib/services/telematics.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

function ingestKey(): string {
  const configured = process.env.TELEMATICS_INGEST_KEY;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("TELEMATICS_INGEST_KEY must be configured in production");
  }
  return configured ?? "fimto-telematics-dev-key-change-me";
}

function keyMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(ingestKey());
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

  type WireReading = z.infer<typeof ReadingSchema>;
  type WireBatch = { readings: WireReading[] };

  const toInput = (r: WireReading): TelemetryReadingInput => ({
    truckId: r.truck_id,
    drumRpm: r.drum_rpm,
    concreteTempC: r.concrete_temp_c,
    waterAddedL: r.water_added_l,
    latitude: r.latitude,
    longitude: r.longitude,
    speedKmh: r.speed_kmh,
    capturedAt: r.captured_at,
    source: r.source,
  });

  const list: TelemetryReadingInput[] =
    "readings" in parsed.data
      ? (parsed.data as WireBatch).readings.map(toInput)
      : [toInput(parsed.data as WireReading)];

  try {
    // Resolve the owning tenant per identifier (vehicle code, vehicle UUID, or
    // a coded device IMEI), then group readings by tenant and ingest.
    const ownerOf = new Map<string, { tenantId: string } | null>();
    for (const r of list) {
      if (ownerOf.has(r.truckId)) continue;
      ownerOf.set(r.truckId, await findIngestOwner(r.truckId));
    }

    const unknown = list.filter((r) => !ownerOf.get(r.truckId)).length;

    const groups = new Map<string, TelemetryReadingInput[]>();
    for (const r of list) {
      const t = ownerOf.get(r.truckId)?.tenantId;
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
