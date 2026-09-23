-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0007: ZATCA Phase-2 documents (Epic 7)
-- ============================================================
--  • zatca_documents — e-invoice registry with hash chain
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "zatca_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid,
	"invoice_number" varchar(40) NOT NULL,
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
	CONSTRAINT "zatca_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "zatca_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "zatca_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_zt_doc_tenant" ON "zatca_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_zt_doc_order" ON "zatca_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_zt_doc_status" ON "zatca_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_zt_doc_number" ON "zatca_documents" USING btree ("invoice_number");
