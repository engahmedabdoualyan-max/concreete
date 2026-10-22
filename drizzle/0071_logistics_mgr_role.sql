-- ============================================================================
--  0071_logistics_mgr_role.sql
--  مدير النقطليات — LOGISTICS_MGR
-- ============================================================================
--  The transport/logistics manager owns the fleet side of the plant:
--    • the dispatch board (what must pour today, what is running, what is late)
--    • the fleet (vehicles, classes, drivers assigned to them)
--    • driver assignment and driver reports
--    • fuel logs and the fuel-efficiency trail
--    • weighbridge tickets (open/close a weighing)
--
--  It deliberately does NOT get production, finance, procurement or HR
--  powers — the same narrow-by-design rule the gate operator follows.
--
--  ALTER TYPE … ADD VALUE can only APPEND, so this must be the last value
--  in the enum. It is also idempotent: re-running the migration must not
--  fail on a copy where the value already exists.
-- ============================================================================

DO $$ BEGIN
  ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'LOGISTICS_MGR';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
