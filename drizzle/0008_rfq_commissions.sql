-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0008: RFQ quoting + sales commissions (Epic 8)
-- ============================================================
--  • rfqs — quotation headers with approval chain
--  • rfq_items — per-mix volume + cost breakdown + margin + floor
--  • commission_schemes — named % rates
--  • sales_commissions — earned rows PENDING → APPROVED → PAID
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rfq_number" varchar(30) NOT NULL,
	"client_id" uuid NOT NULL,
	"delivery_site_id" uuid,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"valid_until" timestamp,
	"requested_by_id" uuid,
	"costed_by_id" uuid,
	"costed_at" timestamp,
	"approved_by_id" uuid,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfqs_rfq_number_unique" UNIQUE("rfq_number"),
	CONSTRAINT "rfqs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rfqs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rfqs_delivery_site_id_delivery_sites_id_fk" FOREIGN KEY ("delivery_site_id") REFERENCES "public"."delivery_sites"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rfqs_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rfqs_costed_by_id_users_id_fk" FOREIGN KEY ("costed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rfqs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rfqs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "rfq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"mix_design_id" uuid NOT NULL,
	"volume_m3" numeric(8, 2) NOT NULL,
	"material_cost_per_m3" numeric(10, 2) DEFAULT '0',
	"haul_cost_per_m3" numeric(10, 2) DEFAULT '0',
	"pump_cost_per_m3" numeric(10, 2) DEFAULT '0',
	"overhead_cost_per_m3" numeric(10, 2) DEFAULT '0',
	"total_cost_per_m3" numeric(10, 2) DEFAULT '0',
	"margin_pct" numeric(5, 2) DEFAULT '0',
	"floor_price_per_m3" numeric(10, 2) DEFAULT '0',
	"quoted_price_per_m3" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rfq_items_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rfq_items_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "commission_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"rate_pct" numeric(5, 2) NOT NULL,
	"min_delivered_m3" numeric(10, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commission_schemes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "commission_schemes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "sales_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sales_rep_id" uuid NOT NULL,
	"order_id" uuid,
	"scheme_id" uuid,
	"period" varchar(7) NOT NULL,
	"basis_revenue_sar" numeric(12, 2) NOT NULL,
	"rate_pct" numeric(5, 2) NOT NULL,
	"amount_sar" numeric(12, 2) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"approved_by_id" uuid,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_commissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "sales_commissions_sales_rep_id_users_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "sales_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "sales_commissions_scheme_id_commission_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."commission_schemes"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_rfq_tenant" ON "rfqs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_client" ON "rfqs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_status" ON "rfqs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rfq_number" ON "rfqs" USING btree ("rfq_number");--> statement-breakpoint
CREATE INDEX "idx_rfq_item_rfq" ON "rfq_items" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_item_mix" ON "rfq_items" USING btree ("mix_design_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_item_tenant" ON "rfq_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_comm_scheme_tenant" ON "commission_schemes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_comm_scheme_active" ON "commission_schemes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_comm_rep" ON "sales_commissions" USING btree ("sales_rep_id");--> statement-breakpoint
CREATE INDEX "idx_comm_order" ON "sales_commissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_comm_period" ON "sales_commissions" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_comm_status" ON "sales_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_comm_tenant" ON "sales_commissions" USING btree ("tenant_id");
