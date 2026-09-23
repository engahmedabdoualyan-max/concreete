-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0012: HR social bridge (Epic 12)
-- ============================================================
--  • HR_OFFICER in user_role enum
--  • hr_requests — leave / advance / salary-confirm / other
--  • hr_broadcasts + hr_broadcast_reads — HR announcements
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

ALTER TYPE "public"."user_role" ADD VALUE 'HR_OFFICER';--> statement-breakpoint
CREATE TABLE "hr_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"amount_sar" numeric(12, 2),
	"reference_id" varchar(64),
	"reason" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp,
	"review_note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "hr_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "hr_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "hr_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"audience" jsonb DEFAULT '[]'::jsonb,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_broadcasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "hr_broadcasts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "hr_broadcast_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_broadcast_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "hr_broadcast_reads_broadcast_id_hr_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."hr_broadcasts"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "hr_broadcast_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_hr_req_tenant" ON "hr_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_req_requester" ON "hr_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "idx_hr_req_status" ON "hr_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hr_req_type" ON "hr_requests" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_hr_bc_tenant" ON "hr_broadcasts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_bc_created" ON "hr_broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_hr_bcr_broadcast" ON "hr_broadcast_reads" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "idx_hr_bcr_user" ON "hr_broadcast_reads" USING btree ("user_id");
