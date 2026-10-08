/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Role-Based Access Control (RBAC) — 12-Role Permission Matrix
 * ============================================================
 *
 *  6 PRIMARY ERP ROLES (web / mobile):
 *  ─────────────────────────────────────────────────────────
 *   1. SUPER_ADMIN        Full unrestricted access
 *   2. FINANCE            Order approval, credit limit checks, invoice mgmt
 *   3. SALES_REP          Order creation, site geolocation
 *   4. DRIVER             Trip timeline, geofence, fuel logs
 *   5. RND_MANAGER        Development plans, task distribution, follow-up
 *   6. HR_OFFICER         Leave/advance review, broadcasts, payroll support
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
  /**
   * See WHERE the vehicles are — every truck's last GPS fix, its distance to the
   * sites, whether it is inside a geofence.
   *
   * Deliberately separate from FLEET_READ, which is about the vehicle RECORD
   * (code, type, plate, assignment). A driver needs the record of the truck he is
   * driving and has no reason to see where his colleagues' trucks are, so holding
   * FLEET_READ must not imply this. Granting it to DRIVER was considered and
   * rejected: a driver's own position comes from his own phone, so the whole-fleet
   * map is pure surplus — and it is the kind of surplus that becomes a habit.
   *
   * Note that a driver reads his own position through /api/sites/near instead,
   * which answers "how far am I from the plant" without touching the fleet.
   */
  FLEET_POSITION_READ: "fleet:position:read",

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

  // ── Research & Development (the factory brain) ──────────────
  RND_READ: "rnd:read",                       // View plans, tasks, reports
  RND_WRITE: "rnd:write",                     // Create/update plans, tasks, issues, evaluations
  RND_APPROVE: "rnd:approve",                 // Approve plans & evaluations (RND Manager / Plant Mgr)
  RND_FINANCE_APPROVE: "rnd:finance_approve", // Approve plan budgets (Finance / Accountant)

  // ── Sales Quoting (Epic 8) ──────────────────────────────────
  RFQ_APPROVE: "rfq:approve",                 // Approve quotes & commissions (Plant Mgr / GM)

  // ── GCC Payroll (Epic 9) ────────────────────────────────────
  HR_READ: "hr:read",                         // View employees, runs, payslips
  HR_WRITE: "hr:write",                       // Manage employees & payroll runs

  // ── Asset QR Identity (Epic 14) ───────────────────────────────
  /**
   * Scan any asset QR label and get the REDACTED answer.
   * Deliberately weaker than the label's real record: a driver who scans a
   * mixer truck should learn which truck it is and who is driving it, not read
   * its maintenance history. This permission alone reveals nothing sensitive.
   */
  QR_SCAN: "qr:scan",
  /**
   * See the FULL record behind a scanned label — every repair, every oil
   * change, every part ever fitted. Granted to the mechanic, the workshop
   * manager and the plant manager, because those three need it to do the job.
   */
  QR_READ_FULL: "qr:read_full",
  /** Mint, print and retire QR labels (sticker stock is a controlled thing). */
  QR_LABEL_PRINT: "qr:label_print",

  // ── Procurement (المشتريات: طلب + 3 عروض + اعتمادان + توريد) ──
  /** Raise a purchase request and attach supplier quotes. */
  PROCURE_REQUEST: "procure:request",
  /** First approval: reviewer (finance) signs the chosen quote. */
  PROCURE_REVIEW: "procure:review",
  /** Final approval + disbursement (procurement manager / plant owner). */
  PROCURE_APPROVE: "procure:approve",

  // ── Warehouse: Spares (قطع الغيار) + Scrap (الهالك) ───────────
  WAREHOUSE_READ: "warehouse:read",
  WAREHOUSE_WRITE: "warehouse:write",
  /**
   * Write stock off for good (DISPOSE). Kept apart from WAREHOUSE_WRITE on
   * purpose: issuing a part is routine, but destroying the evidence that a part
   * exists is exactly what the anti-fraud trail depends on.
   */
  WAREHOUSE_DISPOSE: "warehouse:dispose",
  /** Move stock into / out of the scrap warehouse. */
  WAREHOUSE_SCRAP: "warehouse:scrap",

  // ── Company sites (مصنع + فروع) ─────────────────────────────────
  /**
   * See where the plant and its branches are.
   *
   * Read, not write, and deliberately broad: dispatch and driving are both
   * distance questions ("which yard is this load for", "am I back at the
   * plant"), so a role that cannot read the site list cannot answer either.
   */
  SITE_READ: "site:read",
  /**
   * Add, move, rename or retire a site, and change which one is primary.
   *
   * This is the one that moves every distance and arrival calculation in the
   * system, so it stays with the plant owner and above — a dispatcher choosing
   * where the plant is would be choosing the answer to every ETA.
   */
  SITE_WRITE: "site:write",

  // ── Employee Master (سجلات الموظفين) ──────────────────────────
  /** View the employee master record (identity, job, contact, documents). */
  EMPLOYEE_READ: "employee:read",
  /**
   * Create workers, edit their records, and issue their employee QR cards.
   * Held by HR_MANAGER — the officer files requests, the manager owns people.
   */
  EMPLOYEE_WRITE: "employee:write",
  /** Register plant equipment (معدات) and issue its QR label. */
  EQUIPMENT_WRITE: "equipment:write",

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
    PERMISSIONS.PROCURE_REQUEST,
    PERMISSIONS.PROCURE_REVIEW, // reviewer: first approval
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
    PERMISSIONS.RND_READ,            // Review R&D plan budgets awaiting approval
    PERMISSIONS.RND_FINANCE_APPROVE, // Approve / reject R&D plan budgets
    PERMISSIONS.HR_READ,             // Payroll visibility for costing
    PERMISSIONS.HR_WRITE,            // Run monthly payroll
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
    PERMISSIONS.RND_READ,
    PERMISSIONS.RND_FINANCE_APPROVE,
    PERMISSIONS.HR_READ,
    PERMISSIONS.HR_WRITE,
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
    PERMISSIONS.PROCURE_REQUEST,
    PERMISSIONS.PROCURE_REVIEW,
    PERMISSIONS.PROCURE_APPROVE,
    PERMISSIONS.SYSTEM_SETTINGS,
    PERMISSIONS.AUDIT_LOG_READ,
    PERMISSIONS.RND_READ,     // Plant manager sees R&D plans & progress
    PERMISSIONS.RND_APPROVE,  // Plant manager co-owns plan approval
    PERMISSIONS.RFQ_APPROVE,  // Plant manager signs off quotes & commissions (GM)
    PERMISSIONS.HR_READ,      // Plant manager sees payroll
    PERMISSIONS.HR_WRITE,     // Plant manager approves payroll
    PERMISSIONS.EMPLOYEE_READ,
    // ── Asset QR ── the owner sees the complete record behind any scan
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.QR_READ_FULL,
    PERMISSIONS.QR_LABEL_PRINT,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.WAREHOUSE_WRITE, // owner receives/issues like the storekeeper
    PERMISSIONS.WAREHOUSE_SCRAP,
    PERMISSIONS.EQUIPMENT_WRITE,
    PERMISSIONS.SITE_READ,
    // …and SITE_WRITE: the owner is the only role that can say where the plant
    // is. Everyone below may read that answer; nobody below may change it.
    PERMISSIONS.SITE_WRITE,
    // The owner also sees where the fleet actually is.
    PERMISSIONS.FLEET_POSITION_READ,
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
    // Where the trucks are. A rep quoting a delivery has to say when it lands,
    // and "which mixer is free and how far is it from this job" is the only
    // honest answer — a rep guessing a time is how a 14:00 promise becomes a
    // 17:00 arrival and an angry customer call.
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
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
    // Redacted scan only — a driver can confirm a truck or a concrete sample
    // is the right one, but sees no maintenance or cost history.
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.SITE_READ,
    // ── No FLEET_POSITION_READ here, on purpose.
    // The driver knows where HE is from his own phone (POST live-location), and
    // /api/sites/near answers "how far am I from the plant" from that. Seeing the
    // whole fleet's map is not part of the job. Note this is a genuine restriction,
    // not a non-grant: PLANT_MGR holds both FLEET_READ and FLEET_POSITION_READ, so
    // the two permissions are genuinely separate and the endpoint cannot rely on
    // FLEET_READ being absent.
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
    // ── Asset QR ── the mechanic sees the COMPLETE vehicle record behind a
    // scan (repairs, oils, every part ever fitted). Without this they would
    // be diagnosing a truck they are not allowed to read the history of.
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.QR_READ_FULL,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.WAREHOUSE_WRITE, // fits and removes parts all day
    PERMISSIONS.WAREHOUSE_SCRAP, // binning a dead part is the mechanic's job
    PERMISSIONS.SITE_READ,
    // Where every truck is. Fetching a broken mixer off a road and off a
    // customer's site is the mechanic's whole job, so "where is it" is a tool
    // rather than surveillance — and its arrival at the yard is how anyone
    // confirms the recovery actually happened.
    PERMISSIONS.FLEET_POSITION_READ,
    // …but NOT warehouse:dispose. Selling or dumping stock for good is the one
    // stores action that can erase the evidence a part ever existed, so it stays
    // with the workshop manager and above. The mechanic can put a part in the
    // scrap bin; only a manager can make it disappear.
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
    // Redacted scans only: confirms which truck a label belongs to and who is
    // driving it, without opening the maintenance record.
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.SITE_READ,
    // Dispatch is the job that sends trucks where — it is the one role below the
    // owner that must see where they all are, to answer "which mixer is free and
    // how far is it from the job".
    PERMISSIONS.FLEET_POSITION_READ,
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
    PERMISSIONS.PROCURE_REQUEST,
    PERMISSIONS.WORKSHOP_CREATE_ORDER,
    PERMISSIONS.WORKSHOP_UPDATE_ORDER,
    PERMISSIONS.WORKSHOP_CLOSE_ORDER,
    PERMISSIONS.WORKSHOP_MANAGE,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.FUEL_LOG_RECORD,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_RECEIVE, // Spare-parts receipt
    PERMISSIONS.TRIP_READ,
    // ── Asset QR ── full record + runs both warehouses
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.QR_READ_FULL,
    PERMISSIONS.QR_LABEL_PRINT,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.WAREHOUSE_WRITE,
    PERMISSIONS.WAREHOUSE_SCRAP,
    PERMISSIONS.WAREHOUSE_DISPOSE,
    PERMISSIONS.EQUIPMENT_WRITE,
    // Read-only site list: deciding which yard a broken truck was recovered to,
    // and whether the parts run left that site, is workshop work.
    PERMISSIONS.SITE_READ,
    // …and where every truck is. The workshop has to send a recovery crew, so
    // the last known position is how that crew gets directed, and how a truck
    // "missing since Tuesday" gets settled.
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  // ── Primary role: R&D Manager (مدير البحث والتطوير) ─────────────────────
  // Owns the factory brain: records the current state, creates development
  // plans, distributes tasks to staff, tracks weekly progress, logs
  // off-plan issues, and evaluates employees. Cannot approve budgets —
  // that stays with FINANCE via RND_FINANCE_APPROVE.
  RND_MANAGER: [
    PERMISSIONS.RND_READ,
    PERMISSIONS.RND_WRITE,
    PERMISSIONS.RND_APPROVE,
    PERMISSIONS.ORDER_READ,      // Read orders to split production targets across reps
    PERMISSIONS.TRIP_READ,       // Read delivery reality for weekly follow-up
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.FINANCE_READ,    // Read-only visibility of financial standing
    PERMISSIONS.USER_READ,       // List staff for task assignment
    // Field work is how R&D gets its data: which plant ran a trial mix, and how
    // far the truck was from that site when it did, is the context behind any
    // strength or slump result. So it reads the sites and the fleet positions.
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  // ── Primary role: HR Officer (موظف الموارد البشرية) ─────────────────────
  // Bridges every employee and HR: reviews leave/advance requests,
  // broadcasts announcements, supports payroll. Cannot touch finance
  // approvals, dispatch or production controls.
  HR_OFFICER: [
    PERMISSIONS.HR_READ,
    PERMISSIONS.HR_WRITE,
    PERMISSIONS.USER_READ,       // Staff directory for request context
    PERMISSIONS.ORDER_READ,      // Read-only delivery context (no mutation)
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.QR_SCAN,         // Redacted scans only — no full vehicle record
    // Command-center broadcast (TV screen): read-only sections degrade by 403,
    // so these four complete the map + KPIs. No mutation: target editing stays
    // SITE_WRITE (plant owner), workshop/finance actions untouched.
    PERMISSIONS.SITE_READ,           // plant + branches on the broadcast map
    PERMISSIONS.FLEET_POSITION_READ, // vehicles on the map (plate/code only, no driver identity)
    PERMISSIONS.INVENTORY_READ,      // silo levels on the broadcast
    PERMISSIONS.WORKSHOP_READ,       // open tickets + fuel anomalies on the broadcast
  ],

  // ── Primary role: HR Manager (مدير الموارد البشرية) ───────────────────────
  //  Owns the employee master end to end. The HR_OFFICER above processes what
  //  employees file; this role decides WHO EXISTS — it creates workers, edits
  //  their records, issues and reprints their employee QR cards, and can pull
  //  the full record behind a scan of an employee badge. Payroll approval stays
  //  with PLANT_MGR / ACCOUNTANT: staffing the plant and paying for it are
  //  separate powers, and the manager who hires should not also authorise the
  //  payment.
  HR_MANAGER: [
    PERMISSIONS.HR_READ,
    PERMISSIONS.HR_WRITE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.EMPLOYEE_READ,
    PERMISSIONS.EMPLOYEE_WRITE,   // add workers, edit records, code employees
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.QR_READ_FULL,     // full record behind an employee badge scan
    PERMISSIONS.QR_LABEL_PRINT,   // issue + reprint employee QR cards
    PERMISSIONS.FLEET_READ,       // read-only fleet context (driver ↔ vehicle)
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.ORDER_READ,
    // Same broadcast grant as HR_OFFICER (read-only TV screen).
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.WORKSHOP_READ,
  ],

  // ══════════════════════════════════════════════════════════════════════════
  //  Roles that exist in the live database but were never declared here
  // ══════════════════════════════════════════════════════════════════════════
  // These ten were created directly in Postgres. Because `ROLE_PERMISSIONS` is a
  // Record keyed by the `UserRole` union, each of them resolved to `undefined`
  // and `roleHasPermission` returned false for every permission — so these were
  // not under-privileged accounts, they were accounts that could do nothing.
  //
  // Each is granted the set matching the role it plainly duplicates in the live
  // data (the alias is named in the comment). That mapping is an inference from
  // the role name and what the plant actually does all day, not something the
  // owner specified — so it is worth a look before it ships. The grant that
  // matters most for the anti-fraud story is MECHANIC and STOREKEEPER: a mechanic
  // who cannot record work and a storekeeper who cannot move stock make the
  // parts trail unreliable, which is the whole point of recording it.
  CFO: [
    // Mirrors FINANCE (same job, the name the live plant uses). No HR_WRITE:
    // staffing and paying are separate powers, and FINANCE deliberately has only
    // HR_READ.
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_APPROVE_FINANCE,
    PERMISSIONS.ORDER_REJECT_FINANCE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.PROCURE_REQUEST,
    PERMISSIONS.PROCURE_REVIEW,
    PERMISSIONS.PROCURE_APPROVE, // procurement manager: final + disburse
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
    PERMISSIONS.RND_READ,
    PERMISSIONS.RND_FINANCE_APPROVE,
    PERMISSIONS.HR_READ,
    PERMISSIONS.SITE_READ,
  ],

  SCHEDULE_MGR: [
    // Mirrors DISPATCHER (same job). Scheduling is a promise about time and
    // place, so it needs both: which site a job is at, and which trucks are free
    // to reach it.
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_SCHEDULE,
    PERMISSIONS.TRIP_CREATE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.TRIP_CANCEL,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  OPERATIONS_MGR: [
    // Plant-side operations: batching, weighing, materials, the floor. Built from
    // BATCH_OPERATOR + PLANT_MGR's operational half rather than invented.
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_SCHEDULE,
    PERMISSIONS.TRIP_CREATE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.TRIP_CANCEL,
    PERMISSIONS.BATCH_START,
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.BATCH_OVERRIDE_CALIBRATION,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.WEIGHBRIDGE_RECORD,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.LAB_ENV_COMPENSATION,
    PERMISSIONS.MIX_READ,
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.PROCURE_REQUEST,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_STATUS_MUTATION,
    // Multi-plant operations is exactly what the sites table exists to express:
    // which yard is producing, and how far every truck is from each of them.
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  PRODUCTION_MGR: [
    // Production and mix-design conformance: BATCH_OPERATOR plus design authority.
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.BATCH_START,
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.BATCH_OVERRIDE_CALIBRATION,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.LAB_ENV_COMPENSATION,
    PERMISSIONS.MIX_READ,
    PERMISSIONS.PROCURE_REQUEST,
    PERMISSIONS.MIX_DESIGN_MANAGE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.WEIGHBRIDGE_RECORD,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  REPS_MGR: [
    // Mirrors SALES_REP, plus finance approval over the team's orders — which is
    // what PLANT_MGR holds and FINANCE/RND_FINANCE_APPROVE is built around.
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.ORDER_APPROVE_FINANCE,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.RFQ_APPROVE,
    // Same reasoning as SALES_REP: a quoted delivery time has to be grounded in
    // where the trucks actually are.
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  STOREKEEPER: [
    // Materials and spares: receive, move, count. Note no WAREHOUSE_DISPOSE —
    // that stays with WORKSHOP_MGR, because making stock vanish is the one stores
    // action that can erase the evidence a part ever existed.
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_RECEIVE,
    PERMISSIONS.INVENTORY_ADJUST,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.WAREHOUSE_WRITE,
    PERMISSIONS.PROCURE_REQUEST, // purchase rep: raises requests + quotes
    PERMISSIONS.WAREHOUSE_SCRAP,
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.SITE_READ,
  ],

  MECHANIC: [
    // Mirrors WORKSHOP_MECHANIC. A mechanic who cannot record the work is what
    // makes the parts trail unreliable, so this grant list is the anti-fraud
    // story: log the repair, log the part, close the order.
    PERMISSIONS.WORKSHOP_READ,
    PERMISSIONS.WORKSHOP_CREATE_ORDER,
    PERMISSIONS.WORKSHOP_UPDATE_ORDER,
    PERMISSIONS.WORKSHOP_CLOSE_ORDER,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.FLEET_MARK_BREAKDOWN,
    PERMISSIONS.FUEL_LOG_READ,
    PERMISSIONS.FUEL_LOG_RECORD,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.QR_SCAN,
    PERMISSIONS.QR_READ_FULL,
    PERMISSIONS.WAREHOUSE_READ,
    PERMISSIONS.WAREHOUSE_WRITE,
    PERMISSIONS.WAREHOUSE_SCRAP,
    PERMISSIONS.SITE_READ,
    // Sending a recovery crew needs the last known position.
    PERMISSIONS.FLEET_POSITION_READ,
  ],

  STATION_TECH: [
    // Weighbridge / plant station operator.
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.WEIGHBRIDGE_RECORD,
    PERMISSIONS.WEIGHBRIDGE_VERIFY_CHAIN,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.SITE_READ,
  ],

  BATCH_OP: [
    // Mirrors BATCH_OPERATOR — the same job under the name the plant uses.
    PERMISSIONS.BATCH_START,
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.LAB_ENV_COMPENSATION,
    PERMISSIONS.LAB_READ,
    PERMISSIONS.MIX_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.TRIP_READ,
    PERMISSIONS.WEIGHBRIDGE_READ,
    PERMISSIONS.WEIGHBRIDGE_RECORD,
    PERMISSIONS.SITE_READ,
  ],

  LAB_MGR: [
    // LAB_TECH's grants plus mix-design authority, which is the approval the
    // plant actually needs from a lab manager.
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
    PERMISSIONS.BATCH_START,
    PERMISSIONS.FLEET_READ,
    PERMISSIONS.SITE_READ,
    PERMISSIONS.FLEET_POSITION_READ,
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
    "RND_MANAGER",
    "HR_OFFICER",
    "HR_MANAGER",
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
  rnd: PERMISSIONS.RND_READ,
  users: PERMISSIONS.USER_READ,
  audit: PERMISSIONS.AUDIT_LOG_READ,
  settings: PERMISSIONS.SYSTEM_SETTINGS,
  warehouse: PERMISSIONS.WAREHOUSE_READ,
  equipment: PERMISSIONS.QR_SCAN,
  employees: PERMISSIONS.EMPLOYEE_READ,
};
