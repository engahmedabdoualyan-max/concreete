CREATE TABLE "hr_petty_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"amount_sar" numeric(12, 2) NOT NULL,
	"expense_date" varchar(10) NOT NULL,
	"description" varchar(300) NOT NULL,
	"recorded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_petty_funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"department" varchar(80) DEFAULT 'الموارد البشرية' NOT NULL,
	"amount_received" numeric(12, 2) NOT NULL,
	"received_date" varchar(10) NOT NULL,
	"purpose" text,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"settled_at" timestamp,
	"settle_note" text,
	"received_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hr_petty_expenses" ADD CONSTRAINT "hr_petty_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_petty_expenses" ADD CONSTRAINT "hr_petty_expenses_fund_id_hr_petty_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."hr_petty_funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_petty_expenses" ADD CONSTRAINT "hr_petty_expenses_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_petty_funds" ADD CONSTRAINT "hr_petty_funds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_petty_funds" ADD CONSTRAINT "hr_petty_funds_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hr_pe_tenant" ON "hr_petty_expenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_pe_fund" ON "hr_petty_expenses" USING btree ("fund_id");--> statement-breakpoint
CREATE INDEX "idx_hr_pf_tenant" ON "hr_petty_funds" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_pf_status" ON "hr_petty_funds" USING btree ("status");