-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0003: Customer Portal magic links (Epic 2)
-- ============================================================
--  • share_tokens — passwordless portal access (ORDER | CLIENT scope)
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

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
	CONSTRAINT "share_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "share_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "share_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "share_tokens_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "share_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_share_token" ON "share_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_share_order" ON "share_tokens" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_share_client" ON "share_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_share_tenant" ON "share_tokens" USING btree ("tenant_id");
