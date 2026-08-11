/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Role-Based Access Control (RBAC) — 10-Role Permission Matrix
 * ============================================================
 *
 *  4 PRIMARY ERP ROLES (web / mobile):
 *  ─────────────────────────────────────────────────────────
 *   1. SUPER_ADMIN        Full unrestricted access
 *   2. FINANCE            Order approval, credit limit checks, invoice mgmt
 *   3. SALES_REP          Order creation, site geolocation
 *   4. DRIVER             Trip timeline, geofence, fuel logs
 *
 *  6 SUPPORTING SUB-ROLES (plant floor / workshop / lab):
 *  ─────────────────────────────────────────────────────────
 *   5. DISPATCHER         Scheduling, fleet assignment, trip creation
 *   6. BATCH_OPERATOR     Automated batching panel, start-batch, calibration
 *   7. LAB_TECH           Mix designs, slump/strength QC, climate compensation
 *   8. WORKSHOP_MGR       Fleet status mutation, breakdown, fuel/spares inventory
 *   9. WORKSHOP_MECHANIC  Mechanic work orders (legacy, read+close only)
 *  10. LAB_TECHNICIAN     Legacy alias for LAB_TECH
 *
 *  The SUPER_ADMIN role inherits every permission automatically via
 *  `Object.values(PERMISSIONS)`. All other roles are restricted to the
 *  explicit permission list below. Individual users may receive ADDITIONAL
 *  permissions via the `users.permissions` JSON column — these are
 *  strictly additive and never deny permissions a role already grants.
 * ============================================================
 */

import type { UserRole } from "@/db/schema";

// ─── Permission Definitions ───────────────────────────────────────────────────

/**
 * Granular permission keys.
 * Each role is granted a set of these permissions.
 * Individual users can receive additional permissions via the
 * `users.permissions` JSON column (additive only — no deny overrides).
 */
export const PERMISSIONS = {
  // ── Order Management ──────────────────────────────────────
  ORDER_CREATE: "order:create",
  ORDER_READ: "order:read",
  ORDER_UPDATE: "order:update",
  ORDER_CANCEL: "order:cancel",
  ORDER_DELETE: "order:delete",
  ORDER_APPROVE_FINANCE: "order:approve_finance",    // Finance only — electronic toggle
  ORDER_REJECT_FINANCE: "order:reject_finance",
  ORDER_SCHEDULE: "order:schedule",                  // Dispatcher

  // ── Fleet / Vehicles ──────────────────────────────────────
  FLEET_READ: "fleet:read",
  FLEET_CREATE: "fleet:create",
  FLEET_UPDATE: "fleet:update",
  FLEET_DELETE: "fleet:delete",
  FLEET_MARK_BREAKDOWN: "fleet:mark_breakdown",      // Mechanic / Admin
  /** Mutate a vehicle's operational status (e.g. IN_WORKSHOP, MAJOR_BREAKDOWN) */
  FLEET_STATUS_MUTATION: "fleet:status_mutation",
  /** View and manage spare-parts inventory for the workshop */
  FLEET_SPARES_INVENTORY: "fleet:spares_inventory",

  // ── Trip / Dispatch Timeline ──────────────────────────────
  TRIP_CREATE: "trip:create",
  TRIP_READ: "trip:read",
  TRIP_UPDATE_CHECKPOINT: "trip:update_checkpoint",  // Driver
  TRIP_CANCEL: "trip:cancel",

  // ── Weighbridge ───────────────────────────────────────────
  WEIGHBRIDGE_READ: "weighbridge:read",
  WEIGHBRIDGE_RECORD: "weighbridge:record",          // Weighbridge operator
  WEIGHBRIDGE_VERIFY_CHAIN: "weighbridge:verify",    // Admin / Audit

  // ── Inventory ─────────────────────────────────────────────
  INVENTORY_READ: "inventory:read",
  INVENTORY_ADJUST: "inventory:adjust",              // Admin / Lab
  INVENTORY_RECEIVE: "inventory:receive",

  // ── Batching Panel ────────────────────────────────────────
  /** Fire the atomic batch start command */
  BATCH_START: "batch:start",
  /** Perform / record scale calibration verifications */
  BATCH_CALIBRATE: "batch:calibrate",
  /** Override a calibration block (SUPER_ADMIN only in practice) */
  BATCH_OVERRIDE_CALIBRATION: "batch:override_calibration",

  // ── Quality / Lab ─────────────────────────────────────────
  LAB_READ: "lab:read",
  LAB_RECORD_SLUMP: "lab:record_slump",
  LAB_RECORD_STRENGTH: "lab:record_strength",
  LAB_APPROVE: "lab:approve",
  /** Run the climate-compensation algorithm */
  LAB_ENV_COMPENSATION: "lab:env_compensation",
  /** View / edit approved mix designs */
  MIX_READ: "mix:read",

  // ── Workshop & Maintenance ────────────────────────────────
  WORKSHOP_READ: "workshop:read",
  WORKSHOP_CREATE_ORDER: "workshop:create_order",
  WORKSHOP_UPDATE_ORDER: "workshop:update_order",
  WORKSHOP_CLOSE_ORDER: "workshop:close_order",
  /** Manage / escalate workshop work orders (WORKSHOP_MGR) */
  WORKSHOP_MANAGE: "workshop:manage",
  FUEL_LOG_READ: "fuel:read",
  FUEL_LOG_RECORD: "fuel:record",

  // ── Finance / Accounting ──────────────────────────────────
  FINANCE_READ: "finance:read",
  FINANCE_CLIENT_UPDATE: "finance:client_update",    // Credit limit edits
  FINANCE_INVOICE_MANAGE: "finance:invoice_manage",

  // ── User Management ───────────────────────────────────────
  USER_CREATE: "user:create",
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",
  USER_ROLE_ASSIGN: "user:role_assign",

  // ── System / Admin ────────────────────────────────────────
  AUDIT_LOG_READ: "audit:read",
  SYSTEM_SETTINGS: "system:settings",
  MIX_DESIGN_MANAGE: "mix:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Role → Permission Mapping ────────────────────────────────────────────────

/**
 * Defines the default permission set for each role.
 * SUPER_ADMIN is handled separately (wildcard).
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS), // All permissions

  ACCOUNTANT: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_APPROVE_FINANCE,
    PERMISSIONS.ORDER_REJECT_FINANCE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_CLIENT_UPDATE,
    PERMISSIONS.FINANCE_INVOICE_MANAGE,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.AUDIT_LOG_READ,
  ],

  // Legacy alias: FINANCE behaves as ACCOUNTANT
  FINANCE: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_APPROVE_FINANCE,
    PERMISSIONS.ORDER_REJECT_FINANCE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_CLIENT_UPDATE,
    PERMISSIONS.FINANCE_INVOICE_MANAGE,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.AUDIT_LOG_READ,
  ],

  PLANT_MGR: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_SCHEDULE,
    PERMISSIONS.TRIP_CREATE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.TRIP_CANCEL,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_UPDATE,
    PERMISSIONS.FLEET_STATUS_MUTATION,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.SYSTEM_SETTINGS,
    PERMISSIONS.AUDIT_LOG_READ,
  ],

  SALES_REP: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE, // Only own orders in DRAFT/PENDING_FINANCE state
    PERMISSIONS.ORDER_CANCEL, // Only own orders in DRAFT state
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.LAB_READ,
  ],

  DRIVER: [
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.TRIP_UPDATE_CHECKPOINT,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_MARK_BREAKDOWN, // Can self-report a breakdown
    PERMISSIONS.FUEL_LOG_RECORD,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.INVENTORY_READ,
  ],

  LAB_TECHNICIAN: [
    PERMISSIONS.LAB_READ,
    PERMISSIONS.LAB_RECORD_SLUMP,
    PERMISSIONS.LAB_RECORD_STRENGTH,
    PERMISSIONS.LAB_APPROVE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.MIX_DESIGN_MANAGE,
  ],

  WORKSHOP_MECHANIC: [
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.WORKSHOP_CREATE_ORDER,
    PERMISSIONS.WORKSHOP_UPDATE_ORDER,
    PERMISSIONS.WORKSHOP_CLOSE_ORDER,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_MARK_BREAKDOWN,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.FUEL_LOG_RECORD,
    PERMISSIONS.TRIP_READ,
  ],

  DISPATCHER: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_SCHEDULE,
    PERMISSIONS.TRIP_CREATE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.TRIP_CANCEL,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_UPDATE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
  ],

  // ── Sub-role: Batch Plant Operator ──────────────────────────────────────
  // Operates the automated batching panel, fires start-batch commands,
  // performs and records scale calibrations, reads the climate-compensation
  // algorithm. Cannot approve finance, cannot modify orders or clients.
  BATCH_OPERATOR: [
    PERMISSIONS.BATCH_START,
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.LAB_ENV_COMPENSATION,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.MIX_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.WEIGHBRIDGE_RECORD, // Plant operators stamp the weighbridge too
  ],

  // ── Sub-role: Lab Technician (QC engineer) ──────────────────────────────
  // Owns mix designs, slump tests, 7-day & 28-day strength records, and
  // the climate compensation algorithm. Can also view orders, trips, and
  // the weighbridge ledger for traceability.
  LAB_TECH: [
    PERMISSIONS.LAB_READ,
    PERMISSIONS.LAB_RECORD_SLUMP,
    PERMISSIONS.LAB_RECORD_STRENGTH,
    PERMISSIONS.LAB_APPROVE,
    PERMISSIONS.LAB_ENV_COMPENSATION,
    PERMISSIONS.MIX_READ,
    PERMISSIONS.MIX_DESIGN_MANAGE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
  ],

  // ── Sub-role: Workshop Manager ──────────────────────────────────────────
  // Full operational control over fleet vehicles — mutates their status,
  // opens/closes/escalates work orders, logs fuel/oil, manages spare-parts
  // inventory, and can mark breakdowns. Cannot approve orders or finance.
  WORKSHOP_MGR: [
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_UPDATE,
    PERMISSIONS.FLEET_MARK_BREAKDOWN,
    PERMISSIONS.FLEET_STATUS_MUTATION,
    PERMISSIONS.FLEET_SPARES_INVENTORY,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.WORKSHOP_CREATE_ORDER,
    PERMISSIONS.WORKSHOP_UPDATE_ORDER,
    PERMISSIONS.WORKSHOP_CLOSE_ORDER,
    PERMISSIONS.WORKSHOP_MANAGE,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.FUEL_LOG_RECORD,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_RECEIVE, // Spare-parts receipt
    PERMISSIONS.TRIP_READ,
  ],
};

// ─── Permission Check Functions ───────────────────────────────────────────────

/**
 * Returns true if the role has the specified permission.
 * Handles SUPER_ADMIN wildcard implicitly via the all-permissions assignment.
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Returns true if the user (by role + individual permissions) has the specified permission.
 * Individual permissions are additive — they extend but never restrict role-based grants.
 */
export function userHasPermission(
  role: UserRole,
  individualPermissions: string[],
  requiredPermission: Permission
): boolean {
  if (roleHasPermission(role, requiredPermission)) return true;
  return individualPermissions.includes(requiredPermission);
}

/**
 * Returns true if the user has ALL of the specified permissions (AND logic).
 */
export function userHasAllPermissions(
  role: UserRole,
  individualPermissions: string[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every((p) => userHasPermission(role, individualPermissions, p));
}

/**
 * Returns true if the user has ANY of the specified permissions (OR logic).
 */
export function userHasAnyPermission(
  role: UserRole,
  individualPermissions: string[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.some((p) => userHasPermission(role, individualPermissions, p));
}

/**
 * Validates that a given string is a valid UserRole.
 */
export function isValidRole(role: string): role is UserRole {
  const validRoles: UserRole[] = [
    "SUPER_ADMIN",
    "PLANT_MGR",
    "ACCOUNTANT",
    "LAB_TECH",
    "BATCH_OPERATOR",
    "SALES_REP",
    "DRIVER",
    "FINANCE",
    "DISPATCHER",
    "WORKSHOP_MGR",
    // Legacy aliases retained for backward compatibility with older rows
    "LAB_TECHNICIAN",
    "WORKSHOP_MECHANIC",
  ];
  return validRoles.includes(role as UserRole);
}

// ─── Endpoint Guard Factories ─────────────────────────────────────────────────

/**
 * Returns the list of roles that are allowed to access a route
 * requiring the given permission.
 */
export function getRolesWithPermission(permission: Permission): UserRole[] {
  return (Object.entries(ROLE_PERMISSIONS) as [UserRole, Permission[]][])
    .filter(([, perms]) => perms.includes(permission))
    .map(([role]) => role);
}

// ─── Module-Level Access Maps (for UI rendering) ──────────────────────────────

/**
 * Maps ERP module names to the minimum permission required to VIEW them.
 * Used by the mobile/web client to build dynamic navigation menus.
 */
export const MODULE_ACCESS_MAP: Record<string, Permission> = {
  dashboard: PERMISSIONS.ORDER_READ,
  orders: PERMISSIONS.ORDER_READ,
  dispatch: PERMISSIONS.TRIP_READ,
  weighbridge: PERMISSIONS.WEIGHBRIDGE_READ,
  quality: PERMISSIONS.LAB_READ,
  inventory: PERMISSIONS.INVENTORY_READ,
  workshop: PERMISSIONS.WORKSHOP_READ,
  finance: PERMISSIONS.FINANCE_READ,
  fleet: PERMISSIONS.FLEET_READ,
  users: PERMISSIONS.USER_READ,
  audit: PERMISSIONS.AUDIT_LOG_READ,
  settings: PERMISSIONS.SYSTEM_SETTINGS,
};
