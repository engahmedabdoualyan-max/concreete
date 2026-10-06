CREATE TYPE "public"."asset_qr_label_state" AS ENUM('ACTIVE', 'DETACHED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."asset_qr_subject_type" AS ENUM('ITEM_CARD', 'ITEM_UNIT', 'EMPLOYEE', 'EQUIPMENT', 'VEHICLE', 'CHALLAN', 'CONCRETE_SAMPLE');--> statement-breakpoint
CREATE TYPE "public"."bank_transaction_type" AS ENUM('deposit', 'withdrawal', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."client_risk" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."commitment_frequency" AS ENUM('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."commitment_payment_mode" AS ENUM('CASH', 'CHEQUE', 'BANK', 'UPI', 'AUTO_DEBIT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('active', 'completed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."commitment_type" AS ENUM('emi', 'lease', 'insurance', 'maintenance', 'utilities', 'rent', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('vehicle', 'fuel', 'office', 'materials', 'maintenance', 'utilities', 'rent', 'salary', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_payment_method" AS ENUM('cash', 'bank_transfer', 'credit_card', 'upi', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('income', 'expense', 'transfer', 'purchase', 'sale', 'adjustment', 'operational');--> statement-breakpoint
CREATE TYPE "public"."portal_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."portal_request_type" AS ENUM('NEW_ORDER', 'AMENDMENT', 'CANCELLATION');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('READY_MIX', 'AGGREGATE', 'ASPHALT', 'BLOCKS', 'CEMENT');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'ORDERED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."rnd_budget_category" AS ENUM('EQUIPMENT', 'SOFTWARE', 'TRAINING', 'CONSULTING', 'MARKETING', 'HR', 'MATERIALS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."rnd_budget_item_status" AS ENUM('PLANNED', 'REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."rnd_issue_category" AS ENUM('EQUIPMENT', 'QUALITY', 'SAFETY', 'STAFF', 'SUPPLIER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."rnd_issue_severity" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."rnd_issue_status" AS ENUM('OPEN', 'INVESTIGATING', 'RESOLVING', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."rnd_plan_category" AS ENUM('PRODUCTION', 'QUALITY', 'COST', 'STAFF', 'TECHNOLOGY', 'PROCESS');--> statement-breakpoint
CREATE TYPE "public"."rnd_plan_status" AS ENUM('DRAFT', 'PENDING_FINANCE', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."rnd_priority" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."rnd_task_status" AS ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."site_type" AS ENUM('PLANT', 'BRANCH', 'STATION', 'YARD');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('RECEIVE', 'ISSUE', 'RETURN', 'INSTALL', 'REMOVE', 'TO_SCRAP', 'FROM_SCRAP', 'DISPOSE', 'ADJUST');--> statement-breakpoint
CREATE TYPE "public"."supplier_payment_mode" AS ENUM('CASH', 'CHEQUE', 'BANK', 'CREDIT', 'UPI', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."warehouse_item_category" AS ENUM('SPARE_PART', 'LUBRICANT', 'CONSUMABLE', 'SCRAP');--> statement-breakpoint
CREATE TYPE "public"."warehouse_kind" AS ENUM('SPARES', 'SCRAP');--> statement-breakpoint
CREATE TYPE "public"."warehouse_unit_state" AS ENUM('IN_STORE', 'ISSUED', 'INSTALLED', 'IN_SCRAP', 'SCRAPPED');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'RND_MANAGER';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'HR_OFFICER';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'CFO';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'SCHEDULE_MGR';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'OPERATIONS_MGR';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'PRODUCTION_MGR';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'REPS_MGR';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'STOREKEEPER';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'MECHANIC';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'STATION_TECH';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'BATCH_OP';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'LAB_MGR';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'HR_MANAGER';--> statement-breakpoint
CREATE TABLE "asset_qr_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"work_order_id" uuid,
	"location_note" varchar(160),
	"bound_at" timestamp DEFAULT now() NOT NULL,
	"bound_by_id" uuid,
	"unbound_at" timestamp,
	"unbound_by_id" uuid,
	"unbind_reason" text
);
--> statement-breakpoint
CREATE TABLE "asset_qr_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label_code" varchar(40) NOT NULL,
	"subject_type" "asset_qr_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_ref" varchar(80) NOT NULL,
	"subject_label" varchar(200),
	"token_hash" varchar(64) NOT NULL,
	"token_hint" varchar(12) NOT NULL,
	"state" "asset_qr_label_state" DEFAULT 'ACTIVE' NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"issued_by_id" uuid,
	"printed_at" timestamp,
	"print_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_name" varchar(120) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"branch" varchar(100),
	"initial_balance_sar" integer DEFAULT 0 NOT NULL,
	"current_balance_sar" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"destination_account_id" uuid,
	"transaction_type" "bank_transaction_type" NOT NULL,
	"amount_sar" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"description" varchar(255) NOT NULL,
	"reference_number" varchar(50),
	"ledger_entry_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_controllers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_plant_id" uuid,
	"name" varchar(120) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_status" jsonb,
	"last_seen_at" timestamp,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carbon_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"factor_key" varchar(40) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"kgco2e_per_unit" numeric(12, 6) NOT NULL,
	"source" varchar(200),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"rate_pct" numeric(5, 2) NOT NULL,
	"min_delivered_m3" numeric(10, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitment_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"commitment_id" uuid NOT NULL,
	"amount_sar" integer NOT NULL,
	"payment_date" date NOT NULL,
	"payment_mode" "commitment_payment_mode" DEFAULT 'BANK' NOT NULL,
	"reference_number" varchar(100),
	"remarks" text,
	"receipt_number" varchar(100),
	"ledger_entry_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"commitment_type" "commitment_type" DEFAULT 'other' NOT NULL,
	"description" text,
	"amount_sar" integer NOT NULL,
	"reference_number" varchar(100),
	"start_date" date NOT NULL,
	"end_date" date,
	"payment_frequency" "commitment_frequency" DEFAULT 'monthly' NOT NULL,
	"payment_day" integer DEFAULT 1 NOT NULL,
	"next_payment_date" date NOT NULL,
	"current_payment_is_paid" boolean DEFAULT false NOT NULL,
	"status" "commitment_status" DEFAULT 'active' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"payee_name" varchar(200) NOT NULL,
	"contact_person" varchar(100),
	"contact_phone" varchar(15),
	"contact_email" varchar(200),
	"contract_document_url" text,
	"notes" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"equipment_code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_ar" varchar(120),
	"category" varchar(40) DEFAULT 'OTHER' NOT NULL,
	"make" varchar(80),
	"model" varchar(80),
	"serial_number" varchar(80),
	"location" varchar(120),
	"commissioned_at" date,
	"cost_sar" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_sar" integer NOT NULL,
	"date" date NOT NULL,
	"payment_method" "expense_payment_method" DEFAULT 'cash' NOT NULL,
	"description" text,
	"vehicle_id" uuid,
	"reference_number" varchar(100),
	"bill_url" text,
	"ledger_entry_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" varchar(10) NOT NULL,
	"check_in_at" timestamp,
	"check_in_lat" numeric(10, 7),
	"check_in_lng" numeric(10, 7),
	"check_in_zone_id" uuid,
	"check_out_at" timestamp,
	"check_out_lat" numeric(10, 7),
	"check_out_lng" numeric(10, 7),
	"last_inside_at" timestamp,
	"last_inside_lat" numeric(10, 7),
	"last_inside_lng" numeric(10, 7),
	"source" varchar(10) DEFAULT 'AUTO' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_broadcast_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"audience" jsonb DEFAULT '[]'::jsonb,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"subject" varchar(200) NOT NULL,
	"details" text,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"outcome" text,
	"opened_by_id" uuid,
	"closed_by_id" uuid,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_penalties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"amount_sar" numeric(12, 2),
	"suspension_days" integer,
	"reason" text NOT NULL,
	"issued_by_id" uuid,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"amount_sar" numeric(12, 2),
	"reference_id" varchar(64),
	"reason" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp,
	"review_note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"amount_sar" numeric(12, 2),
	"reason" text NOT NULL,
	"issued_by_id" uuid,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"radius_m" integer DEFAULT 200 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"credentials_enc" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"last_test_ok" boolean,
	"last_test_message" varchar(500),
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"direction" varchar(10) DEFAULT 'OUT' NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"local_id" varchar(64),
	"external_id" varchar(120),
	"status" varchar(20) NOT NULL,
	"message" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount_sar" integer NOT NULL,
	"transaction_type" "ledger_entry_type" NOT NULL,
	"reference_number" varchar(50),
	"bank_account_id" uuid,
	"counterparty_type" varchar(20),
	"counterparty_id" uuid,
	"counterparty_name" varchar(200),
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"share_token_id" uuid,
	"request_type" "portal_request_type" NOT NULL,
	"status" "portal_request_status" DEFAULT 'PENDING' NOT NULL,
	"order_id" uuid,
	"requested_volume_m3" numeric(8, 2),
	"requested_date" timestamp,
	"delivery_site_id" uuid,
	"mix_design_id" uuid,
	"note" text,
	"handled_by_id" uuid,
	"handled_at" timestamp,
	"decision_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"silo_id" uuid,
	"material_category" "material_category" NOT NULL,
	"material_name" varchar(100) NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"rate_per_kg_sar" integer NOT NULL,
	"line_total_sar" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_number" varchar(30) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_date" date NOT NULL,
	"due_date" date,
	"subtotal_sar" integer DEFAULT 0 NOT NULL,
	"vat_percent" integer DEFAULT 15 NOT NULL,
	"vat_amount_sar" integer DEFAULT 0 NOT NULL,
	"transport_cost_sar" integer DEFAULT 0 NOT NULL,
	"total_amount_sar" integer DEFAULT 0 NOT NULL,
	"paid_amount_sar" integer DEFAULT 0 NOT NULL,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"inventory_updated" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	CONSTRAINT "rfqs_rfq_number_unique" UNIQUE("rfq_number")
);
--> statement-breakpoint
CREATE TABLE "rnd_budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"budget_plan_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" "rnd_budget_category" DEFAULT 'OTHER' NOT NULL,
	"estimated_cost_sar" integer DEFAULT 0 NOT NULL,
	"actual_cost_sar" integer,
	"vendor" varchar(160),
	"status" "rnd_budget_item_status" DEFAULT 'PLANNED' NOT NULL,
	"finance_approval_required" boolean DEFAULT true NOT NULL,
	"finance_reviewed_by_id" uuid,
	"finance_reviewed_at" timestamp,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_budget_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"fiscal_year" varchar(10) NOT NULL,
	"total_budget_sar" integer DEFAULT 0 NOT NULL,
	"allocated_budget_sar" integer DEFAULT 0 NOT NULL,
	"spent_budget_sar" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_competitor_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"grade" varchar(60) NOT NULL,
	"product_name" varchar(200),
	"their_price_sar" integer DEFAULT 0 NOT NULL,
	"our_mix_design_id" uuid,
	"our_price_sar" integer DEFAULT 0 NOT NULL,
	"extras_note" varchar(300),
	"observed_at" timestamp,
	"source" varchar(30) DEFAULT 'MARKET',
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"city" varchar(100),
	"phone" varchar(20),
	"email" varchar(200),
	"website" varchar(300),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_current_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period" varchar(20) NOT NULL,
	"current_production_capacity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"target_production_capacity" numeric(10, 2) DEFAULT '0' NOT NULL,
	"current_efficiency_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"target_efficiency_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"current_staff_count" integer DEFAULT 0 NOT NULL,
	"target_staff_count" integer DEFAULT 0 NOT NULL,
	"current_cost_per_m3" numeric(10, 2) DEFAULT '0' NOT NULL,
	"target_cost_per_m3" numeric(10, 2) DEFAULT '0' NOT NULL,
	"key_issues" jsonb DEFAULT '[]'::jsonb,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid,
	"employee_name" varchar(120) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"tasks_assigned" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"completion_rate_pct" integer DEFAULT 0 NOT NULL,
	"quality_score" integer DEFAULT 0 NOT NULL,
	"initiative_score" integer DEFAULT 0 NOT NULL,
	"teamwork_score" integer DEFAULT 0 NOT NULL,
	"overall_score" numeric(4, 2) DEFAULT '0' NOT NULL,
	"strengths" text,
	"improvements" text,
	"reviewer_comments" text,
	"evaluated_by_id" uuid,
	"evaluated_by_name" varchar(120),
	"acknowledged_by_employee" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_external_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"severity" "rnd_issue_severity" DEFAULT 'MEDIUM' NOT NULL,
	"category" "rnd_issue_category" DEFAULT 'OTHER' NOT NULL,
	"reported_by_id" uuid,
	"reported_by_name" varchar(120),
	"assigned_to_id" uuid,
	"assigned_to_name" varchar(120),
	"status" "rnd_issue_status" DEFAULT 'OPEN' NOT NULL,
	"root_cause" text,
	"resolution" text,
	"resolved_at" timestamp,
	"resolved_by_id" uuid,
	"related_plan_id" uuid,
	"related_task_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_issue_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"target_date" timestamp NOT NULL,
	"actual_date" timestamp,
	"owner_id" uuid,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"category" "rnd_plan_category" DEFAULT 'PRODUCTION' NOT NULL,
	"priority" "rnd_priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "rnd_plan_status" DEFAULT 'DRAFT' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"budget_sar" integer DEFAULT 0 NOT NULL,
	"expected_roi_pct" numeric(5, 2) DEFAULT '0',
	"overall_progress_pct" integer DEFAULT 0 NOT NULL,
	"finance_reviewed_by_id" uuid,
	"finance_reviewed_at" timestamp,
	"finance_comments" text,
	"finance_approved_budget_sar" integer,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"milestone_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"assignee_name" varchar(120),
	"start_date" timestamp,
	"due_date" timestamp NOT NULL,
	"actual_start_date" timestamp,
	"actual_end_date" timestamp,
	"status" "rnd_task_status" DEFAULT 'TODO' NOT NULL,
	"priority" "rnd_priority" DEFAULT 'MEDIUM' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"estimated_hours" numeric(8, 2),
	"actual_hours" numeric(8, 2),
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rnd_weekly_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"year" integer NOT NULL,
	"week_start_date" timestamp NOT NULL,
	"week_end_date" timestamp NOT NULL,
	"planned_target" numeric(12, 2) DEFAULT '0' NOT NULL,
	"actual_achieved" numeric(12, 2) DEFAULT '0' NOT NULL,
	"variance_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"is_on_track" boolean DEFAULT true NOT NULL,
	"blockers" text,
	"actions_taken" text,
	"next_week_plan" text,
	"metrics_snapshot" jsonb DEFAULT '{}'::jsonb,
	"submitted_by_id" uuid,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"amount_sar" integer NOT NULL,
	"month" date NOT NULL,
	"paid_on" date NOT NULL,
	"notes" text,
	"ledger_entry_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scope" varchar(10) NOT NULL,
	"order_id" uuid,
	"client_id" uuid,
	"token" varchar(64) NOT NULL,
	"expires_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"label" varchar(200),
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_code" varchar(30) NOT NULL,
	"site_name" varchar(200) NOT NULL,
	"site_type" "site_type" DEFAULT 'BRANCH' NOT NULL,
	"address_line" text,
	"city" varchar(100),
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"geofence_radius_metres" integer DEFAULT 200 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" "stock_movement_type" NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"from_warehouse" "warehouse_kind",
	"to_warehouse" "warehouse_kind",
	"vehicle_id" uuid,
	"label_id" uuid,
	"work_order_id" uuid,
	"note" text,
	"moved_at" timestamp DEFAULT now() NOT NULL,
	"moved_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"amount_sar" integer NOT NULL,
	"payment_mode" "supplier_payment_mode" DEFAULT 'BANK' NOT NULL,
	"payment_date" date NOT NULL,
	"due_date" date,
	"reference_number" varchar(50),
	"remarks" text,
	"ledger_entry_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"contact_person" varchar(100),
	"phone" varchar(20) NOT NULL,
	"email" varchar(200),
	"vat_number" varchar(20),
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telematics_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"device_type" varchar(30) NOT NULL,
	"serial_number" varchar(80),
	"device_code" varchar(40),
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mounted_at" timestamp,
	"linked_at" timestamp,
	"linked_by_id" uuid,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telematics_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"trip_id" uuid,
	"drum_rpm" numeric(5, 2),
	"concrete_temp_c" numeric(4, 1),
	"water_added_l" numeric(8, 2),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"speed_kmh" numeric(6, 2),
	"source" varchar(20) DEFAULT 'DEVICE' NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_item_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_serial" varchar(60) NOT NULL,
	"state" "warehouse_unit_state" DEFAULT 'IN_STORE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"name_ar" varchar(160),
	"category" "warehouse_item_category" DEFAULT 'SPARE_PART' NOT NULL,
	"default_warehouse" "warehouse_kind" DEFAULT 'SPARES' NOT NULL,
	"unit" varchar(20) DEFAULT 'PCS' NOT NULL,
	"qty_on_hand" numeric(12, 3) DEFAULT '0' NOT NULL,
	"min_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unit_cost_sar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"oem_part_number" varchar(80),
	"applies_to_make" varchar(80),
	"applies_to_model" varchar(80),
	"is_serialized" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zatca_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid,
	"invoice_number" varchar(40) NOT NULL,
	"idempotency_key" varchar(200),
	"invoice_uuid" varchar(64) NOT NULL,
	"invoice_type" varchar(12) DEFAULT 'STANDARD' NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"counter_value" integer NOT NULL,
	"invoice_hash" varchar(128),
	"previous_hash" varchar(128),
	"qr_tlv_base64" text,
	"totals" jsonb,
	"fatoora_response" jsonb,
	"rejection_reason" text,
	"cleared_at" timestamp,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "zatca_documents_tenant_invoice_number_unique" UNIQUE("tenant_id","invoice_number"),
	CONSTRAINT "zatca_documents_tenant_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "zatca_documents_invoice_uuid_unique" UNIQUE("invoice_uuid"),
	CONSTRAINT "zatca_documents_tenant_counter_unique" UNIQUE("tenant_id","counter_value")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "risk_score" "client_risk" DEFAULT 'LOW' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "risk_notes" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "risk_last_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "source" varchar(20) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "mix_designs" ADD COLUMN "product_type" "product_type" DEFAULT 'READY_MIX' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "product_type" "product_type" DEFAULT 'READY_MIX' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carbon_kgco2e" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carbon_computed_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source_ref" varchar(80);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" varchar(20) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "signature_image" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "signed_by" varchar(120);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "transport_cost_sar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_qr_bindings" ADD CONSTRAINT "asset_qr_bindings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_bindings" ADD CONSTRAINT "asset_qr_bindings_label_id_asset_qr_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."asset_qr_labels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_bindings" ADD CONSTRAINT "asset_qr_bindings_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_bindings" ADD CONSTRAINT "asset_qr_bindings_work_order_id_maintenance_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_bindings" ADD CONSTRAINT "asset_qr_bindings_bound_by_id_users_id_fk" FOREIGN KEY ("bound_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_bindings" ADD CONSTRAINT "asset_qr_bindings_unbound_by_id_users_id_fk" FOREIGN KEY ("unbound_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_labels" ADD CONSTRAINT "asset_qr_labels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_qr_labels" ADD CONSTRAINT "asset_qr_labels_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_destination_account_id_bank_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_controllers" ADD CONSTRAINT "batch_controllers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_controllers" ADD CONSTRAINT "batch_controllers_batch_plant_id_batch_plants_id_fk" FOREIGN KEY ("batch_plant_id") REFERENCES "public"."batch_plants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_controllers" ADD CONSTRAINT "batch_controllers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carbon_factors" ADD CONSTRAINT "carbon_factors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_schemes" ADD CONSTRAINT "commission_schemes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_schemes" ADD CONSTRAINT "commission_schemes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_payments" ADD CONSTRAINT "commitment_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_payments" ADD CONSTRAINT "commitment_payments_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_payments" ADD CONSTRAINT "commitment_payments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_payments" ADD CONSTRAINT "commitment_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_check_in_zone_id_hr_zones_id_fk" FOREIGN KEY ("check_in_zone_id") REFERENCES "public"."hr_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_broadcast_reads" ADD CONSTRAINT "hr_broadcast_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_broadcast_reads" ADD CONSTRAINT "hr_broadcast_reads_broadcast_id_hr_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."hr_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_broadcast_reads" ADD CONSTRAINT "hr_broadcast_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_broadcasts" ADD CONSTRAINT "hr_broadcasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_broadcasts" ADD CONSTRAINT "hr_broadcasts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_opened_by_id_users_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_investigations" ADD CONSTRAINT "hr_investigations_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_penalties" ADD CONSTRAINT "hr_penalties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_penalties" ADD CONSTRAINT "hr_penalties_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_penalties" ADD CONSTRAINT "hr_penalties_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_rewards" ADD CONSTRAINT "hr_rewards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_rewards" ADD CONSTRAINT "hr_rewards_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_rewards" ADD CONSTRAINT "hr_rewards_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_zones" ADD CONSTRAINT "hr_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_zones" ADD CONSTRAINT "hr_zones_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD CONSTRAINT "payroll_employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD CONSTRAINT "payroll_employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_share_token_id_share_tokens_id_fk" FOREIGN KEY ("share_token_id") REFERENCES "public"."share_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_delivery_site_id_delivery_sites_id_fk" FOREIGN KEY ("delivery_site_id") REFERENCES "public"."delivery_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_requests" ADD CONSTRAINT "portal_requests_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_silo_id_inventory_silos_id_fk" FOREIGN KEY ("silo_id") REFERENCES "public"."inventory_silos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_delivery_site_id_delivery_sites_id_fk" FOREIGN KEY ("delivery_site_id") REFERENCES "public"."delivery_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_costed_by_id_users_id_fk" FOREIGN KEY ("costed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_items" ADD CONSTRAINT "rnd_budget_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_items" ADD CONSTRAINT "rnd_budget_items_budget_plan_id_rnd_budget_plans_id_fk" FOREIGN KEY ("budget_plan_id") REFERENCES "public"."rnd_budget_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_items" ADD CONSTRAINT "rnd_budget_items_finance_reviewed_by_id_users_id_fk" FOREIGN KEY ("finance_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_items" ADD CONSTRAINT "rnd_budget_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_plans" ADD CONSTRAINT "rnd_budget_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_plans" ADD CONSTRAINT "rnd_budget_plans_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_budget_plans" ADD CONSTRAINT "rnd_budget_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_competitor_products" ADD CONSTRAINT "rnd_competitor_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_competitor_products" ADD CONSTRAINT "rnd_competitor_products_competitor_id_rnd_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."rnd_competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_competitor_products" ADD CONSTRAINT "rnd_competitor_products_our_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("our_mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_competitor_products" ADD CONSTRAINT "rnd_competitor_products_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_competitors" ADD CONSTRAINT "rnd_competitors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_competitors" ADD CONSTRAINT "rnd_competitors_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_current_states" ADD CONSTRAINT "rnd_current_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_current_states" ADD CONSTRAINT "rnd_current_states_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_evaluations" ADD CONSTRAINT "rnd_evaluations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_evaluations" ADD CONSTRAINT "rnd_evaluations_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_evaluations" ADD CONSTRAINT "rnd_evaluations_evaluated_by_id_users_id_fk" FOREIGN KEY ("evaluated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_external_issues" ADD CONSTRAINT "rnd_external_issues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_external_issues" ADD CONSTRAINT "rnd_external_issues_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_external_issues" ADD CONSTRAINT "rnd_external_issues_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_external_issues" ADD CONSTRAINT "rnd_external_issues_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_external_issues" ADD CONSTRAINT "rnd_external_issues_related_plan_id_rnd_plans_id_fk" FOREIGN KEY ("related_plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_external_issues" ADD CONSTRAINT "rnd_external_issues_related_task_id_rnd_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."rnd_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_issue_comments" ADD CONSTRAINT "rnd_issue_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_issue_comments" ADD CONSTRAINT "rnd_issue_comments_issue_id_rnd_external_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."rnd_external_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_issue_comments" ADD CONSTRAINT "rnd_issue_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_milestones" ADD CONSTRAINT "rnd_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_milestones" ADD CONSTRAINT "rnd_milestones_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_milestones" ADD CONSTRAINT "rnd_milestones_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_plans" ADD CONSTRAINT "rnd_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_plans" ADD CONSTRAINT "rnd_plans_finance_reviewed_by_id_users_id_fk" FOREIGN KEY ("finance_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_plans" ADD CONSTRAINT "rnd_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_task_comments" ADD CONSTRAINT "rnd_task_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_task_comments" ADD CONSTRAINT "rnd_task_comments_task_id_rnd_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."rnd_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_task_comments" ADD CONSTRAINT "rnd_task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_tasks" ADD CONSTRAINT "rnd_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_tasks" ADD CONSTRAINT "rnd_tasks_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_tasks" ADD CONSTRAINT "rnd_tasks_milestone_id_rnd_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."rnd_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_tasks" ADD CONSTRAINT "rnd_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_tasks" ADD CONSTRAINT "rnd_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_weekly_entries" ADD CONSTRAINT "rnd_weekly_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_weekly_entries" ADD CONSTRAINT "rnd_weekly_entries_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_weekly_entries" ADD CONSTRAINT "rnd_weekly_entries_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rnd_weekly_entries" ADD CONSTRAINT "rnd_weekly_entries_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_commissions" ADD CONSTRAINT "sales_commissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_commissions" ADD CONSTRAINT "sales_commissions_sales_rep_id_users_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_commissions" ADD CONSTRAINT "sales_commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_commissions" ADD CONSTRAINT "sales_commissions_scheme_id_commission_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."commission_schemes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_commissions" ADD CONSTRAINT "sales_commissions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_warehouse_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_label_id_asset_qr_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."asset_qr_labels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_work_order_id_maintenance_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_moved_by_id_users_id_fk" FOREIGN KEY ("moved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telematics_devices" ADD CONSTRAINT "telematics_devices_linked_by_id_users_id_fk" FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telematics_readings" ADD CONSTRAINT "telematics_readings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telematics_readings" ADD CONSTRAINT "telematics_readings_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telematics_readings" ADD CONSTRAINT "telematics_readings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_units" ADD CONSTRAINT "warehouse_item_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_item_units" ADD CONSTRAINT "warehouse_item_units_item_id_warehouse_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."warehouse_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_items" ADD CONSTRAINT "warehouse_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zatca_documents" ADD CONSTRAINT "zatca_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zatca_documents" ADD CONSTRAINT "zatca_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zatca_documents" ADD CONSTRAINT "zatca_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_qr_bindings_active_unique" ON "asset_qr_bindings" USING btree ("label_id") WHERE "asset_qr_bindings"."unbound_at" IS NULL;--> statement-breakpoint
CREATE INDEX "asset_qr_bindings_vehicle_idx" ON "asset_qr_bindings" USING btree ("tenant_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "asset_qr_bindings_label_idx" ON "asset_qr_bindings" USING btree ("label_id","bound_at");--> statement-breakpoint
CREATE INDEX "asset_qr_bindings_tenant_idx" ON "asset_qr_bindings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_qr_labels_tenant_code_unique" ON "asset_qr_labels" USING btree ("tenant_id","label_code");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_qr_labels_token_hash_unique" ON "asset_qr_labels" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_qr_labels_subject_unique" ON "asset_qr_labels" USING btree ("tenant_id","subject_type","subject_id") WHERE "asset_qr_labels"."state" <> 'RETIRED';--> statement-breakpoint
CREATE INDEX "asset_qr_labels_tenant_idx" ON "asset_qr_labels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "asset_qr_labels_subject_idx" ON "asset_qr_labels" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_bank_accounts_tenant" ON "bank_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_tenant" ON "bank_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_account" ON "bank_transactions" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_date" ON "bank_transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_bank_transactions_ledger" ON "bank_transactions" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE INDEX "idx_batch_ctrl_tenant" ON "batch_controllers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_batch_ctrl_plant" ON "batch_controllers" USING btree ("batch_plant_id");--> statement-breakpoint
CREATE INDEX "idx_carbon_tenant" ON "carbon_factors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_carbon_key" ON "carbon_factors" USING btree ("tenant_id","factor_key");--> statement-breakpoint
CREATE INDEX "idx_comm_scheme_tenant" ON "commission_schemes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_comm_scheme_active" ON "commission_schemes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_commitment_payments_tenant" ON "commitment_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_commitment_payments_commitment" ON "commitment_payments" USING btree ("commitment_id");--> statement-breakpoint
CREATE INDEX "idx_commitment_payments_date" ON "commitment_payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_commitments_tenant" ON "commitments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_commitments_next_payment" ON "commitments" USING btree ("next_payment_date");--> statement-breakpoint
CREATE INDEX "idx_commitments_status" ON "commitments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_tenant_code_unique" ON "equipment" USING btree ("tenant_id","equipment_code");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_tenant_serial_unique" ON "equipment" USING btree ("tenant_id","serial_number") WHERE "equipment"."serial_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "equipment_tenant_idx" ON "equipment" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_tenant" ON "expenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_date" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_expenses_category" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_expenses_vehicle" ON "expenses" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_hr_att_tenant" ON "hr_attendance" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_att_user_day" ON "hr_attendance" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_hr_bcr_broadcast" ON "hr_broadcast_reads" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "idx_hr_bcr_user" ON "hr_broadcast_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_hr_bc_tenant" ON "hr_broadcasts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_bc_created" ON "hr_broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_hr_inv_tenant" ON "hr_investigations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_inv_employee" ON "hr_investigations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_inv_status" ON "hr_investigations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hr_pen_tenant" ON "hr_penalties" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_pen_employee" ON "hr_penalties" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_req_tenant" ON "hr_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_req_requester" ON "hr_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "idx_hr_req_status" ON "hr_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hr_req_type" ON "hr_requests" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_hr_rew_tenant" ON "hr_rewards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_rew_employee" ON "hr_rewards" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_hr_zone_tenant" ON "hr_zones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_intconn_tenant" ON "integration_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_intconn_provider" ON "integration_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_intlog_conn" ON "integration_sync_logs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_intlog_entity" ON "integration_sync_logs" USING btree ("entity_type","local_id");--> statement-breakpoint
CREATE INDEX "idx_intlog_tenant" ON "integration_sync_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_tenant" ON "ledger_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_date" ON "ledger_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_type" ON "ledger_entries" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_account" ON "ledger_entries" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_counterparty" ON "ledger_entries" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "idx_pay_emp_tenant" ON "payroll_employees" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pay_emp_code" ON "payroll_employees" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX "idx_pay_emp_user" ON "payroll_employees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_employees_tenant_code_unique" ON "payroll_employees" USING btree ("tenant_id","employee_code");--> statement-breakpoint
CREATE INDEX "idx_pay_line_run" ON "payroll_lines" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_pay_line_emp" ON "payroll_lines" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_pay_line_tenant" ON "payroll_lines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pay_run_tenant" ON "payroll_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_pay_run_period" ON "payroll_runs" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_pay_run_status" ON "payroll_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_portal_req_tenant" ON "portal_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_portal_req_status" ON "portal_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_portal_req_client" ON "portal_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_portal_req_order" ON "portal_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_tenant" ON "purchase_order_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_po" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_silo" ON "purchase_order_items" USING btree ("silo_id");--> statement-breakpoint
CREATE INDEX "idx_po_tenant" ON "purchase_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_po_supplier" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_po_status" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_po_date" ON "purchase_orders" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "idx_rfq_item_rfq" ON "rfq_items" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_item_mix" ON "rfq_items" USING btree ("mix_design_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_item_tenant" ON "rfq_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_tenant" ON "rfqs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_client" ON "rfqs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_status" ON "rfqs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rfq_number" ON "rfqs" USING btree ("rfq_number");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_budget" ON "rnd_budget_items" USING btree ("budget_plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_category" ON "rnd_budget_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_status" ON "rnd_budget_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_tenant" ON "rnd_budget_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bp_plan" ON "rnd_budget_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bp_tenant" ON "rnd_budget_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_cp_comp" ON "rnd_competitor_products" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_cp_grade" ON "rnd_competitor_products" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "idx_rnd_cp_tenant" ON "rnd_competitor_products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_comp_tenant" ON "rnd_competitors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_comp_name" ON "rnd_competitors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_rnd_state_tenant" ON "rnd_current_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_state_period" ON "rnd_current_states" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "idx_rnd_ev_employee" ON "rnd_evaluations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ev_period" ON "rnd_evaluations" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_rnd_ev_tenant" ON "rnd_evaluations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_status" ON "rnd_external_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_severity" ON "rnd_external_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_category" ON "rnd_external_issues" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_assignee" ON "rnd_external_issues" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_tenant" ON "rnd_external_issues" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ic_issue" ON "rnd_issue_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ic_tenant" ON "rnd_issue_comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ms_plan" ON "rnd_milestones" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ms_owner" ON "rnd_milestones" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ms_tenant" ON "rnd_milestones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_status" ON "rnd_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_category" ON "rnd_plans" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_tenant" ON "rnd_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_dates" ON "rnd_plans" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_rnd_tc_task" ON "rnd_task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tc_tenant" ON "rnd_task_comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_plan" ON "rnd_tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_assignee" ON "rnd_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_status" ON "rnd_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_due" ON "rnd_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_tenant" ON "rnd_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_w_plan" ON "rnd_weekly_entries" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_w_week" ON "rnd_weekly_entries" USING btree ("plan_id","year","week_number");--> statement-breakpoint
CREATE INDEX "idx_rnd_w_tenant" ON "rnd_weekly_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_salaries_tenant" ON "salaries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_salaries_employee" ON "salaries" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_salaries_month" ON "salaries" USING btree ("month");--> statement-breakpoint
CREATE INDEX "idx_comm_rep" ON "sales_commissions" USING btree ("sales_rep_id");--> statement-breakpoint
CREATE INDEX "idx_comm_order" ON "sales_commissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_comm_period" ON "sales_commissions" USING btree ("period");--> statement-breakpoint
CREATE INDEX "idx_comm_status" ON "sales_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_comm_tenant" ON "sales_commissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_share_token" ON "share_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_share_order" ON "share_tokens" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_share_client" ON "share_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_share_tenant" ON "share_tokens" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_tenant_code_unique" ON "sites" USING btree ("tenant_id","site_code");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_one_primary_per_tenant" ON "sites" USING btree ("tenant_id") WHERE "sites"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "idx_company_sites_tenant" ON "sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_company_sites_type" ON "sites" USING btree ("site_type");--> statement-breakpoint
CREATE INDEX "idx_company_sites_active" ON "sites" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_company_sites_coords" ON "sites" USING btree ("tenant_id","latitude","longitude");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id","moved_at");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_idx" ON "stock_movements" USING btree ("tenant_id","moved_at");--> statement-breakpoint
CREATE INDEX "stock_movements_vehicle_idx" ON "stock_movements" USING btree ("tenant_id","vehicle_id") WHERE "stock_movements"."vehicle_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_tenant" ON "supplier_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_supplier" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_po" ON "supplier_payments" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_tenant" ON "suppliers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_active" ON "suppliers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_tm_dev_vehicle" ON "telematics_devices" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_tm_dev_tenant" ON "telematics_devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tm_dev_serial" ON "telematics_devices" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "idx_tm_dev_active_vehicle" ON "telematics_devices" USING btree ("vehicle_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "telematics_devices_serial_number_unique" ON "telematics_devices" USING btree ("serial_number") WHERE "telematics_devices"."serial_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "telematics_devices_tenant_device_code_unique" ON "telematics_devices" USING btree ("tenant_id","device_code") WHERE "telematics_devices"."device_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "telematics_devices_primary_per_vehicle_type_unique" ON "telematics_devices" USING btree ("vehicle_id","device_type") WHERE "telematics_devices"."is_primary";--> statement-breakpoint
CREATE INDEX "idx_tm_trip" ON "telematics_readings" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idx_tm_vehicle_time" ON "telematics_readings" USING btree ("vehicle_id","captured_at");--> statement-breakpoint
CREATE INDEX "idx_tm_tenant" ON "telematics_readings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_item_units_tenant_serial_unique" ON "warehouse_item_units" USING btree ("tenant_id","unit_serial");--> statement-breakpoint
CREATE INDEX "warehouse_item_units_item_idx" ON "warehouse_item_units" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "warehouse_item_units_tenant_state_idx" ON "warehouse_item_units" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_items_tenant_code_unique" ON "warehouse_items" USING btree ("tenant_id","item_code");--> statement-breakpoint
CREATE INDEX "warehouse_items_tenant_idx" ON "warehouse_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "warehouse_items_warehouse_idx" ON "warehouse_items" USING btree ("tenant_id","default_warehouse");--> statement-breakpoint
CREATE INDEX "warehouse_items_low_stock_idx" ON "warehouse_items" USING btree ("tenant_id","min_qty") WHERE "warehouse_items"."is_active" = true;--> statement-breakpoint
CREATE INDEX "idx_zt_doc_tenant" ON "zatca_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_zt_doc_order" ON "zatca_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_zt_doc_status" ON "zatca_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_zt_doc_number" ON "zatca_documents" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "idx_orders_source_ref" ON "orders" USING btree ("source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));