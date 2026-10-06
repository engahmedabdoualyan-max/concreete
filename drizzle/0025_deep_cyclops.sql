CREATE TABLE "hr_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"storage_url" text NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "country_code" varchar(4);--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "emergency_contact_name" varchar(120);--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "emergency_contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "last_vacation_date" timestamp;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "last_resumption_date" timestamp;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "medical_insurance_no" varchar(60);--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "medical_insurance_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_doc_tenant" ON "hr_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_doc_employee" ON "hr_documents" USING btree ("employee_id");