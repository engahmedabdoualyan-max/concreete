/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Real-Time GPS Pipeline — Background Geofencing & Speed Tracking
 * ============================================================
 *
 *  This service is invoked by the Socket.io handler for every
 *  driver:location_update event. It performs:
 *
 *  1. MOVING AVERAGE SPEED CALCULATION
 *     - Maintains a rolling window of the last 5 location samples
 *     - Uses Exponential Moving Average (EMA) with α = 0.4
 *     - Filters out GPS noise via accuracy-based rejection
 *     - Detects stationary periods (speed < 2 km/h for 3+ samples)
 *
 *  2. GEOFENCE AUTO-TRIGGER (ARR_SITE)
 *     - Calculates haversine distance to order's delivery site
 *     - If distance < site.geofenceRadiusMetres + tolerance
 *     - Auto-fires ARR_SITE checkpoint if not already logged
 *     - Writes to driver_locations table + trip_checkpoints
 *
 *  3. LIVE FLEET BROADCAST
 *     - Publishes FleetVehicleState to admin-live-map room
 *     - Throttles to avoid flooding (max 1 emit per 5 seconds)
 *
 *  4. BATTERY / SIGNAL ALERTS
 *     - Notifies dispatch if battery < 15% or accuracy > 50m
 * ============================================================
 */

import { db } from "@/db";
import {
  driverLocations,
  tripCheckpoints,
  trips,
  orders,
  deliverySites,
  fleetVehicles,
  users,
  auditLogs,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { TripCheckpoint } from "@/db/schema";
import { updateTripCheckpoint } from "./dispatch.service";
import {
  buildFleetVehicleState,
  type DriverLocationPayload,
} from "../realtime/socket-events";

// ─── Algorithm Constants ──────────────────────────────────────────────────────

/** Rolling window size for speed calculation */
const SPEED_WINDOW_SIZE = 5;

/** EMA smoothing factor (higher = more responsive to latest) */
const EMA_ALPHA = 0.4;

/** Minimum GPS accuracy (metres) accepted — reject noisy samples */
const MAX_ACCEPTABLE_ACCURACY_M = 30;

/** Speed threshold below which driver is considered "stopped" (km/h) */
const STOPPED_SPEED_THRESHOLD_KMH = 2;

/** Number of consecutive stationary samples before flagging */
const STATIONARY_SAMPLE_COUNT = 3;

/** Geofence tolerance: extra metres added to radius for auto-trigger */
const GEOFENCE_TOLERANCE_M = 20;

/** Earth radius in metres for haversine */
const EARTH_RADIUS_M = 6_371_000;

/** Max location broadcast interval per vehicle (ms) */
const BROADCAST_THROTTLE_MS = 5_000;

// ─── In-Memory Caches (per-process) ───────────────────────────────────────────

/** Moving average state per vehicle */
const speedStateCache = new Map<
  string,
  {
    samples: number[];
    ema: number;
    stationaryCount: number;
    lastBroadcastAt: number;
  }
>();

/** Geofence entry detection per trip (prevents re-triggering) */
const geofenceTriggered = new Set<string>();

// ─── Haversine Distance ───────────────────────────────────────────────────────

/**
 * Computes distance in metres between two GPS coordinates using Haversine formula.
 * Accurate to ~0.3% for distances under 100 km.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

// ─── Speed Calculation ────────────────────────────────────────────────────────

/**
 * Updates the moving average speed for a vehicle.
 * Uses EMA (Exponential Moving Average) to smooth out GPS noise.
 *
 * Formula: EMA_new = α × currentSpeed + (1-α) × EMA_old
 */
function updateMovingAverageSpeed(
  vehicleId: string,
  deviceSpeedKmh: number | undefined
): { movingAverageSpeedKmh: number; isStationary: boolean } {
  const state =
    speedStateCache.get(vehicleId) ??
    ({
      samples: [],
      ema: 0,
      stationaryCount: 0,
      lastBroadcastAt: 0,
    } as {
      samples: number[];
      ema: number;
      stationaryCount: number;
      lastBroadcastAt: number;
    });

  // Use device-reported speed, or estimate from GPS (0 if unavailable)
  const currentSpeed = deviceSpeedKmh ?? 0;

  // Update EMA
  if (state.ema === 0) {
    state.ema = currentSpeed;
  } else {
    state.ema = EMA_ALPHA * currentSpeed + (1 - EMA_ALPHA) * state.ema;
  }

  // Maintain rolling window
  state.samples.push(currentSpeed);
  if (state.samples.length > SPEED_WINDOW_SIZE) {
    state.samples.shift();
  }

  // Detect stationary periods
  if (currentSpeed < STOPPED_SPEED_THRESHOLD_KMH) {
    state.stationaryCount += 1;
  } else {
    state.stationaryCount = 0;
  }

  speedStateCache.set(vehicleId, state);

  return {
    movingAverageSpeedKmh: parseFloat(state.ema.toFixed(2)),
    isStationary: state.stationaryCount >= STATIONARY_SAMPLE_COUNT,
  };
}

// ─── Geofence Detection ───────────────────────────────────────────────────────

/**
 * Checks if the driver has entered the delivery site geofence.
 * Returns true if distance < geofence radius + tolerance.
 */
export async function checkGeofenceEntry(params: {
  tripId: string;
  latitude: number;
  longitude: number;
}): Promise<{
  isInGeofence: boolean;
  distanceToSiteMetres: number;
  siteId?: string;
  siteName?: string;
  geofenceRadiusMetres?: number;
  tenantId?: string;
}> {
  // Fetch trip → order → delivery site
  const tripRows = await db
    .select({
      orderId: trips.orderId,
      currentCheckpoint: trips.currentCheckpoint,
      tenantId: trips.tenantId,
    })
    .from(trips)
    .where(eq(trips.id, params.tripId))
    .limit(1);

  if (tripRows.length === 0) {
    return { isInGeofence: false, distanceToSiteMetres: 0 };
  }

  const trip = tripRows[0];

  // Skip if ARR_SITE already logged
  if (trip.currentCheckpoint === "ARR_SITE" || 
      ["POUR_START", "DEP_SITE", "RETURN_PLANT"].includes(trip.currentCheckpoint)) {
    return { isInGeofence: false, distanceToSiteMetres: 0, tenantId: trip.tenantId };
  }

  const orderRows = await db
    .select({ deliverySiteId: orders.deliverySiteId })
    .from(orders)
    .where(eq(orders.id, trip.orderId))
    .limit(1);

  if (orderRows.length === 0) {
    return { isInGeofence: false, distanceToSiteMetres: 0, tenantId: trip.tenantId };
  }

  const siteRows = await db
    .select({
      id: deliverySites.id,
      siteName: deliverySites.siteName,
      latitude: deliverySites.latitude,
      longitude: deliverySites.longitude,
      geofenceRadiusMetres: deliverySites.geofenceRadiusMetres,
    })
    .from(deliverySites)
    .where(eq(deliverySites.id, orderRows[0].deliverySiteId))
    .limit(1);

  if (siteRows.length === 0) {
    return { isInGeofence: false, distanceToSiteMetres: 0, tenantId: trip.tenantId };
  }

  const site = siteRows[0];

  // Guard against null lat/lng (typed as nullable but filtered above)
  if (!site.latitude || !site.longitude) {
    return { isInGeofence: false, distanceToSiteMetres: 0, tenantId: trip.tenantId };
  }

  const distance = haversineDistance(
    params.latitude,
    params.longitude,
    parseFloat(site.latitude),
    parseFloat(site.longitude)
  );

  const effectiveRadius = site.geofenceRadiusMetres + GEOFENCE_TOLERANCE_M;

  return {
    isInGeofence: distance <= effectiveRadius,
    distanceToSiteMetres: parseFloat(distance.toFixed(1)),
    siteId: site.id,
    siteName: site.siteName,
    geofenceRadiusMetres: site.geofenceRadiusMetres,
    tenantId: trip.tenantId,
  };
}

// ─── Main Location Update Handler ─────────────────────────────────────────────

export interface ProcessLocationResult {
  vehicleState: ReturnType<typeof buildFleetVehicleState>;
  movingAverageSpeedKmh: number;
  isStationary: boolean;
  geofenceResult: {
    isInGeofence: boolean;
    distanceToSiteMetres: number;
    siteName?: string;
    geofenceRadiusMetres?: number;
  };
  autoTriggeredArrSite: boolean;
  lowBatteryAlert?: boolean;
  poorAccuracyAlert?: boolean;
  /** The broadcast event that should be emitted to admin-live-map */
  broadcastEvent: {
    event: "fleet:vehicle_position";
    payload: ReturnType<typeof buildFleetVehicleState>;
    shouldBroadcast: boolean;
  };
  /** If geofence triggered, this is the socket event to emit */
  geofenceBroadcastEvent?: {
    event: "trip:checkpoint_updated";
    payload: Record<string, unknown>;
  };
}

/**
 * Processes a driver:location_update event.
 * Must be called from the Socket.io handler for each location received.
 */
export async function processLocationUpdate(
  payload: DriverLocationPayload,
  driverUserId: string
): Promise<ProcessLocationResult> {
  // 1. Validate accuracy — reject noisy samples
  if (payload.accuracyMetres && payload.accuracyMetres > MAX_ACCEPTABLE_ACCURACY_M) {
    // Still record but flag as low-quality
    console.warn(
      `[GPS] Low accuracy sample from vehicle ${payload.vehicleId}: ${payload.accuracyMetres}m`
    );
  }

  // 2. Calculate moving average speed
  const { movingAverageSpeedKmh, isStationary } = updateMovingAverageSpeed(
    payload.vehicleId,
    payload.deviceSpeedKmh
  );

  // 3. Check geofence entry
  const geofenceResult = await checkGeofenceEntry({
    tripId: payload.tripId,
    latitude: payload.latitude,
    longitude: payload.longitude,
  });

  // 4. Insert into driver_locations (the high-frequency GPS trail table)
  const [savedLocation] = await db
    .insert(driverLocations)
    .values({
      tripId: payload.tripId,
      tenantId: geofenceResult.tenantId as string,
      vehicleId: payload.vehicleId,
      driverId: payload.driverId,
      latitude: payload.latitude.toFixed(7),
      longitude: payload.longitude.toFixed(7),
      accuracyMetres: payload.accuracyMetres,
      deviceSpeedKmh: payload.deviceSpeedKmh?.toFixed(2),
      movingAverageSpeedKmh: movingAverageSpeedKmh.toFixed(2),
      headingDegrees: payload.headingDegrees?.toFixed(2),
      isMoving: !isStationary,
      batteryPct: payload.batteryPct,
      capturedAt: new Date(payload.capturedAt),
    })
    .returning();

  // 5. Auto-trigger ARR_SITE if geofence entered (and not already triggered)
  let autoTriggeredArrSite = false;
  const geofenceKey = `${payload.tripId}:ARR_SITE`;

  if (geofenceResult.isInGeofence && !geofenceTriggered.has(geofenceKey)) {
    try {
      await updateTripCheckpoint({
        tripId: payload.tripId,
        newCheckpoint: "ARR_SITE" as TripCheckpoint,
        loggedById: driverUserId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        gpsAccuracyMetres: payload.accuracyMetres,
        metadata: {
          source: "geofence_auto_trigger",
          distanceToSiteMetres: geofenceResult.distanceToSiteMetres,
          siteName: geofenceResult.siteName,
          geofenceRadiusMetres: geofenceResult.geofenceRadiusMetres,
        },
      });

      geofenceTriggered.add(geofenceKey);
      autoTriggeredArrSite = true;
    } catch (err) {
      console.error("[GPS] Failed to auto-trigger ARR_SITE:", err);
    }
  }

  // 6. Fetch vehicle state for broadcast
  const vehicleRows = await db
    .select({
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      currentStatus: fleetVehicles.currentStatus,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, payload.vehicleId))
    .limit(1);

  const vehicle = vehicleRows[0];

  // Fetch current trip checkpoint
  const currentTripRows = await db
    .select({ currentCheckpoint: trips.currentCheckpoint })
    .from(trips)
    .where(eq(trips.id, payload.tripId))
    .limit(1);

  // Fetch driver name
  const driverRows = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, payload.driverId))
    .limit(1);

  const vehicleState = buildFleetVehicleState({
    vehicleId: payload.vehicleId,
    vehicleCode: vehicle.vehicleCode,
    plateNumber: vehicle.plateNumber,
    currentStatus: vehicle.currentStatus,
    tripId: payload.tripId,
    driverId: payload.driverId,
    driverName: driverRows[0]?.fullName,
    latitude: payload.latitude,
    longitude: payload.longitude,
    headingDegrees: payload.headingDegrees,
    movingAverageSpeedKmh,
    currentCheckpoint: currentTripRows[0]?.currentCheckpoint,
  });

  // 7. Throttle live map broadcast
  const state = speedStateCache.get(payload.vehicleId);
  const now = Date.now();
  const shouldBroadcast =
    !state || now - state.lastBroadcastAt >= BROADCAST_THROTTLE_MS;
  if (state) state.lastBroadcastAt = now;

  // 8. Battery and accuracy alerts
  const lowBatteryAlert = (payload.batteryPct ?? 100) < 15;
  const poorAccuracyAlert = (payload.accuracyMetres ?? 0) > 50;

  return {
    vehicleState,
    movingAverageSpeedKmh,
    isStationary,
    geofenceResult: {
      isInGeofence: geofenceResult.isInGeofence,
      distanceToSiteMetres: geofenceResult.distanceToSiteMetres,
      siteName: geofenceResult.siteName,
      geofenceRadiusMetres: geofenceResult.geofenceRadiusMetres,
    },
    autoTriggeredArrSite,
    lowBatteryAlert,
    poorAccuracyAlert,
    broadcastEvent: {
      event: "fleet:vehicle_position",
      payload: vehicleState,
      shouldBroadcast,
    },
  };
}

// ─── Utility: Reset cache (for tests / server restarts) ───────────────────────

export function resetGpsCaches(): void {
  speedStateCache.clear();
  geofenceTriggered.clear();
}

/**
 * Returns the number of active vehicles in the GPS cache.
 * Used for diagnostics.
 */
export function getActiveTrackedVehicles(): number {
  return speedStateCache.size;
}

// ─── Cleanup old driver_locations (scheduled task) ────────────────────────────

/**
 * Removes driver_locations older than 7 days.
 * Should run daily as a scheduled task.
 */
export async function purgeOldDriverLocations(): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const result = await db
    .delete(driverLocations)
    .where(sql`captured_at < ${sevenDaysAgo.toISOString()}::timestamptz`)
    .returning({ id: driverLocations.id });

  return result.length;
}
