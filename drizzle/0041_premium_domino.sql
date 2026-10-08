CREATE TABLE "hr_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" varchar(10) NOT NULL,
	"reason" varchar(200),
	"recorded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hr_absences" ADD CONSTRAINT "hr_absences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_absences" ADD CONSTRAINT "hr_absences_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_absences" ADD CONSTRAINT "hr_absences_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_abs_tenant" ON "hr_absences" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_hr_abs_emp_day" ON "hr_absences" USING btree ("employee_id","work_date");