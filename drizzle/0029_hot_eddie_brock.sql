CREATE TABLE "hr_company_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"storage_url" text NOT NULL,
	"expiry_date" timestamp,
	"uploaded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hr_documents" ADD COLUMN "custody_id" uuid;--> statement-breakpoint
ALTER TABLE "hr_company_docs" ADD CONSTRAINT "hr_company_docs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_company_docs" ADD CONSTRAINT "hr_company_docs_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_cdoc_tenant" ON "hr_company_docs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_cdoc_kind" ON "hr_company_docs" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_custody_id_hr_custody_id_fk" FOREIGN KEY ("custody_id") REFERENCES "public"."hr_custody"("id") ON DELETE cascade ON UPDATE no action;