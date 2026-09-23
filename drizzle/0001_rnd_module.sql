-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0001: R&D Module ("The Factory Brain")
-- ============================================================
--  • Adds RND_MANAGER to the user_role enum
--  • Creates R&D enums + 11 tables (plans, milestones, tasks,
--    comments, budgets, weekly follow-up, off-plan issues, evaluations)
--
--  Apply with:  npx drizzle-kit migrate
--  (or run this file directly against the target database)
-- ============================================================

ALTER TYPE "public"."user_role" ADD VALUE 'RND_MANAGER';--> statement-breakpoint
CREATE TYPE "public"."rnd_plan_status" AS ENUM('DRAFT', 'PENDING_FINANCE', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."rnd_plan_category" AS ENUM('PRODUCTION', 'QUALITY', 'COST', 'STAFF', 'TECHNOLOGY', 'PROCESS');--> statement-breakpoint
CREATE TYPE "public"."rnd_priority" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."rnd_task_status" AS ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."rnd_budget_category" AS ENUM('EQUIPMENT', 'SOFTWARE', 'TRAINING', 'CONSULTING', 'MARKETING', 'HR', 'MATERIALS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."rnd_budget_item_status" AS ENUM('PLANNED', 'REQUESTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."rnd_issue_severity" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."rnd_issue_category" AS ENUM('EQUIPMENT', 'QUALITY', 'SAFETY', 'STAFF', 'SUPPLIER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."rnd_issue_status" AS ENUM('OPEN', 'INVESTIGATING', 'RESOLVING', 'RESOLVED', 'CLOSED');--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_current_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_current_states_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_plans_finance_reviewed_by_id_users_id_fk" FOREIGN KEY ("finance_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_milestones_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rnd_milestones_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_tasks_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_tasks_milestone_id_rnd_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."rnd_milestones"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "rnd_task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_task_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_task_comments_task_id_rnd_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."rnd_tasks"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rnd_task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_budget_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_budget_plans_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_budget_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_budget_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_budget_items_budget_plan_id_rnd_budget_plans_id_fk" FOREIGN KEY ("budget_plan_id") REFERENCES "public"."rnd_budget_plans"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rnd_budget_items_finance_reviewed_by_id_users_id_fk" FOREIGN KEY ("finance_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_budget_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_weekly_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_weekly_entries_plan_id_rnd_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rnd_weekly_entries_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_weekly_entries_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_external_issues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_external_issues_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_external_issues_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_external_issues_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_external_issues_related_plan_id_rnd_plans_id_fk" FOREIGN KEY ("related_plan_id") REFERENCES "public"."rnd_plans"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_external_issues_related_task_id_rnd_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."rnd_tasks"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "rnd_issue_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_issue_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_issue_comments_issue_id_rnd_external_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."rnd_external_issues"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rnd_issue_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_evaluations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_evaluations_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_evaluations_evaluated_by_id_users_id_fk" FOREIGN KEY ("evaluated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_rnd_state_tenant" ON "rnd_current_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_state_period" ON "rnd_current_states" USING btree ("tenant_id","period");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_status" ON "rnd_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_category" ON "rnd_plans" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_tenant" ON "rnd_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_plans_dates" ON "rnd_plans" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_rnd_ms_plan" ON "rnd_milestones" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ms_owner" ON "rnd_milestones" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ms_tenant" ON "rnd_milestones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_plan" ON "rnd_tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_assignee" ON "rnd_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_status" ON "rnd_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_due" ON "rnd_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_rnd_tasks_tenant" ON "rnd_tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tc_task" ON "rnd_task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_tc_tenant" ON "rnd_task_comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bp_plan" ON "rnd_budget_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bp_tenant" ON "rnd_budget_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_budget" ON "rnd_budget_items" USING btree ("budget_plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_category" ON "rnd_budget_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_status" ON "rnd_budget_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_bi_tenant" ON "rnd_budget_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_w_plan" ON "rnd_weekly_entries" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_w_week" ON "rnd_weekly_entries" USING btree ("plan_id","year","week_number");--> statement-breakpoint
CREATE INDEX "idx_rnd_w_tenant" ON "rnd_weekly_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_status" ON "rnd_external_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_severity" ON "rnd_external_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_category" ON "rnd_external_issues" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_assignee" ON "rnd_external_issues" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ei_tenant" ON "rnd_external_issues" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ic_issue" ON "rnd_issue_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ic_tenant" ON "rnd_issue_comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ev_employee" ON "rnd_evaluations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_ev_period" ON "rnd_evaluations" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_rnd_ev_tenant" ON "rnd_evaluations" USING btree ("tenant_id");
