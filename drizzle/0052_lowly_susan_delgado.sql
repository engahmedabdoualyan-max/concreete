ALTER TYPE "public"."fleet_readiness_status" ADD VALUE 'STORED';--> statement-breakpoint
ALTER TABLE "fleet_readiness" ADD COLUMN "site_id" uuid;--> statement-breakpoint
ALTER TABLE "fleet_readiness" ADD CONSTRAINT "fleet_readiness_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;