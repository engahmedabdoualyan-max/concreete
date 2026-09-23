-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0014: Tree-plane link (Epic 13 unification)
-- ============================================================
--  • orders.source_ref — Firestore tree doc id for imported orders
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

ALTER TABLE "orders" ADD COLUMN "source_ref" varchar(80);--> statement-breakpoint
CREATE INDEX "idx_orders_source_ref" ON "orders" USING btree ("source_ref");
