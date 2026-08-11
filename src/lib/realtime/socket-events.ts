/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Socket.io Event Contract — Real-Time Mobile ↔ Server
 * ============================================================
 *
 *  This module defines the canonical TypeScript contract between:
 *  • React Native Driver App (emitter)
 *  • React Native Admin Dashboard (subscriber)
 *  • Next.js Socket.io server (broker)
 *  • Background geofencing service (consumer)
 *
 *  Socket.io rooms (namespace: /concrete-erp):
 *  ─────────────────────────────────────────────────────────
 *  • `fleet`             — All fleet status updates
 *  • `dispatch`          — Trip creation, checkpoint transitions
 *  • `admin-live-map`    — High-frequency driver GPS stream
 *  • `lab`               — Quality control events
 *  • `workshop`          — Maintenance + fuel anomaly events
 *  • `finance`           — Order approval events
 *  • `batch-plant`       — Batch start/complete events
 *  • `weighbridge`       — Weight recording events
 *  • `driver:{driverId}` — Driver-private notifications
 *  • `trip:{tripId}`     — Trip-specific subscribers
 * ============================================================
 */

import type { VehicleStatus, TripCheckpoint } from "@/db/schema";

// ─── Inbound Events: Driver Mobile App → Server ───────────────────────────────

export interface DriverLocationPayload {
  tripId: string;
  vehicleId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  /** Device-reported accuracy in metres */
  accuracyMetres?: number;
  /** GPS-reported speed in km/h (from device) */
  deviceSpeedKmh?: number;
  /** Heading in degrees (0-360) */
  headingDegrees?: number;
  /** Whether device considers itself moving */
  isMoving: boolean;
  /** Device battery percentage (for low-battery alerting) */
  batteryPct?: number;
  /** Timestamp when location was captured on device (ISO 8601) */
  capturedAt: string;
}

export interface DriverAutoCheckpointPayload {
  tripId: string;
  checkpoint: TripCheckpoint;
  /** Reason why checkpoint was auto-triggered (e.g., "GEOFENCE_ENTERED") */
  triggerReason: "GEOFENCE_ENTERED" | "MANUAL" | "BACKGROUND_SERVICE";
  /** GPS coordinates at checkpoint */
  latitude: number;
  longitude: number;
  /** Geofence radius that triggered auto-detection (for ARR_SITE) */
  geofenceRadiusMetres?: number;
  metadata?: Record<string, unknown>;
}

export interface ClientToServerEvents {
  /**
   * driver:location_update
   * High-frequency (every 5-10s) GPS stream from driver's device
   * Server must:
   * 1. Calculate moving average speed
   * 2. Check geofence entry for delivery site
   * 3. Broadcast to admin-live-map + fleet room
   * 4. Auto-trigger ARR_SITE if geofence entered
   */
  "driver:location_update": (payload: DriverLocationPayload) => void;

  /**
   * driver:auto_checkpoint
   * Triggered by geofence service when driver enters site perimeter
   * Server must validate and log the checkpoint
   */
  "driver:auto_checkpoint": (payload: DriverAutoCheckpointPayload) => void;

  /**
   * driver:checkpoint_manual
   * Driver manually logs a checkpoint via mobile app button
   */
  "driver:checkpoint_manual": (payload: DriverAutoCheckpointPayload) => void;

  /**
   * driver:breakdown_report
   * Driver reports a breakdown — auto-marks vehicle as MAJOR_BREAKDOWN
   */
  "driver:breakdown_report": (payload: {
    vehicleId: string;
    tripId?: string;
    description: string;
    latitude: number;
    longitude: number;
  }) => void;
}

// ─── Outbound Events: Server → Clients ────────────────────────────────────────

export interface FleetVehicleState {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  currentStatus: VehicleStatus;
  tripId?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  latitude: number | null;
  longitude: number | null;
  headingDegrees: number | null;
  movingAverageSpeedKmh: number | null;
  currentCheckpoint?: TripCheckpoint | null;
  updatedAt: string;
}

export interface TripCheckpointEvent {
  tripId: string;
  tripNumber: string;
  vehicleCode: string;
  driverName: string;
  previousCheckpoint: TripCheckpoint;
  newCheckpoint: TripCheckpoint;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  /** Delivery ticket number (only set at DEP_PLANT) */
  deliveryTicketNumber?: string | null;
}

export interface OrderApprovedEvent {
  orderId: string;
  orderNumber: string;
  newStatus: string;
  approvedBy: string;
  creditOverrideApplied: boolean;
  timestamp: string;
}

export interface WorkshopAlertEvent {
  vehicleCode: string;
  vehicleId: string;
  workOrderNumber?: string;
  alertType:
    | "FUEL_ANOMALY"
    | "MAJOR_BREAKDOWN"
    | "MAINTENANCE_ESCALATED"
    | "CURFEW_BLOCKED";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  timestamp: string;
}

export interface BatchPlantEvent {
  tripId: string;
  tripNumber: string;
  mixDesignCode: string;
  volumeM3: number;
  ambientTempC: number;
  ambientHumidityPct: number;
  compensationApplied: boolean;
  timestamp: string;
}

export interface ServerToClientEvents {
  /** Admin live map — high-frequency fleet position stream */
  "fleet:vehicle_position": (state: FleetVehicleState) => void;

  /** Admin live map — full fleet snapshot (emitted on connect + periodically) */
  "fleet:snapshot": (states: FleetVehicleState[]) => void;

  /** Trip checkpoint transition — broadcast to dispatch + admin + lab + workshop */
  "trip:checkpoint_updated": (event: TripCheckpointEvent) => void;

  /** Order approved by finance — broadcast to batch plant, lab, dispatch */
  "order:approved": (event: OrderApprovedEvent) => void;

  /** Order placed on credit hold — broadcast to finance + sales rep */
  "order:credit_hold": (event: {
    orderId: string;
    orderNumber: string;
    creditUtilisationPct: number;
    headroomExceededSar: number;
    timestamp: string;
  }) => void;

  /** Batch start — broadcast to lab + inventory + dispatch */
  "batch:started": (event: BatchPlantEvent) => void;

  /** Batch completed — broadcast to same rooms */
  "batch:completed": (event: BatchPlantEvent) => void;

  /** Weighbridge transaction recorded */
  "weighbridge:recorded": (event: {
    transactionId: string;
    tripId: string;
    sequenceNumber: number;
    grossWeightKg: number;
    netWeightKg: number;
    recordHash: string;
    timestamp: string;
  }) => void;

  /** Workshop alerts */
  "workshop:alert": (event: WorkshopAlertEvent) => void;

  /** Lab: quality event */
  "quality:slump_fail": (event: {
    sampleNumber: string;
    tripId: string;
    freshSlumpCm: number;
    timestamp: string;
  }) => void;

  /** Lab: strength fail */
  "quality:strength_fail": (event: {
    sampleNumber: string;
    specimenCode: string;
    measuredValue: number;
    requiredValue: number;
    timestamp: string;
  }) => void;

  /** Inventory: low stock alert */
  "inventory:low_stock": (event: {
    siloCode: string;
    materialCategory: string;
    currentStockKg: number;
    reorderLevelKg: number;
    timestamp: string;
  }) => void;

  /** Procurement: automated purchase request generated */
  "procurement:purchase_request": (event: {
    prNumber: string;
    materialCategory: string;
    requestedQuantityKg: number;
    timestamp: string;
  }) => void;

  /** Curfew: scheduling blocked */
  "dispatch:curfew_blocked": (event: {
    orderId?: string;
    tripId?: string;
    zoneName: string;
    startTime: string;
    endTime: string;
    reason: string;
    timestamp: string;
  }) => void;

  /** Driver-private notification (e.g., next order assigned) */
  "driver:notification": (event: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
  }) => void;
}

// ─── Server Socket Interface (for type-safe emit) ─────────────────────────────

/**
 * Use this type in Socket.io server setup:
 *
 *   const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
 */
export type SocketIOServerInterface = {
  ClientToServer: ClientToServerEvents;
  ServerToClient: ServerToClientEvents;
};

// ─── Event Room Routing Table ─────────────────────────────────────────────────

/**
 * Maps outbound event names to the rooms they should be broadcast to.
 * The Socket.io server uses this to automatically route emissions.
 */
export const EVENT_ROOM_ROUTING: Record<keyof ServerToClientEvents, string[]> = {
  "fleet:vehicle_position": ["admin-live-map", "fleet"],
  "fleet:snapshot": ["admin-live-map"],
  "trip:checkpoint_updated": ["dispatch", "admin-live-map", "lab", "workshop"],
  "order:approved": ["finance", "batch-plant", "lab", "workshop", "dispatch"],
  "order:credit_hold": ["finance", "dispatch"],
  "batch:started": ["lab", "inventory", "dispatch", "batch-plant"],
  "batch:completed": ["lab", "inventory", "dispatch", "batch-plant"],
  "weighbridge:recorded": ["weighbridge", "dispatch", "admin-live-map"],
  "workshop:alert": ["workshop", "admin-live-map", "dispatch"],
  "quality:slump_fail": ["lab", "dispatch", "admin-live-map"],
  "quality:strength_fail": ["lab", "admin-live-map"],
  "inventory:low_stock": ["dispatch", "batch-plant"],
  "procurement:purchase_request": ["finance", "dispatch"],
  "dispatch:curfew_blocked": ["dispatch", "admin-live-map"],
  "driver:notification": [], // Sent to driver:{driverId} room dynamically
};

// ─── Socket Payload Builder Helpers ───────────────────────────────────────────

export function buildFleetVehicleState(params: {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  currentStatus: VehicleStatus;
  tripId?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  headingDegrees?: number | null;
  movingAverageSpeedKmh?: number | null;
  currentCheckpoint?: TripCheckpoint | null;
}): FleetVehicleState {
  return {
    vehicleId: params.vehicleId,
    vehicleCode: params.vehicleCode,
    plateNumber: params.plateNumber,
    currentStatus: params.currentStatus,
    tripId: params.tripId ?? null,
    driverId: params.driverId ?? null,
    driverName: params.driverName ?? null,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    headingDegrees: params.headingDegrees ?? null,
    movingAverageSpeedKmh: params.movingAverageSpeedKmh ?? null,
    currentCheckpoint: params.currentCheckpoint ?? null,
    updatedAt: new Date().toISOString(),
  };
}
