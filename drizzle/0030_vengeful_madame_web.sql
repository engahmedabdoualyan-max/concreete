CREATE TABLE "hr_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"kind" varchar(20) DEFAULT 'TRAFFIC' NOT NULL,
	"amount_sar" numeric(12, 2) NOT NULL,
	"violation_date" timestamp DEFAULT now() NOT NULL,
	"location" varchar(200),
	"paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp,
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "istimara_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "hr_violations" ADD CONSTRAINT "hr_violations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_violations" ADD CONSTRAINT "hr_violations_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_violations" ADD CONSTRAINT "hr_violations_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_violations" ADD CONSTRAINT "hr_violations_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_vio_tenant" ON "hr_violations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_vio_employee" ON "hr_violations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_vio_vehicle" ON "hr_violations" USING btree ("vehicle_id");