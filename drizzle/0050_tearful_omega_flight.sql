CREATE TABLE "form_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_code" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"form_date" varchar(10),
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_records" ADD CONSTRAINT "form_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_records" ADD CONSTRAINT "form_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_records_tenant_idx" ON "form_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "form_records_tenant_code_idx" ON "form_records" USING btree ("tenant_id","form_code");