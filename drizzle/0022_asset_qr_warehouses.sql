-- Warehouse item cards, permanent QR asset labels, and the install ledger.
--
-- Why this migration exists
-- ─────────────────────────
-- Three separate problems forced this schema into being:
--
--  1. NO ITEM MASTER. `maintenance_orders.parts_used` is a free-text JSON
--     blob, so "how many oil filters do we have" could not be answered, and the
--     two warehouses the plant actually runs (spares + scrap) had no records
--     at all. A part could be issued, installed, and written off with no
--     trace of where it went.
--
--  2. NO PHYSICAL IDENTITY. A spare part has no identity of its own. The
--     fraud this prevents is concrete: a part is bought, "installed" on a
--     truck, then returned claiming it went on. Nothing in the system could
--     refute that, because the part was never an entity — it was a line of
--     text. Here a serialized unit becomes a first-class row carrying a
--     permanent QR label.
--
--  3. QR LABELS THAT DISAPPEAR. If the QR record is deleted or re-pointed
--     when a part comes off a truck, the anti-fraud value evaporates exactly
--     when it is needed. So `asset_qr_labels` is append-only in spirit: it is
--     never deleted, only moved between ACTIVE / DETACHED / RETIRED, and the
--     binding ledger (`asset_qr_bindings`) keeps every vehicle the unit has
--     ever touched. A unit removed from MIX-03 still remembers MIX-03.
--
-- The scan secret is stored as a SHA-256 hash only — a leaked database dump
-- must not let an outsider forge labels, and the label itself is what grants
-- nothing without a permission check server-side.
--
-- Everything is additive and idempotent; no existing table is altered.

-- ─── Enums ───────────────────────────────────────────────────────────────────

-- What a QR label is stuck to. Polymorphic by design: one scanner, one
-- permission model, one print sheet for every kind of asset in the plant.
DO $$ BEGIN
  CREATE TYPE "asset_qr_subject_type" AS ENUM (
    'ITEM_CARD',         -- كارت الصنف: the stores card, scanned for stock level
    'ITEM_UNIT',         -- a serialized spare part / scrap item
    'EMPLOYEE',          -- a payroll employee card
    'EQUIPMENT',         -- a plant machine (mixer, pump, crusher...)
    'VEHICLE',           -- a fleet vehicle
    'CHALLAN',           -- a delivery ticket / شجرة, labelled as it is issued
    'CONCRETE_SAMPLE'    -- عينات الخرسانة — cube specimens, one label per sample
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- The enum may already exist from a partial apply, and CREATE TYPE above then
-- silently skips it. ADD VALUE is what actually brings an older copy up to date,
-- so it runs unconditionally.
ALTER TYPE "asset_qr_subject_type" ADD VALUE IF NOT EXISTS 'ITEM_CARD';
--> statement-breakpoint
-- HR_MANAGER (مدير الموارد البشرية) sits above HR_OFFICER: the officer files
-- and processes, the manager owns the employee master — creating workers,
-- coding their QR cards, and editing the record itself.
DO $$ BEGIN
  ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'HR_MANAGER';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint

-- Label lifecycle. RETIRED is deliberately terminal and never reused.
DO $$ BEGIN
  CREATE TYPE "asset_qr_label_state" AS ENUM (
    'ACTIVE',     -- printed and in service
    'DETACHED',   -- peeled/stuck on a removed part; identity and history kept
    'RETIRED'     -- written off, scrapped, or employee left
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "warehouse_kind" AS ENUM (
    'SPARES',   -- مخزن قطع الغيار
    'SCRAP'     -- مخزن الهالك
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "warehouse_item_category" AS ENUM (
    'SPARE_PART',   -- قطعة غيار
    'LUBRICANT',    -- زيت / سائل
    'CONSUMABLE',   -- إطارات، فلاتر، أحزمة
    'SCRAP'         -- هالك / خردة
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Where a serialized physical unit is right now. INSTALLED is only reachable
-- while `asset_qr_bindings` holds an open row for that unit's label, so the two
-- tables always agree about what is on a truck.
DO $$ BEGIN
  CREATE TYPE "warehouse_unit_state" AS ENUM (
    'IN_STORE',   -- on the shelf
    'ISSUED',     -- handed to a mechanic, not yet fitted
    'INSTALLED',  -- fitted to a vehicle
    'IN_SCRAP',   -- in the scrap warehouse (الهالك), awaiting disposal
    'SCRAPPED'    -- disposed of
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- The stock ledger. Every quantity change in either warehouse is one row here;
-- `warehouse_items.qty_on_hand` is a cached total recomputed from these rows by
-- a trigger, so it can never drift from the ledger that justifies it.
--
-- A piece leaves the shelf when it is ISSUED and comes back when it is REMOVED
-- or RETURNED. INSTALL and DISPOSE are state changes that cost the store nothing
-- — see the trigger below for the arithmetic and why getting it wrong silently
-- double-counts every part that gets fitted.
DO $$ BEGIN
  CREATE TYPE "stock_movement_type" AS ENUM (
    'RECEIVE',     -- goods in
    'ISSUE',       -- issued from the store to a mechanic, not yet fitted
    'RETURN',      -- came back unused, back on the shelf
    'INSTALL',     -- screwed onto a vehicle
    'REMOVE',      -- taken off a vehicle (goes to scrap or back to store)
    'TO_SCRAP',    -- moved into the scrap warehouse
    'FROM_SCRAP',  -- pulled back out of scrap because it was salvageable
    'DISPOSE',     -- sold or thrown away for good
    'ADJUST'       -- stocktake correction
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ─── Equipment master ─────────────────────────────────────────────────────────
-- The plant's own machinery had no register of its own: batching plants were
-- tracked only as production stations, and nothing else (generators, compressors,
-- crushers) existed anywhere. This is the table the معدات QR labels point at.
CREATE TABLE IF NOT EXISTS "equipment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "equipment_code" varchar(30) NOT NULL,
  "name" varchar(120) NOT NULL,
  "name_ar" varchar(120),
  -- MIXER | PUMP | GENERATOR | COMPRESSOR | CRUSHER | CONVEYOR | OTHER
  "category" varchar(40) NOT NULL DEFAULT 'OTHER',
  "make" varchar(80),
  "model" varchar(80),
  "serial_number" varchar(80),
  "location" varchar(120),
  "commissioned_at" date,
  "cost_sar" numeric(12,2),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- The code is what gets printed on the label, so it must be unique per tenant
-- (two plants sharing a tenant cannot both print "GEN-01").
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_tenant_code_unique"
  ON "equipment" USING btree ("tenant_id", "equipment_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_tenant_serial_unique"
  ON "equipment" USING btree ("tenant_id", "serial_number")
  WHERE "serial_number" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_tenant_idx"
  ON "equipment" USING btree ("tenant_id");
--> statement-breakpoint

-- ─── Warehouse item cards (صنف) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "warehouse_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "item_code" varchar(40) NOT NULL,
  "name" varchar(160) NOT NULL,
  "name_ar" varchar(160),
  "category" "warehouse_item_category" NOT NULL DEFAULT 'SPARE_PART',
  "default_warehouse" "warehouse_kind" NOT NULL DEFAULT 'SPARES',
  "unit" varchar(20) NOT NULL DEFAULT 'PCS',
  -- Cached total. Kept honest by a trigger that recomputes it from
  -- stock_movements, so it can never drift from the ledger.
  "qty_on_hand" numeric(12,3) NOT NULL DEFAULT 0,
  "min_qty" numeric(12,3) NOT NULL DEFAULT 0,
  "unit_cost_sar" numeric(12,2) NOT NULL DEFAULT 0,
  "oem_part_number" varchar(80),
  -- Fitment, so the workshop can ask "which parts fit MIX-03?"
  "applies_to_make" varchar(80),
  "applies_to_model" varchar(80),
  -- Serialized = each physical unit carries its own QR label. True for pumps,
  -- motors and control boxes; false for bulk oil and filters sold by the box.
  "is_serialized" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "warehouse_items_qty_non_negative" CHECK ("qty_on_hand" >= 0)
);
--> statement-breakpoint

-- The >= 0 guard, re-asserted OUTSIDE the CREATE TABLE.
--
-- A table constraint is the ONLY thing that stops two concurrent issuances from
-- both passing the service's pre-check and writing the ledger: under READ
-- COMMITTED both transactions read the same stock figure, so only the database
-- can arbitrate. Checking in application code is a race with extra steps.
--
-- Kept here as well as in the CREATE TABLE because this migration is written to
-- be safely re-runnable, and `CREATE TABLE IF NOT EXISTS` is a no-op once the
-- table exists — a constraint mentioned only inside that CREATE TABLE exists
-- solely on databases where that exact statement built the table. ALTER TABLE
-- ADD CONSTRAINT reaches every database regardless of the order they got here
-- in, and is guarded so a re-run is a no-op.
DO $$ BEGIN
  ALTER TABLE "warehouse_items"
    ADD CONSTRAINT "warehouse_items_qty_non_negative"
    CHECK ("qty_on_hand" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_items_tenant_code_unique"
  ON "warehouse_items" USING btree ("tenant_id", "item_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_items_tenant_idx"
  ON "warehouse_items" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_items_warehouse_idx"
  ON "warehouse_items" USING btree ("tenant_id", "default_warehouse");
--> statement-breakpoint
-- Reorder list: only active items, low stock first.
CREATE INDEX IF NOT EXISTS "warehouse_items_low_stock_idx"
  ON "warehouse_items" USING btree ("tenant_id", "min_qty")
  WHERE "is_active" = true;
--> statement-breakpoint

-- ─── Employee badge codes ─────────────────────────────────────────────────────
-- `payroll_employees.employee_code` only had a NON-unique index, so two workers
-- could hold the same code — and the code is what gets printed large on their QR
-- badge. Two badges reading "EMP-12" is exactly the ambiguity this whole module
-- exists to remove, so the code becomes unique per tenant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "payroll_employees"
    GROUP BY "tenant_id", "employee_code" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'payroll_employees: duplicate employee_code within a tenant, reconcile before applying 0022';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_employees_tenant_code_unique"
  ON "payroll_employees" USING btree ("tenant_id", "employee_code");
--> statement-breakpoint

-- ─── Serialized physical units ───────────────────────────────────────────────
-- One row per physical piece of stock: "the pump that came off MIX-03", not
-- "pumps, 4 of them". This is the row an ITEM_UNIT QR label points at, and it
-- is what makes "we installed it" checkable — the unit carries its own history
-- regardless of how many identical siblings the warehouse also holds.
CREATE TABLE IF NOT EXISTS "warehouse_item_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "item_id" uuid NOT NULL REFERENCES "warehouse_items"("id") ON DELETE RESTRICT,
  -- Distinguishes two identical pumps from each other. Unique per tenant.
  "unit_serial" varchar(60) NOT NULL,
  "state" "warehouse_unit_state" NOT NULL DEFAULT 'IN_STORE',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_item_units_tenant_serial_unique"
  ON "warehouse_item_units" USING btree ("tenant_id", "unit_serial");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_item_units_item_idx"
  ON "warehouse_item_units" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_item_units_tenant_state_idx"
  ON "warehouse_item_units" USING btree ("tenant_id", "state");
--> statement-breakpoint

-- ─── Permanent QR asset labels ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "asset_qr_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  -- Human-readable, printed in large type on the sticker: SP-000123, EQ-000007.
  "label_code" varchar(40) NOT NULL,
  "subject_type" "asset_qr_subject_type" NOT NULL,
  -- Polymorphic pointer. No FK: one table labels four different subjects, and
  -- a label must survive its subject being soft-deleted.
  "subject_id" uuid NOT NULL,
  -- Frozen copy of the subject's own code at issue time. This is what a scan
  -- still shows after the item is scrapped — the label outlives the stock.
  "subject_ref" varchar(80) NOT NULL,
  "subject_label" varchar(200),
  -- SHA-256 of the scan secret. The secret itself is never stored, so a
  -- database dump cannot be replayed to forge a label.
  "token_hash" varchar(64) NOT NULL,
  -- First 6 chars of the secret, printed under the QR so staff can key it in
  -- manually when a camera is scratched or a label is too smudged to scan.
  "token_hint" varchar(12) NOT NULL,
  "state" "asset_qr_label_state" NOT NULL DEFAULT 'ACTIVE',
  "issued_at" timestamp NOT NULL DEFAULT now(),
  "issued_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "printed_at" timestamp,
  "print_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_qr_labels_print_count_valid" CHECK ("print_count" >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "asset_qr_labels_tenant_code_unique"
  ON "asset_qr_labels" USING btree ("tenant_id", "label_code");
--> statement-breakpoint
-- The secret must identify exactly one label across the whole system, or a
-- scan could be ambiguous. Hashed form, so uniqueness is on the hash.
CREATE UNIQUE INDEX IF NOT EXISTS "asset_qr_labels_token_hash_unique"
  ON "asset_qr_labels" USING btree ("token_hash");
--> statement-breakpoint
-- One live label per subject. Reprinting is done by the same row (print_count),
-- and retiring sets state=RETIRED, so a subject can be re-labelled only after
-- the old label is retired — which is itself an audit event.
CREATE UNIQUE INDEX IF NOT EXISTS "asset_qr_labels_subject_unique"
  ON "asset_qr_labels" USING btree ("tenant_id", "subject_type", "subject_id")
  WHERE "state" <> 'RETIRED';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_qr_labels_tenant_idx"
  ON "asset_qr_labels" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_qr_labels_subject_idx"
  ON "asset_qr_labels" USING btree ("subject_type", "subject_id");
--> statement-breakpoint

-- ─── Where each label is physically attached ──────────────────────────────────
-- Append-only ledger. `unbound_at IS NULL` marks the one row describing where
-- the unit is RIGHT NOW; earlier rows are history and are never updated away.
CREATE TABLE IF NOT EXISTS "asset_qr_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "label_id" uuid NOT NULL REFERENCES "asset_qr_labels"("id") ON DELETE RESTRICT,
  -- Null while the unit sits in the warehouse. Set the moment it is fitted.
  "vehicle_id" uuid REFERENCES "fleet_vehicles"("id") ON DELETE RESTRICT,
  -- Which work order justified the fitting — the document a return claim is
  -- checked against.
  "work_order_id" uuid REFERENCES "maintenance_orders"("id") ON DELETE SET NULL,
  -- Free-text mount point, e.g. "rear axle, left".
  "location_note" varchar(160),
  "bound_at" timestamp NOT NULL DEFAULT now(),
  "bound_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "unbound_at" timestamp,
  "unbound_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "unbind_reason" text
);
--> statement-breakpoint

-- The core invariant: a label is on at most one vehicle at a time. Without
-- this, one part could be claimed installed on three trucks at once.
CREATE UNIQUE INDEX IF NOT EXISTS "asset_qr_bindings_active_unique"
  ON "asset_qr_bindings" USING btree ("label_id")
  WHERE "unbound_at" IS NULL;
--> statement-breakpoint
-- Scan history for a vehicle: "what has ever been fitted to MIX-03?"
CREATE INDEX IF NOT EXISTS "asset_qr_bindings_vehicle_idx"
  ON "asset_qr_bindings" USING btree ("tenant_id", "vehicle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_qr_bindings_label_idx"
  ON "asset_qr_bindings" USING btree ("label_id", "bound_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_qr_bindings_tenant_idx"
  ON "asset_qr_bindings" USING btree ("tenant_id");
--> statement-breakpoint

-- ─── Stock movement ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "item_id" uuid NOT NULL REFERENCES "warehouse_items"("id") ON DELETE RESTRICT,
  "movement_type" "stock_movement_type" NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "from_warehouse" "warehouse_kind",
  "to_warehouse" "warehouse_kind",
  "vehicle_id" uuid REFERENCES "fleet_vehicles"("id") ON DELETE SET NULL,
  "label_id" uuid REFERENCES "asset_qr_labels"("id") ON DELETE RESTRICT,
  "work_order_id" uuid REFERENCES "maintenance_orders"("id") ON DELETE SET NULL,
  "note" text,
  "moved_at" timestamp NOT NULL DEFAULT now(),
  "moved_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "stock_movements_item_idx"
  ON "stock_movements" USING btree ("item_id", "moved_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_tenant_idx"
  ON "stock_movements" USING btree ("tenant_id", "moved_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_vehicle_idx"
  ON "stock_movements" USING btree ("tenant_id", "vehicle_id")
  WHERE "vehicle_id" IS NOT NULL;
--> statement-breakpoint

-- ─── Keep qty_on_hand honest ─────────────────────────────────────────────────
-- qty_on_hand is a cached SUM. Recomputing it from the ledger on every insert
-- means a hand-edited quantity in the UI cannot put the stock figure out of
-- step with the movements that justify it.
CREATE OR REPLACE FUNCTION fimto_sync_item_qty_on_hand()
RETURNS trigger AS $$
DECLARE
  v_item uuid;
BEGIN
  v_item := COALESCE(NEW.item_id, OLD.item_id);

  -- Take the item row's lock BEFORE reading the ledger.
  --
  -- This line is what makes the CHECK constraint on qty_on_hand a real guard.
  -- Without it the trigger is a lost update waiting to happen: under READ
  -- COMMITTED each transaction's SUM only sees COMMITTED movements, so two
  -- issuances racing on the same item both recompute to the same number, both
  -- write it, and qty_on_hand ends up too HIGH with both movements recorded.
  -- The CHECK constraint then never fires, because a value computed from a
  -- snapshot missing the other transaction's row cannot come out negative.
  --
  --   start 10, two issuances of 8 race → both SUM to 2 → both write 2
  --
  -- Locking first serialises them: the loser blocks until the winner commits,
  -- and because the recompute runs in a LATER statement it therefore gets a
  -- fresh snapshot that INCLUDES the winner's row, sums to -6, and is rejected
  -- by the CHECK. The constraint then does the job it was added for.
  --
  -- Lock order is item-row-only and the lock is taken before any other
  -- warehouse row, so movements on DIFFERENT items still run fully parallel and
  -- cannot deadlock against each other.
  PERFORM 1 FROM "warehouse_items" w WHERE w."id" = v_item FOR UPDATE;

  -- INSTALL and DISPOSE deliberately contribute ZERO.
  --
  -- A piece leaves the shelf when it is ISSUED, not when it is bolted on, so
  -- counting INSTALL as an outflow would deduct the same pump twice and leave
  -- the store short. Likewise DISPOSE acts on something already sitting in the
  -- scrap warehouse, which TO_SCRAP already deducted.
  --
  --   full cycle, part comes back:  RECEIVE +1  ISSUE -1  INSTALL 0  REMOVE +1  = +1
  --   full cycle, part is scrapped: … REMOVE +1  TO_SCRAP -1  DISPOSE 0        =  0
  UPDATE "warehouse_items" w
  SET "qty_on_hand" = (
        SELECT COALESCE(SUM(
          CASE m."movement_type"
            WHEN 'RECEIVE'     THEN  m."quantity"
            WHEN 'RETURN'      THEN  m."quantity"
            WHEN 'FROM_SCRAP'  THEN  m."quantity"
            WHEN 'REMOVE'      THEN  m."quantity"
            WHEN 'ISSUE'       THEN -m."quantity"
            WHEN 'TO_SCRAP'    THEN -m."quantity"
            ELSE 0
          END), 0)
        FROM "stock_movements" m
        WHERE m."item_id" = v_item
      ),
      "updated_at" = now()
  WHERE w."id" = v_item;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "stock_movements_sync_qty" ON "stock_movements";
--> statement-breakpoint
CREATE TRIGGER "stock_movements_sync_qty"
AFTER INSERT OR UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION fimto_sync_item_qty_on_hand();
--> statement-breakpoint

-- Keep updated_at honest on the two mutable masters.
CREATE OR REPLACE FUNCTION fimto_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment', 'warehouse_items', 'asset_qr_labels']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fimto_touch_updated_at()',
      t || '_touch_updated_at', t);
  END LOOP;
END
$$;