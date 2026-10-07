CREATE TABLE "hr_separations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"last_working_date" varchar(10) NOT NULL,
	"reason" text,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"clearance_note" text,
	"opened_by_id" uuid,
	"cleared_by_id" uuid,
	"cleared_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "date_of_birth" timestamp;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "blood_group" varchar(5);--> statement-breakpoint
ALTER TABLE "hr_separations" ADD CONSTRAINT "hr_separations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_separations" ADD CONSTRAINT "hr_separations_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_separations" ADD CONSTRAINT "hr_separations_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_separations" ADD CONSTRAINT "hr_separations_cleared_by_id_users_id_fk" FOREIGN KEY ("cleared_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_sep_tenant" ON "hr_separations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_sep_employee" ON "hr_separations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_sep_status" ON "hr_separations" USING btree ("status");