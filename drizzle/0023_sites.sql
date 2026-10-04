-- 0023_sites — plant + branch location register (سجل مواقع المصنع والفروع)
--
-- WHY THIS EXISTS
--   Vehicle monitoring needs a fixed origin: "which branch is this truck nearest,
--   how far is it from the plant, has it arrived yet". `tenants` carried only a
--   plant NAME, and the two existing coordinate tables are both the wrong home:
--   `delivery_sites` belongs to a client, and `hr_zones` is where workers clock
--   in. So there was nowhere to record that the plant is *here*.
--
--   One table for the plant and its branches, distinguished by `site_type`, so
--   "the main plant" is just a row rather than a column on `tenants` that would
--   have to be nulled and re-pointed when a company has two yards.
--
-- DESIGN NOTES
--   * Coordinates are NOT NULL. A site that cannot be located cannot fence, and a
--     site that cannot fence is just an address — the whole point of this table
--     is the map, so an unlocatable row is rejected rather than stored as NULL.
--   * latitude/longitude are range-checked. A sign-flipped longitude silently
--     puts a plant in the ocean and every geofence then reports "arrived" or
--     "never" forever, which is the kind of bug nobody notices for a month.
--   * One primary site per tenant, enforced by a PARTIAL unique index rather
--     than application code, so two concurrent saves cannot both claim it.
--   * Soft delete only (`is_active`): telemetry keeps arriving for a site that
--     closed, and hard-deleting would leave those readings pointing at nothing.

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."site_type" AS ENUM('PLANT', 'BRANCH', 'STATION', 'YARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "tenant_id" uuid NOT NULL,
  "site_code" varchar(30) NOT NULL,
  "site_name" varchar(200) NOT NULL,

  -- PLANT = the main batching plant; BRANCH = a satellite yard; STATION = a
  -- batch station; YARD = a storage/loading yard with no batching.
  "site_type" "site_type" NOT NULL DEFAULT 'BRANCH',

  "address_line" text,
  "city" varchar(100),

  -- Required. See header: a site that cannot be located cannot be fenced.
  "latitude" numeric(10, 7) NOT NULL,
  "longitude" numeric(10, 7) NOT NULL,

  -- How close counts as "arrived", in metres.
  "geofence_radius_metres" integer NOT NULL DEFAULT 200,

  -- The one site a company is measured from. Partial-unique below.
  "is_primary" boolean NOT NULL DEFAULT false,

  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,

  "created_by_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),

  CONSTRAINT "sites_latitude_range"  CHECK ("latitude"  BETWEEN  -90 AND  90),
  CONSTRAINT "sites_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
  -- A zero or negative radius would make "arrived" either unreachable or
  -- meaningless, so it is refused rather than clamped.
  CONSTRAINT "sites_radius_positive" CHECK ("geofence_radius_metres" > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES / CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "sites"
    ADD CONSTRAINT "sites_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sites"
    ADD CONSTRAINT "sites_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Code is unique per company, NOT globally: two companies may both call their
-- main plant "HQ", and forcing global uniqueness would make the second signup
-- fail for no business reason.
CREATE UNIQUE INDEX IF NOT EXISTS "sites_tenant_code_unique"
  ON "sites" USING btree ("tenant_id", "site_code");

-- One primary site per tenant. Partial, so branches are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "sites_one_primary_per_tenant"
  ON "sites" USING btree ("tenant_id") WHERE "is_primary" = true;

-- Index names are schema-global in Postgres, and `delivery_sites` already owns
-- the whole `idx_sites_*` namespace. Naming these the obvious thing made
-- `CREATE INDEX IF NOT EXISTS idx_sites_tenant` a silent no-op — the name was
-- taken, so this table shipped with no tenant index at all and nothing warned.
-- Hence the `company_sites` prefix: distinct, and not a trap for whoever adds
-- the next `idx_sites_*` index.
CREATE INDEX IF NOT EXISTS "idx_company_sites_tenant"
  ON "sites" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_company_sites_type"
  ON "sites" USING btree ("site_type");
CREATE INDEX IF NOT EXISTS "idx_company_sites_active"
  ON "sites" USING btree ("tenant_id", "is_active");

-- Nearest-site lookups ("which branch is this truck closest to") filter on
-- coordinates. A composite index on (tenant, lat, lng) lets the planner prune
-- by tenant before scanning coordinates rather than the reverse.
CREATE INDEX IF NOT EXISTS "idx_company_sites_coords"
  ON "sites" USING btree ("tenant_id", "latitude", "longitude");

-- A site that was primary must keep exactly one primary. Deactivating or
-- deleting the primary without promoting a replacement would leave the company
-- with no origin for distance and arrival maths.
--
-- The `s.id <> OLD.id` is load-bearing. This is a BEFORE trigger, so the row
-- being changed is still present and still flagged is_primary — without
-- excluding it, the EXISTS below always finds itself and the guard never fires.
-- (It was written without the exclusion first, and the test suite caught exactly
-- that: deactivating the only primary succeeded.)
CREATE OR REPLACE FUNCTION public.sites_guard_primary() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant uuid;
  v_id    uuid;
BEGIN
  IF NOT OLD.is_primary THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Only a deactivation or a delete can orphan the company.
  IF TG_OP = 'UPDATE' AND (NEW.is_active IS NOT FALSE) THEN
    RETURN NEW;
  END IF;

  v_tenant := OLD.tenant_id;
  v_id     := OLD.id;

  IF NOT EXISTS (
    SELECT 1 FROM sites s
    WHERE s.tenant_id = v_tenant AND s.is_primary AND s.id <> v_id
  ) THEN
    RAISE EXCEPTION
      'cannot remove the primary site of this company — promote another site to primary first'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_sites_guard_primary ON sites;
CREATE TRIGGER trg_sites_guard_primary
  BEFORE DELETE OR UPDATE OF is_active ON sites
  FOR EACH ROW EXECUTE FUNCTION public.sites_guard_primary();