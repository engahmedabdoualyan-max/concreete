CREATE TABLE "hr_custody" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"item" varchar(200) NOT NULL,
	"serial_no" varchar(100),
	"notes" text,
	"status" varchar(16) DEFAULT 'HELD' NOT NULL,
	"handed_at" timestamp DEFAULT now() NOT NULL,
	"returned_at" timestamp,
	"handed_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "vehicle_plate" varchar(20);--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "vehicle_ownership" varchar(10);--> statement-breakpoint
ALTER TABLE "hr_custody" ADD CONSTRAINT "hr_custody_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_custody" ADD CONSTRAINT "hr_custody_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_custody" ADD CONSTRAINT "hr_custody_handed_by_id_users_id_fk" FOREIGN KEY ("handed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_cus_tenant" ON "hr_custody" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_cus_employee" ON "hr_custody" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_cus_status" ON "hr_custody" USING btree ("status");