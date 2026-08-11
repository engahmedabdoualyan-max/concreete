/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Vehicle Classification Policy Engine
 *  src/lib/vehicle-class.ts
 * ============================================================
 *
 *  Single source of truth for WHAT EACH VEHICLE CLASS CAN DO.
 *  Every subsystem (dispatch timeline, weighbridge, silo intake,
 *  drying countdown) consults this matrix before acting, so a
 *  SERVICE pickup can never accidentally be pushed through the
 *  7-checkpoint concrete delivery flow.
 *
 *  ┌───────────┬────────────┬───────────┬──────────┬───────────┬──────────┐
 *  │ Class     │ 7-Timeline │ 90min Dry │ Weighbr. │ Silo Feed │ GPS/Fuel │
 *  ├───────────┼────────────┼───────────┼──────────┼───────────┼──────────┤
 *  │ MIXER     │     ✅     │    ✅     │    ✅    │    ❌     │    ✅    │
 *  │ PUMP      │     ❌     │    ❌     │    ❌    │    ❌     │    ✅    │
 *  │ TIPPER    │     ❌     │    ❌     │    ✅    │    ✅     │    ✅    │
 *  │ SERVICE   │     ❌     │    ❌     │    ❌    │    ❌     │    ✅    │
 *  │ REGULAR   │     ❌     │    ❌     │    ❌    │    ❌     │    ✅    │
 *  └───────────┴────────────┴───────────┴──────────┴───────────┴──────────┘
 * ============================================================
 */

import type { VehicleClass, VehicleType } from "@/db/schema";

// ─── Capability Matrix ────────────────────────────────────────────────────────

export interface VehicleCapabilities {
  /** Participates in the 7-checkpoint concrete delivery timeline */
  deliveryTimeline: boolean;
  /** Subject to the 90-minute DEP_PLANT → ARR_SITE drying countdown */
  dryingCountdown: boolean;
  /** May be recorded on the weighbridge hash-chain ledger */
  weighbridge: boolean;
  /** Feeds raw material directly into inventory_silos */
  siloIntake: boolean;
  /** Runs static hour-based operating sessions at client sites */
  staticOperationHours: boolean;
  /** Always tracked for GPS distance + fuel consumption */
  gpsAndFuel: boolean;
  /** Eligible to be dispatched against a customer order */
  orderDispatchable: boolean;
  /** Delivery-ticket QR is minted for this class at DEP_PLANT */
  ticketQr: boolean;
}

export const VEHICLE_CLASS_CAPABILITIES: Record<VehicleClass, VehicleCapabilities> = {
  MIXER: {
    deliveryTimeline: true,
    dryingCountdown: true,
    weighbridge: true,
    siloIntake: false,
    staticOperationHours: false,
    gpsAndFuel: true,
    orderDispatchable: true,
    ticketQr: true,
  },
  PUMP: {
    deliveryTimeline: false,
    dryingCountdown: false,
    weighbridge: false,
    siloIntake: false,
    staticOperationHours: true,
    gpsAndFuel: true,
    orderDispatchable: true,
    ticketQr: false,
  },
  TIPPER: {
    deliveryTimeline: false,
    dryingCountdown: false,
    weighbridge: true,
    siloIntake: true,
    staticOperationHours: false,
    gpsAndFuel: true,
    orderDispatchable: false,
    ticketQr: false,
  },
  SERVICE: {
    deliveryTimeline: false,
    dryingCountdown: false,
    weighbridge: false,
    siloIntake: false,
    staticOperationHours: false,
    gpsAndFuel: true,
    orderDispatchable: false,
    ticketQr: false,
  },
  REGULAR: {
    deliveryTimeline: false,
    dryingCountdown: false,
    weighbridge: false,
    siloIntake: false,
    staticOperationHours: false,
    gpsAndFuel: true,
    orderDispatchable: false,
    ticketQr: false,
  },
};

export function capabilitiesFor(vehicleClass: VehicleClass): VehicleCapabilities {
  return VEHICLE_CLASS_CAPABILITIES[vehicleClass] ?? VEHICLE_CLASS_CAPABILITIES.REGULAR;
}

// ─── Type → Class Inference ───────────────────────────────────────────────────

/**
 * Derives the behavioural class from the physical asset type.
 * Used when registering a vehicle if the operator does not set the class
 * explicitly, and by the backfill migration.
 */
export function inferClassFromType(vehicleType: VehicleType): VehicleClass {
  switch (vehicleType) {
    case "MIXER_TRUCK":
    case "TRANSIT_MIXER":
      return "MIXER";
    case "CONCRETE_PUMP":
      return "PUMP";
    case "TIPPER_TRUCK":
      return "TIPPER";
    case "SERVICE_TRUCK":
      return "SERVICE";
    case "WATER_TANKER":
    default:
      return "REGULAR";
  }
}

// ─── Guard Helpers ────────────────────────────────────────────────────────────

export class VehicleClassViolation extends Error {
  public readonly vehicleClass: VehicleClass;
  public readonly capability: keyof VehicleCapabilities;

  constructor(
    vehicleClass: VehicleClass,
    capability: keyof VehicleCapabilities,
    message: string
  ) {
    super(message);
    this.name = "VehicleClassViolation";
    this.vehicleClass = vehicleClass;
    this.capability = capability;
    Object.setPrototypeOf(this, VehicleClassViolation.prototype);
  }
}

const CAPABILITY_LABELS: Record<keyof VehicleCapabilities, string> = {
  deliveryTimeline: "the 7-checkpoint delivery timeline",
  dryingCountdown: "the 90-minute concrete drying countdown",
  weighbridge: "weighbridge transactions",
  siloIntake: "raw-material silo intake",
  staticOperationHours: "static on-site operating sessions",
  gpsAndFuel: "GPS and fuel tracking",
  orderDispatchable: "customer order dispatch",
  ticketQr: "delivery-ticket QR minting",
};

/**
 * Throws `VehicleClassViolation` when the class is not permitted to use the
 * requested capability. Call this at the top of any class-sensitive route.
 */
export function assertCapability(
  vehicleClass: VehicleClass,
  capability: keyof VehicleCapabilities,
  vehicleCode?: string
): void {
  const caps = capabilitiesFor(vehicleClass);
  if (!caps[capability]) {
    const who = vehicleCode ? `Vehicle ${vehicleCode}` : "This vehicle";
    throw new VehicleClassViolation(
      vehicleClass,
      capability,
      `${who} is class ${vehicleClass} and is excluded from ${CAPABILITY_LABELS[capability]}. ` +
        `Only ${allowedClassesFor(capability).join(", ")} class vehicles may perform this action.`
    );
  }
}

/** Lists every class permitted to use a capability (for error messages / UI). */
export function allowedClassesFor(capability: keyof VehicleCapabilities): VehicleClass[] {
  return (Object.keys(VEHICLE_CLASS_CAPABILITIES) as VehicleClass[]).filter(
    (c) => VEHICLE_CLASS_CAPABILITIES[c][capability]
  );
}

// ─── Class-Specific Metric Descriptors (for the fleet dashboard) ──────────────

export interface ClassMetricDescriptor {
  key: string;
  labelEn: string;
  labelAr: string;
  unit: string;
}

/**
 * Which KPIs the fleet dashboard should render for each class.
 * MIXER shows cycle metrics, PUMP shows operating hours, TIPPER shows
 * tonnage delivered, SERVICE/REGULAR show only distance and fuel.
 */
export const CLASS_METRICS: Record<VehicleClass, ClassMetricDescriptor[]> = {
  MIXER: [
    { key: "tripsCompleted", labelEn: "Trips completed", labelAr: "الرحلات المنجزة", unit: "trips" },
    { key: "volumeDeliveredM3", labelEn: "Volume delivered", labelAr: "الكمية المسلمة", unit: "m³" },
    { key: "avgCycleMinutes", labelEn: "Avg cycle time", labelAr: "متوسط زمن الدورة", unit: "min" },
    { key: "dryingRiskEvents", labelEn: "Drying-risk events", labelAr: "أحداث خطر الجفاف", unit: "count" },
    { key: "distanceKm", labelEn: "Distance", labelAr: "المسافة", unit: "km" },
    { key: "fuelLitres", labelEn: "Fuel used", labelAr: "الوقود المستهلك", unit: "L" },
  ],
  PUMP: [
    { key: "sessions", labelEn: "Pump sessions", labelAr: "جلسات الضخ", unit: "sessions" },
    { key: "pumpingHours", labelEn: "Pumping hours", labelAr: "ساعات الضخ", unit: "h" },
    { key: "standbyHours", labelEn: "Standby hours", labelAr: "ساعات الانتظار", unit: "h" },
    { key: "volumePumpedM3", labelEn: "Volume pumped", labelAr: "الكمية المضخوخة", unit: "m³" },
    { key: "avgM3PerHour", labelEn: "Avg throughput", labelAr: "متوسط الإنتاجية", unit: "m³/h" },
    { key: "utilisationPct", labelEn: "Utilisation", labelAr: "معدل الاستخدام", unit: "%" },
  ],
  TIPPER: [
    { key: "intakeLoads", labelEn: "Intake loads", labelAr: "أحمال التوريد", unit: "loads" },
    { key: "tonnesDelivered", labelEn: "Tonnes delivered", labelAr: "الأطنان الموردة", unit: "t" },
    { key: "silosServed", labelEn: "Silos served", labelAr: "الصوامع المخدومة", unit: "count" },
    { key: "rejectedLoads", labelEn: "Rejected loads", labelAr: "الأحمال المرفوضة", unit: "count" },
    { key: "distanceKm", labelEn: "Distance", labelAr: "المسافة", unit: "km" },
    { key: "fuelLitres", labelEn: "Fuel used", labelAr: "الوقود المستهلك", unit: "L" },
  ],
  SERVICE: [
    { key: "distanceKm", labelEn: "Distance", labelAr: "المسافة", unit: "km" },
    { key: "fuelLitres", labelEn: "Fuel used", labelAr: "الوقود المستهلك", unit: "L" },
    { key: "efficiencyKmPerL", labelEn: "Efficiency", labelAr: "الكفاءة", unit: "km/L" },
  ],
  REGULAR: [
    { key: "distanceKm", labelEn: "Distance", labelAr: "المسافة", unit: "km" },
    { key: "fuelLitres", labelEn: "Fuel used", labelAr: "الوقود المستهلك", unit: "L" },
    { key: "efficiencyKmPerL", labelEn: "Efficiency", labelAr: "الكفاءة", unit: "km/L" },
  ],
};
