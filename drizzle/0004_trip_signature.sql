-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0004: Trip e-signature (Epic 3)
-- ============================================================
--  • trips.signature_image / signed_by / signed_at
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

ALTER TABLE "trips" ADD COLUMN "signature_image" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "signed_by" varchar(120);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "signed_at" timestamp;
