/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Database Schema (Drizzle ORM / PostgreSQL)
 *  Version: 1.0.0 — Production Grade
 * ============================================================
 *
 *  Modules covered:
 *  ─────────────────────────────────────────────────────────
 *  1. Users & RBAC          – roles, permissions, sessions
 *  2. Clients & Sites        – customers, credit limits, GPS
 *  3. Fleet & Vehicles       – trucks, pumps, tare weights
 *  4. Mix Designs            – recipes, env-compensation data
 *  5. Raw Material Inventory – silos, stock ledger
 *  6. Pouring Schedule       – sales pipeline → finance approval
 *  7. Trips & Timeline       – 7-checkpoint real-time log
 *  8. Weighbridge            – SHA-256 hash-chain ledger
 *  9. Concrete Returns       – disposition tracking
 * 10. Quality / Lab          – slump tests, compressive strength
 * 11. Workshop & Maintenance – breakdown, preventive, fuel logs
 * 12. Audit Log              – immutable system audit trail
 * ============================================================
 */

import {
  pgTable,
  pgEnum,
  text,
  integer,
  real,
  boolean,
  timestamp,
  varchar,
  jsonb,
  uuid,
  unique,
  index,
  primaryKey,
  decimal,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — ENUMERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * System-wide user roles — 10 distinct roles
 *
 * 4 PRIMARY ERP roles (web dashboard):
 *   SUPER_ADMIN · FINANCE · SALES_REP · DRIVER
 *
 * 6 SUPPORTING sub-roles (plant floor / workshop / lab):
 *   LAB_TECH         — mix recipes, slump/strength QC, climate compensation
 *   BATCH_OPERATOR   — automated batching panel, start-batch, scale calibration
 *   WORKSHOP_MGR     — fleet vehicle status mutation, breakdown, fuel/spares inventory
 *   WORKSHOP_MECHANIC — mechanic work orders (read+close, no status mutation)
 *   LAB_TECHNICIAN   — legacy alias for LAB_TECH
 *   DISPATCHER       — fleet scheduling, trip creation
 */
export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "PLANT_MGR",
  "ACCOUNTANT",
  "LAB_TECH",
  "BATCH_OPERATOR",
  "SALES_REP",
  "DRIVER",
  "RND_MANAGER",          // مدير البحث والتطوير — owns development plans, tasks, R&D follow-up
  "HR_OFFICER",           // موظف الموارد البشرية — leave/advance requests, broadcasts, payroll support
  // ── Operational aliases retained for live-data backward compatibility ──
  "FINANCE",
  "DISPATCHER",
  "WORKSHOP_MGR",
  "LAB_TECHNICIAN",
  "WORKSHOP_MECHANIC",
]);

/** Order lifecycle states — maps directly to the Sales Pipeline module */
export const orderStatusEnum = pgEnum("order_status", [
  "DRAFT",              // Sales rep created, not yet submitted
  "PENDING_FINANCE",    // Submitted — awaiting credit-check & accountant approval
  "CREDIT_HOLD",        // ⚠️ Blocked by credit limit breach (requires accountant override)
  "FINANCE_REJECTED",   // Blocked by credit/debt limit breach
  "APPROVED",           // Finance toggled approval; ready for scheduling
  "APPROVED_SCHEDULED", // Finance approved AND placed on smart calendar
  "SCHEDULED",          // Dispatched on the smart calendar (legacy alias)
  "IN_PRODUCTION",      // Batch plant started
  "IN_TRANSIT",         // Truck en-route to site
  "DELIVERED",          // All loads confirmed at site
  "CANCELLED",          // Voided by admin/finance
  "ON_HOLD",            // Paused (customer request / logistics)
]);

/** Vehicle (fleet asset) types */
export const vehicleTypeEnum = pgEnum("vehicle_type", [
  "MIXER_TRUCK",        // Ready-mix concrete transport drum truck
  "CONCRETE_PUMP",      // Boom/line pump unit
  "TRANSIT_MIXER",      // Agitator/transit mixer
  "WATER_TANKER",       // Site support
  "SERVICE_TRUCK",      // Workshop support
  "TIPPER_TRUCK",       // Raw material haulage (aggregate/sand intake)
]);

/**
 * VEHICLE CLASS — behavioural classification that drives which subsystems
 * a vehicle participates in. This is distinct from `vehicle_type` (the
 * physical asset kind) because it controls business logic branching.
 *
 * ┌───────────┬────────────┬───────────┬──────────┬───────────┬──────────┐
 * │ Class     │ 7-Timeline │ 90min Dry │ Weighbr. │ Silo Feed │ GPS/Fuel │
 * ├───────────┼────────────┼───────────┼──────────┼───────────┼──────────┤
 * │ MIXER     │     ✅     │    ✅     │    ✅    │    ❌     │    ✅    │
 * │ PUMP      │     ❌     │    ❌     │    ❌    │    ❌     │    ✅    │
 * │ TIPPER    │     ❌     │    ❌     │    ✅    │    ✅     │    ✅    │
 * │ SERVICE   │     ❌     │    ❌     │    ❌    │    ❌     │    ✅    │
 * │ REGULAR   │     ❌     │    ❌     │    ❌    │    ❌     │    ✅    │
 * └───────────┴────────────┴───────────┴──────────┴───────────┴──────────┘
 *
 *  • MIXER   — Drum trucks. Bound to the 7-checkpoint delivery timeline and
 *              the 90-minute concrete drying countdown (DEP_PLANT → ARR_SITE).
 *  • PUMP    — Boom/line pumps. Tracks STATIC operation hours at the client
 *              site plus pumped-volume metrics. Supports `is_external` so
 *              outsourced pump costs are accounted separately.
 *  • TIPPER  — Raw material haulage. Weighs in at the bridge and feeds
 *              directly into `inventory_silos` via `tipper_intake_logs`.
 *  • SERVICE — Workshop/maintenance support vehicles.
 *  • REGULAR — General company vehicles (admin cars, pickups).
 *
 * SERVICE and REGULAR are HARD-EXCLUDED from the weighbridge ledger and all
 * production timelines. They only accrue GPS distance and fuel consumption.
 */
export const vehicleClassEnum = pgEnum("vehicle_class", [
  "MIXER",
  "PUMP",
  "TIPPER",
  "SERVICE",
  "REGULAR",
]);

/** Lifecycle of a pump's on-site operating session */
export const pumpSessionStatusEnum = pgEnum("pump_session_status", [
  "MOBILISING",     // Travelling to the client site
  "SETUP",          // Deploying outriggers / assembling boom
  "PUMPING",        // Actively pumping concrete
  "STANDBY",        // On site, idle, waiting for the next mixer
  "TEARDOWN",       // Packing up
  "COMPLETED",      // Session closed and billed
  "CANCELLED",
]);

/** Disposition of a tipper's raw-material intake load */
export const tipperIntakeStatusEnum = pgEnum("tipper_intake_status", [
  "WEIGHED_IN",     // Gross weight captured at the bridge
  "DISCHARGED",     // Material tipped into the silo
  "REJECTED",       // Failed QC — returned to supplier
  "PARTIAL",        // Partially discharged (silo reached capacity)
]);

/** Real-time vehicle operational state */
export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "AVAILABLE",          // Ready for dispatch
  "LOADING",            // Under batch plant
  "IN_TRANSIT",         // Delivering to site
  "POURING",            // On-site active pour
  "RETURNING",          // Heading back to plant
  "IN_WORKSHOP",        // Under maintenance (excluded from dispatch pool)
  "MAJOR_BREAKDOWN",    // Critical failure — must not be dispatched
  "OUT_OF_SERVICE",     // Retired / decommissioned
  "FUELING",            // At fuel pump
  "STANDBY",            // Available but parked
]);

/** 7-checkpoint trip timeline states */
export const tripCheckpointEnum = pgEnum("trip_checkpoint", [
  "ARR_PLANT",          // Arrived at plant (start of cycle)
  "ARR_BSTC",           // Entered under batch plant (loading started)
  "DEP_PLANT",          // Departed plant / weighbridge gate out
  "ARR_SITE",           // Arrived at customer site
  "POUR_START",         // Pouring / pump hook-up started
  "DEP_SITE",           // Departed from site
  "RETURN_PLANT",       // Returned to plant (cycle complete)
]);

/** Concrete return material dispositions */
export const returnDispositionEnum = pgEnum("return_disposition", [
  "RECYCLED_BATCHING",  // Returned slurry re-used in next batch
  "CAST_BLOCKS",        // Poured into precast block moulds
  "DISCARDED",          // Wasted / disposed
  "WASHOUT",            // Drum washout water only
]);

/** Maintenance classification */
export const maintenanceTypeEnum = pgEnum("maintenance_type", [
  "PREVENTIVE",         // Scheduled interval-based service
  "CORRECTIVE",         // Repair after failure
  "INSPECTION",         // Routine safety check
  "MAJOR_OVERHAUL",     // Full engine/transmission rebuild
  "TIRE_SERVICE",       // Tire rotation/replacement
  "HYDRAULIC_SERVICE",  // Hydraulic system (drum, boom)
]);

/** Maintenance work order status */
export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_PARTS",
  "COMPLETED",
  "ESCALATED",
  "CANCELLED",
]);

/** Raw material categories for inventory silos */
export const materialCategoryEnum = pgEnum("material_category", [
  "CEMENT",
  "SAND",
  "GRAVEL_10MM",
  "GRAVEL_20MM",
  "GRAVEL_40MM",
  "WATER",
  "ADMIXTURE_PLASTICIZER",
  "ADMIXTURE_RETARDER",
  "ADMIXTURE_ACCELERATOR",
  "FLY_ASH",
  "SILICA_FUME",
  "STEEL_FIBER",
  "POLYPROPYLENE_FIBER",
]);

/** Lab test types */
export const labTestTypeEnum = pgEnum("lab_test_type", [
  "SLUMP_TEST",
  "COMPRESSIVE_7DAY",
  "COMPRESSIVE_28DAY",
  "TEMPERATURE_FRESH",
  "AIR_CONTENT",
  "UNIT_WEIGHT",
]);

/** Lab test pass/fail result */
export const labTestResultEnum = pgEnum("lab_test_result", [
  "PASS",
  "FAIL",
  "MARGINAL",
  "PENDING",
]);

/** Finance approval action types for audit */
export const financeActionEnum = pgEnum("finance_action", [
  "CREDIT_CHECK",
  "MANUAL_OVERRIDE",
  "CASH_APPROVAL",
  "APPROVE",
  "REJECT",
  "HOLD",
  "CREDIT_HOLD",           // Automated hold due to credit limit breach
  "OVERRIDE_APPROVE",      // Manual accountant override past credit limit
]);

/** Maintenance severity levels */
export const maintenanceSeverityEnum = pgEnum("maintenance_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",              // Automatically triggers IN_WORKSHOP status
]);

/** Purchase request states — auto-generated when inventory hits reorder level */
export const purchaseRequestStatusEnum = pgEnum("purchase_request_status", [
  "AUTO_GENERATED",        // System-created on reorder trigger
  "ACKNOWLEDGED",          // Procurement team acknowledged
  "QUOTED",                // Supplier quote received
  "APPROVED",              // Finance approved PO
  "ORDERED",               // PO placed with supplier
  "RECEIVED",              // Goods received at plant
  "CANCELLED",
]);

/** Procurement priority for auto-generated purchase requests */
export const purchasePriorityEnum = pgEnum("purchase_priority", [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",              // Raised automatically when a silo breaches reorder level
]);

/** Calibration verification outcome for batch plant scales */
export const calibrationResultEnum = pgEnum("calibration_result", [
  "PASS",                // deviation within ±1%
  "WARNING",             // deviation within ±1% but trending
  "FAIL",                // deviation > ±1% → blocks batching
]);

/** Batch plant operational state */
export const plantStatusEnum = pgEnum("plant_status", [
  "OPERATIONAL",
  "DEGRADED",
  "OUT_OF_SERVICE",      // Set when calibration fails
  "MAINTENANCE",
]);

/** Credit hold status for orders stuck awaiting accountant override */
export const creditHoldStatusEnum = pgEnum("credit_hold_status", [
  "ON_HOLD",               // Awaiting accountant manual override
  "RELEASED_BY_ACCOUNTANT", // Accountant approved via override
  "RELEASED_BY_ADMIN",      // Admin override
  "EXPIRED",                // Order cancelled after hold timeout
]);

/**
 * client_risk — automatic credit-risk assessment level.
 * Computed by the risk engine from payment/delivery behaviour.
 */
export const clientRiskEnum = pgEnum("client_risk", [
  "LOW",
  "MEDIUM",
  "HIGH",
]);

/** Fuel log record types */
export const fuelLogTypeEnum = pgEnum("fuel_log_type", [
  "REFUEL",             // Normal refueling at plant or station
  "CONSUMPTION_LOG",    // Calculated from odometer reading
  "DISCREPANCY_REPORT", // Anomaly / suspected theft
]);

// ─── R&D Module Enumerations ──────────────────────────────────────────────────

/** Development plan lifecycle — draft → finance approval → execution → closure */
export const rndPlanStatusEnum = pgEnum("rnd_plan_status", [
  "DRAFT",              // Created by management, not yet submitted
  "PENDING_FINANCE",    // Submitted — awaiting finance manager budget approval
  "APPROVED",           // Finance approved; ready for task distribution
  "IN_PROGRESS",        // Tasks distributed and executing
  "COMPLETED",          // All milestones/tasks closed
  "REJECTED",           // Finance rejected the budget
]);

/** Development plan focus area */
export const rndPlanCategoryEnum = pgEnum("rnd_plan_category", [
  "PRODUCTION",         // تحسين الإنتاج (e.g. 5000 → 5200 m³)
  "QUALITY",            // تحسين الجودة
  "COST",               // تقليل التكاليف
  "STAFF",              // تطوير الكوادر
  "TECHNOLOGY",         // تبني التكنولوجيا
  "PROCESS",            // تحسين العمليات
]);

/** Shared priority scale for plans and tasks */
export const rndPriorityEnum = pgEnum("rnd_priority", [
  "HIGH",
  "MEDIUM",
  "LOW",
]);

/** R&D task execution state */
export const rndTaskStatusEnum = pgEnum("rnd_task_status", [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "BLOCKED",
]);

/** Budget line-item categories */
export const rndBudgetCategoryEnum = pgEnum("rnd_budget_category", [
  "EQUIPMENT",          // معدات وآلات
  "SOFTWARE",           // برمجيات وتراخيص
  "TRAINING",           // التدريب والتطوير
  "CONSULTING",         // خدمات استشارية
  "MARKETING",          // التسويق والترويج
  "HR",                 // الموارد البشرية (تعيين/استبدال)
  "MATERIALS",          // اختبار المواد الخام
  "OTHER",
]);

/** Budget line-item lifecycle */
export const rndBudgetItemStatusEnum = pgEnum("rnd_budget_item_status", [
  "PLANNED",
  "REQUESTED",
  "APPROVED",
  "ORDERED",
  "RECEIVED",
  "CANCELLED",
]);

/** External issue severity */
export const rndIssueSeverityEnum = pgEnum("rnd_issue_severity", [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);

/** External issue classification */
export const rndIssueCategoryEnum = pgEnum("rnd_issue_category", [
  "EQUIPMENT",          // عطل معدات
  "QUALITY",            // مشكلة جودة
  "SAFETY",             // حادث سلامة
  "STAFF",              // مشكلة موظفين
  "SUPPLIER",           // مشكلة مورد
  "OTHER",
]);

/** External issue resolution lifecycle */
export const rndIssueStatusEnum = pgEnum("rnd_issue_status", [
  "OPEN",
  "INVESTIGATING",
  "RESOLVING",
  "RESOLVED",
  "CLOSED",
]);

/** Product families beyond ready-mix (Epic 11). */
export const productTypeEnum = pgEnum("product_type", [
  "READY_MIX",
  "AGGREGATE",
  "ASPHALT",
  "BLOCKS",
  "CEMENT",
]);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1B — MULTI-TENANT SAAS ROOT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tenants — hard isolation boundary for every subscribed concrete company/plant.
 * Every analytical query and state-changing operation must carry tenant_id from
 * the verified JWT context and must include a tenant predicate.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantCode: varchar("tenant_code", { length: 40 }).notNull().unique(),
    companyName: varchar("company_name", { length: 200 }).notNull(),
    primaryPlantName: varchar("primary_plant_name", { length: 160 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("SA"),
    timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Riyadh"),
    defaultLocale: varchar("default_locale", { length: 10 }).notNull().default("en"),
    isActive: boolean("is_active").notNull().default(true),
    subscriptionPlan: varchar("subscription_plan", { length: 40 }).notNull().default("STANDARD"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_tenants_code").on(t.tenantCode), index("idx_tenants_active").on(t.isActive)]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — USERS & AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * users — Core identity table
 * Supports JWT + RBAC with bcrypt-hashed passwords
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeCode: varchar("employee_code", { length: 20 }).notNull().unique(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 200 }).notNull().unique(),
    phoneNumber: varchar("phone_number", { length: 20 }),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    /** Granular permissions override (JSON array of permission keys) */
    permissions: jsonb("permissions").$type<string[]>().default([]),
    /** Push notification token for mobile app (FCM/APNs) */
    pushToken: text("push_token"),
    /** Geographic zone assignment (e.g. "Al-Sharqia East") */
    zone: varchar("zone", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at"),
    /** Refresh token stored server-side for rotation strategy */
    refreshTokenHash: text("refresh_token_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_users_role").on(t.role),
    index("idx_users_email").on(t.email),
    index("idx_users_employee_code").on(t.employeeCode),
    index("idx_users_tenant").on(t.tenantId),
  ]
);

/**
 * user_sessions — Active JWT session tracking
 * Allows forced logout / session revocation
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jti: varchar("jti", { length: 64 }).notNull().unique(), // JWT ID claim
    deviceInfo: jsonb("device_info").$type<{
      platform: string;
      appVersion: string;
      deviceId: string;
      ip: string;
    }>(),
    isRevoked: boolean("is_revoked").notNull().default(false),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_sessions_user").on(t.userId),
    index("idx_sessions_jti").on(t.jti),
    index("idx_sessions_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — CLIENTS & DELIVERY SITES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * clients — Customer master data with credit management
 */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    clientCode: varchar("client_code", { length: 20 }).notNull().unique(),
    companyName: varchar("company_name", { length: 200 }).notNull(),
    contactPerson: varchar("contact_person", { length: 120 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 200 }),
    vatNumber: varchar("vat_number", { length: 50 }),
    /** Credit limit in SAR (stored as integer cents to avoid float issues) */
    creditLimitSar: integer("credit_limit_sar").notNull().default(0),
    /** Current outstanding balance in SAR cents */
    outstandingBalanceSar: integer("outstanding_balance_sar").notNull().default(0),
    /** Hard block: if true, no new orders are allowed regardless of credit */
    isBlacklisted: boolean("is_blacklisted").notNull().default(false),
    /**
     * Automatic credit-risk assessment (LOW/MEDIUM/HIGH) computed by the risk
     * engine from outstanding balance, delivered-but-unpaid volume and
     * historical credit-risk events. Recalculated on demand by finance.
     */
    riskScore: clientRiskEnum("risk_score").notNull().default("LOW"),
    /** Human-readable breakdown of the risk factors that produced riskScore */
    riskNotes: text("risk_notes"),
    riskLastUpdatedAt: timestamp("risk_last_updated_at"),
    /** Manual paper clearance flag (set by finance, does NOT bypass e-approval) */
    paperClearanceGranted: boolean("paper_clearance_granted").notNull().default(false),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    /** Origin surface after the unified-DB merge: 'app' (mobile/ERP) | 'website' */
    source: varchar("source", { length: 20 }).notNull().default("app"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_clients_code").on(t.clientCode),
    index("idx_clients_company").on(t.companyName),
    index("idx_clients_tenant").on(t.tenantId),
  ]
);

/**
 * delivery_sites — Individual pour sites with GPS coordinates for geofencing
 */
export const deliverySites = pgTable(
  "delivery_sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    siteName: varchar("site_name", { length: 200 }).notNull(),
    siteCode: varchar("site_code", { length: 30 }).notNull().unique(),
    addressLine: text("address_line"),
    city: varchar("city", { length: 100 }),
    /** GPS coordinates — captured via mobile app geolocation */
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    /** Geofence radius in metres for auto ARR_SITE detection */
    geofenceRadiusMetres: integer("geofence_radius_metres").notNull().default(150),
    /** Distance from plant in kilometres (pre-calculated) */
    distanceFromPlantKm: decimal("distance_from_plant_km", { precision: 8, scale: 2 }),
    /** Curfew windows for heavy vehicles (JSON: [{days, startTime, endTime}]) */
    trafficCurfewWindows: jsonb("traffic_curfew_windows").$type<
      { days: string[]; startTime: string; endTime: string; reason: string }[]
    >().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_sites_client").on(t.clientId),
    index("idx_sites_code").on(t.siteCode),
    index("idx_sites_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — FLEET MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * fleet_vehicles — Mixer trucks, pumps, and all plant fleet assets
 */
export const fleetVehicles = pgTable(
  "fleet_vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    vehicleCode: varchar("vehicle_code", { length: 20 }).notNull().unique(), // e.g. "T01", "P01"
    plateNumber: varchar("plate_number", { length: 30 }).notNull().unique(),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    /**
     * Behavioural class — controls which subsystems this vehicle participates
     * in (timeline, weighbridge, silo intake). See `vehicleClassEnum` docs.
     */
    vehicleClass: vehicleClassEnum("vehicle_class").notNull().default("REGULAR"),
    make: varchar("make", { length: 80 }),
    model: varchar("model", { length: 80 }),
    year: integer("year"),
    /** Drum capacity in cubic metres (e.g. 8.0 m³) */
    drumCapacityM3: decimal("drum_capacity_m3", { precision: 5, scale: 2 }),
    /**
     * TARE WEIGHT (empty vehicle weight in tonnes)
     * CRITICAL for weighbridge net calculation: Net = Gross - Tare
     */
    tareWeightTonnes: decimal("tare_weight_tonnes", { precision: 8, scale: 3 }).notNull(),
    currentStatus: vehicleStatusEnum("current_status").notNull().default("AVAILABLE"),
    /** Fuel type and efficiency targets */
    fuelType: varchar("fuel_type", { length: 20 }).default("DIESEL"),
    /** Target fuel consumption (litres per 100 km) */
    targetFuelLPer100Km: decimal("target_fuel_l_per_100km", { precision: 5, scale: 2 }),
    odometreKm: decimal("odometre_km", { precision: 10, scale: 1 }).default("0"),
    /** Assigned primary driver */
    assignedDriverId: uuid("assigned_driver_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * IS_EXTERNAL — marks the asset as outsourced / leased / third-party.
     * Used by Finance to separate in-house CAPEX depreciation from outsourced
     * equipment operating costs when generating the monthly P&L.
     */
    isExternal: boolean("is_external").notNull().default(false),
    /** Owner / vendor for external equipment (used for vendor cost rollup) */
    externalVendorName: varchar("external_vendor_name", { length: 120 }),
    /** Monthly rental rate in SAR halalas (only meaningful when isExternal=true) */
    monthlyRentalRateSar: integer("monthly_rental_rate_sar").default(0),
    /** Hourly hire rate for PUMP class assets (SAR halalas per operating hour) */
    hourlyRateSar: integer("hourly_rate_sar").default(0),
    /** Payload capacity in tonnes — used by TIPPER class for intake reconciliation */
    payloadCapacityTonnes: decimal("payload_capacity_tonnes", { precision: 8, scale: 3 }),
    /** Boom reach in metres — PUMP class only */
    boomReachMetres: decimal("boom_reach_metres", { precision: 5, scale: 2 }),
    /** Rated pumping throughput in m³/hour — PUMP class only */
    pumpRateM3PerHour: decimal("pump_rate_m3_per_hour", { precision: 6, scale: 2 }),
    /** Insurance expiry */
    insuranceExpiresAt: timestamp("insurance_expires_at"),
    /** Inspection due date */
    inspectionDueAt: timestamp("inspection_due_at"),
    /**
     * LIVE GPS TELEMETRY — last known position pushed either by the driver app
     * (Socket.io) or by a third-party GPS vendor via /api/v1/fleet/gps-webhook.
     */
    lastGpsLat: decimal("last_gps_lat", { precision: 10, scale: 7 }),
    lastGpsLng: decimal("last_gps_lng", { precision: 10, scale: 7 }),
    lastGpsSpeedKmh: decimal("last_gps_speed_kmh", { precision: 6, scale: 2 }),
    lastGpsHeading: decimal("last_gps_heading", { precision: 5, scale: 2 }),
    /** Source of the last fix: "DRIVER_APP" | "GPS_VENDOR" | "MANUAL" */
    lastGpsSource: varchar("last_gps_source", { length: 20 }),
    lastGpsAt: timestamp("last_gps_at"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_vehicles_status").on(t.currentStatus),
    index("idx_vehicles_type").on(t.vehicleType),
    index("idx_vehicles_code").on(t.vehicleCode),
    index("idx_vehicles_driver").on(t.assignedDriverId),
    index("idx_vehicles_last_gps").on(t.lastGpsAt),
    index("idx_vehicles_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — MIX DESIGNS & RECIPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * mix_designs — Concrete recipes (C25, C30, C35, C40, etc.)
 * All quantities are per 1 m³ of concrete produced
 */
export const mixDesigns = pgTable(
  "mix_designs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    designCode: varchar("design_code", { length: 30 }).notNull().unique(), // e.g. "C30-S4"
    gradeDescription: varchar("grade_description", { length: 100 }).notNull(),
    /** Target compressive strength at 28 days (MPa) */
    targetStrengthMpa: decimal("target_strength_mpa", { precision: 6, scale: 2 }).notNull(),
    /** Target slump at delivery (cm) */
    targetSlumpCm: decimal("target_slump_cm", { precision: 4, scale: 1 }).notNull(),
    /** Bill of materials per 1 m³ (kg) */
    cementKgPerM3: decimal("cement_kg_per_m3", { precision: 8, scale: 3 }).notNull(),
    sandKgPerM3: decimal("sand_kg_per_m3", { precision: 8, scale: 3 }).notNull(),
    gravel10mmKgPerM3: decimal("gravel_10mm_kg_per_m3", { precision: 8, scale: 3 }).default("0"),
    gravel20mmKgPerM3: decimal("gravel_20mm_kg_per_m3", { precision: 8, scale: 3 }).default("0"),
    gravel40mmKgPerM3: decimal("gravel_40mm_kg_per_m3", { precision: 8, scale: 3 }).default("0"),
    waterLitresPerM3: decimal("water_litres_per_m3", { precision: 8, scale: 3 }).notNull(),
    admixturePlasiticzerLPerM3: decimal("admixture_plasticizer_l_per_m3", {
      precision: 8,
      scale: 3,
    }).default("0"),
    admixtureRetarderLPerM3: decimal("admixture_retarder_l_per_m3", {
      precision: 8,
      scale: 3,
    }).default("0"),
    flyAshKgPerM3: decimal("fly_ash_kg_per_m3", { precision: 8, scale: 3 }).default("0"),
    silicaFumeKgPerM3: decimal("silica_fume_kg_per_m3", { precision: 8, scale: 3 }).default("0"),

    /**
     * ENVIRONMENT COMPENSATION ALGORITHM PARAMETERS
     * Al-Sharqia region: extreme heat (up to 50°C) + humidity variation
     * Formula: AdjustedWater = baseWater + (tempDelta * waterPerDegC) + (humidityDelta * waterPerPercentHumidity)
     */
    /** Temperature (°C) at which the base recipe was designed */
    baseDesignTempC: decimal("base_design_temp_c", { precision: 4, scale: 1 }).default("25"),
    /** Water adjustment per 1°C above base temp (litres/m³) */
    waterAdjLitresPerDegC: decimal("water_adj_litres_per_deg_c", {
      precision: 5,
      scale: 3,
    }).default("0.5"),
    /** Admixture retarder adjustment per 1°C above base temp (L/m³) */
    retarderAdjLPerDegC: decimal("retarder_adj_l_per_deg_c", {
      precision: 5,
      scale: 3,
    }).default("0.02"),
    /** Humidity correction factor (water reduction per 1% RH above 50%) */
    waterAdjLitresPerPercentHumidity: decimal("water_adj_litres_per_percent_humidity", {
      precision: 5,
      scale: 3,
    }).default("0.05"),
    /** Maximum allowable water-cement ratio */
    maxWcRatio: decimal("max_wc_ratio", { precision: 4, scale: 3 }).default("0.5"),
    /** Product family (Epic 11 — multi-material parity) */
    productType: productTypeEnum("product_type").notNull().default("READY_MIX"),

    isActive: boolean("is_active").notNull().default(true),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_mix_designs_code").on(t.designCode),
    index("idx_mix_designs_active").on(t.isActive),
    index("idx_mix_designs_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — RAW MATERIAL INVENTORY (SILOS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * inventory_silos — Physical storage units (cement silos, aggregate bins, tanks)
 */
export const inventorySilos = pgTable(
  "inventory_silos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    siloCode: varchar("silo_code", { length: 20 }).notNull().unique(), // e.g. "SLO-C1", "BIN-S1"
    siloName: varchar("silo_name", { length: 100 }).notNull(),
    materialCategory: materialCategoryEnum("material_category").notNull(),
    /** Current stock in kg */
    currentStockKg: decimal("current_stock_kg", { precision: 12, scale: 3 }).notNull().default("0"),
    /** Maximum physical capacity in kg */
    capacityKg: decimal("capacity_kg", { precision: 12, scale: 3 }).notNull(),
    /** Reorder threshold — triggers low-stock alert */
    reorderLevelKg: decimal("reorder_level_kg", { precision: 12, scale: 3 }).notNull(),
    /** Unit cost (SAR per tonne for reporting) */
    costSarPerTonne: decimal("cost_sar_per_tonne", { precision: 10, scale: 2 }).default("0"),
    /**
     * QR CODE TOKEN — permanent placard token affixed to the physical silo.
     * A TIPPER driver scans it at discharge so material is credited to the
     * correct silo, eliminating mis-tipping into the wrong bin.
     */
    qrCodeToken: varchar("qr_code_token", { length: 512 }).unique(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_silos_category").on(t.materialCategory),
    index("idx_silos_code").on(t.siloCode),
    index("idx_silos_tenant").on(t.tenantId),
  ]
);

/**
 * inventory_transactions — Double-entry ledger for all silo stock movements
 * Negative qty = consumption (batching), Positive qty = receipt (resupply)
 */
export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    siloId: uuid("silo_id")
      .notNull()
      .references(() => inventorySilos.id, { onDelete: "restrict" }),
    /** Reference to the production batch that consumed this material */
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    transactionType: varchar("transaction_type", { length: 30 }).notNull(), // CONSUMPTION | RECEIPT | ADJUSTMENT | WASTE
    quantityKg: decimal("quantity_kg", { precision: 12, scale: 3 }).notNull(), // negative for deductions
    /** Stock level after this transaction */
    balanceAfterKg: decimal("balance_after_kg", { precision: 12, scale: 3 }).notNull(),
    referenceDoc: varchar("reference_doc", { length: 80 }), // PO number, batch ref, etc.
    performedById: uuid("performed_by_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_inv_tx_silo").on(t.siloId),
    index("idx_inv_tx_trip").on(t.tripId),
    index("idx_inv_tx_type").on(t.transactionType),
    index("idx_inv_tx_created").on(t.createdAt),
    index("idx_inv_tx_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — SALES PIPELINE & ORDERS (POURING SCHEDULES)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * orders — The central sales order entity that drives the full pipeline
 * Sales Rep → Pending Finance → Finance Approval → Scheduled → Production
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    orderNumber: varchar("order_number", { length: 30 }).notNull().unique(), // e.g. "ORD-2024-00142"
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    deliverySiteId: uuid("delivery_site_id")
      .notNull()
      .references(() => deliverySites.id, { onDelete: "restrict" }),
    mixDesignId: uuid("mix_design_id")
      .notNull()
      .references(() => mixDesigns.id, { onDelete: "restrict" }),
    /** Total volume ordered in m³ */
    totalVolumeM3: decimal("total_volume_m3", { precision: 8, scale: 2 }).notNull(),
    /** Remaining m³ not yet poured */
    remainingVolumeM3: decimal("remaining_volume_m3", { precision: 8, scale: 2 }).notNull(),
    /** Price per m³ in SAR (cents) */
    pricePerM3Sar: integer("price_per_m3_sar").notNull(),
    /** Scheduled pour date */
    scheduledDate: timestamp("scheduled_date").notNull(),
    /** Requested pour rate (m³ / hour) — used for pump/truck scheduling */
    requestedPourRateM3PerHour: decimal("requested_pour_rate_m3_per_hour", {
      precision: 5,
      scale: 2,
    }),
    status: orderStatusEnum("status").notNull().default("DRAFT"),
    /** Product family (Epic 11 — multi-material parity) */
    productType: productTypeEnum("product_type").notNull().default("READY_MIX"),
    /** Carbon footprint snapshot in kgCO2e (computed on demand) */
    carbonKgco2e: decimal("carbon_kgco2e", { precision: 12, scale: 2 }),
    carbonComputedAt: timestamp("carbon_computed_at"),
    /**
     * External reference (Epic 13 — data unification): Firestore tree
     * document id when this order was imported from the field-speed
     * plane. Null = native ERP order.
     */
    sourceRef: varchar("source_ref", { length: 80 }),
    /** Origin surface after the unified-DB merge: 'app' (mobile/ERP) | 'website' */
    source: varchar("source", { length: 20 }).notNull().default("app"),
    /** Sales Representative who created the order */
    createdByRepId: uuid("created_by_rep_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Finance officer who actioned the approval */
    financeOfficerId: uuid("finance_officer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Timestamp when finance toggled approval */
    financeApprovedAt: timestamp("finance_approved_at"),
    /** Finance rejection reason (if rejected) */
    financeRejectionReason: text("finance_rejection_reason"),
    /** Manual paper clearance flag (does NOT replace electronic toggle) */
    paperClearanceGranted: boolean("paper_clearance_granted").notNull().default(false),
    /** Customer's concrete pump code if pump required (e.g. "P01") */
    assignedPumpCode: varchar("assigned_pump_code", { length: 10 }),
    /** Special instructions for lab / driver */
    specialInstructions: text("special_instructions"),
    /** Ambient conditions at time of scheduling (for env compensation) */
    ambientTempC: decimal("ambient_temp_c", { precision: 4, scale: 1 }),
    ambientHumidityPct: decimal("ambient_humidity_pct", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_orders_client").on(t.clientId),
    index("idx_orders_status").on(t.status),
    index("idx_orders_scheduled").on(t.scheduledDate),
    index("idx_orders_rep").on(t.createdByRepId),
    index("idx_orders_finance").on(t.financeOfficerId),
    index("idx_orders_number").on(t.orderNumber),
    index("idx_orders_tenant").on(t.tenantId),
    index("idx_orders_source_ref").on(t.sourceRef),
  ]
);

/**
 * finance_actions — Immutable audit log for every finance decision on an order
 */
export const financeActions = pgTable(
  "finance_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    performedById: uuid("performed_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: financeActionEnum("action").notNull(),
    /** Credit limit at the time of action (snapshot) */
    creditLimitSnapshot: integer("credit_limit_snapshot"),
    /** Outstanding balance at the time of action */
    outstandingBalanceSnapshot: integer("outstanding_balance_snapshot"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_finance_actions_order").on(t.orderId),
    index("idx_finance_actions_by").on(t.performedById),
    index("idx_finance_actions_tenant").on(t.tenantId),
  ]
);

/**
 * bank_accounts — Company bank accounts (unified ledger). Balances stored in
 * SAR cents (integer) to avoid float drift.
 */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    accountName: varchar("account_name", { length: 120 }).notNull(),
    accountNumber: varchar("account_number", { length: 50 }).notNull(),
    bankName: varchar("bank_name", { length: 100 }).notNull(),
    branch: varchar("branch", { length: 100 }),
    initialBalanceSar: integer("initial_balance_sar").notNull().default(0),
    /** Running balance — maintained by the ledger service */
    currentBalanceSar: integer("current_balance_sar").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bank_accounts_tenant").on(t.tenantId),
  ]
);

/** Ledger entry types — mirrors the RMC reference accounting model */
export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "income",
  "expense",
  "transfer",
  "purchase",
  "sale",
  "adjustment",
  "operational",
]);

/** Bank transaction types */
export const bankTransactionTypeEnum = pgEnum("bank_transaction_type", [
  "deposit",
  "withdrawal",
  "transfer",
]);

/**
 * ledger_entries — Unified general ledger. Every financial movement (income,
 * expense, transfer, purchase, sale, adjustment, operational) lands here.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    date: timestamp("date").notNull().defaultNow(),
    description: varchar("description", { length: 255 }).notNull(),
    /** Amount in SAR cents */
    amountSar: integer("amount_sar").notNull(),
    transactionType: ledgerEntryTypeEnum("transaction_type").notNull(),
    referenceNumber: varchar("reference_number", { length: 50 }),
    /** Linked bank account the entry posts against (nullable for non-bank entries) */
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Counterparty classification (client / supplier / internal / other) */
    counterpartyType: varchar("counterparty_type", { length: 20 }),
    /** Counterparty id — client (clients.id) or future supplier, no hard FK */
    counterpartyId: uuid("counterparty_id"),
    counterpartyName: varchar("counterparty_name", { length: 200 }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_ledger_entries_tenant").on(t.tenantId),
    index("idx_ledger_entries_date").on(t.date),
    index("idx_ledger_entries_type").on(t.transactionType),
    index("idx_ledger_entries_account").on(t.bankAccountId),
    index("idx_ledger_entries_counterparty").on(t.counterpartyId),
  ]
);

/**
 * bank_transactions — Deposits / withdrawals / transfers against a bank
 * account. Balances are updated by the ledger service in the same write.
 */
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    /** Destination account for transfers */
    destinationAccountId: uuid("destination_account_id").references(
      () => bankAccounts.id,
      { onDelete: "set null" }
    ),
    transactionType: bankTransactionTypeEnum("transaction_type").notNull(),
    /** Amount in SAR cents */
    amountSar: integer("amount_sar").notNull(),
    date: timestamp("date").notNull().defaultNow(),
    description: varchar("description", { length: 255 }).notNull(),
    referenceNumber: varchar("reference_number", { length: 50 }),
    /** Optional back-reference to the source ledger entry */
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bank_transactions_tenant").on(t.tenantId),
    index("idx_bank_transactions_account").on(t.bankAccountId),
    index("idx_bank_transactions_date").on(t.date),
    index("idx_bank_transactions_ledger").on(t.ledgerEntryId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7B — OPERATIONAL COMMITMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const commitmentTypeEnum = pgEnum("commitment_type", [
  "emi",
  "lease",
  "insurance",
  "maintenance",
  "utilities",
  "rent",
  "other",
]);

export const commitmentFrequencyEnum = pgEnum("commitment_frequency", [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "one_time",
]);

export const commitmentStatusEnum = pgEnum("commitment_status", [
  "active",
  "completed",
  "terminated",
]);

export const commitmentPaymentModeEnum = pgEnum("commitment_payment_mode", [
  "CASH",
  "CHEQUE",
  "BANK",
  "UPI",
  "AUTO_DEBIT",
  "OTHER",
]);

/**
 * commitments — Recurring operational obligations (EMIs, leases, insurance,
 * utilities, rent...) with auto-rolling payment schedules.
 */
export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    commitmentType: commitmentTypeEnum("commitment_type").notNull().default("other"),
    description: text("description"),
    /** Amount in SAR cents */
    amountSar: integer("amount_sar").notNull(),
    /** Contract / policy number */
    referenceNumber: varchar("reference_number", { length: 100 }),
    startDate: date("start_date").notNull(),
    /** Leave blank for indefinite commitments */
    endDate: date("end_date"),
    paymentFrequency: commitmentFrequencyEnum("payment_frequency").notNull().default("monthly"),
    /** Day of the month when payment is due */
    paymentDay: integer("payment_day").notNull().default(1),
    nextPaymentDate: date("next_payment_date").notNull(),
    currentPaymentIsPaid: boolean("current_payment_is_paid").notNull().default(false),
    status: commitmentStatusEnum("status").notNull().default("active"),
    isActive: boolean("is_active").notNull().default(true),
    /** Institution/company to pay */
    payeeName: varchar("payee_name", { length: 200 }).notNull(),
    contactPerson: varchar("contact_person", { length: 100 }),
    contactPhone: varchar("contact_phone", { length: 15 }),
    contactEmail: varchar("contact_email", { length: 200 }),
    contractDocumentUrl: text("contract_document_url"),
    notes: text("notes"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_commitments_tenant").on(t.tenantId),
    index("idx_commitments_next_payment").on(t.nextPaymentDate),
    index("idx_commitments_status").on(t.status),
  ]
);

/**
 * commitmentPayments — Each payment made against a commitment.
 * Auto-links a ledger entry (transaction_type = operational).
 */
export const commitmentPayments = pgTable(
  "commitment_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    /** Amount in SAR cents */
    amountSar: integer("amount_sar").notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentMode: commitmentPaymentModeEnum("payment_mode").notNull().default("BANK"),
    referenceNumber: varchar("reference_number", { length: 100 }),
    remarks: text("remarks"),
    receiptNumber: varchar("receipt_number", { length: 100 }),
    /** Optional link to the generated ledger entry */
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_commitment_payments_tenant").on(t.tenantId),
    index("idx_commitment_payments_commitment").on(t.commitmentId),
    index("idx_commitment_payments_date").on(t.paymentDate),
  ]
);

export const expenseCategoryEnum = pgEnum("expense_category", [
  "vehicle",
  "fuel",
  "office",
  "materials",
  "maintenance",
  "utilities",
  "rent",
  "salary",
  "other",
]);

export const expensePaymentMethodEnum = pgEnum("expense_payment_method", [
  "cash",
  "bank_transfer",
  "credit_card",
  "upi",
  "cheque",
]);

/**
 * expenses — Day-to-day operating expenses with optional vehicle /
 * material / delivery linkage and an auto-linked ledger entry.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    category: expenseCategoryEnum("category").notNull(),
    /** Amount in SAR cents */
    amountSar: integer("amount_sar").notNull(),
    date: date("date").notNull(),
    paymentMethod: expensePaymentMethodEnum("payment_method").notNull().default("cash"),
    description: text("description"),
    /** Optional related vehicle */
    vehicleId: uuid("vehicle_id").references(() => fleetVehicles.id, { onDelete: "set null" }),
    referenceNumber: varchar("reference_number", { length: 100 }),
    billUrl: text("bill_url"),
    /** Optional link to the generated ledger entry */
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_expenses_tenant").on(t.tenantId),
    index("idx_expenses_date").on(t.date),
    index("idx_expenses_category").on(t.category),
    index("idx_expenses_vehicle").on(t.vehicleId),
  ]
);

/**
 * salaries — Monthly payroll records per employee.
 * month = first day of the paid month. Auto-links a ledger entry.
 */
export const salaries = pgTable(
  "salaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Amount in SAR cents */
    amountSar: integer("amount_sar").notNull(),
    /** First day of the paid month */
    month: date("month").notNull(),
    paidOn: date("paid_on").notNull(),
    notes: text("notes"),
    /** Optional link to the generated ledger entry */
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_salaries_tenant").on(t.tenantId),
    index("idx_salaries_employee").on(t.employeeId),
    index("idx_salaries_month").on(t.month),
  ]
);

export const supplierPaymentModeEnum = pgEnum("supplier_payment_mode", [
  "CASH",
  "CHEQUE",
  "BANK",
  "CREDIT",
  "UPI",
  "OTHER",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "DRAFT",
  "ORDERED",
  "PARTIAL_RECEIVED",
  "RECEIVED",
  "CANCELLED",
]);

/**
 * suppliers — Material / service vendors.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 150 }).notNull(),
    contactPerson: varchar("contact_person", { length: 100 }),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 200 }),
    /** VAT number (Saudi / GCC) */
    vatNumber: varchar("vat_number", { length: 20 }),
    address: text("address"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_suppliers_tenant").on(t.tenantId),
    index("idx_suppliers_active").on(t.isActive),
  ]
);

/**
 * purchaseOrders — Purchase orders placed with suppliers.
 * totals in SAR cents; inventoryUpdated marks stock posting.
 */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    poNumber: varchar("po_number", { length: 30 }).notNull().unique(), // e.g. "PO-2026-00042"
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    purchaseDate: date("purchase_date").notNull(),
    dueDate: date("due_date"),
    /** Subtotals in SAR cents */
    subtotalSar: integer("subtotal_sar").notNull().default(0),
    vatPercent: integer("vat_percent").notNull().default(15),
    vatAmountSar: integer("vat_amount_sar").notNull().default(0),
    transportCostSar: integer("transport_cost_sar").notNull().default(0),
    totalAmountSar: integer("total_amount_sar").notNull().default(0),
    paidAmountSar: integer("paid_amount_sar").notNull().default(0),
    status: purchaseOrderStatusEnum("status").notNull().default("DRAFT"),
    notes: text("notes"),
    inventoryUpdated: boolean("inventory_updated").notNull().default(false),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_po_tenant").on(t.tenantId),
    index("idx_po_supplier").on(t.supplierId),
    index("idx_po_status").on(t.status),
    index("idx_po_date").on(t.purchaseDate),
  ]
);

/**
 * purchaseOrderItems — Line items on a purchase order.
 * Quantities in kg, rate per kg (ratePerKgSar in SAR cents per kg → use integer
 * micro-rupiah style: rate stored as cents/kg).
 */
export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    /** Target silo receiving the material */
    siloId: uuid("silo_id").references(() => inventorySilos.id, { onDelete: "set null" }),
    materialCategory: materialCategoryEnum("material_category").notNull(),
    materialName: varchar("material_name", { length: 100 }).notNull(),
    quantityKg: decimal("quantity_kg", { precision: 12, scale: 3 }).notNull(),
    /** SAR cents per kg */
    ratePerKgSar: integer("rate_per_kg_sar").notNull(),
    /** quantityKg * ratePerKgSar */
    lineTotalSar: integer("line_total_sar").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_po_items_tenant").on(t.tenantId),
    index("idx_po_items_po").on(t.purchaseOrderId),
    index("idx_po_items_silo").on(t.siloId),
  ]
);

/**
 * supplierPayments — Payments made to suppliers against POs.
 * Auto-links a ledger entry (transaction_type = purchase).
 */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    amountSar: integer("amount_sar").notNull(),
    paymentMode: supplierPaymentModeEnum("payment_mode").notNull().default("BANK"),
    paymentDate: date("payment_date").notNull(),
    dueDate: date("due_date"),
    referenceNumber: varchar("reference_number", { length: 50 }),
    remarks: text("remarks"),
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_supplier_payments_tenant").on(t.tenantId),
    index("idx_supplier_payments_supplier").on(t.supplierId),
    index("idx_supplier_payments_po").on(t.purchaseOrderId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — TRIPS & REAL-TIME DELIVERY TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * trips — One truck load = one trip
 * Tracks the complete 7-checkpoint lifecycle with GPS snapshots
 */
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    tripNumber: varchar("trip_number", { length: 40 }).notNull().unique(), // e.g. "TRP-20240315-T01-001"
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "restrict" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Pump vehicle if required */
    pumpVehicleId: uuid("pump_vehicle_id").references(() => fleetVehicles.id, {
      onDelete: "set null",
    }),
    /** Mix design used for this specific load */
    mixDesignId: uuid("mix_design_id")
      .notNull()
      .references(() => mixDesigns.id, { onDelete: "restrict" }),
    /** Planned load volume for this trip (m³) */
    loadedVolumeM3: decimal("loaded_volume_m3", { precision: 6, scale: 2 }).notNull(),
    /** Actual volume confirmed at weighbridge */
    confirmedVolumeM3: decimal("confirmed_volume_m3", { precision: 6, scale: 2 }),
    currentCheckpoint: tripCheckpointEnum("current_checkpoint").notNull().default("ARR_PLANT"),
    /**
     * Environment compensation applied for this specific batch
     * Computed values (may differ from recipe base due to temp/humidity)
     */
    actualWaterLitresPerM3: decimal("actual_water_litres_per_m3", { precision: 8, scale: 3 }),
    actualRetarderLPerM3: decimal("actual_retarder_l_per_m3", { precision: 8, scale: 3 }),
    /** Ambient conditions at batch time */
    batchTempC: decimal("batch_temp_c", { precision: 4, scale: 1 }),
    batchHumidityPct: decimal("batch_humidity_pct", { precision: 5, scale: 2 }),
    /**
     * DELIVERY TICKET — generated at DEP_PLANT checkpoint
     * Signed with weighbridge hash for anti-tamper
     */
    deliveryTicketNumber: varchar("delivery_ticket_number", { length: 50 }).unique(),
    deliveryTicketIssuedAt: timestamp("delivery_ticket_issued_at"),
    /**
     * QR CODE TOKEN — minted at DEP_PLANT alongside the delivery ticket.
     * Opaque, tamper-evident, AES-256-GCM encrypted payload carrying:
     *   trip_id + client_id + mix_design_code + loaded_qty
     * Scanned by the client/salesman at the site to verify the correct load
     * arrived at the correct project, and to auto-stamp ARR_SITE.
     */
    qrCodeToken: varchar("qr_code_token", { length: 512 }).unique(),
    qrCodeIssuedAt: timestamp("qr_code_issued_at"),
    /** Set when the QR has been successfully scanned & verified at site */
    qrVerifiedAt: timestamp("qr_verified_at"),
    qrVerifiedById: uuid("qr_verified_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Count of failed scan attempts (wrong site / wrong client) */
    qrFailedScanCount: integer("qr_failed_scan_count").notNull().default(0),
    /**
     * CUSTOMER E-SIGNATURE (sign-on-glass — Epic 3)
     * Captured on the driver device at DEP_SITE. Stored as a PNG data URL
     * (data:image/png;base64,...) — self-contained, no object storage needed.
     */
    signatureImage: text("signature_image"),
    /** Printed name of the site person who signed */
    signedBy: varchar("signed_by", { length: 120 }),
    signedAt: timestamp("signed_at"),
    /** Dispatcher who created this trip */
    dispatchedById: uuid("dispatched_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Computed metrics (populated at DEP_SITE / RETURN_PLANT) */
    transitTimeMinutes: integer("transit_time_minutes"),
    onSiteDurationMinutes: integer("on_site_duration_minutes"),
    returnTimeMinutes: integer("return_time_minutes"),
    totalCycleTimeMinutes: integer("total_cycle_time_minutes"),
    /**
     * Delivered cost of THIS trip in SAR halalas (cents) — driver overtime, pump
     * rental, tolls, loading crew, anything spent to move this load. Recorded at
     * dispatch; it is what makes the cost-per-m³ report real instead of a
     * materials-only estimate. 0 = not costed yet.
     */
    transportCostSar: integer("transport_cost_sar").notNull().default(0),
    isCompleted: boolean("is_completed").notNull().default(false),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_trips_order").on(t.orderId),
    index("idx_trips_vehicle").on(t.vehicleId),
    index("idx_trips_driver").on(t.driverId),
    index("idx_trips_checkpoint").on(t.currentCheckpoint),
    index("idx_trips_completed").on(t.isCompleted),
    index("idx_trips_number").on(t.tripNumber),
    index("idx_trips_ticket").on(t.deliveryTicketNumber),
    index("idx_trips_tenant").on(t.tenantId),
  ]
);

/**
 * trip_checkpoints — Immutable log of each of the 7 timeline events
 * Each row is written ONCE and never updated (append-only for audit)
 */
export const tripCheckpoints = pgTable(
  "trip_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    checkpoint: tripCheckpointEnum("checkpoint").notNull(),
    /** Exact timestamp the checkpoint was logged */
    loggedAt: timestamp("logged_at").notNull().defaultNow(),
    /** GPS coordinates at checkpoint */
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    /** Driver's mobile device accuracy (metres) */
    gpsAccuracyMetres: real("gps_accuracy_metres"),
    /** Extra metadata (e.g. pour start → pump hookup code) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    /** ID of user who logged this (usually the driver) */
    loggedById: uuid("logged_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_tc_trip").on(t.tripId),
    index("idx_tc_checkpoint").on(t.checkpoint),
    index("idx_tc_tenant").on(t.tenantId),
    unique("uq_trip_checkpoint").on(t.tripId, t.checkpoint), // Each checkpoint logged only once per trip
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — WEIGHBRIDGE (ANTI-FRAUD HASH-CHAIN LEDGER)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * weighbridge_transactions — Blockchain-like SHA-256 hash-chained weight records
 *
 * ANTI-FRAUD MECHANISM:
 * Each record contains:
 *   - recordHash  = SHA256(id + tripId + grossWeightKg + netWeightKg + timestamp + previousHash)
 *   - previousHash = recordHash of the immediately preceding weighbridge record
 *
 * Any retroactive alteration of weight data breaks the hash chain,
 * making tampering cryptographically detectable by recomputing the chain.
 */
export const weighbridgeTransactions = pgTable(
  "weighbridge_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    /** Sequential record number for easy chain verification */
    sequenceNumber: integer("sequence_number").notNull(),
    transactionType: varchar("transaction_type", { length: 20 }).notNull(), // LOAD_OUT | RETURN_IN | TARE_VERIFY
    /** Gross weight captured by weighbridge sensor (kg) */
    grossWeightKg: decimal("gross_weight_kg", { precision: 10, scale: 3 }).notNull(),
    /**
     * Vehicle tare weight at time of transaction (kg)
     * Snapshot from fleet_vehicles.tare_weight_tonnes — prevents retroactive tare manipulation
     */
    tareWeightKg: decimal("tare_weight_kg", { precision: 10, scale: 3 }).notNull(),
    /**
     * NET CONCRETE WEIGHT = Gross - Tare (calculated programmatically, never manual)
     */
    netWeightKg: decimal("net_weight_kg", { precision: 10, scale: 3 }).notNull(),
    /** Weighbridge operator ID */
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Weighbridge sensor / scale unit identifier */
    scaleUnitId: varchar("scale_unit_id", { length: 30 }),
    /** Raw sensor reading (for calibration audit) */
    rawSensorData: jsonb("raw_sensor_data").$type<Record<string, unknown>>(),
    /**
     * SHA-256 HASH CHAIN FIELDS
     * previousHash = hash of the previous record (genesis record uses "GENESIS")
     * recordHash   = SHA256(payload) — computed & stored; must never be editable
     */
    previousHash: varchar("previous_hash", { length: 64 }).notNull(),
    recordHash: varchar("record_hash", { length: 64 }).notNull().unique(),
    /**
     * QR CODE TOKEN — encrypted scannable proof of this weighing.
     * Lets an auditor scan a printed weighbridge slip and confirm it matches
     * the sealed hash-chain record (detects forged paper tickets).
     */
    qrCodeToken: varchar("qr_code_token", { length: 512 }).unique(),
    /** ISO timestamp baked into the hash payload (prevents timestamp rollback) */
    lockedAt: timestamp("locked_at").notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => [
    index("idx_wb_trip").on(t.tripId),
    index("idx_wb_seq").on(t.sequenceNumber),
    index("idx_wb_hash").on(t.recordHash),
    index("idx_wb_locked").on(t.lockedAt),
    index("idx_wb_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — CONCRETE RETURNS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * concrete_returns — Logs excess or rejected concrete at site/plant
 */
export const concreteReturns = pgTable(
  "concrete_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    /** Returned volume in m³ */
    returnedVolumeM3: decimal("returned_volume_m3", { precision: 6, scale: 2 }).notNull(),
    /** Returned weight at weighbridge (kg) */
    returnedWeightKg: decimal("returned_weight_kg", { precision: 10, scale: 3 }),
    disposition: returnDispositionEnum("disposition").notNull(),
    returnReason: text("return_reason").notNull(),
    /** Person who authorised/logged the return */
    authorisedById: uuid("authorised_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Slump of returned concrete (cm) — for quality records */
    returnedSlumpCm: decimal("returned_slump_cm", { precision: 4, scale: 1 }),
    /** Whether a financial credit/deduction was raised */
    financialDeductionRaised: boolean("financial_deduction_raised").notNull().default(false),
    deductionAmountSar: integer("deduction_amount_sar").default(0),
    /**
     * RECOVERY STATISTICS — populated based on disposition:
     * - CAST_BLOCKS      → blocksCastCount is recorded
     * - RECYCLED_BATCHING → aggregateRecoveredKg is recorded
     * - WASHOUT         → waterRecoveredLitres is recorded
     */
    blocksCastCount: integer("blocks_cast_count").default(0),
    aggregateRecoveredKg: decimal("aggregate_recovered_kg", { precision: 10, scale: 3 }).default("0"),
    waterRecoveredLitres: decimal("water_recovered_litres", { precision: 8, scale: 2 }).default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_returns_trip").on(t.tripId),
    index("idx_returns_disposition").on(t.disposition),
    index("idx_returns_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — QUALITY CONTROL & LAB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * lab_test_samples — Sample batch collected at pour point
 */
export const labTestSamples = pgTable(
  "lab_test_samples",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    sampleNumber: varchar("sample_number", { length: 40 }).notNull().unique(), // e.g. "QC-20240315-001"
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    mixDesignId: uuid("mix_design_id")
      .notNull()
      .references(() => mixDesigns.id, { onDelete: "restrict" }),
    sampledById: uuid("sampled_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Ambient conditions at sampling */
    sampleTempC: decimal("sample_temp_c", { precision: 4, scale: 1 }),
    sampleHumidityPct: decimal("sample_humidity_pct", { precision: 5, scale: 2 }),
    /** Fresh slump (cm) — must be ≥ targetSlumpCm */
    freshSlumpCm: decimal("fresh_slump_cm", { precision: 4, scale: 1 }),
    freshSlumpResult: labTestResultEnum("fresh_slump_result").default("PENDING"),
    /** Number of cube specimens cast (typically 3 per trip) */
    cubesCount: integer("cubes_count").notNull().default(3),
    sampledAt: timestamp("sampled_at").notNull().defaultNow(),
    labNotes: text("lab_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_lab_samples_trip").on(t.tripId),
    index("idx_lab_samples_order").on(t.orderId),
    index("idx_lab_samples_number").on(t.sampleNumber),
    index("idx_lab_samples_tenant").on(t.tenantId),
  ]
);

/**
 * lab_test_results — Individual test readings (7-day, 28-day compressive, etc.)
 */
export const labTestResults = pgTable(
  "lab_test_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    sampleId: uuid("sample_id")
      .notNull()
      .references(() => labTestSamples.id, { onDelete: "cascade" }),
    testType: labTestTypeEnum("test_type").notNull(),
    /** Scheduled test date */
    testDue: timestamp("test_due").notNull(),
    /** Actual test date */
    testedAt: timestamp("tested_at"),
    testedById: uuid("tested_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Measured value (MPa for compressive, cm for slump, etc.) */
    measuredValue: decimal("measured_value", { precision: 8, scale: 3 }),
    /** Required minimum value for PASS */
    requiredMinimumValue: decimal("required_minimum_value", { precision: 8, scale: 3 }),
    result: labTestResultEnum("result").notNull().default("PENDING"),
    /** Cube specimen reference code */
    specimenCode: varchar("specimen_code", { length: 30 }),
    certificateUrl: text("certificate_url"), // S3/Supabase Storage URL
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_lab_results_sample").on(t.sampleId),
    index("idx_lab_results_type").on(t.testType),
    index("idx_lab_results_due").on(t.testDue),
    index("idx_lab_results_result").on(t.result),
    index("idx_lab_results_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — WORKSHOP & MAINTENANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * maintenance_orders — Work orders for preventive and corrective maintenance
 * When status = IN_PROGRESS or OPEN, vehicle is excluded from dispatch pool
 */
export const maintenanceOrders = pgTable(
  "maintenance_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    workOrderNumber: varchar("work_order_number", { length: 30 }).notNull().unique(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "restrict" }),
    maintenanceType: maintenanceTypeEnum("maintenance_type").notNull(),
    status: maintenanceStatusEnum("status").notNull().default("OPEN"),
    /** Priority 1=Critical, 2=High, 3=Medium, 4=Low */
    priority: integer("priority").notNull().default(3),
    /** Severity level — CRITICAL auto-sets vehicle to IN_WORKSHOP */
    severity: maintenanceSeverityEnum("severity").notNull().default("MEDIUM"),
    /** Reported by (driver, dispatcher, mechanic) */
    reportedById: uuid("reported_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Assigned mechanic */
    assignedMechanicId: uuid("assigned_mechanic_id").references(() => users.id, {
      onDelete: "set null",
    }),
    faultDescription: text("fault_description").notNull(),
    /** Action taken (filled on completion) */
    actionTaken: text("action_taken"),
    partsUsed: jsonb("parts_used").$type<
      { partCode: string; description: string; quantityUsed: number; costSar: number }[]
    >().default([]),
    /** Odometer reading at maintenance */
    odometreAtMaintenanceKm: decimal("odometre_at_maintenance_km", { precision: 10, scale: 1 }),
    /** Next scheduled maintenance kilometre */
    nextServiceDueKm: decimal("next_service_due_km", { precision: 10, scale: 1 }),
    estimatedCompletionAt: timestamp("estimated_completion_at"),
    completedAt: timestamp("completed_at"),
    /** Labour hours billed */
    labourHours: decimal("labour_hours", { precision: 5, scale: 2 }),
    /** Total cost in SAR cents */
    totalCostSar: integer("total_cost_sar").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_maint_vehicle").on(t.vehicleId),
    index("idx_maint_status").on(t.status),
    index("idx_maint_type").on(t.maintenanceType),
    index("idx_maint_mechanic").on(t.assignedMechanicId),
    index("idx_maint_priority").on(t.priority),
    index("idx_maint_tenant").on(t.tenantId),
  ]
);

/**
 * fuel_logs — Per-vehicle fuel tracking for efficiency and theft detection
 */
export const fuelLogs = pgTable(
  "fuel_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "restrict" }),
    logType: fuelLogTypeEnum("log_type").notNull(),
    /** Date/time of refuelling or odometer reading */
    loggedAt: timestamp("logged_at").notNull().defaultNow(),
    /** Litres added (for REFUEL) */
    litresAdded: decimal("litres_added", { precision: 8, scale: 2 }),
    /** Odometer at time of log */
    odometreKm: decimal("odometre_km", { precision: 10, scale: 1 }).notNull(),
    /** Previous odometer (for distance calculation) */
    previousOdometreKm: decimal("previous_odometre_km", { precision: 10, scale: 1 }),
    /** Calculated distance since last refuel */
    distanceTravelledKm: decimal("distance_travelled_km", { precision: 8, scale: 1 }),
    /** Actual fuel efficiency (L/100km) — computed */
    actualLPer100Km: decimal("actual_l_per_100km", { precision: 5, scale: 2 }),
    /** Target L/100km for this vehicle (snapshot) */
    targetLPer100Km: decimal("target_l_per_100km", { precision: 5, scale: 2 }),
    /** Variance from target: actual - target (positive = overconsumption) */
    efficiencyVariance: decimal("efficiency_variance", { precision: 5, scale: 2 }),
    /** Fuel cost SAR cents per litre at time of fill */
    costPerLitreSarCents: integer("cost_per_litre_sar_cents"),
    /** Total fuel cost SAR cents */
    totalFuelCostSar: integer("total_fuel_cost_sar"),
    fuelStationName: varchar("fuel_station_name", { length: 100 }),
    receiptNumber: varchar("receipt_number", { length: 50 }),
    /** Person who logged the record */
    loggedById: uuid("logged_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * Anomaly flag — set programmatically when:
     * - Consumption > (target * 1.25) for 3 consecutive logs
     * - Litres added > tank capacity
     */
    isAnomaly: boolean("is_anomaly").notNull().default(false),
    anomalyNotes: text("anomaly_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_fuel_vehicle").on(t.vehicleId),
    index("idx_fuel_type").on(t.logType),
    index("idx_fuel_logged").on(t.loggedAt),
    index("idx_fuel_anomaly").on(t.isAnomaly),
    index("idx_fuel_tenant").on(t.tenantId),
  ]
);

/**
 * curfew_zones — Geographic or time-based heavy vehicle restriction windows
 * The dispatch scheduling algorithm checks these before assigning truck slots
 */
export const curfewZones = pgTable(
  "curfew_zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    zoneName: varchar("zone_name", { length: 100 }).notNull(),
    /** Days affected (0=Sunday … 6=Saturday) */
    activeDays: jsonb("active_days").$type<number[]>().notNull().default([]),
    /** "HH:MM" 24h format */
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    /** Severity: blocks all scheduling (true) or just warns (false) */
    isBlocking: boolean("is_blocking").notNull().default(true),
    reason: text("reason"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_curfew_tenant").on(t.tenantId)]
);

/**
 * driver_locations — Real-time GPS trail for live admin map
 * Written at high frequency by the Driver mobile app (driver:location_update event)
 * Used for:
 *   - Live tracking on admin dashboard
 *   - Moving average speed calculation
 *   - Geofence ARR_SITE auto-trigger detection
 *   - Route deviation detection
 */
export const driverLocations = pgTable(
  "driver_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    /** GPS accuracy in metres from device */
    accuracyMetres: real("accuracy_metres"),
    /** Speed reported by device (km/h) */
    deviceSpeedKmh: decimal("device_speed_kmh", { precision: 5, scale: 2 }),
    /** Calculated moving average speed (km/h) — rolling window of last N samples */
    movingAverageSpeedKmh: decimal("moving_average_speed_kmh", { precision: 5, scale: 2 }),
    /** Heading (degrees 0-360) */
    headingDegrees: decimal("heading_degrees", { precision: 5, scale: 2 }),
    /** Whether the device reported this location as "moving" */
    isMoving: boolean("is_moving").notNull().default(true),
    /** Battery percentage of driver's mobile device */
    batteryPct: integer("battery_pct"),
    /** Timestamp when location was captured on device */
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_dloc_trip").on(t.tripId),
    index("idx_dloc_vehicle").on(t.vehicleId),
    index("idx_dloc_captured").on(t.capturedAt),
    index("idx_dloc_driver").on(t.driverId),
    index("idx_dloc_tenant").on(t.tenantId),
  ]
);

/**
 * purchase_requests — Auto-generated when inventory silos hit reorder level
 * After each batch deduction, the system checks remaining stock vs reorder level.
 * If breached, a purchase request is created and procurement is notified.
 */
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    prNumber: varchar("pr_number", { length: 30 }).notNull().unique(), // e.g. "PR-2026-00142"
    siloId: uuid("silo_id")
      .notNull()
      .references(() => inventorySilos.id, { onDelete: "restrict" }),
    materialCategory: materialCategoryEnum("material_category").notNull(),
    /** Quantity in kg to order (auto-calculated: reorder buffer - current stock) */
    requestedQuantityKg: decimal("requested_quantity_kg", { precision: 12, scale: 3 }).notNull(),
    /** Triggering trip that pushed stock below reorder level */
    triggeringTripId: uuid("triggering_trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    /** Stock level at time of PR generation */
    stockAtGenerationKg: decimal("stock_at_generation_kg", { precision: 12, scale: 3 }).notNull(),
    /** Reorder level that triggered this request */
    reorderLevelKg: decimal("reorder_level_kg", { precision: 12, scale: 3 }).notNull(),
    status: purchaseRequestStatusEnum("status").notNull().default("AUTO_GENERATED"),
    /** Procurement priority — URGENT is raised when stock breaches reorder level */
    priority: purchasePriorityEnum("priority").notNull().default("NORMAL"),
    /** User who triggered generation (system = null) */
    generatedById: uuid("generated_by_id").references(() => users.id, { onDelete: "set null" }),
    /** User who approved/acknowledged the PR */
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pr_silo").on(t.siloId),
    index("idx_pr_status").on(t.status),
    index("idx_pr_number").on(t.prNumber),
    index("idx_pr_material").on(t.materialCategory),
    index("idx_pr_tenant").on(t.tenantId),
  ]
);

/**
 * pump_operation_logs — PUMP class static on-site operating sessions
 *
 * Unlike MIXER trucks (which follow the 7-checkpoint delivery timeline),
 * concrete pumps are STATIC assets billed by operating hours at the client
 * site. This table captures the full session lifecycle so Finance can bill
 * hourly hire and Operations can measure pumped throughput.
 *
 * Cost accounting respects `fleet_vehicles.is_external` — outsourced pumps
 * are rolled up separately from in-house CAPEX assets.
 */
export const pumpOperationLogs = pgTable(
  "pump_operation_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    sessionNumber: varchar("session_number", { length: 40 }).notNull().unique(),
    /** The PUMP class vehicle performing the work */
    pumpVehicleId: uuid("pump_vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "restrict" }),
    /** Order this pump session serves */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    deliverySiteId: uuid("delivery_site_id")
      .notNull()
      .references(() => deliverySites.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: pumpSessionStatusEnum("status").notNull().default("MOBILISING"),

    // ── Session timestamps (drive the billable-hour calculation) ──────────
    mobilisedAt: timestamp("mobilised_at"),
    arrivedOnSiteAt: timestamp("arrived_on_site_at"),
    setupCompletedAt: timestamp("setup_completed_at"),
    pumpingStartedAt: timestamp("pumping_started_at"),
    pumpingEndedAt: timestamp("pumping_ended_at"),
    departedSiteAt: timestamp("departed_site_at"),

    // ── Computed operating metrics ────────────────────────────────────────
    /** Total minutes physically present on the client site */
    onSiteMinutes: integer("on_site_minutes"),
    /** Minutes actively pumping (the primary billable metric) */
    pumpingMinutes: integer("pumping_minutes"),
    /** Minutes idle on site waiting for mixers (billable at standby rate) */
    standbyMinutes: integer("standby_minutes"),
    /** Cumulative volume pumped this session (m³) */
    volumePumpedM3: decimal("volume_pumped_m3", { precision: 8, scale: 2 }).default("0"),
    /** Realised throughput = volumePumpedM3 / (pumpingMinutes / 60) */
    actualM3PerHour: decimal("actual_m3_per_hour", { precision: 6, scale: 2 }),
    /** Number of mixer loads discharged through this pump */
    mixerLoadsServed: integer("mixer_loads_served").notNull().default(0),

    // ── Cost accounting ───────────────────────────────────────────────────
    /** Snapshot of is_external at session time (outsourced vs in-house) */
    wasExternal: boolean("was_external").notNull().default(false),
    /** Hourly rate applied (SAR halalas) */
    hourlyRateSar: integer("hourly_rate_sar").default(0),
    /** Billable total = hours × rate */
    totalChargeSar: integer("total_charge_sar").default(0),
    /** Vendor invoice reference for external pumps */
    vendorInvoiceRef: varchar("vendor_invoice_ref", { length: 60 }),

    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pump_vehicle").on(t.pumpVehicleId),
    index("idx_pump_order").on(t.orderId),
    index("idx_pump_status").on(t.status),
    index("idx_pump_site").on(t.deliverySiteId),
    index("idx_pump_external").on(t.wasExternal),
    index("idx_pump_session_no").on(t.sessionNumber),
    index("idx_pump_tenant").on(t.tenantId),
  ]
);

/**
 * tipper_intake_logs — TIPPER class raw-material supply chain intake
 *
 * A tipper arrives loaded with aggregate/sand/cement, is weighed on the
 * bridge, then discharges DIRECTLY into an `inventory_silos` bin. This
 * table is the audit bridge between the weighbridge ledger and the
 * inventory ledger for inbound material.
 *
 * Net delivered weight = gross − tare (from the sealed weighbridge record).
 */
export const tipperIntakeLogs = pgTable(
  "tipper_intake_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    intakeNumber: varchar("intake_number", { length: 40 }).notNull().unique(),
    /** The TIPPER class vehicle delivering the material */
    tipperVehicleId: uuid("tipper_vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "restrict" }),
    /** Destination silo the material is discharged into */
    siloId: uuid("silo_id")
      .notNull()
      .references(() => inventorySilos.id, { onDelete: "restrict" }),
    materialCategory: materialCategoryEnum("material_category").notNull(),
    /** Sealed weighbridge record proving the delivered weight */
    weighbridgeTransactionId: uuid("weighbridge_transaction_id").references(
      () => weighbridgeTransactions.id,
      { onDelete: "set null" }
    ),
    /** Purchase request this delivery fulfils (closes the procurement loop) */
    purchaseRequestId: uuid("purchase_request_id").references(() => purchaseRequests.id, {
      onDelete: "set null",
    }),
    status: tipperIntakeStatusEnum("status").notNull().default("WEIGHED_IN"),

    // ── Weights ───────────────────────────────────────────────────────────
    grossWeightKg: decimal("gross_weight_kg", { precision: 10, scale: 3 }).notNull(),
    tareWeightKg: decimal("tare_weight_kg", { precision: 10, scale: 3 }).notNull(),
    /** Net delivered = gross − tare (computed, never manual) */
    netWeightKg: decimal("net_weight_kg", { precision: 10, scale: 3 }).notNull(),
    /** Actually discharged into the silo (may be < net if silo filled up) */
    dischargedWeightKg: decimal("discharged_weight_kg", { precision: 10, scale: 3 }).default("0"),
    /** Silo stock level after discharge */
    siloBalanceAfterKg: decimal("silo_balance_after_kg", { precision: 12, scale: 3 }),

    // ── Supplier & QC ─────────────────────────────────────────────────────
    supplierName: varchar("supplier_name", { length: 140 }),
    supplierDeliveryNote: varchar("supplier_delivery_note", { length: 80 }),
    /** Moisture content % — affects batching water correction for aggregates */
    moistureContentPct: decimal("moisture_content_pct", { precision: 5, scale: 2 }),
    qcPassed: boolean("qc_passed").notNull().default(true),
    rejectionReason: text("rejection_reason"),

    /** Unit cost of this delivery (SAR halalas per tonne) */
    costSarPerTonne: integer("cost_sar_per_tonne").default(0),
    totalCostSar: integer("total_cost_sar").default(0),

    receivedById: uuid("received_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    weighedInAt: timestamp("weighed_in_at").notNull().defaultNow(),
    dischargedAt: timestamp("discharged_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_tipper_vehicle").on(t.tipperVehicleId),
    index("idx_tipper_silo").on(t.siloId),
    index("idx_tipper_status").on(t.status),
    index("idx_tipper_material").on(t.materialCategory),
    index("idx_tipper_intake_no").on(t.intakeNumber),
    index("idx_tipper_weighed").on(t.weighedInAt),
    index("idx_tipper_tenant").on(t.tenantId),
  ]
);

/**
 * batch_plants — Physical batching stations at the plant
 * A station is blocked from batching if its scales fail calibration (> ±1% deviation)
 */
export const batchPlants = pgTable(
  "batch_plants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    plantCode: varchar("plant_code", { length: 20 }).notNull().unique(), // e.g. "BP-01"
    plantName: varchar("plant_name", { length: 120 }).notNull(),
    /** Rated output in m³ per hour */
    ratedCapacityM3PerHour: decimal("rated_capacity_m3_per_hour", { precision: 6, scale: 2 }),
    status: plantStatusEnum("status").notNull().default("OPERATIONAL"),
    /** Reason the plant was taken out of service (calibration failure, etc.) */
    outOfServiceReason: text("out_of_service_reason"),
    outOfServiceAt: timestamp("out_of_service_at"),
    /** Last successful calibration timestamp */
    lastCalibrationAt: timestamp("last_calibration_at"),
    /** Calibration is required every N hours (default 24h) */
    calibrationIntervalHours: integer("calibration_interval_hours").notNull().default(24),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bplant_code").on(t.plantCode),
    index("idx_bplant_status").on(t.status),
    index("idx_bplant_tenant").on(t.tenantId),
  ]
);

/**
 * calibration_control — Scale verification logs for batch plant weighing hoppers
 *
 * GOVERNANCE RULE:
 * A deviation greater than ±1% between the certified test weight and the
 * scale reading FAILS calibration. On failure:
 *   1. The calibration row is stored with result = FAIL
 *   2. The parent batch_plant is flagged OUT_OF_SERVICE
 *   3. StartBatching is hard-blocked for that station
 */
export const calibrationControl = pgTable(
  "calibration_control",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    batchPlantId: uuid("batch_plant_id")
      .notNull()
      .references(() => batchPlants.id, { onDelete: "cascade" }),
    /** Which hopper/scale was verified (CEMENT | AGGREGATE | WATER | ADMIXTURE) */
    scaleIdentifier: varchar("scale_identifier", { length: 40 }).notNull(),
    /** Certified reference weight applied to the scale (kg) */
    certifiedTestWeightKg: decimal("certified_test_weight_kg", { precision: 10, scale: 3 }).notNull(),
    /** What the scale actually displayed (kg) */
    observedReadingKg: decimal("observed_reading_kg", { precision: 10, scale: 3 }).notNull(),
    /** Signed deviation percentage: ((observed - certified) / certified) × 100 */
    deviationPct: decimal("deviation_pct", { precision: 6, scale: 3 }).notNull(),
    /** Absolute tolerance used for this check (default 1.0 %) */
    tolerancePct: decimal("tolerance_pct", { precision: 5, scale: 3 }).notNull().default("1.000"),
    result: calibrationResultEnum("result").notNull(),
    /** Technician who performed the verification */
    verifiedById: uuid("verified_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Whether this failure caused the plant to be taken out of service */
    triggeredOutOfService: boolean("triggered_out_of_service").notNull().default(false),
    notes: text("notes"),
    verifiedAt: timestamp("verified_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_calib_plant").on(t.batchPlantId),
    index("idx_calib_result").on(t.result),
    index("idx_calib_verified").on(t.verifiedAt),
    index("idx_calib_scale").on(t.scaleIdentifier),
    index("idx_calib_tenant").on(t.tenantId),
  ]
);

/**
 * plant_config — Global singleton configuration for plant-wide targets & budgets
 * Only ONE active row should exist (enforced by isActive + application logic).
 */
export const plantConfig = pgTable(
  "plant_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    configKey: varchar("config_key", { length: 40 }).notNull().unique().default("GLOBAL"),

    // ── Fuel efficiency targets ────────────────────────────────────────────
    /** Baseline efficiency target: km per litre for the fleet */
    podEffTargetKmPerLitre: decimal("pod_eff_target_km_per_litre", {
      precision: 6,
      scale: 3,
    }).notNull().default("2.600"),
    /** Tolerance window (%) before flagging FUEL_ANOMALY */
    fuelToleranceP: decimal("fuel_tolerance_pct", { precision: 5, scale: 2 }).notNull().default("15.00"),

    // ── Monthly budgets (SAR halalas / cents) ──────────────────────────────
    lightFuelBudgetSar: integer("light_fuel_budget_sar").notNull().default(0),
    heavyFuelBudgetSar: integer("heavy_fuel_budget_sar").notNull().default(0),
    tyreBudgetSar: integer("tyre_budget_sar").notNull().default(0),
    maintenanceBudgetSar: integer("maintenance_budget_sar").notNull().default(0),

    // ── Evaluation thresholds ──────────────────────────────────────────────
    /** Max acceptable average loading time under the batch plant (minutes) */
    targetLoadingTimeMinutes: integer("target_loading_time_minutes").notNull().default(15),
    /** Max acceptable transit time vs Google Maps ETA (% overrun) */
    onTimeToleranceP: decimal("on_time_tolerance_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("20.00"),

    // ── Climate compensation baselines (Al-Sharqia) ────────────────────────
    baselineTempC: decimal("baseline_temp_c", { precision: 4, scale: 1 }).notNull().default("35.0"),
    baselineHumidityPct: decimal("baseline_humidity_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("40.00"),
    /** Litres of water added per °C above baseline */
    waterPerDegCLitres: decimal("water_per_deg_c_litres", { precision: 5, scale: 3 })
      .notNull()
      .default("1.500"),

    /** Scale calibration tolerance (±%) */
    calibrationTolerancePct: decimal("calibration_tolerance_pct", { precision: 5, scale: 3 })
      .notNull()
      .default("1.000"),

    isActive: boolean("is_active").notNull().default(true),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_pconfig_key").on(t.configKey), index("idx_pconfig_tenant").on(t.tenantId)]
);

/**
 * evaluation_snapshots — Persisted history of plant performance ratings
 * Written by the evaluation engine so the web dashboard can chart trends.
 */
export const evaluationSnapshots = pgTable(
  "evaluation_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** Overall rating out of 100 */
    overallScore: decimal("overall_score", { precision: 5, scale: 2 }).notNull(),
    workshopScore: decimal("workshop_score", { precision: 5, scale: 2 }).notNull(),
    batchPlantScore: decimal("batch_plant_score", { precision: 5, scale: 2 }).notNull(),
    mixerPumpScore: decimal("mixer_pump_score", { precision: 5, scale: 2 }).notNull(),
    salesOrderScore: decimal("sales_order_score", { precision: 5, scale: 2 }).notNull(),
    /** Raw metric payload used to compute the scores */
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    /** Automated recommendations generated for this snapshot */
    recommendations: jsonb("recommendations")
      .$type<{ code: string; severity: string; titleEn: string; titleAr: string; detail: string }[]>()
      .notNull()
      .default([]),
    /** Window analysed (hours) */
    windowHours: integer("window_hours").notNull().default(24),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_eval_created").on(t.createdAt), index("idx_eval_tenant").on(t.tenantId)]
);

/**
 * block_manufacturing_logs — Tracks concrete returned and cast into blocks
 * Part of the recovery statistics from concrete_returns disposition = CAST_BLOCKS
 */
export const blockManufacturingLogs = pgTable(
  "block_manufacturing_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    returnId: uuid("return_id")
      .notNull()
      .references(() => concreteReturns.id, { onDelete: "cascade" }),
    /** Number of blocks cast from the returned concrete */
    blocksCount: integer("blocks_count").notNull(),
    /** Standard block size (e.g. "20x20x40 cm") */
    blockSizeCm: varchar("block_size_cm", { length: 30 }),
    /** Volume used per block in m³ */
    volumePerBlockM3: decimal("volume_per_block_m3", { precision: 6, scale: 4 }),
    /** Total volume cast into blocks in m³ */
    totalVolumeCastM3: decimal("total_volume_cast_m3", { precision: 6, scale: 2 }).notNull(),
    /** Cured status */
    curedStatus: varchar("cured_status", { length: 30 }).default("CURING"), // CURING | CURED | DISPATCHED
    storageLocation: varchar("storage_location", { length: 100 }),
    loggedById: uuid("logged_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_blocks_return").on(t.returnId),
    index("idx_blocks_cured").on(t.curedStatus),
    index("idx_blocks_tenant").on(t.tenantId),
  ]
);

/**
 * aggregate_recycling_logs — Tracks returned concrete recycled into aggregate
 * For concrete_returns disposition = RECYCLED_BATCHING
 */
export const aggregateRecyclingLogs = pgTable(
  "aggregate_recycling_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    returnId: uuid("return_id")
      .notNull()
      .references(() => concreteReturns.id, { onDelete: "cascade" }),
    /** Total weight of concrete recovered as aggregate (kg) */
    aggregateRecoveredKg: decimal("aggregate_recovered_kg", { precision: 10, scale: 3 }).notNull(),
    /** Quality grade of recovered aggregate */
    recoveredGrade: varchar("recovered_grade", { length: 30 }), // FINE | COARSE | MIXED
    /** Destination silo where recovered aggregate was routed */
    destinationSiloId: uuid("destination_silo_id").references(() => inventorySilos.id, {
      onDelete: "set null",
    }),
    /** Washing/drying processing state */
    processingState: varchar("processing_state", { length: 30 }).default("RAW"),
    loggedById: uuid("logged_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_recycling_return").on(t.returnId),
    index("idx_recycling_silo").on(t.destinationSiloId),
    index("idx_recycling_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13 — SYSTEM AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * audit_logs — Immutable system-wide event log
 * Written by middleware on every state-changing API action
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** User who performed the action (null = system) */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(), // e.g. "ORDER_APPROVED"
    entityType: varchar("entity_type", { length: 60 }).notNull(), // e.g. "orders"
    entityId: uuid("entity_id"),
    /** Before-state snapshot (JSON) */
    previousState: jsonb("previous_state"),
    /** After-state snapshot (JSON) */
    newState: jsonb("new_state"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    /** Socket.io event name if triggered via websocket */
    socketEvent: varchar("socket_event", { length: 80 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_user").on(t.userId),
    index("idx_audit_action").on(t.action),
    index("idx_audit_entity").on(t.entityType, t.entityId),
    index("idx_audit_created").on(t.createdAt),
    index("idx_audit_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13 — RESEARCH & DEVELOPMENT (R&D) — THE FACTORY BRAIN
// ─────────────────────────────────────────────────────────────────────────────
//
//  Workflow:
//    1. Management records the CURRENT STATE (production m³, efficiency,
//       staff, cost/m³) with target values  →  rnd_current_states
//    2. Management creates a DEVELOPMENT PLAN with milestones + budget
//       →  rnd_plans + rnd_milestones
//    3. Plans with financial requirements go to FINANCE for approval
//       (status PENDING_FINANCE → APPROVED / REJECTED)
//    4. R&D Manager distributes TASKS to responsible staff with due dates
//       →  rnd_tasks + rnd_task_comments
//    5. Budget line items (equipment, marketing, HR...) are tracked
//       →  rnd_budget_plans + rnd_budget_items
//    6. WEEKLY follow-up: planned vs actual, variance, blockers,
//       next-week plan  →  rnd_weekly_entries
//    7. Problems OUTSIDE any plan are tracked separately
//       →  rnd_external_issues + rnd_issue_comments
//    8. Staff are EVALUATED on task execution
//       →  rnd_evaluations
//
//  Example: current output 5000 m³ → target 5200 m³ in one month.
//  The target is split across sales reps (tasks), promo spend is added
//  (budget → finance approval), HR is asked to hire/replace reps (tasks),
//  and every week the achieved volume is compared with the plan.

/**
 * rnd_current_states — Baseline snapshot of the factory reality + targets.
 * One row per tenant per period (e.g. "2026-Q1"). Every development plan
 * builds on the latest current-state row.
 */
export const rndCurrentStates = pgTable(
  "rnd_current_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    period: varchar("period", { length: 20 }).notNull(), // e.g. "2026-Q1"
    /** Current monthly production (m³) */
    currentProductionCapacity: decimal("current_production_capacity", { precision: 10, scale: 2 }).notNull().default("0"),
    /** Target monthly production (m³) */
    targetProductionCapacity: decimal("target_production_capacity", { precision: 10, scale: 2 }).notNull().default("0"),
    currentEfficiencyPct: decimal("current_efficiency_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    targetEfficiencyPct: decimal("target_efficiency_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    currentStaffCount: integer("current_staff_count").notNull().default(0),
    targetStaffCount: integer("target_staff_count").notNull().default(0),
    /** Current cost per m³ in SAR */
    currentCostPerM3: decimal("current_cost_per_m3", { precision: 10, scale: 2 }).notNull().default("0"),
    targetCostPerM3: decimal("target_cost_per_m3", { precision: 10, scale: 2 }).notNull().default("0"),
    /** Key issues identified (JSON array of {title, description, severity, category}) */
    keyIssues: jsonb("key_issues").$type<
      { title: string; description: string; severity: string; category: string }[]
    >().default([]),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_state_tenant").on(t.tenantId),
    index("idx_rnd_state_period").on(t.tenantId, t.period),
  ]
);

/**
 * rnd_plans — Development plans created by management.
 */
export const rndPlans = pgTable(
  "rnd_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    category: rndPlanCategoryEnum("category").notNull().default("PRODUCTION"),
    priority: rndPriorityEnum("priority").notNull().default("MEDIUM"),
    status: rndPlanStatusEnum("status").notNull().default("DRAFT"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    /** Approved budget in SAR (integer) */
    budgetSar: integer("budget_sar").notNull().default(0),
    /** Expected ROI percentage */
    expectedRoiPct: decimal("expected_roi_pct", { precision: 5, scale: 2 }).default("0"),
    /** Overall progress 0–100 (maintained by service layer) */
    overallProgressPct: integer("overall_progress_pct").notNull().default(0),
    /** Finance decision metadata */
    financeReviewedById: uuid("finance_reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    financeReviewedAt: timestamp("finance_reviewed_at"),
    financeComments: text("finance_comments"),
    financeApprovedBudgetSar: integer("finance_approved_budget_sar"),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_plans_status").on(t.status),
    index("idx_rnd_plans_category").on(t.category),
    index("idx_rnd_plans_tenant").on(t.tenantId),
    index("idx_rnd_plans_dates").on(t.startDate, t.endDate),
  ]
);

/**
 * rnd_milestones — Time-boxed checkpoints inside a plan, each with an owner.
 */
export const rndMilestones = pgTable(
  "rnd_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => rndPlans.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    targetDate: timestamp("target_date").notNull(),
    actualDate: timestamp("actual_date"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"), // PENDING | IN_PROGRESS | COMPLETED | DELAYED
    progressPct: integer("progress_pct").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_ms_plan").on(t.planId),
    index("idx_rnd_ms_owner").on(t.ownerId),
    index("idx_rnd_ms_tenant").on(t.tenantId),
  ]
);

/**
 * rnd_tasks — Work assigned to staff (optionally under a plan).
 */
export const rndTasks = pgTable(
  "rnd_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").references(() => rndPlans.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => rndMilestones.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Denormalised assignee name (mobile clients may assign by name before user exists) */
    assigneeName: varchar("assignee_name", { length: 120 }),
    startDate: timestamp("start_date"),
    dueDate: timestamp("due_date").notNull(),
    actualStartDate: timestamp("actual_start_date"),
    actualEndDate: timestamp("actual_end_date"),
    status: rndTaskStatusEnum("status").notNull().default("TODO"),
    priority: rndPriorityEnum("priority").notNull().default("MEDIUM"),
    progressPct: integer("progress_pct").notNull().default(0),
    estimatedHours: decimal("estimated_hours", { precision: 8, scale: 2 }),
    actualHours: decimal("actual_hours", { precision: 8, scale: 2 }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_tasks_plan").on(t.planId),
    index("idx_rnd_tasks_assignee").on(t.assigneeId),
    index("idx_rnd_tasks_status").on(t.status),
    index("idx_rnd_tasks_due").on(t.dueDate),
    index("idx_rnd_tasks_tenant").on(t.tenantId),
  ]
);

/** rnd_task_comments — Discussion thread on a task */
export const rndTaskComments = pgTable(
  "rnd_task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => rndTasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_tc_task").on(t.taskId),
    index("idx_rnd_tc_tenant").on(t.tenantId),
  ]
);

/**
 * rnd_budget_plans — Budget container per development plan (and fiscal year).
 */
export const rndBudgetPlans = pgTable(
  "rnd_budget_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").references(() => rndPlans.id, { onDelete: "set null" }),
    fiscalYear: varchar("fiscal_year", { length: 10 }).notNull(),
    totalBudgetSar: integer("total_budget_sar").notNull().default(0),
    allocatedBudgetSar: integer("allocated_budget_sar").notNull().default(0),
    spentBudgetSar: integer("spent_budget_sar").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_bp_plan").on(t.planId),
    index("idx_rnd_bp_tenant").on(t.tenantId),
  ]
);

/** rnd_budget_items — Individual spend lines (promo, equipment, HR...) */
export const rndBudgetItems = pgTable(
  "rnd_budget_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    budgetPlanId: uuid("budget_plan_id")
      .notNull()
      .references(() => rndBudgetPlans.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    category: rndBudgetCategoryEnum("category").notNull().default("OTHER"),
    estimatedCostSar: integer("estimated_cost_sar").notNull().default(0),
    actualCostSar: integer("actual_cost_sar"),
    vendor: varchar("vendor", { length: 160 }),
    status: rndBudgetItemStatusEnum("status").notNull().default("PLANNED"),
    financeApprovalRequired: boolean("finance_approval_required").notNull().default(true),
    financeReviewedById: uuid("finance_reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    financeReviewedAt: timestamp("finance_reviewed_at"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_bi_budget").on(t.budgetPlanId),
    index("idx_rnd_bi_category").on(t.category),
    index("idx_rnd_bi_status").on(t.status),
    index("idx_rnd_bi_tenant").on(t.tenantId),
  ]
);

/**
 * rnd_weekly_entries — Weekly follow-up per plan: planned vs actual,
 * variance, blockers, actions taken, next-week plan.
 */
export const rndWeeklyEntries = pgTable(
  "rnd_weekly_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => rndPlans.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    year: integer("year").notNull(),
    weekStartDate: timestamp("week_start_date").notNull(),
    weekEndDate: timestamp("week_end_date").notNull(),
    plannedTarget: decimal("planned_target", { precision: 12, scale: 2 }).notNull().default("0"),
    actualAchieved: decimal("actual_achieved", { precision: 12, scale: 2 }).notNull().default("0"),
    variancePct: decimal("variance_pct", { precision: 6, scale: 2 }).notNull().default("0"),
    isOnTrack: boolean("is_on_track").notNull().default(true),
    blockers: text("blockers"),           // ما المشاكل التي منعت التنفيذ؟
    actionsTaken: text("actions_taken"),
    nextWeekPlan: text("next_week_plan"),
    /** Metrics snapshot for trend charts */
    metricsSnapshot: jsonb("metrics_snapshot").$type<Record<string, number>>().default({}),
    submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_w_plan").on(t.planId),
    index("idx_rnd_w_week").on(t.planId, t.year, t.weekNumber),
    index("idx_rnd_w_tenant").on(t.tenantId),
  ]
);

/**
 * rnd_external_issues — Factory problems OUTSIDE any development plan,
 * tracked until resolution (root cause + fix recorded).
 */
export const rndExternalIssues = pgTable(
  "rnd_external_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    severity: rndIssueSeverityEnum("severity").notNull().default("MEDIUM"),
    category: rndIssueCategoryEnum("category").notNull().default("OTHER"),
    reportedById: uuid("reported_by_id").references(() => users.id, { onDelete: "set null" }),
    reportedByName: varchar("reported_by_name", { length: 120 }),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    assignedToName: varchar("assigned_to_name", { length: 120 }),
    status: rndIssueStatusEnum("status").notNull().default("OPEN"),
    rootCause: text("root_cause"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at"),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Escalation links (optional) */
    relatedPlanId: uuid("related_plan_id").references(() => rndPlans.id, { onDelete: "set null" }),
    relatedTaskId: uuid("related_task_id").references(() => rndTasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_ei_status").on(t.status),
    index("idx_rnd_ei_severity").on(t.severity),
    index("idx_rnd_ei_category").on(t.category),
    index("idx_rnd_ei_assignee").on(t.assignedToId),
    index("idx_rnd_ei_tenant").on(t.tenantId),
  ]
);

/** rnd_issue_comments — Discussion thread on an external issue */
export const rndIssueComments = pgTable(
  "rnd_issue_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => rndExternalIssues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_ic_issue").on(t.issueId),
    index("idx_rnd_ic_tenant").on(t.tenantId),
  ]
);

/**
 * rnd_evaluations — Staff evaluation on R&D task execution:
 * completion rate + quality + initiative + teamwork.
 */
export const rndEvaluations = pgTable(
  "rnd_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").references(() => users.id, { onDelete: "set null" }),
    employeeName: varchar("employee_name", { length: 120 }).notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    tasksAssigned: integer("tasks_assigned").notNull().default(0),
    tasksCompleted: integer("tasks_completed").notNull().default(0),
    completionRatePct: integer("completion_rate_pct").notNull().default(0),
    qualityScore: integer("quality_score").notNull().default(0),     // 1–10
    initiativeScore: integer("initiative_score").notNull().default(0), // 1–10
    teamworkScore: integer("teamwork_score").notNull().default(0),   // 1–10
    overallScore: decimal("overall_score", { precision: 4, scale: 2 }).notNull().default("0"),
    strengths: text("strengths"),
    improvements: text("improvements"),
    reviewerComments: text("reviewer_comments"),
    evaluatedById: uuid("evaluated_by_id").references(() => users.id, { onDelete: "set null" }),
    evaluatedByName: varchar("evaluated_by_name", { length: 120 }),
    acknowledgedByEmployee: boolean("acknowledged_by_employee").notNull().default(false),
    acknowledgedAt: timestamp("acknowledged_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_ev_employee").on(t.employeeId),
    index("idx_rnd_ev_period").on(t.periodStart, t.periodEnd),
    index("idx_rnd_ev_tenant").on(t.tenantId),
  ]
);

// ─── COMPETITOR INTELLIGENCE (المصانع المنافسة) ────────────────────────────────
//
//  R&D tracks rival plants: their mixes (خلطاتهم) and prices (أسعارهم)
//  side-by-side with OUR mixes and prices (خلطاتنا وأسعارنا) so management
//  can compare grade-by-grade and position pricing strategically.
//
//  • rnd_competitors — rival plant directory (name, city, contacts, notes)
//  • rnd_competitor_products — one row per rival mix/grade with THEIR price
//    plus OUR matched mix + OUR price snapshot → instant price-gap analysis

/**
 * rnd_competitors — Directory of rival concrete plants.
 */
export const rndCompetitors = pgTable(
  "rnd_competitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    city: varchar("city", { length: 100 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 200 }),
    website: varchar("website", { length: 300 }),
    /** Free-form intel: fleet size, strengths, weaknesses, rumours... */
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_comp_tenant").on(t.tenantId),
    index("idx_rnd_comp_name").on(t.name),
  ]
);

/**
 * rnd_competitor_products — Rival mixes & prices vs ours.
 * Each row = one competitor grade (e.g. C30) with THEIR price per m³,
 * linked to OUR mix design + OUR price for the same grade.
 */
export const rndCompetitorProducts = pgTable(
  "rnd_competitor_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => rndCompetitors.id, { onDelete: "cascade" }),
    /** Rival grade / product name (e.g. "C30", "C40-SR") */
    grade: varchar("grade", { length: 60 }).notNull(),
    productName: varchar("product_name", { length: 200 }),
    /** THEIR price per m³ in SAR */
    theirPriceSar: integer("their_price_sar").notNull().default(0),
    /** Link to OUR mix design for the same grade (optional) */
    ourMixDesignId: uuid("our_mix_design_id").references(() => mixDesigns.id, {
      onDelete: "set null",
    }),
    /** OUR price per m³ in SAR (snapshot, editable) */
    ourPriceSar: integer("our_price_sar").notNull().default(0),
    /** Pump / delivery extras included? (free text, e.g. "pump +20") */
    extrasNote: varchar("extras_note", { length: 300 }),
    /** When was this price observed? */
    observedAt: timestamp("observed_at"),
    /** Source of intel: "SITE_VISIT" | "CLIENT_QUOTE" | "MARKET" | "OTHER" */
    source: varchar("source", { length: 30 }).default("MARKET"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rnd_cp_comp").on(t.competitorId),
    index("idx_rnd_cp_grade").on(t.grade),
    index("idx_rnd_cp_tenant").on(t.tenantId),
  ]
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14 — DRIZZLE RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const rndPlansRelations = relations(rndPlans, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [rndPlans.createdById],
    references: [users.id],
  }),
  financeReviewer: one(users, {
    fields: [rndPlans.financeReviewedById],
    references: [users.id],
  }),
  milestones: many(rndMilestones),
  tasks: many(rndTasks),
  weeklyEntries: many(rndWeeklyEntries),
  budgetPlans: many(rndBudgetPlans),
}));

export const rndMilestonesRelations = relations(rndMilestones, ({ one, many }) => ({
  plan: one(rndPlans, {
    fields: [rndMilestones.planId],
    references: [rndPlans.id],
  }),
  owner: one(users, {
    fields: [rndMilestones.ownerId],
    references: [users.id],
  }),
  tasks: many(rndTasks),
}));

export const rndTasksRelations = relations(rndTasks, ({ one, many }) => ({
  plan: one(rndPlans, {
    fields: [rndTasks.planId],
    references: [rndPlans.id],
  }),
  milestone: one(rndMilestones, {
    fields: [rndTasks.milestoneId],
    references: [rndMilestones.id],
  }),
  assignee: one(users, {
    fields: [rndTasks.assigneeId],
    references: [users.id],
  }),
  comments: many(rndTaskComments),
}));

export const rndBudgetPlansRelations = relations(rndBudgetPlans, ({ one, many }) => ({
  plan: one(rndPlans, {
    fields: [rndBudgetPlans.planId],
    references: [rndPlans.id],
  }),
  items: many(rndBudgetItems),
}));

export const rndExternalIssuesRelations = relations(rndExternalIssues, ({ one, many }) => ({
  reporter: one(users, {
    fields: [rndExternalIssues.reportedById],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [rndExternalIssues.assignedToId],
    references: [users.id],
  }),
  relatedPlan: one(rndPlans, {
    fields: [rndExternalIssues.relatedPlanId],
    references: [rndPlans.id],
  }),
  comments: many(rndIssueComments),
}));

export const rndCompetitorsRelations = relations(rndCompetitors, ({ many }) => ({
  products: many(rndCompetitorProducts),
}));

export const rndCompetitorProductsRelations = relations(
  rndCompetitorProducts,
  ({ one }) => ({
    competitor: one(rndCompetitors, {
      fields: [rndCompetitorProducts.competitorId],
      references: [rndCompetitors.id],
    }),
    ourMixDesign: one(mixDesigns, {
      fields: [rndCompetitorProducts.ourMixDesignId],
      references: [mixDesigns.id],
    }),
  })
);

// ─── DRUM TELEMATICS IoT (Epic 5 — تيليمترية البرميل) ─────────────────────────
//
//  Live drum intelligence per mixer (InfoRMC / Coretex parity):
//   • telematics_devices — sensor registry per vehicle (drum RPM probe,
//     temperature probe, water-add flow meter, GPS tracker)
//   • telematics_readings — high-frequency time series: RPM, concrete
//     temperature, water added, position, speed
//   Relations are declared right after the table definitions below.

// ─── CUSTOMER PORTAL (بوابة العميل — Epic 2) ──────────────────────────────────
//
//  Passwordless magic-link access for customers:
//   • SCOPE=ORDER  → public tracking of ONE delivery (timeline + ticket)
//   • SCOPE=CLIENT → full portal: all orders + computed statements
//
//  The token IS the credential: unguessable nanoid (21 chars), expirable,
//  revocable, view-counted. The public endpoint requires NO login.

/**
 * share_tokens — Magic links for the customer portal.
 */
export const shareTokens = pgTable(
  "share_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** ORDER = single delivery tracking · CLIENT = full customer portal */
    scope: varchar("scope", { length: 10 }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    /** Unguessable public token (nanoid) — never sequential, never a UUID */
    token: varchar("token", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at"),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at"),
    isRevoked: boolean("is_revoked").notNull().default(false),
    /** Optional label: "site engineer Ahmed", "sent via WhatsApp"... */
    label: varchar("label", { length: 200 }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_share_token").on(t.token),
    index("idx_share_order").on(t.orderId),
    index("idx_share_client").on(t.clientId),
    index("idx_share_tenant").on(t.tenantId),
  ]
);

/**
 * telematics_devices — Sensor registry per vehicle.
 * One row per physical probe: drum-RPM, temperature, water-add meter, tracker.
 */
export const telematicsDevices = pgTable(
  "telematics_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "cascade" }),
    /** DRUM_RPM | CONCRETE_TEMP | WATER_ADD_METER | GPS_TRACKER */
    deviceType: varchar("device_type", { length: 30 }).notNull(),
    /** Vendor serial / IMEI printed on the probe */
    serialNumber: varchar("serial_number", { length: 80 }),
    isActive: boolean("is_active").notNull().default(true),
    mountedAt: timestamp("mounted_at"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_tm_dev_vehicle").on(t.vehicleId),
    index("idx_tm_dev_tenant").on(t.tenantId),
  ]
);

/**
 * telematics_readings — High-frequency drum/fleet time series.
 * Written by probes via POST /api/v1/telematics/ingest (integration key).
 * Retention pruning is an ops task (see roadmap hardening notes).
 */
export const telematicsReadings = pgTable(
  "telematics_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => fleetVehicles.id, { onDelete: "cascade" }),
    /** Active trip at capture time (null when roaming/empty) */
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    /** Drum revolutions per minute (0 = stopped — agitation gap!) */
    drumRpm: decimal("drum_rpm", { precision: 5, scale: 2 }),
    /** Fresh concrete temperature °C */
    concreteTempC: decimal("concrete_temp_c", { precision: 4, scale: 1 }),
    /** Water added since batch, litres (cumulative per trip) */
    waterAddedL: decimal("water_added_l", { precision: 8, scale: 2 }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    speedKmh: decimal("speed_kmh", { precision: 6, scale: 2 }),
    /** DEVICE | DRIVER_APP | GPS_VENDOR */
    source: varchar("source", { length: 20 }).notNull().default("DEVICE"),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_tm_trip").on(t.tripId),
    index("idx_tm_vehicle_time").on(t.vehicleId, t.capturedAt),
    index("idx_tm_tenant").on(t.tenantId),
  ]
);

/**
 * integration_connections — External accounting endpoints.
 * Credentials are AES-256-GCM encrypted (see accounting-sync.service).
 */
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** ZOHO_BOOKS | QUICKBOOKS | CSV_BRIDGE (SAP/Oracle file bridge) */
    provider: varchar("provider", { length: 30 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(), // "Zoho — Main Books"
    /** Encrypted JSON credentials (iv:ciphertext:tag, base64) */
    credentialsEnc: text("credentials_enc").notNull(),
    /** Non-secret provider settings (region, sandbox, item refs...) */
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    lastTestedAt: timestamp("last_tested_at"),
    lastTestOk: boolean("last_test_ok"),
    lastTestMessage: varchar("last_test_message", { length: 500 }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_intconn_tenant").on(t.tenantId),
    index("idx_intconn_provider").on(t.provider),
  ]
);

/**
 * integration_sync_logs — Audit-grade trail of every external push.
 */
export const integrationSyncLogs = pgTable(
  "integration_sync_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 10 }).notNull().default("OUT"), // OUT | IN
    entityType: varchar("entity_type", { length: 30 }).notNull(), // CUSTOMER | INVOICE | CSV_EXPORT
    localId: varchar("local_id", { length: 64 }),
    externalId: varchar("external_id", { length: 120 }),
    status: varchar("status", { length: 20 }).notNull(), // OK | FAILED
    message: text("message"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_intlog_conn").on(t.connectionId),
    index("idx_intlog_entity").on(t.entityType, t.localId),
    index("idx_intlog_tenant").on(t.tenantId),
  ]
);

/**
 * zatca_documents — Phase-2 e-invoice registry with hash chain.
 */
export const zatcaDocuments = pgTable(
  "zatca_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    /** Our sequential invoice number, e.g. INV-2026-000123 */
    invoiceNumber: varchar("invoice_number", { length: 40 }).notNull(),
    /** Stable client retry key; nullable until a caller opts into idempotent retries */
    idempotencyKey: varchar("idempotency_key", { length: 200 }),
    /** ZATCA invoice UUID (we generate) */
    invoiceUuid: varchar("invoice_uuid", { length: 64 }).notNull(),
    /** STANDARD (B2B clearance) | SIMPLIFIED (B2C reporting) */
    invoiceType: varchar("invoice_type", { length: 12 }).notNull().default("STANDARD"),
    /** DRAFT | PENDING | CLEARED | REPORTED | REJECTED */
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    /** Sequential counter per ZATCA anti-gap rules */
    counterValue: integer("counter_value").notNull(),
    /** SHA-256 of the submitted UBL XML (base64) */
    invoiceHash: varchar("invoice_hash", { length: 128 }),
    /** Previous invoice hash (base64 PIH chain) */
    previousHash: varchar("previous_hash", { length: 128 }),
    /** Local fallback QR; the Fatoora-returned QR is stored here when supplied */
    qrTlvBase64: text("qr_tlv_base64"),
    /** Money snapshot {exVat, vatAmount, total, currency} */
    totals: jsonb("totals").$type<Record<string, number | string>>(),
    /** Raw Fatoora API response (validation results, warnings...) */
    fatooraResponse: jsonb("fatoora_response").$type<Record<string, unknown>>(),
    rejectionReason: text("rejection_reason"),
    clearedAt: timestamp("cleared_at"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_zt_doc_tenant").on(t.tenantId),
    index("idx_zt_doc_order").on(t.orderId),
    index("idx_zt_doc_status").on(t.status),
    index("idx_zt_doc_number").on(t.invoiceNumber),
    unique("zatca_documents_tenant_invoice_number_unique").on(t.tenantId, t.invoiceNumber),
    unique("zatca_documents_tenant_idempotency_unique").on(t.tenantId, t.idempotencyKey),
    unique("zatca_documents_invoice_uuid_unique").on(t.invoiceUuid),
    unique("zatca_documents_tenant_counter_unique").on(t.tenantId, t.counterValue),
  ]
);

/**
 * rfqs — Request-for-quotation headers.
 */
export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    rfqNumber: varchar("rfq_number", { length: 30 }).notNull().unique(), // RFQ-2026-00001
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    deliverySiteId: uuid("delivery_site_id").references(() => deliverySites.id, {
      onDelete: "set null",
    }),
    /** DRAFT | SUBMITTED | COSTED | APPROVED | REJECTED | CONVERTED | EXPIRED */
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    notes: text("notes"),
    validUntil: timestamp("valid_until"),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    costedById: uuid("costed_by_id").references(() => users.id, { onDelete: "set null" }),
    costedAt: timestamp("costed_at"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rfq_tenant").on(t.tenantId),
    index("idx_rfq_client").on(t.clientId),
    index("idx_rfq_status").on(t.status),
    index("idx_rfq_number").on(t.rfqNumber),
  ]
);

/**
 * rfq_items — One row per mix: volume + cost breakdown + margin + floor + quote.
 * Money in SAR decimals (converted to cents only when creating orders).
 */
export const rfqItems = pgTable(
  "rfq_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    mixDesignId: uuid("mix_design_id")
      .notNull()
      .references(() => mixDesigns.id, { onDelete: "restrict" }),
    volumeM3: decimal("volume_m3", { precision: 8, scale: 2 }).notNull(),
    /** Auto material estimate from silo costs (snapshot at costing time) */
    materialCostPerM3: decimal("material_cost_per_m3", { precision: 10, scale: 2 }).default("0"),
    haulCostPerM3: decimal("haul_cost_per_m3", { precision: 10, scale: 2 }).default("0"),
    pumpCostPerM3: decimal("pump_cost_per_m3", { precision: 10, scale: 2 }).default("0"),
    overheadCostPerM3: decimal("overhead_cost_per_m3", { precision: 10, scale: 2 }).default("0"),
    totalCostPerM3: decimal("total_cost_per_m3", { precision: 10, scale: 2 }).default("0"),
    marginPct: decimal("margin_pct", { precision: 5, scale: 2 }).default("0"),
    /** Floor = total × (1 + margin). Approval blocked below this. */
    floorPricePerM3: decimal("floor_price_per_m3", { precision: 10, scale: 2 }).default("0"),
    quotedPricePerM3: decimal("quoted_price_per_m3", { precision: 10, scale: 2 }).default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_rfq_item_rfq").on(t.rfqId),
    index("idx_rfq_item_mix").on(t.mixDesignId),
    index("idx_rfq_item_tenant").on(t.tenantId),
  ]
);

/**
 * commission_schemes — Named % rates on delivered revenue.
 */
export const commissionSchemes = pgTable(
  "commission_schemes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** % of delivered revenue, e.g. 1.5 */
    ratePct: decimal("rate_pct", { precision: 5, scale: 2 }).notNull(),
    /** Minimum delivered m³ in the period to qualify (0 = none) */
    minDeliveredM3: decimal("min_delivered_m3", { precision: 10, scale: 2 }).default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_comm_scheme_tenant").on(t.tenantId),
    index("idx_comm_scheme_active").on(t.isActive),
  ]
);

/**
 * sales_commissions — Earned rows: PENDING → APPROVED → PAID.
 */
export const salesCommissions = pgTable(
  "sales_commissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    salesRepId: uuid("sales_rep_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    schemeId: uuid("scheme_id").references(() => commissionSchemes.id, { onDelete: "set null" }),
    /** YYYY-MM period label, e.g. "2026-09" */
    period: varchar("period", { length: 7 }).notNull(),
    basisRevenueSar: decimal("basis_revenue_sar", { precision: 12, scale: 2 }).notNull(),
    ratePct: decimal("rate_pct", { precision: 5, scale: 2 }).notNull(),
    amountSar: decimal("amount_sar", { precision: 12, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    paidAt: timestamp("paid_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_comm_rep").on(t.salesRepId),
    index("idx_comm_order").on(t.orderId),
    index("idx_comm_period").on(t.period),
    index("idx_comm_status").on(t.status),
    index("idx_comm_tenant").on(t.tenantId),
  ]
);

/**
 * payroll_employees — Salary packages (SAR monthly).
 */
export const payrollEmployees = pgTable(
  "payroll_employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** Link to system user when the employee has a login (drivers, reps...) */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    employeeCode: varchar("employee_code", { length: 20 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    nationalId: varchar("national_id", { length: 20 }),
    /** SAUDI | NON_SAUDI */
    nationality: varchar("nationality", { length: 12 }).notNull().default("NON_SAUDI"),
    /**
     * GOSI track — EXPLICIT, set from contribution history:
     * LEGACY (registered before 2024-07-03) | NEW (first registration after)
     * Non-Saudis ignore this (hazards-only regardless).
     */
    gosiSystem: varchar("gosi_system", { length: 10 }).notNull().default("LEGACY"),
    jobTitle: varchar("job_title", { length: 120 }),
    department: varchar("department", { length: 80 }),
    baseSalarySar: decimal("base_salary_sar", { precision: 12, scale: 2 }).notNull().default("0"),
    housingAllowanceSar: decimal("housing_allowance_sar", { precision: 12, scale: 2 }).notNull().default("0"),
    transportAllowanceSar: decimal("transport_allowance_sar", { precision: 12, scale: 2 }).notNull().default("0"),
    otherAllowancesSar: decimal("other_allowances_sar", { precision: 12, scale: 2 }).notNull().default("0"),
    bankIban: varchar("bank_iban", { length: 40 }),
    bankName: varchar("bank_name", { length: 80 }),
    hireDate: timestamp("hire_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pay_emp_tenant").on(t.tenantId),
    index("idx_pay_emp_code").on(t.employeeCode),
    index("idx_pay_emp_user").on(t.userId),
  ]
);

/**
 * payroll_runs — Monthly snapshots: DRAFT → APPROVED → PAID.
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    totalGrossSar: decimal("total_gross_sar", { precision: 14, scale: 2 }).default("0"),
    totalEmployeeGosiSar: decimal("total_employee_gosi_sar", { precision: 14, scale: 2 }).default("0"),
    totalEmployerGosiSar: decimal("total_employer_gosi_sar", { precision: 14, scale: 2 }).default("0"),
    totalDeductionsSar: decimal("total_deductions_sar", { precision: 14, scale: 2 }).default("0"),
    totalNetSar: decimal("total_net_sar", { precision: 14, scale: 2 }).default("0"),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    paidAt: timestamp("paid_at"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pay_run_tenant").on(t.tenantId),
    index("idx_pay_run_period").on(t.period),
    index("idx_pay_run_status").on(t.status),
  ]
);

/**
 * payroll_lines — Per-employee math snapshot (immutable once APPROVED).
 */
export const payrollLines = pgTable(
  "payroll_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => payrollEmployees.id, { onDelete: "restrict" }),
    employeeName: varchar("employee_name", { length: 120 }).notNull(),
    daysWorked: decimal("days_worked", { precision: 5, scale: 2 }).notNull().default("30"),
    baseSalarySar: decimal("base_salary_sar", { precision: 12, scale: 2 }).notNull(),
    allowancesSar: decimal("allowances_sar", { precision: 12, scale: 2 }).notNull(),
    grossSar: decimal("gross_sar", { precision: 12, scale: 2 }).notNull(),
    /** Contributory wage actually used (basic+housing, capped 45k) */
    gosiWageSar: decimal("gosi_wage_sar", { precision: 12, scale: 2 }).notNull(),
    gosiSystem: varchar("gosi_system", { length: 10 }).notNull(),
    employeeGosiSar: decimal("employee_gosi_sar", { precision: 12, scale: 2 }).notNull(),
    employerGosiSar: decimal("employer_gosi_sar", { precision: 12, scale: 2 }).notNull(),
    deductionsSar: decimal("deductions_sar", { precision: 12, scale: 2 }).notNull().default("0"),
    deductionNote: varchar("deduction_note", { length: 200 }),
    netSar: decimal("net_sar", { precision: 12, scale: 2 }).notNull(),
    bankIban: varchar("bank_iban", { length: 40 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pay_line_run").on(t.runId),
    index("idx_pay_line_emp").on(t.employeeId),
    index("idx_pay_line_tenant").on(t.tenantId),
  ]
);

/**
 * hr_requests — Employee → HR: leave, advance, salary confirmation, other.
 */
export const hrRequests = pgTable(
  "hr_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** LEAVE | ADVANCE | SALARY_CONFIRM | OTHER */
    type: varchar("type", { length: 20 }).notNull(),
    /** PENDING | APPROVED | REJECTED | CANCELLED */
    status: varchar("status", { length: 16 }).notNull().default("PENDING"),
    /** Leave dates / advance payday context */
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    /** Advance amount in SAR (ADVANCE only) */
    amountSar: decimal("amount_sar", { precision: 12, scale: 2 }),
    /** Reference: payroll line id for SALARY_CONFIRM */
    referenceId: varchar("reference_id", { length: 64 }),
    reason: text("reason"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNote: varchar("review_note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hr_req_tenant").on(t.tenantId),
    index("idx_hr_req_requester").on(t.requesterId),
    index("idx_hr_req_status").on(t.status),
    index("idx_hr_req_type").on(t.type),
  ]
);

/**
 * hr_broadcasts — HR → employees announcements (role-targeted or all).
 */
export const hrBroadcasts = pgTable(
  "hr_broadcasts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** Target roles JSON array, e.g. ["DRIVER"] — empty/null = everyone */
    audience: jsonb("audience").$type<string[]>().default([]),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hr_bc_tenant").on(t.tenantId),
    index("idx_hr_bc_created").on(t.createdAt),
  ]
);

/**
 * hr_broadcast_reads — Read receipts (one row per reader).
 */
export const hrBroadcastReads = pgTable(
  "hr_broadcast_reads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => hrBroadcasts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hr_bcr_broadcast").on(t.broadcastId),
    index("idx_hr_bcr_user").on(t.userId),
  ]
);

/**
 * hr_zones — Work geofences (factory gate, plant yard, major sites).
 */
export const hrZones = pgTable(
  "hr_zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(), // "م بوابة المصنع"
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    /** Geofence radius in metres */
    radiusM: integer("radius_m").notNull().default(200),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hr_zone_tenant").on(t.tenantId),
  ]
);

/**
 * hr_attendance — One row per user per day (YYYY-MM-DD).
 * checkIn = first zone entry · checkOut = last zone exit.
 */
export const hrAttendance = pgTable(
  "hr_attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workDate: varchar("work_date", { length: 10 }).notNull(), // YYYY-MM-DD
    checkInAt: timestamp("check_in_at"),
    checkInLat: decimal("check_in_lat", { precision: 10, scale: 7 }),
    checkInLng: decimal("check_in_lng", { precision: 10, scale: 7 }),
    checkInZoneId: uuid("check_in_zone_id").references(() => hrZones.id, {
      onDelete: "set null",
    }),
    checkOutAt: timestamp("check_out_at"),
    checkOutLat: decimal("check_out_lat", { precision: 10, scale: 7 }),
    checkOutLng: decimal("check_out_lng", { precision: 10, scale: 7 }),
    /** Last inside-zone fix (drives check-out on exit) */
    lastInsideAt: timestamp("last_inside_at"),
    lastInsideLat: decimal("last_inside_lat", { precision: 10, scale: 7 }),
    lastInsideLng: decimal("last_inside_lng", { precision: 10, scale: 7 }),
    /** AUTO (geofence) | MANUAL (HR correction) */
    source: varchar("source", { length: 10 }).notNull().default("AUTO"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hr_att_tenant").on(t.tenantId),
    index("idx_hr_att_user_day").on(t.userId, t.workDate),
  ]
);

export const hrBroadcastsRelations = relations(hrBroadcasts, ({ many }) => ({
  reads: many(hrBroadcastReads),
}));

// ─── GEOFENCE ATTENDANCE (Epic 12b — حضور وانصراف باللوكيشن) ─────────────────
//
//  Location-based attendance like dedicated attendance apps:
//   • hr_zones — work geofences (factory + sites): lat/lng + radius
//   • hr_attendance — one row per user per day: first zone entry =
//     check-in (حضور), last zone exit = check-out (انصراف).
//  The mobile app pings position periodically; the server derives
//  enter/exit transitions. Driver overtime reports join attendance
//  with trip counts (trips = إضافي evidence).

/**
 * batch_controllers — One controller binding per batch plant.
 * Settings hold provider-specific config (host/registerMap, baseUrl...).
 * Secrets (if any) go in settings.apiKey — treat like credentials.
 */
export const batchControllers = pgTable(
  "batch_controllers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    batchPlantId: uuid("batch_plant_id").references(() => batchPlants.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 120 }).notNull(), // "BP-01 Modbus"
    /** MODBUS_TCP | HTTP_GATEWAY | SIMULATOR */
    provider: varchar("provider", { length: 20 }).notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    /** Last live snapshot (state, progress, latency, message) */
    lastStatus: jsonb("last_status").$type<Record<string, unknown>>(),
    lastSeenAt: timestamp("last_seen_at"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_batch_ctrl_tenant").on(t.tenantId),
    index("idx_batch_ctrl_plant").on(t.batchPlantId),
  ]
);

/**
 * carbon_factors — Editable kgCO2e intensities.
 * factorKey examples: CEMENT_KG, SAND_KG, GRAVEL_KG, WATER_L,
 * ADMIXTURE_L, FLYASH_KG, SILICAFUME_KG, DIESEL_L, HAUL_TKM.
 * Seeded lazily with IPCC-style defaults (see sustainability service).
 */
export const carbonFactors = pgTable(
  "carbon_factors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    factorKey: varchar("factor_key", { length: 40 }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    kgco2ePerUnit: decimal("kgco2e_per_unit", { precision: 12, scale: 6 }).notNull(),
    source: varchar("source", { length: 200 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_carbon_tenant").on(t.tenantId),
    index("idx_carbon_key").on(t.tenantId, t.factorKey),
  ]
);

export const batchControllersRelations = relations(batchControllers, ({ one }) => ({
  plant: one(batchPlants, {
    fields: [batchControllers.batchPlantId],
    references: [batchPlants.id],
  }),
}));

// ─── MULTI-MATERIAL + CARBON (Epic 11 — مواد واستدامة) ────────────────────────
//
//  Beyond ready-mix (Command Alkon multi-material parity):
//   • orders.product_type + mix_designs.product_type:
//     READY_MIX | AGGREGATE | ASPHALT | BLOCKS | CEMENT (default READY_MIX)
//   • carbon_factors — editable kgCO2e intensities per unit
//   • orders.carbon_kgco2e — footprint snapshot (mix BOM × factors + haul)
//  SSO (OIDC) needs no schema — config lives in tenants.settings.sso.

export const payrollRunsRelations = relations(payrollRuns, ({ many }) => ({
  lines: many(payrollLines),
}));

// ─── HR SOCIAL (Epic 12 — تواصل الموظفين مع HR) ──────────────────────────────
//
//  Two-way bridge between every employee and HR:
//   • hr_requests — LEAVE | ADVANCE | SALARY_CONFIRM | OTHER.
//     Created by ANY authenticated employee (own scope), reviewed
//     (APPROVED/REJECTED + note) by HR_WRITE holders.
//   • hr_broadcasts — HR announcements to roles/all + read receipts.
//  Push delivery via Expo Push (see push.service.ts).

// ─── BATCH-PLANT CONTROLLERS (Epic 10 — تكامل PLC) ────────────────────────────
//
//  Registry binding each batch plant to its controller:
//   • MODBUS_TCP (Libra/generic PLC via register map — READ-ONLY v1)
//   • HTTP_GATEWAY (Marcotte-style REST)
//   • SIMULATOR (virtual plant for demos/dev — never production)
//  Live reads are on-demand (no time-series table); last snapshot is
//  cached on the row for dashboards.

export const rfqsRelations = relations(rfqs, ({ many }) => ({
  items: many(rfqItems),
}));

// ─── GCC PAYROLL GOSI + MUDAD (Epic 9 — الرواتب الخليجية) ─────────────────────
//
//  Saudi GOSI-accurate payroll (iCeipts / AKST parity):
//   • payroll_employees — salary package + nationality + EXPLICIT gosi
//     system (LEGACY pre-2024-07-03 vs NEW). The system follows
//     contribution HISTORY, never the hire date (classic payroll error).
//   • payroll_runs — monthly DRAFT → APPROVED → PAID snapshots
//   • payroll_lines — per-employee gross/GOSI/deductions/net math
//
//  Rate engine (verified Sep-2026 sources):
//   • Contributory wage = basic + housing ONLY, capped at SAR 45,000
//   • Legacy Saudi: employee 9.75% (9 + 0.75) · employer 11.75% (9+2+0.75)
//   • New-system Saudi (Jul-26): employee 10.75% · employer 12.75%,
//     +0.5%/side each July through 2028 (final 11.75 / 13.75)
//   • Non-Saudi: employer 2% hazards only, employee 0%

export const zatcaDocumentsRelations = relations(zatcaDocuments, ({ one }) => ({
  order: one(orders, {
    fields: [zatcaDocuments.orderId],
    references: [orders.id],
  }),
}));

// ─── SALES QUOTING RFQ + COMMISSIONS (Epic 8 — عروض الأسعار والعمولات) ─────────
//
//  Enforced-margin quoting (D4A / MAS parity):
//   • rfqs — header: client, site, status chain, validity, approvals
//   • rfq_items — one row per mix: volume + cost breakdown + margin +
//     floor price + quoted price. APPROVE is BLOCKED below floor.
//   • commission_schemes — named % rates on delivered revenue
//   • sales_commissions — earned rows: PENDING → APPROVED → PAID
//
//  Flow: DRAFT → SUBMITTED → COSTED → APPROVED → CONVERTED (→ orders)
//  Conversion creates one DRAFT... no — PENDING_FINANCE order per item,
//  so the finance gate is never bypassed.

export const integrationConnectionsRelations = relations(
  integrationConnections,
  ({ many }) => ({
    logs: many(integrationSyncLogs),
  })
);

// ─── ZATCA PHASE-2 E-INVOICING (Epic 7 — الفوترة الإلكترونية) ─────────────────
//
//  Full Fatoora clearance/reporting (iCeipts / ERPGulf parity):
//   • tenant.settings.zatca — taxpayer config (tokens AES-encrypted)
//   • zatca_documents — every invoice: UBL hash chain (counter + previous
//     hash per ZATCA rules), TLV QR, clearance status, Fatoora response
//   • STANDARD (B2B) invoices go through clearance; SIMPLIFIED (B2C)
//     go through reporting. Without configured tokens, docs are stored
//     as PENDING with a valid TLV QR (Phase-1-compatible) until certs exist.

export const telematicsDevicesRelations = relations(telematicsDevices, ({ one }) => ({
  vehicle: one(fleetVehicles, {
    fields: [telematicsDevices.vehicleId],
    references: [fleetVehicles.id],
  }),
}));

export const telematicsReadingsRelations = relations(telematicsReadings, ({ one }) => ({
  vehicle: one(fleetVehicles, {
    fields: [telematicsReadings.vehicleId],
    references: [fleetVehicles.id],
  }),
  trip: one(trips, {
    fields: [telematicsReadings.tripId],
    references: [trips.id],
  }),
}));

// ─── EXTERNAL ACCOUNTING INTEGRATIONS (Epic 6 — التكامل المحاسبي) ─────────────
//
//  Push customers + invoices to SAP / Oracle / QuickBooks / Zoho
//  (Sysdyne QuickLink / D4A parity):
//   • integration_connections — provider + ENCRYPTED credentials + status
//   • integration_sync_logs — every push attempt (audit-grade trail)
//  SAP/Oracle mid-market reality = file bridge: CSV export/import
//  handled by the csv-bridge connector against the same log table.

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  ordersCreated: many(orders, { relationName: "orderCreator" }),
  ordersApproved: many(orders, { relationName: "orderFinance" }),
  trips: many(trips),
  auditLogs: many(auditLogs),
  financeActions: many(financeActions),
  maintenanceReported: many(maintenanceOrders, { relationName: "reporter" }),
  maintenanceAssigned: many(maintenanceOrders, { relationName: "mechanic" }),
  fuelLogs: many(fuelLogs),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  deliverySites: many(deliverySites),
  orders: many(orders),
}));

export const deliverySitesRelations = relations(deliverySites, ({ one, many }) => ({
  client: one(clients, { fields: [deliverySites.clientId], references: [clients.id] }),
  orders: many(orders),
}));

export const fleetVehiclesRelations = relations(fleetVehicles, ({ one, many }) => ({
  assignedDriver: one(users, {
    fields: [fleetVehicles.assignedDriverId],
    references: [users.id],
  }),
  trips: many(trips, { relationName: "tripVehicle" }),
  pumpTrips: many(trips, { relationName: "tripPump" }),
  maintenanceOrders: many(maintenanceOrders),
  fuelLogs: many(fuelLogs),
}));

export const mixDesignsRelations = relations(mixDesigns, ({ one, many }) => ({
  approvedBy: one(users, { fields: [mixDesigns.approvedById], references: [users.id] }),
  orders: many(orders),
  trips: many(trips),
  labSamples: many(labTestSamples),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  client: one(clients, { fields: [orders.clientId], references: [clients.id] }),
  deliverySite: one(deliverySites, {
    fields: [orders.deliverySiteId],
    references: [deliverySites.id],
  }),
  mixDesign: one(mixDesigns, { fields: [orders.mixDesignId], references: [mixDesigns.id] }),
  createdByRep: one(users, {
    fields: [orders.createdByRepId],
    references: [users.id],
    relationName: "orderCreator",
  }),
  financeOfficer: one(users, {
    fields: [orders.financeOfficerId],
    references: [users.id],
    relationName: "orderFinance",
  }),
  trips: many(trips),
  financeActions: many(financeActions),
  labSamples: many(labTestSamples),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  order: one(orders, { fields: [trips.orderId], references: [orders.id] }),
  vehicle: one(fleetVehicles, {
    fields: [trips.vehicleId],
    references: [fleetVehicles.id],
    relationName: "tripVehicle",
  }),
  pumpVehicle: one(fleetVehicles, {
    fields: [trips.pumpVehicleId],
    references: [fleetVehicles.id],
    relationName: "tripPump",
  }),
  driver: one(users, { fields: [trips.driverId], references: [users.id] }),
  mixDesign: one(mixDesigns, { fields: [trips.mixDesignId], references: [mixDesigns.id] }),
  checkpoints: many(tripCheckpoints),
  weighbridgeTransactions: many(weighbridgeTransactions),
  concreteReturns: many(concreteReturns),
  labSamples: many(labTestSamples),
  inventoryTransactions: many(inventoryTransactions),
  driverLocations: many(driverLocations),
}));

export const tripCheckpointsRelations = relations(tripCheckpoints, ({ one }) => ({
  trip: one(trips, { fields: [tripCheckpoints.tripId], references: [trips.id] }),
  loggedBy: one(users, { fields: [tripCheckpoints.loggedById], references: [users.id] }),
}));

export const weighbridgeTransactionsRelations = relations(weighbridgeTransactions, ({ one }) => ({
  trip: one(trips, { fields: [weighbridgeTransactions.tripId], references: [trips.id] }),
  operator: one(users, { fields: [weighbridgeTransactions.operatorId], references: [users.id] }),
}));

export const labTestSamplesRelations = relations(labTestSamples, ({ one, many }) => ({
  trip: one(trips, { fields: [labTestSamples.tripId], references: [trips.id] }),
  order: one(orders, { fields: [labTestSamples.orderId], references: [orders.id] }),
  mixDesign: one(mixDesigns, { fields: [labTestSamples.mixDesignId], references: [mixDesigns.id] }),
  sampledBy: one(users, { fields: [labTestSamples.sampledById], references: [users.id] }),
  results: many(labTestResults),
}));

export const labTestResultsRelations = relations(labTestResults, ({ one }) => ({
  sample: one(labTestSamples, {
    fields: [labTestResults.sampleId],
    references: [labTestSamples.id],
  }),
  testedBy: one(users, { fields: [labTestResults.testedById], references: [users.id] }),
}));

export const maintenanceOrdersRelations = relations(maintenanceOrders, ({ one }) => ({
  vehicle: one(fleetVehicles, {
    fields: [maintenanceOrders.vehicleId],
    references: [fleetVehicles.id],
  }),
  reportedBy: one(users, {
    fields: [maintenanceOrders.reportedById],
    references: [users.id],
    relationName: "reporter",
  }),
  assignedMechanic: one(users, {
    fields: [maintenanceOrders.assignedMechanicId],
    references: [users.id],
    relationName: "mechanic",
  }),
}));

export const fuelLogsRelations = relations(fuelLogs, ({ one }) => ({
  vehicle: one(fleetVehicles, { fields: [fuelLogs.vehicleId], references: [fleetVehicles.id] }),
  loggedBy: one(users, { fields: [fuelLogs.loggedById], references: [users.id] }),
}));

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  silo: one(inventorySilos, {
    fields: [inventoryTransactions.siloId],
    references: [inventorySilos.id],
  }),
  trip: one(trips, { fields: [inventoryTransactions.tripId], references: [trips.id] }),
  performedBy: one(users, {
    fields: [inventoryTransactions.performedById],
    references: [users.id],
  }),
}));

export const financeActionsRelations = relations(financeActions, ({ one }) => ({
  order: one(orders, { fields: [financeActions.orderId], references: [orders.id] }),
  performedBy: one(users, {
    fields: [financeActions.performedById],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const driverLocationsRelations = relations(driverLocations, ({ one }) => ({
  trip: one(trips, { fields: [driverLocations.tripId], references: [trips.id] }),
  vehicle: one(fleetVehicles, {
    fields: [driverLocations.vehicleId],
    references: [fleetVehicles.id],
  }),
  driver: one(users, { fields: [driverLocations.driverId], references: [users.id] }),
}));

export const pumpOperationLogsRelations = relations(pumpOperationLogs, ({ one }) => ({
  pumpVehicle: one(fleetVehicles, {
    fields: [pumpOperationLogs.pumpVehicleId],
    references: [fleetVehicles.id],
  }),
  order: one(orders, {
    fields: [pumpOperationLogs.orderId],
    references: [orders.id],
  }),
  deliverySite: one(deliverySites, {
    fields: [pumpOperationLogs.deliverySiteId],
    references: [deliverySites.id],
  }),
  operator: one(users, {
    fields: [pumpOperationLogs.operatorId],
    references: [users.id],
  }),
}));

export const tipperIntakeLogsRelations = relations(tipperIntakeLogs, ({ one }) => ({
  tipperVehicle: one(fleetVehicles, {
    fields: [tipperIntakeLogs.tipperVehicleId],
    references: [fleetVehicles.id],
  }),
  silo: one(inventorySilos, {
    fields: [tipperIntakeLogs.siloId],
    references: [inventorySilos.id],
  }),
  weighbridgeTransaction: one(weighbridgeTransactions, {
    fields: [tipperIntakeLogs.weighbridgeTransactionId],
    references: [weighbridgeTransactions.id],
  }),
  purchaseRequest: one(purchaseRequests, {
    fields: [tipperIntakeLogs.purchaseRequestId],
    references: [purchaseRequests.id],
  }),
  receivedBy: one(users, {
    fields: [tipperIntakeLogs.receivedById],
    references: [users.id],
  }),
}));

export const batchPlantsRelations = relations(batchPlants, ({ many }) => ({
  calibrations: many(calibrationControl),
}));

export const calibrationControlRelations = relations(calibrationControl, ({ one }) => ({
  batchPlant: one(batchPlants, {
    fields: [calibrationControl.batchPlantId],
    references: [batchPlants.id],
  }),
  verifiedBy: one(users, {
    fields: [calibrationControl.verifiedById],
    references: [users.id],
  }),
}));

export const plantConfigRelations = relations(plantConfig, ({ one }) => ({
  updatedBy: one(users, { fields: [plantConfig.updatedById], references: [users.id] }),
}));

export const purchaseRequestsRelations = relations(purchaseRequests, ({ one }) => ({
  silo: one(inventorySilos, {
    fields: [purchaseRequests.siloId],
    references: [inventorySilos.id],
  }),
  triggeringTrip: one(trips, {
    fields: [purchaseRequests.triggeringTripId],
    references: [trips.id],
  }),
  generatedBy: one(users, {
    fields: [purchaseRequests.generatedById],
    references: [users.id],
  }),
}));

export const blockManufacturingLogsRelations = relations(blockManufacturingLogs, ({ one }) => ({
  return: one(concreteReturns, {
    fields: [blockManufacturingLogs.returnId],
    references: [concreteReturns.id],
  }),
  loggedBy: one(users, {
    fields: [blockManufacturingLogs.loggedById],
    references: [users.id],
  }),
}));

export const aggregateRecyclingLogsRelations = relations(aggregateRecyclingLogs, ({ one }) => ({
  return: one(concreteReturns, {
    fields: [aggregateRecyclingLogs.returnId],
    references: [concreteReturns.id],
  }),
  destinationSilo: one(inventorySilos, {
    fields: [aggregateRecyclingLogs.destinationSiloId],
    references: [inventorySilos.id],
  }),
  loggedBy: one(users, {
    fields: [aggregateRecyclingLogs.loggedById],
    references: [users.id],
  }),
}));

export const commitmentsRelations = relations(commitments, ({ many, one }) => ({
  payments: many(commitmentPayments),
  createdBy: one(users, { fields: [commitments.createdById], references: [users.id] }),
}));

export const commitmentPaymentsRelations = relations(commitmentPayments, ({ one }) => ({
  commitment: one(commitments, {
    fields: [commitmentPayments.commitmentId],
    references: [commitments.id],
  }),
  ledgerEntry: one(ledgerEntries, {
    fields: [commitmentPayments.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
  createdBy: one(users, { fields: [commitmentPayments.createdById], references: [users.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  vehicle: one(fleetVehicles, { fields: [expenses.vehicleId], references: [fleetVehicles.id] }),
  ledgerEntry: one(ledgerEntries, { fields: [expenses.ledgerEntryId], references: [ledgerEntries.id] }),
  createdBy: one(users, { fields: [expenses.createdById], references: [users.id] }),
}));

export const salariesRelations = relations(salaries, ({ one }) => ({
  employee: one(users, { fields: [salaries.employeeId], references: [users.id] }),
  ledgerEntry: one(ledgerEntries, { fields: [salaries.ledgerEntryId], references: [ledgerEntries.id] }),
  createdBy: one(users, { fields: [salaries.createdById], references: [users.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many, one }) => ({
  purchaseOrders: many(purchaseOrders),
  payments: many(supplierPayments),
  createdBy: one(users, { fields: [suppliers.createdById], references: [users.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ many, one }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  items: many(purchaseOrderItems),
  payments: many(supplierPayments),
  createdBy: one(users, { fields: [purchaseOrders.createdById], references: [users.id] }),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  silo: one(inventorySilos, { fields: [purchaseOrderItems.siloId], references: [inventorySilos.id] }),
}));

export const supplierPaymentsRelations = relations(supplierPayments, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierPayments.supplierId], references: [suppliers.id] }),
  purchaseOrder: one(purchaseOrders, {
    fields: [supplierPayments.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  ledgerEntry: one(ledgerEntries, {
    fields: [supplierPayments.ledgerEntryId],
    references: [ledgerEntries.id],
  }),
  createdBy: one(users, { fields: [supplierPayments.createdById], references: [users.id] }),
}));

// Driver locations are linked to trips via tripsRelations above

// Export all table names for easy reference in API routes
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type VehicleStatus = (typeof vehicleStatusEnum.enumValues)[number];
export type TripCheckpoint = (typeof tripCheckpointEnum.enumValues)[number];
export type VehicleType = (typeof vehicleTypeEnum.enumValues)[number];
export type MaintenanceType = (typeof maintenanceTypeEnum.enumValues)[number];
export type MaintenanceStatus = (typeof maintenanceStatusEnum.enumValues)[number];
export type MaterialCategory = (typeof materialCategoryEnum.enumValues)[number];
export type ReturnDisposition = (typeof returnDispositionEnum.enumValues)[number];
export type LabTestType = (typeof labTestTypeEnum.enumValues)[number];
export type LabTestResult = (typeof labTestResultEnum.enumValues)[number];
export type MaintenanceSeverity = (typeof maintenanceSeverityEnum.enumValues)[number];
export type PurchasePriority = (typeof purchasePriorityEnum.enumValues)[number];
export type VehicleClass = (typeof vehicleClassEnum.enumValues)[number];
export type PumpSessionStatus = (typeof pumpSessionStatusEnum.enumValues)[number];
export type TipperIntakeStatus = (typeof tipperIntakeStatusEnum.enumValues)[number];
export type CalibrationResult = (typeof calibrationResultEnum.enumValues)[number];
export type PlantStatus = (typeof plantStatusEnum.enumValues)[number];
export type PurchaseRequestStatus = (typeof purchaseRequestStatusEnum.enumValues)[number];
export type CreditHoldStatus = (typeof creditHoldStatusEnum.enumValues)[number];
export type ClientRisk = (typeof clientRiskEnum.enumValues)[number];
export type LedgerEntryType = (typeof ledgerEntryTypeEnum.enumValues)[number];
export type BankTransactionType = (typeof bankTransactionTypeEnum.enumValues)[number];
export type CommitmentType = (typeof commitmentTypeEnum.enumValues)[number];
export type CommitmentFrequency = (typeof commitmentFrequencyEnum.enumValues)[number];
export type CommitmentStatus = (typeof commitmentStatusEnum.enumValues)[number];
export type CommitmentPaymentMode = (typeof commitmentPaymentModeEnum.enumValues)[number];
export type ExpenseCategory = (typeof expenseCategoryEnum.enumValues)[number];
export type ExpensePaymentMethod = (typeof expensePaymentMethodEnum.enumValues)[number];
export type SupplierPaymentMode = (typeof supplierPaymentModeEnum.enumValues)[number];
export type PurchaseOrderStatus = (typeof purchaseOrderStatusEnum.enumValues)[number];
// ── R&D module types ──
export type RndPlanStatus = (typeof rndPlanStatusEnum.enumValues)[number];
export type RndPlanCategory = (typeof rndPlanCategoryEnum.enumValues)[number];
export type RndPriority = (typeof rndPriorityEnum.enumValues)[number];
export type RndTaskStatus = (typeof rndTaskStatusEnum.enumValues)[number];
export type RndBudgetCategory = (typeof rndBudgetCategoryEnum.enumValues)[number];
export type RndBudgetItemStatus = (typeof rndBudgetItemStatusEnum.enumValues)[number];
export type RndIssueSeverity = (typeof rndIssueSeverityEnum.enumValues)[number];
export type RndIssueCategory = (typeof rndIssueCategoryEnum.enumValues)[number];
export type RndIssueStatus = (typeof rndIssueStatusEnum.enumValues)[number];
export type ProductType = (typeof productTypeEnum.enumValues)[number];
