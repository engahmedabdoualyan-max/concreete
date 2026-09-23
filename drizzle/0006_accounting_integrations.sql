-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0006: External accounting integrations (Epic 6)
-- ============================================================
--  • integration_connections — providers + encrypted credentials
--  • integration_sync_logs — audit trail of every push
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "integration_connections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_sync_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "integration_sync_logs_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_intconn_tenant" ON "integration_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_intconn_provider" ON "integration_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_intlog_conn" ON "integration_sync_logs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_intlog_entity" ON "integration_sync_logs" USING btree ("entity_type","local_id");--> statement-breakpoint
CREATE INDEX "idx_intlog_tenant" ON "integration_sync_logs" USING btree ("tenant_id");
