-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0009: GCC payroll GOSI + Mudad (Epic 9)
-- ============================================================
--  • payroll_employees — salary packages + GOSI track
--  • payroll_runs — monthly DRAFT → APPROVED → PAID
--  • payroll_lines — per-employee math snapshots
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "payroll_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"employee_code" varchar(20) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"national_id" varchar(20),
	"nationality" varchar(12) DEFAULT 'NON_SAUDI' NOT NULL,
	"gosi_system" varchar(10) DEFAULT 'LEGACY' NOT NULL,
	"job_title" varchar(120),
	"department" varchar(80),
	"base_salary_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"housing_allowance_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"transport_allowance_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_allowances_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bank_iban" varchar(40),
	"bank_name" varchar(80),
	"hire_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "payroll_employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"total_gross_sar" numeric(14, 2) DEFAULT '0',
	"total_employee_gosi_sar" numeric(14, 2) DEFAULT '0',
	"total_employer_gosi_sar" numeric(14, 2) DEFAULT '0',
	"total_deductions_sar" numeric(14, 2) DEFAULT '0',
	"total_net_sar" numeric(14, 2) DEFAULT '0',
	"approved_by_id" uuid,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "payroll_runs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "payroll_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "payroll_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_name" varchar(120) NOT NULL,
	"days_worked" numeric(5, 2) DEFAULT '30' NOT NULL,
	"base_salary_sar" numeric(12, 2) NOT NULL,
	"allowances_sar" numeric(12, 2) NOT NULL,
	"gross_sar" numeric(12, 2) NOT NULL,
	"gosi_wage_sar" numeric(12, 2) NOT NULL,
	"gosi_system" varchar(10) NOT NULL,
	"employee_gosi_sar" numeric(12, 2) NOT NULL,
	"employer_gosi_sar" numeric(12, 2) NOT NULL,
	"deductions_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deduction_note" varchar(200),
	"net_sar" numeric(12, 2) NOT NULL,
	"bank_iban" varchar(40),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "payroll_lines_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_pay_emp_tenant" ON "payroll_employees" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pay_emp_code" ON "payroll_employees" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "idx_pay_emp_user" ON "payroll_employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pay_run_tenant" ON "payroll_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pay_run_period" ON "payroll_runs" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_pay_run_status" ON "payroll_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pay_line_run" ON "payroll_lines" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_pay_line_emp" ON "payroll_lines" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_pay_line_tenant" ON "payroll_lines" USING btree ("tenant_id");
