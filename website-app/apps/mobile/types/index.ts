/**
 * Fimto Concrete ERP — Mobile App Type Definitions
 * Aligned with backend schema (src/db/schema.ts)
 */

// ─── User Roles ────────────────────────────────────────────────────────────────

export type UserRole =
  | "SUPER_ADMIN"
  | "PLANT_MGR"
  | "ACCOUNTANT"
  | "LAB_TECH"
  | "BATCH_OPERATOR"
  | "SALES_REP"
  | "DRIVER"
  | "STATION_TECH"
  | "RND_MANAGER"           // مدير البحث والتطوير
  | "HR_OFFICER"            // موظف الموارد البشرية
  // Operational aliases retained for backward compatibility
  | "FINANCE"
  | "DISPATCHER"
  | "WORKSHOP_MGR"
  | "LAB_TECHNICIAN"
  | "WORKSHOP_MECHANIC"
  // Department managers
  | "OPERATIONS_MGR"
  | "PRODUCTION_MGR"
  // Reps (sales field team) manager — tracks rep routes and assigns daily tasks
  | "REPS_MGR"
  // Schedule officer — approves the daily schedule after the accountant
  | "SCHEDULE_MGR";

export interface AuthUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  role: UserRole;
  zone?: string;
  /** Website app-tree modules this account may access (mirrors treeRoles.ts mods). */
  mods?: string[];
  /** Vehicle type assigned by the owner in the tree (truck field). */
  vehicleType?: string;
  /** Company subscription — set by the owner in the tree (Console). */
  subscriptionStart?: string;
  subscriptionEnd?: string;
  /** "active" | "trial" | "expired" | "" */
  subscriptionStatus?: string;
  /** Plant/factory display name — shown in headers so cross-plant data is obvious. */
  plantName?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

// ─── API Response Wrapper ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errorCode?: string;
  timestamp: string;
}

// ─── Order Status ──────────────────────────────────────────────────────────────

export type OrderStatus =
  | "DRAFT"
  | "PENDING_FINANCE"
  | "CREDIT_HOLD"
  | "FINANCE_REJECTED"
  | "APPROVED"
  | "APPROVED_SCHEDULED"
  | "SCHEDULED"
  | "IN_PRODUCTION"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"
  | "ON_HOLD";

// ─── Trip Checkpoint ───────────────────────────────────────────────────────────

export type TripCheckpoint =
  | "ARR_PLANT"
  | "ARR_BSTC"
  | "DEP_PLANT"
  | "ARR_SITE"
  | "POUR_START"
  | "DEP_SITE"
  | "RETURN_PLANT";

export type VehicleStatus =
  | "AVAILABLE"
  | "LOADING"
  | "IN_TRANSIT"
  | "POURING"
  | "RETURNING"
  | "IN_WORKSHOP"
  | "MAJOR_BREAKDOWN"
  | "OUT_OF_SERVICE"
  | "FUELING"
  | "STANDBY";

// ─── Simplified Trip (Driver View) ─────────────────────────────────────────────

export interface Trip {
  id: string;
  tripNumber: string;
  orderId: string;
  vehicleId: string;
  driverId: string;
  mixDesignId: string;
  loadedVolumeM3: string;
  currentCheckpoint: TripCheckpoint;
  deliveryTicketNumber: string | null;
  isCompleted: boolean;
  isCancelled: boolean;
  createdAt: string;

  // E-signature proof (Epic 3 — from my-active; image fetched on demand)
  hasSignature?: boolean;
  signedBy?: string | null;
  signedAt?: string | null;

  // Joins (from API)
  vehicleCode?: string;
  plateNumber?: string;
  clientName?: string;
  siteName?: string;
  siteLatitude?: number;
  siteLongitude?: number;
  geofenceRadiusMetres?: number;
  designCode?: string;
  gradeDescription?: string;
  totalVolumeM3?: string;
  remainingVolumeM3?: string;

  // Delivery challan (Package 1 — midhuna-rmc style guard rails)
  cycleTimeMin?: number;
  stageTimes?: {
    dispatchTime?: string | null;
    siteArrivalTime?: string | null;
    unloadingEndTime?: string | null;
    returnTime?: string | null;
  };
  hasChallan?: boolean;
}

/** Customer signature captured on the pad → serialized strokes (JSON) or data URL. */
export interface Challan {
  number?: string;
  receivedBy?: string;
  customerSignature?: string;
  slumpMm?: number | null;
  temperatureC?: number | null;
  distanceKm?: number | null;
  qrCode?: string;
  capturedAt?: string;
  updatedAt?: string;
}

// ─── Simplified Order (Sales View) ─────────────────────────────────────────────

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalVolumeM3: string;
  pricePerM3Sar: number;
  scheduledDate: string;
  paperClearanceGranted: boolean;
  financeApprovedAt: string | null;
  createdAt: string;

  // Joins (from API)
  companyName?: string;
  clientCode?: string;
  siteName?: string;
  designCode?: string;
  repName?: string;
}

// ─── Client & Site ─────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  clientCode: string;
  companyName: string;
  phone?: string;
  email?: string;
  creditHold?: boolean;
}

export interface DeliverySite {
  id: string;
  siteName: string;
  siteCode: string;
  city?: string;
  latitude?: string;
  longitude?: string;
  geofenceRadiusMetres: number;
}

// ─── Mix Design ────────────────────────────────────────────────────────────────

export interface MixDesign {
  id: string;
  designCode: string;
  gradeDescription: string;
  targetStrengthMpa: string;
  targetSlumpCm: string;
}

// ─── Location Payload (GPS) ────────────────────────────────────────────────────

export interface LocationPayload {
  tripId: string;
  vehicleId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracyMetres?: number;
  deviceSpeedKmh?: number;
  headingDegrees?: number;
  isMoving: boolean;
  batteryPct?: number;
  capturedAt: string;
}

// ─── Socket.io Events ──────────────────────────────────────────────────────────

export interface SocketEvents {
  "fleet:vehicle_position": {
    vehicleId: string;
    vehicleCode: string;
    currentStatus: VehicleStatus;
    currentCheckpoint?: TripCheckpoint;
    latitude: number | null;
    longitude: number | null;
    updatedAt: string;
  };
  "trip:checkpoint_updated": {
    tripId: string;
    tripNumber: string;
    newCheckpoint: TripCheckpoint;
    timestamp: string;
  };
  "order:approved": {
    orderId: string;
    orderNumber: string;
    newStatus: string;
    timestamp: string;
  };
  "order:credit_hold": {
    orderId: string;
    orderNumber: string;
    creditUtilisationPct: number;
    timestamp: string;
  };
  "driver:notification": {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp: string;
  };
}

// ─── Simplified Driver UI State ────────────────────────────────────────────────

export interface DriverCheckpointStep {
  checkpoint: TripCheckpoint;
  labelAr: string;
  labelEn: string;
  emoji: string;
  color: string; // tailwind color class
  bgColor: string;
}

// Map from current checkpoint → next action button state
export const DRIVER_CHECKPOINT_STEPS: DriverCheckpointStep[] = [
  {
    checkpoint: "ARR_PLANT",
    labelAr: "أنا بالمحطة",
    labelEn: "At Plant",
    emoji: "🏭",
    color: "text-white",
    bgColor: "bg-orange-500",
  },
  {
    checkpoint: "ARR_BSTC",
    labelAr: "تحت البلانت للتعبئة",
    labelEn: "Loading",
    emoji: "📥",
    color: "text-white",
    bgColor: "bg-amber-500",
  },
  {
    checkpoint: "DEP_PLANT",
    labelAr: "انطلقت للموقع",
    labelEn: "Departed to Site",
    emoji: "🚚",
    color: "text-white",
    bgColor: "bg-blue-500",
  },
  {
    checkpoint: "ARR_SITE",
    labelAr: "وصلت الموقع",
    labelEn: "Arrived at Site",
    emoji: "📍",
    color: "text-white",
    bgColor: "bg-emerald-500",
  },
  {
    checkpoint: "POUR_START",
    labelAr: "بدأت الصب",
    labelEn: "Pour Started",
    emoji: "💧",
    color: "text-white",
    bgColor: "bg-teal-500",
  },
  {
    checkpoint: "DEP_SITE",
    labelAr: "انتهيت الصب",
    labelEn: "Finished Pour",
    emoji: "✅",
    color: "text-white",
    bgColor: "bg-green-600",
  },
  {
    checkpoint: "RETURN_PLANT",
    labelAr: "راجعت للمصنع",
    labelEn: "Return to Plant",
    emoji: "🔄",
    color: "text-white",
    bgColor: "bg-slate-700",
  },
];

export const CHECKPOINT_SEQUENCE: TripCheckpoint[] = [
  "ARR_PLANT",
  "ARR_BSTC",
  "DEP_PLANT",
  "ARR_SITE",
  "POUR_START",
  "DEP_SITE",
  "RETURN_PLANT",
];

// ─── Order Status Display Config ───────────────────────────────────────────────

export interface StatusDisplay {
  labelAr: string;
  labelEn: string;
  color: string;
  bgColor: string;
  emoji: string;
}

export const ORDER_STATUS_DISPLAY: Record<OrderStatus, StatusDisplay> = {
  DRAFT: {
    labelAr: "مسودة",
    labelEn: "Draft",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    emoji: "📝",
  },
  PENDING_FINANCE: {
    labelAr: "بانتظار الحسابات",
    labelEn: "Pending Finance",
    color: "text-orange-700",
    bgColor: "bg-orange-100",
    emoji: "⏳",
  },
  CREDIT_HOLD: {
    labelAr: "موقوف ائتمانياً",
    labelEn: "Credit Hold",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    emoji: "⚠️",
  },
  FINANCE_REJECTED: {
    labelAr: "مرفوض",
    labelEn: "Rejected",
    color: "text-red-700",
    bgColor: "bg-red-100",
    emoji: "❌",
  },
  APPROVED: {
    labelAr: "معتمد",
    labelEn: "Approved",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
    emoji: "✅",
  },
  APPROVED_SCHEDULED: {
    labelAr: "معتمد ومجدول",
    labelEn: "Scheduled",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
    emoji: "📅",
  },
  SCHEDULED: {
    labelAr: "مجدول",
    labelEn: "Scheduled",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    emoji: "📅",
  },
  IN_PRODUCTION: {
    labelAr: "قيد الإنتاج",
    labelEn: "In Production",
    color: "text-indigo-700",
    bgColor: "bg-indigo-100",
    emoji: "🏭",
  },
  IN_TRANSIT: {
    labelAr: "في الطريق",
    labelEn: "In Transit",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    emoji: "🚚",
  },
  DELIVERED: {
    labelAr: "تم التسليم",
    labelEn: "Delivered",
    color: "text-green-700",
    bgColor: "bg-green-100",
    emoji: "✅",
  },
  CANCELLED: {
    labelAr: "ملغى",
    labelEn: "Cancelled",
    color: "text-slate-500",
    bgColor: "bg-slate-100",
    emoji: "🚫",
  },
  ON_HOLD: {
    labelAr: "معلق",
    labelEn: "On Hold",
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
    emoji: "⏸️",
  },
};

// ─── Constants ─────────────────────────────────────────────────────────────────

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://concrete.fimtosoft.com/api";

export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? "https://concrete.fimtosoft.com";

export const GPS_TRACKING_INTERVAL_MS = 10_000; // 10 seconds
export const GPS_ACCURACY_THRESHOLD_M = 50;

/**
 * Placeholder routing flag → external web deletion form for users who are NOT
 * logged into the mobile app (Google Play requires a publicly reachable
 * account-deletion page). Wire the real marketing-site URL here at release.
 */
export const WEB_ACCOUNT_DELETION_URL =
  process.env.EXPO_PUBLIC_WEB_DELETION_URL ??
  "https://fimtosoft.com/account/delete";

/** WhatsApp Business share deep-link base (used by report/ticket sharing). */
export const WHATSAPP_SHARE_BASE = "https://wa.me/?text=";

/**
 * Public download links for the native apps (shared from the marketing site).
 * Configure via env at release; defaults point at the hosted downloads folder.
 */
export const APK_DOWNLOAD_URL =
  process.env.EXPO_PUBLIC_APK_URL ?? "https://concrete.fimtosoft.com/downloads/fimto-android.apk";

export const IOS_DOWNLOAD_URL =
  process.env.EXPO_PUBLIC_IOS_URL ?? "https://apps.apple.com/app/fimto-concrete-erp";

/** WebSocket resilience tuning (Module 5). */
export const SOCKET_RECONNECT = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 10_000,
  timeout: 10_000,
} as const;

/** Local-storage keys for the offline sync engine. */
export const OFFLINE_QUEUE_KEY = "fimto_offline_queue";
