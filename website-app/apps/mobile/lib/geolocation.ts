/**
 * Background Geolocation Service
 * Tracks driver location continuously using Expo Location APIs
 * Sends updates to server via Socket.io for real-time tracking
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { socket } from "./socket";
import { api } from "./api";
import { offlineSync } from "./offline-sync";
import { getItem, setItem, removeItem } from "./storage";
import { GPS_TRACKING_INTERVAL_MS } from "@/types";
import type { LocationPayload } from "@/types";

const DISCLOSURE_FLAG_KEY = "fimto_bg_location_disclosure_accepted";
const ACTIVE_TRIP_CTX_KEY = "fimto_active_trip_ctx";

const LOCATION_TASK_NAME = "fimto-driver-location-tracking";
const LOCATION_UPDATE_DISTANCE = 50; // meters
const LOCATION_UPDATE_INTERVAL = GPS_TRACKING_INTERVAL_MS;

interface ActiveTripContext {
  tripId: string;
  vehicleId: string;
  driverId: string;
}

// ─── Background Task Handler ───────────────────────────────────────────────────

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[GPS] Background task error:", error);
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const latestLocation = locations[0];
  const { latitude, longitude, speed, heading, accuracy } = latestLocation.coords;

  // The background task runs outside the app context — re-read the active trip
  // so the server can associate this update with the right trip/vehicle/driver.
  let ctx: ActiveTripContext | null = null;
  try {
    const raw = await getItem(ACTIVE_TRIP_CTX_KEY);
    if (raw) ctx = JSON.parse(raw) as ActiveTripContext;
  } catch {
    ctx = null;
  }

  // Send to Socket.io for real-time broadcast
  socket.emit("driver:location_update", {
    ...(ctx ?? {}),
    latitude,
    longitude,
    deviceSpeedKmh: speed ? speed * 3.6 : 0, // m/s to km/h
    headingDegrees: heading ?? 0,
    accuracyMetres: accuracy ?? 0,
    isMoving: (speed ?? 0) > 0.5,
    capturedAt: new Date().toISOString(),
  });
});

// ─── Location Service Class ────────────────────────────────────────────────────

class GeolocationService {
  private isTracking = false;
  private foregroundSubscription: Location.LocationSubscription | null = null;

  async requestPermissions(): Promise<boolean> {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== "granted") {
      return false;
    }

    if (Platform.OS !== "web") {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== "granted") {
        console.warn("[GPS] Background location not granted - foreground only");
      }
      return backgroundStatus === "granted" || foregroundStatus === "granted";
    }

    return true;
  }

  // ── Prominent-disclosure gating (Google Play compliance) ──────────────────

  /** True once the user has already granted background location. */
  async hasBackgroundPermission(): Promise<boolean> {
    if (Platform.OS === "web") return true;
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === "granted";
  }

  /** Whether the driver already accepted the disclosure on a previous run. */
  async hasAcceptedDisclosure(): Promise<boolean> {
    return (await getItem(DISCLOSURE_FLAG_KEY)) === "true";
  }

  async setDisclosureAccepted(): Promise<void> {
    await setItem(DISCLOSURE_FLAG_KEY, "true");
  }

  /**
   * Returns true when the prominent disclosure dialog MUST be shown before the
   * native ACCESS_BACKGROUND_LOCATION prompt. The Driver screen calls this and
   * renders <BackgroundLocationDisclosure/> when it returns true.
   */
  async needsBackgroundDisclosure(): Promise<boolean> {
    if (Platform.OS === "web") return false;
    if (await this.hasBackgroundPermission()) return false; // already granted
    if (await this.hasAcceptedDisclosure()) return false; // already disclosed
    return true;
  }

  /** Request foreground permission only (safe to call before the disclosure). */
  async requestForegroundPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  }

  async startTracking(
    tripId: string,
    vehicleId: string,
    driverId: string,
    onLocation?: (location: LocationPayload) => void
  ): Promise<void> {
    if (this.isTracking) {
      console.log("[GPS] Already tracking");
      return;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error("Location permission not granted");
    }

    this.isTracking = true;

    // Persist the trip context so the background task can associate updates.
    await setItem(ACTIVE_TRIP_CTX_KEY, JSON.stringify({ tripId, vehicleId, driverId }));

    // Try background tracking first
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        distanceInterval: LOCATION_UPDATE_DISTANCE,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "تتبع موقع الشاحنة",
          notificationBody: "يتم تتبع موقعك لتسجيل الرحلة",
        },
        deferredUpdatesDistance: LOCATION_UPDATE_DISTANCE,
        deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL,
      });
      console.log("[GPS] Background tracking started");
    } catch (error) {
      console.warn("[GPS] Background tracking failed, using foreground:", error);
      // Fall back to foreground tracking
      await this.startForegroundTracking(tripId, vehicleId, driverId, onLocation);
    }
  }

  private async startForegroundTracking(
    tripId: string,
    vehicleId: string,
    driverId: string,
    onLocation?: (location: LocationPayload) => void
  ): Promise<void> {
    this.foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        distanceInterval: LOCATION_UPDATE_DISTANCE,
      },
      async (location) => {
        const { latitude, longitude, speed, heading, accuracy } = location.coords;

        const payload: LocationPayload = {
          tripId,
          vehicleId,
          driverId,
          latitude,
          longitude,
          deviceSpeedKmh: speed ? speed * 3.6 : 0,
          headingDegrees: heading ?? 0,
          accuracyMetres: accuracy ?? 0,
          isMoving: (speed ?? 0) > 0.5,
          capturedAt: new Date().toISOString(),
        };

        // Emit to Socket.io (best-effort realtime)
        socket.emit("driver:location_update", payload);

        // Persist via REST; if the network is down, queue it for later sync.
        const locationRest = {
          driverId,
          latitude,
          longitude,
          speed: payload.deviceSpeedKmh ?? 0,
          heading: payload.headingDegrees ?? 0,
          accuracy: payload.accuracyMetres ?? 0,
        };
        if (offlineSync.getIsConnected()) {
          try {
            await api.sendLocationUpdate(tripId, vehicleId, locationRest);
          } catch {
            // Network blipped mid-request → queue so nothing is lost.
            await offlineSync.enqueue("LOCATION", {
              tripId,
              vehicleId,
              location: locationRest,
            });
          }
        } else {
          // Offline corridor → store locally, auto-flushes on reconnect.
          await offlineSync.enqueue("LOCATION", {
            tripId,
            vehicleId,
            location: locationRest,
          });
        }

        // Notify caller
        if (onLocation) {
          onLocation(payload);
        }
      }
    );
  }

  async stopTracking(): Promise<void> {
    if (!this.isTracking) return;

    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (error) {
      console.error("[GPS] Error stopping background tracking:", error);
    }

    if (this.foregroundSubscription) {
      this.foregroundSubscription.remove();
      this.foregroundSubscription = null;
    }

    await removeItem(ACTIVE_TRIP_CTX_KEY);

    this.isTracking = false;
    console.log("[GPS] Tracking stopped");
  }

  async getCurrentLocation(): Promise<Location.LocationObjectCoords | null> {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      return location.coords;
    } catch (error) {
      console.error("[GPS] Failed to get current location:", error);
      return null;
    }
  }

  async calculateDistance(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
  ): Promise<number | null> {
    try {
      return geolocationHaversineMetres(from.latitude, from.longitude, to.latitude, to.longitude);
    } catch (error) {
      console.error("[GPS] Failed to calculate distance:", error);
      return null;
    }
  }

  isTrackingActive(): boolean {
    return this.isTracking;
  }
}

export const geolocation = new GeolocationService();

// ─── Geofence Detection ────────────────────────────────────────────────────────

/** Haversine great-circle distance in metres (Earth radius = 6 371 000 m). */
export function geolocationHaversineMetres(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLon = ((toLng - fromLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((fromLat * Math.PI) / 180) *
      Math.cos((toLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function checkGeofenceEntry(
  driverLocation: { latitude: number; longitude: number },
  siteLocation: { latitude: number; longitude: number },
  geofenceRadiusMetres: number
): boolean {
  const distance = geolocationHaversineMetres(
    driverLocation.latitude,
    driverLocation.longitude,
    siteLocation.latitude,
    siteLocation.longitude
  );

  return distance <= geofenceRadiusMetres + 20; // +20m tolerance
}
