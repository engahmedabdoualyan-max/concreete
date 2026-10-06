CREATE TABLE "hr_expense_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" varchar(20) DEFAULT 'OTHER' NOT NULL,
	"amount_sar" numeric(12, 2) NOT NULL,
	"expense_date" varchar(10) NOT NULL,
	"notes" text,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"leave_type" varchar(20) DEFAULT 'ANNUAL' NOT NULL,
	"allocated" numeric(8, 2) DEFAULT '0' NOT NULL,
	"used" numeric(8, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_overtime" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" varchar(10) NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"rate_sar" numeric(10, 2),
	"reason" text,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_vehicle_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"log_date" varchar(10) NOT NULL,
	"odometer_km" numeric(12, 1),
	"fuel_litres" numeric(10, 2),
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hr_expense_claims" ADD CONSTRAINT "hr_expense_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_expense_claims" ADD CONSTRAINT "hr_expense_claims_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_expense_claims" ADD CONSTRAINT "hr_expense_claims_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_leave_balances" ADD CONSTRAINT "hr_leave_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_leave_balances" ADD CONSTRAINT "hr_leave_balances_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_overtime" ADD CONSTRAINT "hr_overtime_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_overtime" ADD CONSTRAINT "hr_overtime_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_overtime" ADD CONSTRAINT "hr_overtime_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_vehicle_logs" ADD CONSTRAINT "hr_vehicle_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_vehicle_logs" ADD CONSTRAINT "hr_vehicle_logs_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_vehicle_logs" ADD CONSTRAINT "hr_vehicle_logs_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_ec_tenant" ON "hr_expense_claims" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_ec_employee" ON "hr_expense_claims" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_lb_tenant" ON "hr_leave_balances" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_lb_employee" ON "hr_leave_balances" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_ot_tenant" ON "hr_overtime" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_ot_employee" ON "hr_overtime" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_vl_tenant" ON "hr_vehicle_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_vl_vehicle" ON "hr_vehicle_logs" USING btree ("vehicle_id");