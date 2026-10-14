CREATE TABLE "procure_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"stage" varchar(16) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"note" text,
	"decided_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procure_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"supplier_name" varchar(200) NOT NULL,
	"amount_sar" numeric(12, 2) NOT NULL,
	"file_name" varchar(255),
	"mime_type" varchar(100),
	"size_bytes" integer,
	"storage_url" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procure_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_name" varchar(200) NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit" varchar(20) DEFAULT 'قطعة' NOT NULL,
	"reason" text,
	"workshop_ref" varchar(120),
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"chosen_quote_id" uuid,
	"disbursed_sar" numeric(12, 2),
	"requested_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procure_approvals" ADD CONSTRAINT "procure_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_approvals" ADD CONSTRAINT "procure_approvals_request_id_procure_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procure_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_approvals" ADD CONSTRAINT "procure_approvals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_quotes" ADD CONSTRAINT "procure_quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_quotes" ADD CONSTRAINT "procure_quotes_request_id_procure_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procure_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_quotes" ADD CONSTRAINT "procure_quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_requests" ADD CONSTRAINT "procure_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_requests" ADD CONSTRAINT "procure_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_proc_a_tenant" ON "procure_approvals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_proc_a_request" ON "procure_approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_proc_q_tenant" ON "procure_quotes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_proc_q_request" ON "procure_quotes" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_proc_req_tenant" ON "procure_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_proc_req_status" ON "procure_requests" USING btree ("status");